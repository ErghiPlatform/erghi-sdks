"""Conversation Insights resource"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional, Union

from ..types import InsightPage, InsightSummary

if TYPE_CHECKING:
    from ..client import ErghiClient


def _iso(value: Union[str, datetime]) -> str:
    return value.isoformat() if isinstance(value, datetime) else value


class InsightsResource:
    """Topic, sentiment and outcome of finished conversations.

    Needs the ``view_insights`` workspace permission (Owner and Admin roles), so call it
    with a signed-in user's access token. API keys and client-credentials tokens get 403.
    An invalid filter is a 400 whose error code is ``invalid_filter``.

    Filters (all optional, all keyword): ``from_``/``to`` (ISO 8601 string or datetime),
    ``channel``, ``category``, ``topic``, ``sentiment`` (positive, neutral, negative),
    ``outcome`` (resolved_by_ai, resolved_by_agent, handed_off_unresolved, abandoned,
    spam_or_empty) and ``min_confidence`` (0 to 1).
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    @staticmethod
    def _query(
        from_: Union[str, datetime, None],
        to: Union[str, datetime, None],
        channel: Optional[str],
        category: Optional[str],
        topic: Optional[str],
        sentiment: Optional[str],
        outcome: Optional[str],
        min_confidence: Optional[float],
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {}
        if from_ is not None:
            query["from"] = _iso(from_)
        if to is not None:
            query["to"] = _iso(to)
        for key, value in (
            ("channel", channel),
            ("category", category),
            ("topic", topic),
            ("sentiment", sentiment),
            ("outcome", outcome),
        ):
            if value:
                query[key] = value
        if min_confidence is not None:
            query["minConfidence"] = min_confidence
        return query

    async def summary(
        self,
        *,
        from_: Union[str, datetime, None] = None,
        to: Union[str, datetime, None] = None,
        channel: Optional[str] = None,
        category: Optional[str] = None,
        topic: Optional[str] = None,
        sentiment: Optional[str] = None,
        outcome: Optional[str] = None,
        min_confidence: Optional[float] = None,
    ) -> InsightSummary:
        """Counts by outcome, sentiment, category, topic (top 20) and language, plus the AI-resolved rate"""
        params = self._query(
            from_, to, channel, category, topic, sentiment, outcome, min_confidence
        )
        response = await self.client.request("GET", "/api/v1/insights/summary", params=params)
        return InsightSummary.model_validate(response.json())

    async def list_conversations(
        self,
        *,
        from_: Union[str, datetime, None] = None,
        to: Union[str, datetime, None] = None,
        channel: Optional[str] = None,
        category: Optional[str] = None,
        topic: Optional[str] = None,
        sentiment: Optional[str] = None,
        outcome: Optional[str] = None,
        min_confidence: Optional[float] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> InsightPage:
        """Classified conversations, newest first. ``page_size`` is capped at 100 by the server."""
        params = self._query(
            from_, to, channel, category, topic, sentiment, outcome, min_confidence
        )
        if page is not None:
            params["page"] = page
        if page_size is not None:
            params["pageSize"] = page_size
        response = await self.client.request(
            "GET", "/api/v1/insights/conversations", params=params
        )
        return InsightPage.model_validate(response.json())

    async def export_csv(
        self,
        *,
        from_: Union[str, datetime, None] = None,
        to: Union[str, datetime, None] = None,
        channel: Optional[str] = None,
        category: Optional[str] = None,
        topic: Optional[str] = None,
        sentiment: Optional[str] = None,
        outcome: Optional[str] = None,
        min_confidence: Optional[float] = None,
    ) -> str:
        """The same rows as CSV text (newest first, at most 10,000 rows).

        The server's file starts with a UTF-8 byte-order mark so Excel reads Arabic correctly;
        it is kept in the returned string, so write it with ``encoding="utf-8"`` as is. Text
        fields that start with ``= + - @`` are prefixed with ``'`` so a spreadsheet will not
        run them as formulas.
        """
        params = self._query(
            from_, to, channel, category, topic, sentiment, outcome, min_confidence
        )
        response = await self.client.request("GET", "/api/v1/insights/export.csv", params=params)
        return response.text
