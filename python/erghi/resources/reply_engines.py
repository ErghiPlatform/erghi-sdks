"""Reply engine resources: admin (create and bind engines) and runtime (answer turns)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from urllib.parse import quote

from ..reply_types import (
    AgentReply,
    AgentReplyResult,
    AgentTurn,
    BotMessageResult,
    ReplyEngine,
    ReplyEngineHealth,
    ReplyEngineList,
    ReplyEngineName,
    ReplyEngineTestResult,
    ReplyEngineWrite,
    ReplyTurnLogPage,
    WidgetReplyEngine,
)

if TYPE_CHECKING:
    from ..client import ErghiClient

_BASE = "/api/v1/reply-engines"


def _seg(value: str) -> str:
    return quote(str(value), safe="")


class ReplyEnginesResource:
    """Admin side of the reply engine: create and manage the customer's own agents that answer a
    widget's visitors instead of Erghi AI, and choose which one answers which widget.

    Every call needs ``configure_ai`` (the names list and reading a widget's binding also admit
    ``manage_widgets``). The workspace comes from the credential, never a parameter. Another
    workspace's id is a plain 404 (``NotFoundError``); 403 and 409 answers raise ``ApiError`` with
    the platform's machine code in ``error_code`` (for example ``configure_ai_required``).
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    async def list(self) -> ReplyEngineList:
        """All engines, the modes the plan allows and (for queue assume-role) Erghi's principal ARN"""
        response = await self.client.request("GET", _BASE)
        return ReplyEngineList.model_validate(response.json())

    async def list_names(self) -> List[ReplyEngineName]:
        """Id, name, mode and status only"""
        response = await self.client.request("GET", _BASE, params={"view": "names"})
        return [ReplyEngineName.model_validate(item) for item in response.json()]

    async def get(self, engine_id: str) -> ReplyEngine:
        response = await self.client.request("GET", f"{_BASE}/{_seg(engine_id)}")
        return ReplyEngine.model_validate(response.json())

    async def create(self, engine: ReplyEngineWrite) -> ReplyEngine:
        """Creates an engine (starts enabled). For Webhook and Queue the response carries the
        generated ``whsec_`` signing secret in ``secret``: shown once, store it now."""
        response = await self.client.request("POST", _BASE, json=engine.to_body())
        return ReplyEngine.model_validate(response.json())

    async def update(self, engine_id: str, changes: ReplyEngineWrite) -> ReplyEngine:
        """Changes only the fields you set. ``mode`` cannot change."""
        response = await self.client.request(
            "PATCH", f"{_BASE}/{_seg(engine_id)}", json=changes.to_body()
        )
        return ReplyEngine.model_validate(response.json())

    async def delete(self, engine_id: str) -> None:
        """Soft-deletes the engine, removes its bindings and closes its open turns"""
        await self.client.request("DELETE", f"{_BASE}/{_seg(engine_id)}")

    async def enable(self, engine_id: str) -> ReplyEngine:
        response = await self.client.request("POST", f"{_BASE}/{_seg(engine_id)}/enable")
        return ReplyEngine.model_validate(response.json())

    async def disable(self, engine_id: str) -> ReplyEngine:
        """A disabled engine keeps its bindings but is skipped: Erghi AI answers instead"""
        response = await self.client.request("POST", f"{_BASE}/{_seg(engine_id)}/disable")
        return ReplyEngine.model_validate(response.json())

    async def rotate_secret(self, engine_id: str) -> ReplyEngine:
        """New signing secret (in ``secret``, returned once). The previous one keeps signing for a
        24 hour grace window (``previous_secret_expires_at``)."""
        response = await self.client.request("POST", f"{_BASE}/{_seg(engine_id)}/rotate-secret")
        return ReplyEngine.model_validate(response.json())

    async def test(self, engine_id: str) -> ReplyEngineTestResult:
        """Sends a test turn to the saved config; read ``ok`` / ``error_code`` (no exception)"""
        response = await self.client.request("POST", f"{_BASE}/{_seg(engine_id)}/test")
        return ReplyEngineTestResult.model_validate(response.json())

    async def health(self, engine_id: str) -> ReplyEngineHealth:
        """The last 24 hours: counts, p50/p95 first reply and the circuit breaker"""
        response = await self.client.request("GET", f"{_BASE}/{_seg(engine_id)}/health")
        return ReplyEngineHealth.model_validate(response.json())

    async def list_turns(
        self,
        engine_id: str,
        *,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        include_tests: bool = False,
    ) -> ReplyTurnLogPage:
        """Turn log, newest first. Pass the previous page's ``next_cursor``; limit up to 100."""
        params: Dict[str, Any] = {}
        if cursor is not None:
            params["cursor"] = cursor
        if limit is not None:
            params["limit"] = limit
        if include_tests:
            params["includeTests"] = "true"
        response = await self.client.request(
            "GET", f"{_BASE}/{_seg(engine_id)}/turns", params=params
        )
        return ReplyTurnLogPage.model_validate(response.json())

    async def get_widget_binding(self, widget_id: str) -> WidgetReplyEngine:
        """Which engine answers the widget (and each of its channels)"""
        response = await self.client.request(
            "GET", f"/api/v1/widgets/{_seg(widget_id)}/reply-engine"
        )
        return WidgetReplyEngine.model_validate(response.json())

    async def set_widget_binding(
        self,
        widget_id: str,
        *,
        default: Optional[str] = None,
        channels: Optional[Dict[str, Optional[str]]] = None,
    ) -> None:
        """Replaces the widget's bindings. ``default="erghi"`` pins Erghi AI explicitly, None
        removes the binding. ``channels`` maps a channel key (``"telegram"``) to an engine id,
        ``"erghi"`` or None/``"default"``. Erghi AI turned off on the widget wins over a binding."""
        await self.client.request(
            "PUT",
            f"/api/v1/widgets/{_seg(widget_id)}/reply-engine",
            json={"default": default, "channels": channels},
        )


class AgentRuntimeResource:
    """Runtime side of the reply engine, for the code that answers a turn Erghi sent to your agent
    (webhook, live connection or queue). Needs an API key (``client_id`` and ``client_secret``)
    holding ``agent:runtime``; the workspace is the key's. A turn or conversation of another
    workspace is a 404, never a 403. A turn that already ended answers 409: ``ApiError`` with
    ``error_code`` ``turn_closed`` (see ``reason``) or ``turn_superseded``; stop work on it."""

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    @staticmethod
    def _turn(turn_id: str) -> str:
        return f"/api/v1/agent/turns/{_seg(turn_id)}"

    @staticmethod
    def _conversation(conversation_id: str) -> str:
        return f"/api/v1/agent/conversations/{_seg(conversation_id)}"

    async def get_turn(self, turn_id: str) -> AgentTurn:
        response = await self.client.request("GET", self._turn(turn_id))
        return AgentTurn.model_validate(response.json())

    async def reply(self, turn_id: str, reply: AgentReply) -> AgentReplyResult:
        """Posts the reply as bot messages. Safe to retry with the same ``idempotency_key``. A
        reply carrying ``handoff`` also hands the conversation to a person."""
        response = await self.client.request(
            "POST", self._turn(turn_id) + "/replies", json=reply.to_body()
        )
        return AgentReplyResult.model_validate(response.json())

    async def typing(self, turn_id: str) -> None:
        """Shows the typing indicator in the widget for a few seconds; never extends the deadline"""
        await self.client.request("POST", self._turn(turn_id) + "/typing")

    async def handoff(self, turn_id: str, reason: Optional[str] = None) -> None:
        """Gives the conversation to a person. 409 ``handoff_unavailable`` when the workspace
        turned handoff off."""
        await self.client.request(
            "POST", self._turn(turn_id) + "/handoff", json=_without_none({"reason": reason})
        )

    async def decline(self, turn_id: str, reason: Optional[str] = None) -> None:
        """Says this agent will not answer, so the engine's fallback applies now, not at the deadline"""
        await self.client.request(
            "POST", self._turn(turn_id) + "/decline", json=_without_none({"reason": reason})
        )

    async def take_back(self, conversation_id: str, *, force: bool = False) -> None:
        """Takes a conversation back from a person (or Erghi AI) for this engine. 409
        ``human_engaged`` when a teammate already replied (unless ``force``), 409
        ``conversation_closed`` when it is closed."""
        await self.client.request(
            "POST", self._conversation(conversation_id) + "/take-back", json={"force": force}
        )

    async def post_bot_message(
        self, conversation_id: str, idempotency_key: str, content: str
    ) -> BotMessageResult:
        """Posts a bot message into a conversation this engine holds, outside any turn. 409
        ``not_held`` when no engine holds it. Idempotent per key."""
        response = await self.client.request(
            "POST",
            self._conversation(conversation_id) + "/bot-messages",
            json={"idempotency_key": idempotency_key, "content": content},
        )
        return BotMessageResult.model_validate(response.json())


def _without_none(value: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in value.items() if v is not None}
