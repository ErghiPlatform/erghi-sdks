"""Wire-contract tests for the workforce resource: path, verb, body and partial-update omission."""

import json
from typing import Any, Callable

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import ErghiError

STATUS = {
    "state": "away",
    "reasonId": "r-1",
    "reasonName": "Lunch",
    "reasonColour": "#ccc",
    "since": "2026-11-20T10:00:00Z",
    "seq": 4,
    "source": "manual",
    "changedByName": None,
    "note": None,
    "activeChats": 1,
    "capacity": 5,
    "awayReassignMinutes": None,
}
REASON = {
    "id": "r-1",
    "name": "Lunch",
    "colour": "#ccc",
    "maxMinutes": 30,
    "reassignChats": False,
    "isSystem": False,
    "systemKey": None,
    "sortOrder": 1,
    "archived": False,
}
SKILL = {"id": "s-1", "name": "Billing", "description": "Refunds", "archived": False, "agentCount": 2}
PROFILE = {
    "userId": "u-1",
    "maxConcurrentChats": 4,
    "languages": ["ar"],
    "skills": [{"id": "s-1", "name": "Billing", "level": 2}],
}
SETTINGS = {
    "routing": {
        "aiRoutingEnabled": False,
        "languageMatch": "off",
        "skillWaitSeconds": 30,
        "offerMode": "off",
        "offerTimeoutSeconds": 20,
    },
    "features": {"analytics": True, "aiRouting": False},
    "statusOnSignIn": "ready",
    "requireAwayReason": False,
    "idleAwayMinutes": None,
    "signOutAfterHoursMinutes": None,
    "autoAwayAfterMissedOffers": None,
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
async def test_status_calls() -> None:
    client, seen = make_client(lambda r: httpx.Response(200, json=STATUS))
    assert (await client.workforce.get_my_status()).state == "away"
    await client.workforce.set_my_status("away", reason_id="r-1")
    await client.workforce.set_agent_status("a/1", "offline", return_chats=True)
    await client.workforce.sign_out_agent("a-1")
    assert [(r.method, r.url.path) for r in seen] == [
        ("GET", "/api/v1/workforce/me/status"),
        ("PUT", "/api/v1/workforce/me/status"),
        ("PUT", "/api/v1/workforce/agents/a/1/status"),
        ("POST", "/api/v1/workforce/agents/a-1/sign-out"),
    ]
    assert seen[2].url.raw_path == b"/api/v1/workforce/agents/a%2F1/status"  # id is escaped
    assert body(seen[1]) == {"state": "away", "reasonId": "r-1"}
    assert body(seen[2]) == {"state": "offline", "returnChats": True}


@pytest.mark.asyncio
async def test_away_reasons() -> None:
    client, seen = make_client(
        lambda r: httpx.Response(200, json=[REASON] if r.method == "GET" else REASON)
    )
    assert (await client.workforce.list_away_reasons(include_archived=True))[0].name == "Lunch"
    await client.workforce.create_away_reason("Lunch", color="#ccc", max_minutes=30)
    await client.workforce.update_away_reason("r-1", archived=False, reassign_chats=True)
    await client.workforce.archive_away_reason("r-1")
    assert seen[0].url.params["includeArchived"] == "true"
    assert (seen[1].method, seen[1].url.path) == ("POST", "/api/v1/workforce/away-reasons")
    assert body(seen[1]) == {"name": "Lunch", "color": "#ccc", "maxMinutes": 30}
    assert (seen[2].method, seen[2].url.path) == ("PUT", "/api/v1/workforce/away-reasons/r-1")
    assert body(seen[2]) == {"reassignChats": True, "archived": False}
    assert (seen[3].method, seen[3].url.path) == ("DELETE", "/api/v1/workforce/away-reasons/r-1")


@pytest.mark.asyncio
async def test_skills_and_profile() -> None:
    def respond(r: httpx.Request) -> httpx.Response:
        if "profile" in r.url.path:
            return httpx.Response(200, json=PROFILE)
        return httpx.Response(200, json=[SKILL] if r.method == "GET" else SKILL)

    client, seen = make_client(respond)
    assert (await client.workforce.list_skills())[0].agent_count == 2
    await client.workforce.create_skill("Billing", "Refunds")
    await client.workforce.update_skill("s-1", name="Billing 2")
    await client.workforce.archive_skill("s-1")
    await client.workforce.get_agent_profile("u-1")
    profile = await client.workforce.save_agent_profile(
        "u-1", max_concurrent_chats=4, languages=["ar"], skills=[{"skillId": "s-1", "level": 2}]
    )
    assert profile.skills[0].level == 2
    assert body(seen[1]) == {"name": "Billing", "description": "Refunds"}
    assert body(seen[2]) == {"name": "Billing 2"}
    assert seen[3].method == "DELETE"
    assert (seen[5].method, seen[5].url.path) == ("PUT", "/api/v1/workforce/agents/u-1/profile")
    assert body(seen[5]) == {
        "maxConcurrentChats": 4,
        "languages": ["ar"],
        "skills": [{"skillId": "s-1", "level": 2}],
    }


@pytest.mark.asyncio
async def test_settings_partial_update_omits_unset_and_sends_zero() -> None:
    client, seen = make_client(lambda r: httpx.Response(200, json=SETTINGS))
    got = await client.workforce.get_settings()
    assert got.idle_away_minutes is None
    await client.workforce.update_settings(idle_away_minutes=0)
    await client.workforce.update_settings(require_away_reason=True, offer_mode="ring")
    await client.workforce.update_settings()
    assert (seen[1].method, seen[1].url.path) == ("PUT", "/api/v1/workforce/settings")
    assert body(seen[1]) == {"idleAwayMinutes": 0}
    assert body(seen[2]) == {"requireAwayReason": True, "routing": {"offerMode": "ring"}}
    assert body(seen[3]) == {}


@pytest.mark.asyncio
async def test_offers_and_routing_decision() -> None:
    offer = {
        "offerId": "o-1",
        "conversationId": "c-1",
        "attempt": 1,
        "offeredAt": "2026-11-20T10:00:00Z",
        "expiresAt": "2026-11-20T10:00:20Z",
    }
    decision = {
        "conversationId": "c-1",
        "decidedAt": "2026-11-20T10:00:00Z",
        "step": "assigned",
        "candidates": [],
        "offers": [],
    }

    def respond(r: httpx.Request) -> httpx.Response:
        if r.url.path.endswith("/mine"):
            return httpx.Response(200, json={"items": [offer]})
        if r.url.path.endswith("/accept"):
            return httpx.Response(200, json={"conversationId": "c-1"})
        if r.url.path.endswith("/decline"):
            return httpx.Response(204)
        return httpx.Response(200, json=decision)

    client, seen = make_client(respond)
    assert (await client.workforce.list_my_offers())[0].offer_id == "o-1"
    assert await client.workforce.accept_offer("o-1") == "c-1"
    await client.workforce.decline_offer("o-1")
    assert (await client.workforce.get_routing_decision("c-1")).step == "assigned"
    assert [(r.method, r.url.path) for r in seen] == [
        ("GET", "/api/v1/workforce/offers/mine"),
        ("POST", "/api/v1/workforce/offers/o-1/accept"),
        ("POST", "/api/v1/workforce/offers/o-1/decline"),
        ("GET", "/api/v1/conversations/c-1/routing-decision"),
    ]


@pytest.mark.asyncio
async def test_reports_and_live() -> None:
    client, seen = make_client(lambda r: httpx.Response(200, json={"rows": []}, headers={}))
    await client.workforce.get_live()
    await client.workforce.get_agent_status_report(
        from_="2026-11-01", to="2026-11-08", time_zone="Africa/Cairo", group_by="agent"
    )
    await client.workforce.get_agent_status_timeline("a-1", from_="2026-11-01")
    await client.workforce.get_agent_performance_report(group_by="day")
    await client.workforce.export_agent_status_csv()
    await client.workforce.export_agent_performance_csv()
    assert seen[1].url.path == "/api/v1/reports/agent-status"
    assert dict(seen[1].url.params) == {
        "from": "2026-11-01",
        "to": "2026-11-08",
        "timeZone": "Africa/Cairo",
        "groupBy": "agent",
    }
    assert seen[2].url.path == "/api/v1/reports/agent-status/timeline"
    assert dict(seen[2].url.params) == {"agentId": "a-1", "from": "2026-11-01"}
    assert dict(seen[3].url.params) == {"groupBy": "day"}
    assert seen[4].url.path == "/api/v1/reports/agent-status/export.csv"
    assert seen[5].url.path == "/api/v1/reports/agent-performance/export.csv"


@pytest.mark.asyncio
async def test_conflict_code_is_available() -> None:
    client, _ = make_client(
        lambda r: httpx.Response(409, json={"error": "taken", "code": "offer_taken"})
    )
    with pytest.raises(ErghiError) as info:
        await client.workforce.accept_offer("o-1")
    assert info.value.status_code == 409
    assert info.value.details["code"] == "offer_taken"
