"""Wire-contract tests for the social inbox resource."""

import json
from typing import Any, Callable

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import ErghiError

COMMENT = {
    "id": "k-1",
    "connectionId": "n-1",
    "postId": "p-1",
    "conversationId": "c-1",
    "platform": "facebook",
    "externalCommentId": "x1",
    "parentExternalCommentId": None,
    "authorExternalId": "a1",
    "authorName": "Ann",
    "text": "hi",
    "isFromPage": False,
    "visibility": "visible",
    "postedAt": "2026-11-20T10:00:00Z",
    "canPrivateReply": True,
    "privateReplyExpiresAt": "2026-11-27T10:00:00Z",
    "unanswered": True,
    "needsAttention": False,
}
SETTINGS = {
    "connectionId": "n-1",
    "channelType": "facebook",
    "name": "Page",
    "dmsEnabled": True,
    "commentsEnabled": True,
    "autoHideSpam": True,
    "autoHideScamImpersonation": True,
    "autoHideAbuse": False,
    "commentReplyMode": "suggest",
    "autoPublicRepliesEnabled": False,
    "publicAcknowledgmentEnabled": False,
    "replyToPraise": False,
    "maxAutoPublicRepliesPerPostPerHour": 5,
    "allowedLinkDomains": [],
}


def make_client(
    respond: Callable[[httpx.Request], httpx.Response],
) -> tuple[ErghiClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return respond(request)

    client = ErghiClient(api_url="http://erghi.test")
    client._http_client = httpx.AsyncClient(
        base_url="http://erghi.test", transport=httpx.MockTransport(handler)
    )
    return client, seen


def body(request: httpx.Request) -> Any:
    return json.loads(request.content)


@pytest.mark.asyncio
async def test_connections_and_settings() -> None:
    conn = {
        "id": "n-1",
        "channelType": "facebook",
        "externalAccountId": "e1",
        "name": "Page",
        "status": "active",
        "connectedAt": "2026-11-01T10:00:00Z",
        "needsReauth": False,
    }
    preview = {
        "connectionId": "n-1",
        "channelType": "facebook",
        "openConversationCount": 3,
        "openConversationScope": "workspace",
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("/disconnect-preview"):
            return httpx.Response(200, json=preview)
        if r.method == "DELETE":
            return httpx.Response(204)
        if r.url.path.endswith("/settings"):
            return httpx.Response(200, json=SETTINGS)
        return httpx.Response(200, json=[conn])

    client, seen = make_client(respond)
    assert (await client.social.list_connections())[0].id == "n-1"
    await client.social.get_connection_settings("n-1")
    await client.social.update_connection_settings(
        "n-1", comment_reply_mode="auto", auto_hide_abuse=False, allowed_link_domains=[]
    )
    assert (await client.social.get_disconnect_preview("n-1")).open_conversation_count == 3
    await client.social.disconnect_connection("n-1")
    assert [(r.method, r.url.path) for r in seen] == [
        ("GET", "/api/v1/channels/meta/connections"),
        ("GET", "/api/v1/channels/meta/connections/n-1/settings"),
        ("PUT", "/api/v1/channels/meta/connections/n-1/settings"),
        ("GET", "/api/v1/channels/meta/connections/n-1/disconnect-preview"),
        ("DELETE", "/api/v1/channels/meta/connections/n-1"),
    ]
    # Only the passed fields are sent; an empty list is still sent (it clears the list).
    assert body(seen[2]) == {
        "commentReplyMode": "auto",
        "autoHideAbuse": False,
        "allowedLinkDomains": [],
    }


@pytest.mark.asyncio
async def test_dm_helpers() -> None:
    policy = {
        "state": "open",
        "requiresHumanAgentTag": False,
        "humanAgentApproved": False,
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("/reply-policy"):
            return httpx.Response(200, json=policy)
        return httpx.Response(200, json=[{"messageId": "m-1", "status": "sent"}])

    client, seen = make_client(respond)
    assert (await client.social.get_reply_policy("c-1")).state == "open"
    assert (await client.social.list_deliveries("c-1"))[0].status == "sent"
    assert seen[0].url.path == "/api/v1/channels/meta/conversations/c-1/reply-policy"
    assert seen[1].url.path == "/api/v1/channels/meta/conversations/c-1/deliveries"


@pytest.mark.asyncio
async def test_posts_and_comments_queries() -> None:
    post = {
        "id": "p-1",
        "connectionId": "n-1",
        "platform": "facebook",
        "externalPostId": "x",
        "isAd": False,
        "commentCount": 2,
        "needsAttentionCount": 1,
    }

    def respond(r: httpx.Request) -> httpx.Response:
        item = post if r.url.path.endswith("/posts") else COMMENT
        return httpx.Response(200, json={"items": [item], "total": 1, "page": 1, "pageSize": 20})

    client, seen = make_client(respond)
    posts = await client.social.list_posts(connection_id="n-1", page_size=20)
    assert posts.items[0].comment_count == 2
    comments = await client.social.list_comments(
        post_id="p-1", category="question", hidden=False, needs_attention=True, page=2
    )
    assert comments.items[0].text == "hi"
    await client.social.list_comments()
    assert dict(seen[0].url.params) == {"connectionId": "n-1", "pageSize": "20"}
    assert dict(seen[1].url.params) == {
        "postId": "p-1",
        "category": "question",
        "hidden": "false",
        "needsAttention": "true",
        "page": "2",
    }
    assert dict(seen[2].url.params) == {}


@pytest.mark.asyncio
async def test_moderation_actions() -> None:
    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("/private-reply"):
            return httpx.Response(200, json={"comment": COMMENT, "conversationId": "c-2"})
        if r.url.path.endswith("/ignore-contact"):
            return httpx.Response(200, json={"contactId": "ct-1", "ignored": True})
        return httpx.Response(200, json=COMMENT)

    client, seen = make_client(respond)
    await client.social.hide_comment("k-1")
    await client.social.unhide_comment("k-1")
    await client.social.reply_to_comment("k-1", "thanks")
    result = await client.social.private_reply_to_comment("k-1", "dm")
    assert result.conversation_id == "c-2"
    await client.social.mark_comment_done("k-1")
    assert (await client.social.ignore_comment_contact("k-1")).ignored is True
    assert [(r.method, r.url.path) for r in seen] == [
        ("POST", "/api/v1/social/comments/k-1/hide"),
        ("POST", "/api/v1/social/comments/k-1/unhide"),
        ("POST", "/api/v1/social/comments/k-1/reply"),
        ("POST", "/api/v1/social/comments/k-1/private-reply"),
        ("POST", "/api/v1/social/comments/k-1/done"),
        ("POST", "/api/v1/social/comments/k-1/ignore-contact"),
    ]
    assert body(seen[2]) == {"text": "thanks"}
    assert body(seen[3]) == {"text": "dm"}


@pytest.mark.asyncio
async def test_report_and_csv() -> None:
    report = {
        "from": "2026-10-24T00:00:00Z",
        "to": "2026-11-23T00:00:00Z",
        "commentsReceived": 10,
        "byCategory": {"question": 4},
        "autoHidden": 1,
        "agentHidden": 0,
        "unhiddenByAgent": 0,
        "commentsAnswered": 6,
        "commentsUnanswered": 4,
        "aiPublicRepliesPosted": 0,
        "aiPublicRepliesRefused": 0,
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith(".csv"):
            return httpx.Response(200, text="a,b\n1,2\n")
        return httpx.Response(200, json=report)

    client, seen = make_client(respond)
    got = await client.social.get_report(time_zone="Africa/Cairo")
    assert got.comments_received == 10
    assert (await client.social.export_report_csv(from_="2026-11-01")).startswith("a,b")
    assert seen[0].url.path == "/api/v1/reports/social"
    assert dict(seen[0].url.params) == {"timeZone": "Africa/Cairo"}
    assert seen[1].url.path == "/api/v1/reports/social/export.csv"


@pytest.mark.asyncio
async def test_use_comment_reply_code_is_available() -> None:
    client, _ = make_client(
        lambda r: httpx.Response(409, json={"error": "use the comment reply", "code": "use_comment_reply"})
    )
    with pytest.raises(ErghiError) as info:
        await client.social.reply_to_comment("k-1", "x")
    assert info.value.status_code == 409
    assert info.value.details["code"] == "use_comment_reply"
