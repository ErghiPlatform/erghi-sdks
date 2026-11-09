"""Wire-contract tests for the insights resource."""

from datetime import datetime, timezone
from typing import Any, Callable, Tuple, List

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import ErghiError

SUMMARY = {
    "total": 4,
    "aiResolvedRate": 0.5,
    "outcomes": [{"key": "ResolvedByAi", "count": 2}],
    "sentiments": [{"key": "Neutral", "count": 4}],
    "categories": [],
    "topics": [{"key": "refund", "count": 3}],
    "languages": [{"key": "ar", "count": 4}],
}
ROW = {
    "conversationId": "c-1",
    "topic": "refund",
    "category": "billing",
    "sentiment": "Negative",
    "sentimentEnd": "Neutral",
    "outcome": "ResolvedByAgent",
    "language": "ar-EG",
    "summary": "Asked for a refund.",
    "confidence": 0.9,
    "classifiedAt": "2026-11-09T10:00:00Z",
    "stale": False,
}


def make_client(
    respond: Callable[[httpx.Request], httpx.Response],
) -> Tuple[ErghiClient, List[httpx.Request]]:
    seen: List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return respond(request)

    client = ErghiClient(api_url="http://erghi.test")
    client._http_client = httpx.AsyncClient(
        base_url="http://erghi.test", transport=httpx.MockTransport(handler)
    )
    return client, seen


@pytest.mark.asyncio
async def test_summary_sends_only_set_filters() -> None:
    client, seen = make_client(lambda _: httpx.Response(200, json=SUMMARY))
    result = await client.insights.summary(
        from_=datetime(2026, 11, 1, tzinfo=timezone.utc),
        outcome="resolved_by_ai",
        min_confidence=0.5,
        topic="",
    )
    assert seen[0].url.path == "/api/v1/insights/summary"
    assert dict(seen[0].url.params) == {
        "from": "2026-11-01T00:00:00+00:00",
        "outcome": "resolved_by_ai",
        "minConfidence": "0.5",
    }
    assert result.total == 4
    assert result.ai_resolved_rate == 0.5
    assert result.topics[0].key == "refund"


@pytest.mark.asyncio
async def test_list_conversations_pages_and_parses_rows() -> None:
    page = {"total": 1, "page": 2, "pageSize": 50, "items": [ROW]}
    client, seen = make_client(lambda _: httpx.Response(200, json=page))
    result = await client.insights.list_conversations(
        channel="widget", sentiment="negative", page=2, page_size=50
    )
    assert seen[0].url.path == "/api/v1/insights/conversations"
    assert dict(seen[0].url.params) == {
        "channel": "widget",
        "sentiment": "negative",
        "page": "2",
        "pageSize": "50",
    }
    assert result.page_size == 50
    row = result.items[0]
    assert row.conversation_id == "c-1"
    assert row.sentiment_end == "Neutral"
    assert row.language == "ar-EG"
    assert row.classified_at.year == 2026


@pytest.mark.asyncio
async def test_export_csv_returns_text_with_bom() -> None:
    csv = "﻿conversation_id,classified_at\r\n"
    client, seen = make_client(lambda _: httpx.Response(200, text=csv))
    assert await client.insights.export_csv(to="2026-12-01T00:00:00Z") == csv
    assert seen[0].url.path == "/api/v1/insights/export.csv"
    assert dict(seen[0].url.params) == {"to": "2026-12-01T00:00:00Z"}


@pytest.mark.asyncio
async def test_invalid_filter_surfaces_as_error() -> None:
    client, _ = make_client(
        lambda _: httpx.Response(
            400, json={"error": "sentiment must be positive, neutral or negative.", "code": "invalid_filter"}
        )
    )
    with pytest.raises(ErghiError):
        await client.insights.summary(sentiment="angry")
