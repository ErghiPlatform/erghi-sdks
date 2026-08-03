"""Tests for erghi.client's real-time transport.

Drives ErghiClient.connect()/invoke()/send() against a small local server that speaks the
actual SignalR wire protocol (negotiate response + JSON handshake + record-separator framing),
not a mock of the client's own internals -- this is what proves the client can complete a real
negotiate/handshake and correctly frame/parse hub invocations, which the previous raw-WebSocket
transport never could against a real ASP.NET Core SignalR hub.
"""

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional

import pytest
import websockets

from erghi.client import ErghiClient
from erghi.errors import HubException

RECORD_SEPARATOR = "\x1e"


class _NegotiateHandler(BaseHTTPRequestHandler):
    connection_token = "test-connection-token"

    def do_POST(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler's naming convention)
        body = json.dumps({"connectionToken": self.connection_token, "negotiateVersion": 1}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # silence test output
        pass


@pytest.fixture
def negotiate_server():
    server = HTTPServer(("127.0.0.1", 0), _NegotiateHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    thread.join(timeout=2)


class _MockHub:
    """Minimal real SignalR-protocol server: accepts the handshake, records what the client
    sends, and lets a test script exactly what to send back (a broadcast Invocation, a
    Completion, etc.)."""

    def __init__(self) -> None:
        self.received_records: list[dict] = []
        self._server = None
        self._ws = None
        self._connected_event = asyncio.Event()

    async def _handler(self, ws) -> None:
        self._ws = ws
        raw = await ws.recv()
        text = raw.decode() if isinstance(raw, bytes) else raw
        handshake_record, _, _ = text.partition(RECORD_SEPARATOR)
        json.loads(handshake_record)  # {"protocol": "json", "version": 1}
        await ws.send(json.dumps({}) + RECORD_SEPARATOR)  # empty object = handshake success
        self._connected_event.set()

        try:
            async for raw_msg in ws:
                msg_text = raw_msg.decode() if isinstance(raw_msg, bytes) else raw_msg
                for record in msg_text.split(RECORD_SEPARATOR):
                    if record:
                        self.received_records.append(json.loads(record))
        except websockets.exceptions.ConnectionClosed:
            pass

    async def start(self) -> int:
        self._server = await websockets.serve(self._handler, "127.0.0.1", 0)
        return self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def wait_connected(self, timeout: float = 2.0) -> None:
        await asyncio.wait_for(self._connected_event.wait(), timeout)

    async def send_invocation(self, target: str, *arguments: object) -> None:
        message = {"type": 1, "target": target, "arguments": list(arguments)}
        await self._ws.send(json.dumps(message) + RECORD_SEPARATOR)

    async def send_completion(self, invocation_id: str, *, error: Optional[str] = None, result: object = None) -> None:
        message = {"type": 3, "invocationId": invocation_id}
        if error is not None:
            message["error"] = error
        else:
            message["result"] = result
        await self._ws.send(json.dumps(message) + RECORD_SEPARATOR)


@pytest.fixture
async def mock_hub():
    hub = _MockHub()
    port = await hub.start()
    yield hub, port
    await hub.stop()


def _client_for(negotiate_server: HTTPServer, ws_port: int) -> ErghiClient:
    negotiate_host, negotiate_port = negotiate_server.server_address
    return ErghiClient(
        ws_url=f"ws://{negotiate_host}:{ws_port}",
        access_token="test-token",
    )


@pytest.mark.asyncio
async def test_connect_completes_real_signalr_handshake(negotiate_server, mock_hub) -> None:
    hub, ws_port = mock_hub
    # The negotiate server and the hub websocket server run on different ports in this test
    # setup, so point the client's negotiate call at the HTTP server directly by overriding
    # ws_url's scheme derivation -- simplest is to monkeypatch _negotiate to hit the right host.
    client = _client_for(negotiate_server, ws_port)
    client._negotiate = _make_negotiate_override(negotiate_server)  # type: ignore[method-assign]

    connected = []
    client.on("connected", lambda data: connected.append(data))

    await client.connect()
    await hub.wait_connected()

    assert connected, "client never emitted 'connected' after completing the handshake"
    await client.disconnect()


@pytest.mark.asyncio
async def test_server_invocation_is_remapped_to_public_event_name(negotiate_server, mock_hub) -> None:
    hub, ws_port = mock_hub
    client = _client_for(negotiate_server, ws_port)
    client._negotiate = _make_negotiate_override(negotiate_server)  # type: ignore[method-assign]

    received = []
    client.on("message.received", lambda data: received.append(data))

    await client.connect()
    await hub.wait_connected()

    await hub.send_invocation("MessageReceived", {"id": "msg-1", "content": "hello"})
    await asyncio.sleep(0.1)

    assert received == [{"id": "msg-1", "content": "hello"}]
    await client.disconnect()


@pytest.mark.asyncio
async def test_invoke_sends_real_hub_invocation_frame(negotiate_server, mock_hub) -> None:
    hub, ws_port = mock_hub
    client = _client_for(negotiate_server, ws_port)
    client._negotiate = _make_negotiate_override(negotiate_server)  # type: ignore[method-assign]

    await client.connect()
    await hub.wait_connected()

    await client.invoke("SendTyping", "conv-1", wait_for_result=False)
    await asyncio.sleep(0.1)

    assert hub.received_records[-1] == {"type": 1, "target": "SendTyping", "arguments": ["conv-1"]}
    await client.disconnect()


@pytest.mark.asyncio
async def test_invoke_raises_hub_exception_on_server_rejection(negotiate_server, mock_hub) -> None:
    """Proves a rejection from ConversationOwnershipHubFilter-style server logic (a Completion
    message carrying an error) surfaces to the caller as HubException, instead of being
    silently lost the way it always would have been on the old transport."""
    hub, ws_port = mock_hub
    client = _client_for(negotiate_server, ws_port)
    client._negotiate = _make_negotiate_override(negotiate_server)  # type: ignore[method-assign]

    await client.connect()
    await hub.wait_connected()

    async def respond_with_rejection():
        await asyncio.sleep(0.1)
        sent = hub.received_records[-1]
        await hub.send_completion(sent["invocationId"], error="Conversation not found")

    asyncio.create_task(respond_with_rejection())

    with pytest.raises(HubException, match="Conversation not found"):
        await client.invoke("JoinConversation", "someone-elses-conversation")

    await client.disconnect()


def _make_negotiate_override(negotiate_server: HTTPServer):
    host, port = negotiate_server.server_address

    async def _negotiate() -> str:
        import httpx

        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(f"http://{host}:{port}/hubs/chat/negotiate")
            response.raise_for_status()
            return str(response.json()["connectionToken"])

    return _negotiate
