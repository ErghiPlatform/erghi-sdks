"""Erghi SDK Client"""

import asyncio
import json
import logging
import uuid
from typing import Any, Callable, Dict, Optional
from urllib.parse import urljoin

import httpx
import websockets
from websockets.asyncio.client import ClientConnection

from .errors import (
    ErghiError,
    AuthenticationError,
    HubException,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from .resources.auth import AuthResource
from .resources.chat import ChatResource
from .resources.workspace import WorkspaceResource

logger = logging.getLogger(__name__)

# ASP.NET Core SignalR's JSON Hub Protocol terminates every frame with this character.
_RECORD_SEPARATOR = "\x1e"

# Real hub broadcast names (Erghi.Conversation/Api/Hubs/ChatHub.cs /
# ConversationRealtimeNotifier.cs) mapped onto this SDK's documented dotted event names, so
# existing `client.on("message.received", ...)`-style consumer code keeps working unchanged.
_HUB_EVENT_MAP = {
    "MessageReceived": "message.received",
    "MessageRead": "message.read",
    "UserTyping": "user.typing",
    "ConversationClosed": "conversation.closed",
    "ConversationAssigned": "conversation.assigned",
}


class ErghiClient:
    """Main Erghi SDK Client"""

    def __init__(
        self,
        api_url: str = "http://localhost:5000",
        ws_url: str = "ws://localhost:5002",
        api_key: Optional[str] = None,
        access_token: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        workspace_id: Optional[str] = None,
        account_id: Optional[str] = None,
        timeout: float = 30.0,
        debug: bool = False,
    ) -> None:
        """
        Initialize Erghi client

        Args:
            api_url: API base URL
            ws_url: WebSocket URL
            api_key: API key for authentication
            access_token: Access token (JWT)
            client_id: Client ID for M2M authentication
            client_secret: Client Secret for M2M authentication
            workspace_id: Workspace ID
            account_id: Account ID
            timeout: Request timeout in seconds
            debug: Enable debug logging
        """
        self.api_url = api_url
        self.ws_url = ws_url
        self.api_key = api_key
        self.access_token = access_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.workspace_id = workspace_id
        self.account_id = account_id
        self.visitor_id: Optional[str] = None
        self.timeout = timeout
        self.debug = debug

        if debug:
            logging.basicConfig(level=logging.DEBUG)

        # Initialize HTTP client
        self._http_client = httpx.AsyncClient(
            base_url=api_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

        # Real-time hub connection (SignalR protocol over a raw websocket -- see connect())
        self._ws: Optional[ClientConnection] = None
        self._ws_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._event_handlers: Dict[str, list[Callable]] = {}
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._pending_invocations: Dict[str, "asyncio.Future[Any]"] = {}

        # Initialize resources
        self.auth = AuthResource(self)
        self.chat = ChatResource(self)
        self.workspace = WorkspaceResource(self)

    async def __aenter__(self) -> "ErghiClient":
        """Async context manager entry"""
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Async context manager exit"""
        await self.close()

    async def close(self) -> None:
        """Close client connections"""
        await self.disconnect()
        await self._http_client.aclose()

    async def authenticate(self) -> str:
        """Authenticate using Client Credentials to obtain a JWT token"""
        if not self.client_id or not self.client_secret:
            raise AuthenticationError("client_id and client_secret are required for token exchange")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = urljoin(self.api_url + "/", "api/v1/auth/token")
                response = await client.post(
                    url,
                    json={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                token = str(data["access_token"])
                self.set_access_token(token)
                return token
        except httpx.HTTPStatusError as e:
            try:
                msg = e.response.json().get("message", str(e))
            except Exception:
                msg = str(e)
            raise AuthenticationError(f"Failed to authenticate: {msg}")
        except Exception as e:
            raise AuthenticationError(f"Failed to authenticate: {str(e)}")

    async def authenticate_visitor(self, widget_id: str, jwt_token: str) -> str:
        """Authenticate a visitor using a signed JWT from the customer's backend."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = urljoin(self.api_url + "/", "api/conversations/identity")
                response = await client.post(
                    url,
                    json={
                        "widgetId": widget_id,
                        "jwtToken": jwt_token,
                    },
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                data = response.json()
                self.visitor_id = str(data.get("visitorId", data.get("VisitorId")))
                return self.visitor_id
        except httpx.HTTPStatusError as e:
            try:
                msg = e.response.json().get("error", str(e))
            except Exception:
                msg = str(e)
            raise AuthenticationError(f"Failed to authenticate visitor: {msg}")
        except Exception as e:
            raise AuthenticationError(f"Failed to authenticate visitor: {str(e)}")

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        headers: Dict[str, str] = {}

        if self.api_key:
            headers["X-API-Key"] = self.api_key

        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        if self.workspace_id:
            headers["X-Workspace-Id"] = self.workspace_id

        if self.account_id:
            headers["X-Account-Id"] = self.account_id

        return headers

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make HTTP request"""
        if self.client_id and self.client_secret and not self.access_token:
            try:
                await self.authenticate()
            except Exception as e:
                logger.error(f"Auto-authentication failed: {e}")

        try:
            headers = self._get_headers()
            headers.update(kwargs.pop("headers", {}))

            response = await self._http_client.request(
                method,
                path,
                headers=headers,
                **kwargs,
            )

            response.raise_for_status()
            return response

        except httpx.HTTPStatusError as e:
            raise self._handle_error(e)
        except httpx.RequestError as e:
            raise NetworkError(f"Network request failed: {str(e)}", details=str(e))

    def _handle_error(self, error: httpx.HTTPStatusError) -> ErghiError:
        """Handle HTTP errors"""
        response = error.response

        try:
            data = response.json()
            message = data.get("message", str(error))
            details = data.get("errors")
        except Exception:
            message = str(error)
            details = None

        status_code = response.status_code

        if status_code == 400:
            return ValidationError(message, details)
        elif status_code == 401:
            return AuthenticationError(message)
        elif status_code == 404:
            return NotFoundError(message)
        elif status_code == 429:
            retry_after = int(response.headers.get("Retry-After", "60"))
            return RateLimitError(message, retry_after)
        else:
            return ErghiError(message, "API_ERROR", status_code, details)

    def set_access_token(self, token: str) -> None:
        """Set access token"""
        self.access_token = token

    def set_workspace_id(self, workspace_id: str) -> None:
        """Set workspace ID"""
        self.workspace_id = workspace_id

    async def connect(self) -> None:
        """Connect to the real-time hub.

        Was a bare `websockets.connect(...)` speaking a hand-rolled {type, data} envelope
        directly at /hubs/chat -- that never completes the SignalR negotiate/handshake a real
        ASP.NET Core SignalR hub requires (a POST to /negotiate for a connection token, then a
        JSON handshake record before any invocation frames are accepted), so it could not
        actually exchange messages with the real backend. This implements that protocol
        directly on top of the same `websockets` library, since no official/maintained SignalR
        client exists for Python.
        """
        if self._ws_is_open():
            return

        try:
            connection_token = await self._negotiate()
            ws_url = (
                f"{self.ws_url}/hubs/chat?id={connection_token}"
                f"&access_token={self.access_token or ''}"
            )
            self._ws = await websockets.connect(ws_url)
            await self._handshake()

            self._reconnect_attempts = 0
            logger.debug("Hub connected")

            self._ws_task = asyncio.create_task(self._listen())
            self._ping_task = asyncio.create_task(self._keepalive())

            await self._emit("connected", {})

        except Exception as e:
            logger.error(f"Hub connection failed: {e}")
            await self._reconnect()

    async def _negotiate(self) -> str:
        """POST /hubs/chat/negotiate to obtain the connection token the WebSocket URL needs.
        Requests negotiateVersion=1 explicitly and prefers connectionToken (that version's
        field) over connectionId (the older/v0 field) if both are present."""
        scheme = "https" if self.ws_url.startswith("wss://") else "http"
        base = scheme + "://" + self.ws_url.split("://", 1)[-1]
        url = urljoin(base + "/", "hubs/chat/negotiate")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, params={"negotiateVersion": 1}, headers=self._get_headers())
            response.raise_for_status()
            data = response.json()

        if data.get("url"):
            # Azure SignalR-style redirect to a different endpoint -- not used by this
            # platform's self-hosted deployment, but fail clearly instead of silently
            # connecting to the wrong place if it ever is.
            raise ErghiError("Hub negotiate returned a redirect target; not supported", "WS_NEGOTIATE_REDIRECT")

        token = data.get("connectionToken") or data.get("connectionId")
        if not token:
            raise ErghiError("Hub negotiate response had no connection token", "WS_NEGOTIATE_FAILED")
        return str(token)

    def _ws_is_open(self) -> bool:
        """`websockets` 14+ replaced the connection object's `.closed` property with a
        `.state` enum (`websockets.State.OPEN`/`CLOSED`/...) -- `.closed` no longer exists on
        the connection object `websockets.connect()` returns."""
        return self._ws is not None and self._ws.state is websockets.State.OPEN

    async def _handshake(self) -> None:
        """Send the SignalR handshake request record and wait for the response record --
        required before the server will accept any invocation frames."""
        assert self._ws is not None
        await self._ws.send(json.dumps({"protocol": "json", "version": 1}) + _RECORD_SEPARATOR)

        raw = await self._ws.recv()
        text = raw.decode() if isinstance(raw, bytes) else raw
        record, _, _rest = text.partition(_RECORD_SEPARATOR)
        response = json.loads(record) if record else {}

        if response.get("error"):
            raise ErghiError(f"Hub handshake failed: {response['error']}", "WS_HANDSHAKE_FAILED")

    async def disconnect(self) -> None:
        """Disconnect from the hub."""
        for task_attr in ("_ping_task", "_ws_task"):
            task = getattr(self, task_attr)
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                setattr(self, task_attr, None)

        for future in self._pending_invocations.values():
            if not future.done():
                future.cancel()
        self._pending_invocations.clear()

        if self._ws:
            await self._ws.close()
            self._ws = None

    async def invoke(self, method: str, *args: Any, wait_for_result: bool = True) -> Any:
        """Invoke a real hub method (e.g. "SendTyping", "JoinConversation", "MarkAsRead").

        By default waits for the server's Completion message and raises HubException if the
        server rejected the call -- notably including ConversationOwnershipHubFilter denying
        access to a conversation outside the caller's own workspace, which the previous
        transport could never have surfaced since it never spoke to a real hub at all.
        """
        if not self._ws_is_open():
            raise ErghiError("Hub is not connected", "WS_NOT_CONNECTED")

        message: Dict[str, Any] = {"type": 1, "target": method, "arguments": list(args)}

        future: Optional["asyncio.Future[Any]"] = None
        invocation_id: Optional[str] = None
        if wait_for_result:
            invocation_id = str(uuid.uuid4())
            message["invocationId"] = invocation_id
            future = asyncio.get_event_loop().create_future()
            self._pending_invocations[invocation_id] = future

        assert self._ws is not None  # guaranteed by the _ws_is_open() check above
        await self._ws.send(json.dumps(message) + _RECORD_SEPARATOR)

        if future is not None:
            try:
                return await asyncio.wait_for(future, timeout=self.timeout)
            finally:
                if invocation_id is not None:
                    self._pending_invocations.pop(invocation_id, None)
        return None

    async def send(self, event_type: str, data: Any) -> None:
        """Preserved for API compatibility with the SDK's previous {type, data} envelope --
        maps known event types onto real hub method invocations. Fire-and-forget, matching
        this method's previous behavior (no waiting for a server response)."""
        if event_type == "user.typing":
            conversation_id = (data or {}).get("conversationId")
            await self.invoke("SendTyping", conversation_id, wait_for_result=False)
        else:
            raise ErghiError(f"Unsupported real-time event type: {event_type}", "UNSUPPORTED_EVENT_TYPE")

    async def join_conversation(self, conversation_id: str) -> None:
        """Join a conversation's real-time group -- required before UserTyping/MessageRead
        events for that conversation are delivered to this connection. Raises HubException if
        the conversation isn't in the caller's own workspace."""
        await self.invoke("JoinConversation", conversation_id)

    async def leave_conversation(self, conversation_id: str) -> None:
        await self.invoke("LeaveConversation", conversation_id, wait_for_result=False)

    async def mark_as_read(self, conversation_id: str, message_id: str) -> None:
        await self.invoke("MarkAsRead", conversation_id, message_id)

    def on(self, event: str, handler: Callable) -> None:
        """Register event handler"""
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def off(self, event: str, handler: Optional[Callable] = None) -> None:
        """Unregister event handler"""
        if event not in self._event_handlers:
            return

        if handler is None:
            del self._event_handlers[event]
        else:
            self._event_handlers[event].remove(handler)

    async def _emit(self, event: str, data: Any) -> None:
        """Emit event to handlers"""
        if event in self._event_handlers:
            for handler in self._event_handlers[event]:
                try:
                    result = handler(data)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.error(f"Error in event handler: {e}")

    async def _keepalive(self) -> None:
        """SignalR's JSON protocol expects periodic client activity, not just server pings --
        matches the default @microsoft/signalr client's 15-second keep-alive interval."""
        try:
            while True:
                await asyncio.sleep(15)
                if self._ws_is_open():
                    assert self._ws is not None
                    await self._ws.send(json.dumps({"type": 6}) + _RECORD_SEPARATOR)
        except asyncio.CancelledError:
            pass

    async def _listen(self) -> None:
        """Listen for hub messages. A single WebSocket text frame can contain multiple
        record-separator-terminated JSON records, so each frame is split before parsing."""
        try:
            async for raw in self._ws:  # type: ignore
                text = raw.decode() if isinstance(raw, bytes) else raw
                for record in text.split(_RECORD_SEPARATOR):
                    if record:
                        await self._handle_record(record)

        except websockets.exceptions.ConnectionClosed:
            logger.debug("Hub connection closed")
            await self._emit("disconnected", {})
            await self._reconnect()

    async def _handle_record(self, record: str) -> None:
        try:
            message = json.loads(record)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse hub message: {record}")
            return

        msg_type = message.get("type")

        if msg_type == 1:
            # Invocation from the server -- a hub broadcast (MessageReceived, UserTyping, ...).
            target = message.get("target")
            arguments = message.get("arguments") or []
            event_name = _HUB_EVENT_MAP.get(target, target)
            logger.debug(f"Hub event: {target}")
            await self._emit(event_name, arguments[0] if arguments else None)

        elif msg_type == 3:
            # Completion -- the response to one of our own invoke() calls.
            invocation_id = message.get("invocationId")
            future = self._pending_invocations.get(invocation_id) if invocation_id else None
            if future and not future.done():
                if message.get("error"):
                    future.set_exception(HubException(message["error"]))
                else:
                    future.set_result(message.get("result"))

        elif msg_type == 6:
            # Server ping -- no application-level response required beyond our own keepalive.
            pass

        elif msg_type == 7:
            # Server-initiated close.
            logger.debug(f"Hub sent close: {message.get('error')}")
            await self._emit("disconnected", {})
            if message.get("allowReconnect"):
                await self._reconnect()

        # Types 2 (StreamItem), 4 (StreamInvocation), 5 (CancelInvocation) are not used by
        # ChatHub/VisitorChatHub -- no client-to-server or server-to-client streaming today.

    async def _reconnect(self) -> None:
        """Reconnect to the hub."""
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnect attempts reached")
            return

        self._reconnect_attempts += 1
        delay = min(2**self._reconnect_attempts, 30)

        logger.debug(f"Reconnecting in {delay}s (attempt {self._reconnect_attempts})")
        await asyncio.sleep(delay)

        await self.connect()
