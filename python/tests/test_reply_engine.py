"""Reply engine: admin + runtime resources and the Standard Webhooks verifier."""

import json

import httpx
import pytest

from erghi import (
    AgentReply,
    ApiError,
    ErghiClient,
    NotFoundError,
    ReplyEngineWrite,
    WebhookVerificationError,
    is_valid_webhook,
    parse_turn_webhook,
    sign_webhook,
    verify_webhook,
)

# Independent vectors (HMAC computed outside this SDK).
SW_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
SW_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek"
SW_TS = 1614265330
SW_BODY = '{"test": 2432232314}'
SW_SIG = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="

U_SECRET = "whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEyMzQ1Njc4OTA="
U_ID = "5d1b6a8e-0f3c-4c1e-9a77-2f6f1c0a9b11"
U_TS = 1790000000


def _headers(sig=SW_SIG, wid=SW_ID, ts=SW_TS):
    return {"webhook-id": wid, "webhook-timestamp": str(ts), "webhook-signature": sig}


def test_sign_matches_known_vector():
    assert sign_webhook(SW_SECRET, SW_ID, SW_TS, SW_BODY) == SW_SIG


def test_sign_non_ascii_vector():
    body = '{"content":"مرحبا ✓"}'
    sig = sign_webhook(U_SECRET, U_ID, U_TS, body)
    assert sig.startswith("v1,")
    assert is_valid_webhook(U_SECRET, _headers(sig, U_ID, U_TS), body.encode(), now=U_TS)


def test_verify_accepts_known_vector():
    verify_webhook(SW_SECRET, _headers(), SW_BODY, now=SW_TS + 10)


def test_verify_accepts_any_entry_during_rotation():
    sig = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= " + SW_SIG
    verify_webhook(SW_SECRET, _headers(sig), SW_BODY, now=SW_TS)


def test_headers_case_insensitive():
    h = {"Webhook-Id": SW_ID, "Webhook-Timestamp": str(SW_TS), "Webhook-Signature": SW_SIG}
    verify_webhook(SW_SECRET, h, SW_BODY, now=SW_TS)


@pytest.mark.parametrize(
    "mutate,reason",
    [
        (lambda h, b: (h, b + " "), "no_matching_signature"),
        (lambda h, b: ({**h, "webhook-id": "other"}, b), "no_matching_signature"),
        (lambda h, b: ({k: v for k, v in h.items() if k != "webhook-id"}, b), "missing_headers"),
        (lambda h, b: ({**h, "webhook-timestamp": "abc"}, b), "bad_timestamp"),
    ],
)
def test_verify_rejects(mutate, reason):
    h, b = mutate(_headers(), SW_BODY)
    with pytest.raises(WebhookVerificationError) as exc:
        verify_webhook(SW_SECRET, h, b, now=SW_TS)
    assert exc.value.reason == reason


def test_verify_rejects_old_and_future_timestamps():
    with pytest.raises(WebhookVerificationError) as old:
        verify_webhook(SW_SECRET, _headers(), SW_BODY, now=SW_TS + 301)
    assert old.value.reason == "timestamp_too_old"
    with pytest.raises(WebhookVerificationError) as fut:
        verify_webhook(SW_SECRET, _headers(), SW_BODY, now=SW_TS - 301)
    assert fut.value.reason == "timestamp_in_future"
    verify_webhook(SW_SECRET, _headers(), SW_BODY, now=SW_TS + 299)


def test_verify_wrong_secret_and_bad_secret():
    other = "whsec_" + "QUJD" * 8
    assert not is_valid_webhook(other, _headers(), SW_BODY, now=SW_TS)
    with pytest.raises(ValueError):
        verify_webhook("whsec_!!!", _headers(), SW_BODY, now=SW_TS)


def test_parse_turn_webhook():
    body = json.dumps(
        {
            "type": "turn.requested",
            "turn_id": SW_ID,
            "sequence": 7,
            "engine_id": "e1",
            "workspace_id": "w1",
            "is_test": False,
            "conversation": {"id": "c1", "visitor": {"id": "v1"}},
            "messages": [
                {"id": "m1", "conversation_id": "c1", "sender": "visitor", "content": "hi"}
            ],
            "reply": {"url": "https://x/replies"},
        }
    )
    sig = sign_webhook(SW_SECRET, SW_ID, SW_TS, body)
    turn = parse_turn_webhook(SW_SECRET, _headers(sig), body, now=SW_TS)
    assert turn.turn_id == SW_ID and turn.sequence == 7
    assert turn.messages[0].content == "hi"
    assert turn.reply.url == "https://x/replies"


def _client(handler):
    client = ErghiClient(api_url="https://api.test")
    client.set_access_token("tok")
    client._http_client = httpx.AsyncClient(
        base_url="https://api.test", transport=httpx.MockTransport(handler)
    )
    return client


async def test_admin_create_sends_camel_case_and_returns_secret():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"], seen["path"] = request.method, request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            201,
            json={
                "id": "e1",
                "name": "Bot",
                "mode": "Webhook",
                "status": "Active",
                "timeoutSeconds": 20,
                "hasSecret": True,
                "secret": "whsec_abc",
                "url": "https://hook.test",
            },
        )

    client = _client(handler)
    engine = await client.reply_engines.create(
        ReplyEngineWrite(name="Bot", mode="Webhook", url="https://hook.test", timeout_seconds=20)
    )
    assert seen["method"] == "POST" and seen["path"] == "/api/v1/reply-engines"
    assert seen["body"] == {
        "name": "Bot",
        "mode": "Webhook",
        "url": "https://hook.test",
        "timeoutSeconds": 20,
    }
    assert engine.secret == "whsec_abc" and engine.has_secret and engine.timeout_seconds == 20


async def test_admin_paths_and_query():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.raw_path.decode()))
        if request.url.path.endswith("/turns"):
            return httpx.Response(200, json={"items": [], "nextCursor": "c2"})
        if request.url.path.endswith("/reply-engine") and request.method == "GET":
            return httpx.Response(
                200, json={"default": "e1", "channels": {"telegram": "erghi"}, "availableChannels": ["telegram"]}
            )
        if request.url.path.endswith("/reply-engine"):
            return httpx.Response(204)
        if request.url.path.endswith("/test"):
            return httpx.Response(200, json={"ok": False, "latencyMs": 5, "errorCode": "timeout"})
        return httpx.Response(204)

    client = _client(handler)
    page = await client.reply_engines.list_turns("e1", cursor="c1", limit=10, include_tests=True)
    assert page.next_cursor == "c2"
    binding = await client.reply_engines.get_widget_binding("w1")
    assert binding.default == "e1" and binding.channels["telegram"] == "erghi"
    await client.reply_engines.set_widget_binding("w1", default="e1", channels={"telegram": None})
    result = await client.reply_engines.test("e1")
    assert result.ok is False and result.error_code == "timeout"
    await client.reply_engines.delete("../admin")
    assert calls[0][1].startswith("/api/v1/reply-engines/e1/turns?")
    assert "cursor=c1" in calls[0][1] and "limit=10" in calls[0][1] and "includeTests=true" in calls[0][1]
    assert calls[-1] == ("DELETE", "/api/v1/reply-engines/..%2Fadmin")


async def test_runtime_reply_snake_case_and_errors():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/replies"):
            body = json.loads(request.content)
            seen["body"] = body
            if body["idempotency_key"] == "closed":
                return httpx.Response(
                    409,
                    json={"error": "Turn closed", "message": "Turn closed", "code": "turn_closed", "reason": "deadline"},
                )
            return httpx.Response(200, json={"turn_id": "t1", "message_ids": ["m1"]})
        if request.url.path.endswith("/take-back"):
            seen["take"] = json.loads(request.content)
            return httpx.Response(204)
        return httpx.Response(404, json={"error": "nope", "code": "not_found"})

    client = _client(handler)
    result = await client.agent_runtime.reply("t1", AgentReply.of("k1", "hello"))
    assert seen["body"] == {"idempotency_key": "k1", "messages": [{"content": "hello"}]}
    assert result.message_ids == ["m1"]

    with pytest.raises(ApiError) as exc:
        await client.agent_runtime.reply("t1", AgentReply.of("closed", "x"))
    assert exc.value.status_code == 409
    assert exc.value.error_code == "turn_closed" and exc.value.reason == "deadline"

    await client.agent_runtime.take_back("c1", force=True)
    assert seen["take"] == {"force": True}

    with pytest.raises(NotFoundError):
        await client.agent_runtime.get_turn("missing")
