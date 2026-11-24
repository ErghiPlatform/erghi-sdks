"""Types for reply engines: your own agent answering a widget's visitors instead of Erghi AI.

Admin models (``ReplyEngine`` and friends) read the platform's camelCase JSON and expose snake_case
attributes. Runtime models (``AgentReply``, ``TurnRequest``...) are snake_case on the wire, like the
platform's runtime API and webhook payloads. Values the server sends as enum names (``"Webhook"``,
``"LiveConnection"``, ``"Active"``...) are plain strings, so a new server value never breaks parsing.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

REPLY_ENGINE_MODES = ("Webhook", "CustomModel", "LiveConnection", "Queue")
REPLY_ENGINE_FALLBACKS = ("ErghiAi", "Human", "FixedMessage")


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class _Snake(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ReplyEngineWrite(_Camel):
    """Every writable field of an engine. ``None`` means "not sent": on update the stored value is
    kept (PATCH). ``mode`` is immutable after create (400 ``mode_immutable``). Write-only secrets
    (``api_key``, header values, AWS keys) are never returned by the API."""

    name: Optional[str] = None
    mode: Optional[str] = None
    timeout_seconds: Optional[int] = None
    fallback: Optional[str] = None
    fallback_messages: Optional[Dict[str, str]] = None
    history_limit: Optional[int] = None
    include_contact_details: Optional[bool] = None
    observe_human_messages: Optional[bool] = None
    accept_superseded_replies: Optional[bool] = None
    circuit_failure_threshold: Optional[int] = None
    # Webhook
    url: Optional[str] = None
    response_mode: Optional[str] = None
    # Custom model
    base_url: Optional[str] = None
    model: Optional[str] = None
    context_mode: Optional[str] = None
    stream: Optional[bool] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    api_key: Optional[str] = None
    extra_headers: Optional[Dict[str, str]] = None
    # Live connection
    max_connections: Optional[int] = None
    # Queue
    turns_queue_url: Optional[str] = None
    replies_queue_url: Optional[str] = None
    region: Optional[str] = None
    auth: Optional[str] = None
    role_arn: Optional[str] = None
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore", protected_namespaces=()
    )

    def to_body(self) -> Dict[str, Any]:
        """The camelCase JSON body, unset fields left out."""
        return self.model_dump(by_alias=True, exclude_none=True)


class ReplyEngine(_Camel):
    """An engine as the API returns it. ``secret`` is set only on the create and rotate-secret
    responses, and only when Erghi generated one (``whsec_...``): it is shown once, store it."""

    id: str
    name: str
    mode: str
    status: str
    timeout_seconds: int = 0
    fallback: str = ""
    fallback_messages: Optional[Dict[str, str]] = None
    history_limit: int = 0
    include_contact_details: bool = False
    observe_human_messages: bool = False
    accept_superseded_replies: bool = False
    circuit_failure_threshold: int = 0
    has_secret: bool = False
    secret_rotated_at: Optional[datetime] = None
    previous_secret_expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    binding_count: int = 0
    url: Optional[str] = None
    response_mode: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    context_mode: Optional[str] = None
    stream: Optional[bool] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    has_api_key: Optional[bool] = None
    extra_headers: Optional[List[str]] = None
    max_connections: Optional[int] = None
    turns_queue_url: Optional[str] = None
    replies_queue_url: Optional[str] = None
    region: Optional[str] = None
    auth: Optional[str] = None
    role_arn: Optional[str] = None
    external_id: Optional[str] = None
    has_access_keys: Optional[bool] = None
    secret: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore", protected_namespaces=()
    )


class ReplyEngineList(_Camel):
    items: List[ReplyEngine]
    allowed_modes: List[str] = Field(default_factory=list)
    erghi_principal_arn: Optional[str] = None


class ReplyEngineName(_Camel):
    id: str
    name: str
    mode: str
    status: str


class ReplyEngineTestResult(_Camel):
    """A failing test is a normal answer (``ok`` False and an ``error_code`` such as ``timeout``,
    ``http_status``, ``no_live_client``), not an exception."""

    ok: bool
    latency_ms: int = 0
    error_code: Optional[str] = None
    detail: Optional[str] = None
    status: Optional[int] = None


class ReplyEngineCircuit(_Camel):
    state: str
    opened_at: Optional[datetime] = None
    retry_at: Optional[datetime] = None
    consecutive_failures: int = 0


class ReplyEngineHealth(_Camel):
    window_hours: int
    turns: int
    replied: int
    fell_back: int
    failed: int
    timed_out: int
    success_rate: Optional[float] = None
    p50_first_reply_ms: Optional[int] = None
    p95_first_reply_ms: Optional[int] = None
    circuit: ReplyEngineCircuit


class ReplyTurnLogItem(_Camel):
    id: str
    conversation_id: str
    status: str
    is_test: bool = False
    sequence: int = 0
    created_at: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None
    first_reply_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    first_reply_ms: Optional[int] = None
    close_reason: Optional[str] = None
    fallback_used: Optional[str] = None
    error_code: Optional[str] = None
    error_detail: Optional[str] = None
    reply_count: int = 0


class ReplyTurnLogPage(_Camel):
    items: List[ReplyTurnLogItem]
    next_cursor: Optional[str] = None


class WidgetReplyEngine(_Camel):
    """Current bindings of a widget: ``default`` is an engine id, ``"erghi"`` or None."""

    default: Optional[str] = None
    channels: Dict[str, str] = Field(default_factory=dict)
    available_channels: List[str] = Field(default_factory=list)


# -- Runtime (snake_case on the wire) ---------------------------------------


class AgentReplyMessage(_Snake):
    """One reply message (1-4000 characters, markdown like AI replies). ``actions`` is validated
    against the workspace's chat-action policy."""

    content: str
    actions: Optional[Any] = None


class AgentHandoff(_Snake):
    reason: Optional[str] = None


class AgentReply(_Snake):
    """The reply body. ``idempotency_key`` is required (at most 100 characters, unique per turn):
    a repeat with the same key returns the first answer and posts nothing again, so reuse the key
    when you retry. 1 to 5 messages (none with a handoff). ``final=False`` keeps the turn open."""

    idempotency_key: str
    messages: Optional[List[AgentReplyMessage]] = None
    final: Optional[bool] = None
    handoff: Optional[AgentHandoff] = None

    @classmethod
    def of(cls, idempotency_key: str, *messages: str) -> AgentReply:
        """A reply of plain text messages."""
        return cls(
            idempotency_key=idempotency_key,
            messages=[AgentReplyMessage(content=m) for m in messages],
        )

    def to_body(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=True)


class AgentReplyResult(_Snake):
    turn_id: str
    message_ids: List[str] = Field(default_factory=list)


class AgentTurn(_Snake):
    turn_id: str
    conversation_id: str
    status: str
    deadline_at: Optional[datetime] = None
    is_test: bool = False
    reply_count: int = 0
    close_reason: Optional[str] = None


class BotMessageResult(_Snake):
    message_ids: List[str] = Field(default_factory=list)


class TurnAttachment(_Snake):
    id: Optional[str] = None
    file_name: Optional[str] = None
    content_type: Optional[str] = None
    size: int = 0


class TurnMessage(_Snake):
    id: str
    conversation_id: str
    sender: str
    sender_id: Optional[str] = None
    is_ai: bool = False
    type: str = "text"
    content: Optional[str] = None
    attachments: List[TurnAttachment] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    reply_origin: Optional[str] = None
    reply_engine_name: Optional[str] = None


class TurnVisitor(_Snake):
    """``name``, ``email`` and ``phone`` are present only with "include contact details" on."""

    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class TurnConversation(_Snake):
    id: str
    channel: Optional[str] = None
    widget_id: Optional[str] = None
    language: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[Any] = None
    verified_identity: Optional[Any] = None
    visitor: Optional[TurnVisitor] = None
    summary: Optional[str] = None


class TurnReplyUrls(_Snake):
    url: Optional[str] = None
    typing_url: Optional[str] = None
    handoff_url: Optional[str] = None
    decline_url: Optional[str] = None


class TurnRequest(_Snake):
    """A ``turn.requested`` event: the visitor's unanswered messages and recent history. Answer
    before ``deadline_at``. ``is_test`` turns come from "Test connection": nothing is stored."""

    type: str
    api_version: Optional[str] = None
    turn_id: str
    sequence: int = 0
    engine_id: str
    workspace_id: str
    deadline_at: Optional[datetime] = None
    is_test: bool = False
    conversation: TurnConversation
    messages: List[TurnMessage] = Field(default_factory=list)
    history: List[TurnMessage] = Field(default_factory=list)
    reply: Optional[TurnReplyUrls] = None
