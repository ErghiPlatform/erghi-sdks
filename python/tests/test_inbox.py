"""Wire-contract tests for the inbox and contacts resources."""

import json
from typing import Any, Callable

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import ErghiError

LABEL = {"id": "l-1", "name": "VIP", "color": "#ff0000", "description": None}
NOTE = {
    "id": "n-1",
    "conversationId": "c-1",
    "authorId": "u-1",
    "authorName": "Sam",
    "content": "hello",
    "createdAt": "2026-11-10T10:00:00Z",
    "updatedAt": "2026-11-10T10:00:00Z",
    "canEdit": True,
    "canDelete": True,
}
CONTACT = {
    "id": "k-1",
    "name": "Ann",
    "email": "ann@example.com",
    "phone": None,
    "externalId": None,
    "locale": "ar",
    "firstSeenAt": "2026-11-01T10:00:00Z",
    "lastSeenAt": "2026-11-02T10:00:00Z",
    "blocked": False,
    "blockedAt": None,
    "conversations": [
        {
            "id": "c-1",
            "channel": "widget",
            "status": "open",
            "startedAt": "2026-11-01T10:00:00Z",
            "closedAt": None,
            "assignedAgentId": None,
        }
    ],
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
async def test_label_crud() -> None:
    client, seen = make_client(
        lambda r: httpx.Response(
            204 if r.method == "DELETE" else 200,
            json=(
                None
                if r.method == "DELETE"
                else ({"maxLabels": 50, "labels": [LABEL]} if r.method == "GET" else LABEL)
            ),
        )
    )
    listed = await client.inbox.list_labels()
    assert listed.max_labels == 50 and listed.labels[0].name == "VIP"
    created = await client.inbox.create_label("VIP", color="#ff0000")
    assert created.id == "l-1"
    assert (seen[1].method, seen[1].url.path) == ("POST", "/api/v1/conversation-labels")
    assert body(seen[1])["name"] == "VIP"
    await client.inbox.update_label("l-1", "Vip")
    assert (seen[2].method, seen[2].url.path) == ("PUT", "/api/v1/conversation-labels/l-1")
    await client.inbox.delete_label("l-1")
    assert (seen[3].method, seen[3].url.path) == ("DELETE", "/api/v1/conversation-labels/l-1")


@pytest.mark.asyncio
async def test_conversation_label_assignment() -> None:
    client, seen = make_client(lambda _: httpx.Response(200, json=[LABEL]))
    assert (await client.inbox.get_conversation_labels("c-1"))[0].id == "l-1"
    await client.inbox.set_conversation_labels("c-1", ["l-1", "l-2"])
    assert (seen[1].method, seen[1].url.path) == ("PUT", "/api/v1/conversations/c-1/labels")
    assert body(seen[1]) == {"labelIds": ["l-1", "l-2"]}
    await client.inbox.add_conversation_label("c-1", "l-1")
    assert (seen[2].method, seen[2].url.path) == ("POST", "/api/v1/conversations/c-1/labels/l-1")
    await client.inbox.remove_conversation_label("c-1", "l-1")
    assert seen[3].method == "DELETE"


@pytest.mark.asyncio
async def test_notes_send_mentions_only_when_given() -> None:
    client, seen = make_client(
        lambda r: httpx.Response(200, json=[NOTE] if r.method == "GET" else NOTE)
    )
    assert (await client.inbox.list_notes("c-1"))[0].author_name == "Sam"
    await client.inbox.create_note("c-1", "hi")
    assert body(seen[1]) == {"content": "hi"}
    await client.inbox.create_note("c-1", "hi @a", mentioned_user_ids=["u-2"])
    assert body(seen[2]) == {"content": "hi @a", "mentionedUserIds": ["u-2"]}
    await client.inbox.update_note("c-1", "n-1", "edited")
    assert (seen[3].method, seen[3].url.path) == ("PUT", "/api/v1/conversations/c-1/notes/n-1")


@pytest.mark.asyncio
async def test_api_key_cannot_write_notes_surfaces_error() -> None:
    client, _ = make_client(
        lambda _: httpx.Response(
            403,
            json={"error": "Notes are written by workspace members.", "code": "member_required"},
        )
    )
    with pytest.raises(ErghiError):
        await client.inbox.create_note("c-1", "hi")


@pytest.mark.asyncio
async def test_canned_responses() -> None:
    listing = {
        "maxResponses": 100,
        "responses": [
            {
                "id": "r-1",
                "shortCode": "hi",
                "content": "Hello",
                "updatedAt": "2026-11-10T10:00:00Z",
            }
        ],
    }
    client, seen = make_client(
        lambda r: httpx.Response(
            200, json=listing if r.method == "GET" else listing["responses"][0]
        )
    )
    assert (await client.inbox.list_canned_responses()).responses[0].short_code == "hi"
    assert dict(seen[0].url.params) == {}
    await client.inbox.list_canned_responses("hel")
    assert dict(seen[1].url.params) == {"search": "hel"}
    await client.inbox.create_canned_response("hi", "Hello")
    assert body(seen[2]) == {"shortCode": "hi", "content": "Hello"}
    await client.inbox.update_canned_response("r-1", "hi", "Hey")
    assert seen[3].url.path == "/api/v1/canned-responses/r-1"
    await client.inbox.delete_canned_response("r-1")
    assert seen[4].method == "DELETE"


@pytest.mark.asyncio
async def test_notifications_and_mentionable() -> None:
    notif = {
        "id": "x-1",
        "type": "mention",
        "conversationId": "c-1",
        "noteId": "n-1",
        "actorId": "u-2",
        "actorName": "Lee",
        "preview": "hi",
        "createdAt": "2026-11-10T10:00:00Z",
        "readAt": None,
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("unread-count"):
            return httpx.Response(200, json={"count": 3})
        if r.url.path.endswith("mentionable"):
            return httpx.Response(200, json=[{"userId": "u-2", "displayName": "Lee"}])
        if r.method == "POST":
            return httpx.Response(204)
        return httpx.Response(200, json=[notif])

    client, seen = make_client(respond)
    items = await client.inbox.list_notifications(unread_only=True, limit=10)
    assert items[0].actor_name == "Lee" and items[0].read_at is None
    assert dict(seen[0].url.params) == {"unreadOnly": "true", "limit": "10"}
    assert await client.inbox.get_unread_notification_count() == 3
    await client.inbox.mark_notification_read("x-1")
    assert seen[2].url.path == "/api/v1/notifications/x-1/read"
    await client.inbox.mark_all_notifications_read()
    assert seen[3].url.path == "/api/v1/notifications/read-all"
    members = await client.inbox.list_mentionable_members()
    assert members[0].user_id == "u-2"


@pytest.mark.asyncio
async def test_contacts_list_get_update_and_actions() -> None:
    page = {
        "items": [
            {
                "id": "k-1",
                "name": "Ann",
                "email": None,
                "phone": None,
                "externalId": "ext",
                "firstSeenAt": "2026-11-01T10:00:00Z",
                "lastSeenAt": "2026-11-02T10:00:00Z",
                "blocked": False,
                "conversationCount": 2,
            }
        ],
        "total": 1,
        "page": 1,
        "pageSize": 25,
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.method == "POST":
            return httpx.Response(204)
        if r.method == "DELETE":
            return httpx.Response(200, json={"conversationsDeleted": 2, "messagesDeleted": 9})
        if r.url.path == "/api/v1/contacts":
            return httpx.Response(200, json=page)
        return httpx.Response(200, json=CONTACT)

    client, seen = make_client(respond)
    result = await client.contacts.list(search="ann", blocked=False, page=2)
    assert dict(seen[0].url.params) == {"search": "ann", "blocked": "false", "page": "2"}
    assert result.items[0].conversation_count == 2
    detail = await client.contacts.get("k-1")
    assert detail.conversations[0].status == "open" and detail.locale == "ar"
    await client.contacts.update("k-1", email="")
    assert (seen[2].method, body(seen[2])) == ("PATCH", {"email": ""})
    await client.contacts.block("k-1")
    assert seen[3].url.path == "/api/v1/contacts/k-1/block"
    await client.contacts.unblock("k-1")
    assert seen[4].url.path == "/api/v1/contacts/k-1/unblock"
    erased = await client.contacts.erase("k-1")
    assert (erased.conversations_deleted, erased.messages_deleted) == (2, 9)


@pytest.mark.asyncio
async def test_contact_notes() -> None:
    note = {
        "id": "n-1",
        "contactId": "k-1",
        "authorId": "u-1",
        "authorName": None,
        "content": "vip",
        "createdAt": "2026-11-10T10:00:00Z",
        "updatedAt": "2026-11-10T10:00:00Z",
        "canEdit": True,
        "canDelete": False,
    }
    client, seen = make_client(
        lambda r: (
            httpx.Response(204)
            if r.method == "DELETE"
            else httpx.Response(200, json=[note] if r.method == "GET" else note)
        )
    )
    assert (await client.contacts.list_notes("k-1"))[0].contact_id == "k-1"
    await client.contacts.create_note("k-1", "vip")
    assert body(seen[1]) == {"content": "vip"}
    await client.contacts.update_note("k-1", "n-1", "x")
    assert seen[2].url.path == "/api/v1/contacts/k-1/notes/n-1"
    await client.contacts.delete_note("k-1", "n-1")
    assert seen[3].method == "DELETE"


@pytest.mark.asyncio
async def test_contact_merge_suggestions_merge_and_dismiss() -> None:
    side = {
        "id": "k-1",
        "name": "Ann",
        "email": None,
        "phone": "+201000",
        "channels": ["whatsapp"],
        "firstSeenAt": "2026-11-01T10:00:00Z",
        "lastSeenAt": "2026-11-02T10:00:00Z",
    }
    suggestion = {
        "matchedOn": "phone",
        "contactA": side,
        "contactB": {**side, "id": "k-2", "channels": []},
        "suggestedTargetId": "k-1",
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("/merge-dismissals"):
            return httpx.Response(204)
        if r.url.path.endswith("/merge"):
            return httpx.Response(200, json={"contactId": "k-1", "mergedContactId": "k-2"})
        return httpx.Response(200, json=[suggestion])

    client, seen = make_client(respond)
    found = await client.contacts.list_merge_suggestions()
    assert (found[0].matched_on, found[0].contact_a.channels, found[0].suggested_target_id) == (
        "phone",
        ["whatsapp"],
        "k-1",
    )
    assert (await client.contacts.merge("k/1", "k-2")).merged_contact_id == "k-2"
    await client.contacts.dismiss_merge_suggestion("k-1", "k-2")
    assert [(r.method, r.url.raw_path.decode()) for r in seen] == [
        ("GET", "/api/v1/contacts/merge-suggestions"),
        ("POST", "/api/v1/contacts/k%2F1/merge"),
        ("POST", "/api/v1/contacts/merge-dismissals"),
    ]
    assert body(seen[1]) == {"sourceContactId": "k-2"}
    assert body(seen[2]) == {"contactAId": "k-1", "contactBId": "k-2"}


@pytest.mark.asyncio
async def test_contact_merge_conflict_code_is_available() -> None:
    client, _ = make_client(
        lambda r: httpx.Response(
            409, json={"error": "same channel", "code": "merge_conflicting_identities"}
        )
    )
    with pytest.raises(ErghiError) as info:
        await client.contacts.merge("k-1", "k-2")
    assert info.value.status_code == 409
    assert info.value.details["code"] == "merge_conflicting_identities"

