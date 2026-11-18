"""Conversation calls with a workspace API key, and the API's PascalCase enum values."""

from typing import Any, Callable, List, Tuple

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import ErghiError

CONVERSATION = {
    "id": "c-1",
    "workspaceId": "w-1",
    "widgetId": "wd-1",
    "visitorId": None,
    "assignedAgentId": None,
    "status": "Open",
    "channel": "telegram",
    "startedAt": "2026-11-18T10:00:00Z",
    "closedAt": None,
    "metadata": None,
}
MESSAGE = {
    "id": "m-1",
    "conversationId": "c-1",
    "sender": "bot",
    "senderId": None,
    "type": "Text",
    "content": "hi",
    "attachments": None,
    "createdAt": "2026-11-18T10:00:00Z",
    "readAt": None,
    "isAI": True,
    "aiModel": "gpt",
}


def make_client(
    client_id: str | None, secret: str | None, body: Any
) -> Tuple[ErghiClient, List[httpx.Request]]:
    seen: List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth/token":
            return httpx.Response(200, json={"access_token": "tok", "token_type": "Bearer"})
        seen.append(request)
        return httpx.Response(200, json=body)

    client = ErghiClient(api_url="http://erghi.test", client_id=client_id, client_secret=secret)
    client._http_client = httpx.AsyncClient(
        base_url="http://erghi.test", transport=httpx.MockTransport(handler)
    )
    return client, seen


@pytest.mark.asyncio
async def test_api_key_lists_and_reads_through_the_key_endpoints() -> None:
    page = {"data": [CONVERSATION], "total": 1, "page": 1, "limit": 50, "totalPages": 1}
    client, seen = make_client("cid", "secret", page)
    await client.chat.list_conversations()
    assert seen[-1].url.path == "/api/v1/agent/conversations"

    client, seen = make_client("cid", "secret", CONVERSATION)
    conversation = await client.chat.get_conversation("c-1")
    assert seen[-1].url.path == "/api/v1/agent/conversations/c-1"
    # The API sends "Open"; the model normalises it so this does not fail validation.
    assert conversation.status == "open"
    assert conversation.channel == "telegram"


@pytest.mark.asyncio
async def test_api_key_sends_and_closes_through_the_key_endpoints() -> None:
    client, seen = make_client("cid", "secret", MESSAGE)
    message = await client.chat.send_message("c-1", "hi")
    assert seen[-1].method == "POST"
    assert seen[-1].url.path == "/api/v1/agent/conversations/c-1/messages"
    assert message.sender == "bot"
    assert message.type == "text"

    await client.chat.close_conversation("c-1")
    assert seen[-1].url.path == "/api/v1/agent/conversations/c-1/close"


@pytest.mark.asyncio
async def test_api_key_refuses_attachments_instead_of_dropping_them() -> None:
    client, _ = make_client("cid", "secret", MESSAGE)
    with pytest.raises(ErghiError) as raised:
        await client.chat.send_message("c-1", "hi", attachments=[("a.txt", b"x")])
    assert raised.value.code == "ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS"


@pytest.mark.asyncio
async def test_teammate_token_keeps_the_member_endpoints() -> None:
    client, seen = make_client(None, None, CONVERSATION)
    client.access_token = "user-token"
    await client.chat.get_conversation("c-1")
    assert seen[-1].url.path == "/api/conversations/c-1"


@pytest.mark.parametrize("status", ["Open", "Assigned", "Queued", "Snoozed", "Resolved", "Closed", "open"])
def test_every_api_status_validates(status: str) -> None:
    from erghi.types import Conversation

    conversation = Conversation.model_validate({**CONVERSATION, "status": status})
    assert conversation.status == status.lower()
