"""Type definitions for Erghi SDK"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    """User model"""

    id: str
    email: EmailStr
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")
    avatar: Optional[str] = None
    role: str
    email_verified: bool = Field(alias="emailVerified")
    two_factor_enabled: bool = Field(alias="twoFactorEnabled")
    created_at: datetime = Field(alias="createdAt")
    last_login_at: Optional[datetime] = Field(None, alias="lastLoginAt")

    class Config:
        populate_by_name = True

    @classmethod
    def from_gotrue(cls, data: Dict[str, Any]) -> "User":
        """Build from the auth server's snake_case user object."""
        metadata: Dict[str, Any] = data.get("user_metadata") or {}

        def text(key: str) -> Optional[str]:
            value = metadata.get(key)
            return value if isinstance(value, str) else None

        return cls.model_validate(
            {
                "id": data["id"],
                "email": data.get("email") or "",
                "firstName": text("first_name"),
                "lastName": text("last_name"),
                "avatar": text("avatar_url"),
                "role": data.get("role") or "authenticated",
                "emailVerified": bool(data.get("email_confirmed_at")),
                "twoFactorEnabled": bool(data.get("factors")),
                "createdAt": data["created_at"],
                "lastLoginAt": data.get("last_sign_in_at"),
            }
        )


class RegisterRequest(BaseModel):
    """Register request"""

    email: EmailStr
    password: str
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")

    class Config:
        populate_by_name = True


class LoginRequest(BaseModel):
    """Login request"""

    email: EmailStr
    password: str
    two_factor_code: Optional[str] = Field(None, alias="twoFactorCode")

    class Config:
        populate_by_name = True


class AuthResponse(BaseModel):
    """Authentication response.

    Tokens are empty strings when registration is pending email confirmation.
    """

    access_token: str = Field(alias="accessToken")
    refresh_token: str = Field(alias="refreshToken")
    expires_in: int = Field(alias="expiresIn")
    token_type: str = Field(alias="tokenType")
    user: User

    class Config:
        populate_by_name = True

    @classmethod
    def from_gotrue(cls, data: Dict[str, Any]) -> "AuthResponse":
        """Build from an auth server session (or a bare user from signup)."""
        user = data.get("user") or data
        return cls.model_validate(
            {
                "accessToken": data.get("access_token") or "",
                "refreshToken": data.get("refresh_token") or "",
                "expiresIn": data.get("expires_in") or 0,
                "tokenType": data.get("token_type") or "bearer",
                "user": User.from_gotrue(user),
            }
        )


class Attachment(BaseModel):
    """Message attachment"""

    id: str
    filename: str
    content_type: str = Field(alias="contentType")
    size: int
    url: str

    class Config:
        populate_by_name = True


class Message(BaseModel):
    """Chat message"""

    id: str
    conversation_id: str = Field(alias="conversationId")
    sender: Literal["visitor", "agent", "system", "ai"]
    sender_id: Optional[str] = Field(None, alias="senderId")
    type: Literal["text", "image", "file", "system"]
    content: str
    attachments: Optional[List[Attachment]] = None
    created_at: datetime = Field(alias="createdAt")
    read_at: Optional[datetime] = Field(None, alias="readAt")
    is_ai: bool = Field(alias="isAI")
    ai_model: Optional[str] = Field(None, alias="aiModel")
    # "voice" when the visitor sent it as a voice note (content is the transcript).
    source: Optional[str] = None

    class Config:
        populate_by_name = True


class Conversation(BaseModel):
    """Chat conversation"""

    id: str
    workspace_id: str = Field(alias="workspaceId")
    widget_id: str = Field(alias="widgetId")
    visitor_id: Optional[str] = Field(None, alias="visitorId")
    assigned_agent_id: Optional[str] = Field(None, alias="assignedAgentId")
    status: Literal["open", "assigned", "resolved", "closed"]
    channel: Literal["web_widget", "email", "sms", "whatsapp"]
    started_at: datetime = Field(alias="startedAt")
    closed_at: Optional[datetime] = Field(None, alias="closedAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class Workspace(BaseModel):
    """Workspace of the signed-in user's account"""

    id: str = Field(alias="workspaceId")
    name: str
    slug: str = ""
    is_current: bool = Field(False, alias="isCurrent")

    class Config:
        populate_by_name = True

    @classmethod
    def from_summary(cls, data: Dict[str, Any]) -> "Workspace":
        """Build from a ``GET /api/v1/accounts/workspaces`` row."""
        return cls.model_validate(
            {
                "workspaceId": data["workspaceId"],
                "name": data["name"],
                "slug": data.get("slug") or "",
                "isCurrent": bool(data.get("isCurrent")),
            }
        )


class InsightCount(BaseModel):
    """One bucket of an insights summary"""

    key: str
    count: int


class InsightSummary(BaseModel):
    """``GET /api/v1/insights/summary``"""

    total: int
    # AI-resolved over conversations that needed a reply (spam/empty excluded); None when none.
    ai_resolved_rate: Optional[float] = Field(None, alias="aiResolvedRate")
    outcomes: List[InsightCount] = []
    sentiments: List[InsightCount] = []
    # None when the workspace's plan locks the field (named in ``locked``).
    categories: Optional[List[InsightCount]] = None
    topics: Optional[List[InsightCount]] = None
    languages: Optional[List[InsightCount]] = None
    # Effective plan, locked field names, counts of locked topics/categories, and the readable window.
    plan: Optional[str] = None
    locked: List[str] = []
    locked_counts: Dict[str, int] = Field(default_factory=dict, alias="lockedCounts")
    window_days: Optional[int] = Field(None, alias="windowDays")
    from_: Optional[datetime] = Field(None, alias="from")

    class Config:
        populate_by_name = True


class InsightConversation(BaseModel):
    """One classified conversation"""

    conversation_id: str = Field(alias="conversationId")
    topic: Optional[str] = None  # None when the plan locks it (Starter)
    category: Optional[str] = None
    sentiment: Literal["Positive", "Neutral", "Negative"]
    sentiment_end: Literal["Positive", "Neutral", "Negative"] = Field(alias="sentimentEnd")
    outcome: Literal[
        "ResolvedByAi", "ResolvedByAgent", "HandedOffUnresolved", "Abandoned", "SpamOrEmpty"
    ]
    language: Optional[str] = None  # BCP-47 tag; None when locked
    summary: Optional[str] = None
    confidence: Optional[float] = None  # 0 to 1; None when locked
    classified_at: datetime = Field(alias="classifiedAt")
    stale: bool  # reopened since; reclassified on its next close

    class Config:
        populate_by_name = True


class InsightPage(BaseModel):
    """``GET /api/v1/insights/conversations``"""

    total: int
    page: int
    page_size: int = Field(alias="pageSize")
    items: List[InsightConversation] = []
    plan: Optional[str] = None
    locked: List[str] = []
    window_days: Optional[int] = Field(None, alias="windowDays")
    from_: Optional[datetime] = Field(None, alias="from")

    class Config:
        populate_by_name = True


class PaginationParams(BaseModel):
    """Pagination parameters"""

    page: Optional[int] = 1
    limit: Optional[int] = 50
    sort: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = "desc"


class PaginatedResponse(BaseModel):
    """Paginated response"""

    data: List[Any]
    total: int
    page: int
    limit: int
    total_pages: int = Field(alias="totalPages")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Inbox: labels, notes, saved replies, contacts, notifications
# ---------------------------------------------------------------------------


class ConversationLabel(BaseModel):
    """A workspace conversation label"""

    id: str
    name: str
    color: str
    description: Optional[str] = None


class ConversationLabelList(BaseModel):
    """``GET /api/v1/conversation-labels``"""

    max_labels: int = Field(alias="maxLabels")
    labels: List[ConversationLabel] = []

    class Config:
        populate_by_name = True


class ConversationNote(BaseModel):
    """A private (internal-only) note on a conversation; visitors never see it"""

    id: str
    conversation_id: str = Field(alias="conversationId")
    author_id: str = Field(alias="authorId")
    author_name: Optional[str] = Field(None, alias="authorName")
    content: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    can_edit: bool = Field(alias="canEdit")
    can_delete: bool = Field(alias="canDelete")

    class Config:
        populate_by_name = True


class CannedResponse(BaseModel):
    """A saved reply, inserted by typing its short code"""

    id: str
    short_code: str = Field(alias="shortCode")
    content: str
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class CannedResponseList(BaseModel):
    """``GET /api/v1/canned-responses``"""

    max_responses: int = Field(alias="maxResponses")
    responses: List[CannedResponse] = []

    class Config:
        populate_by_name = True


class ContactSummary(BaseModel):
    """A row of ``GET /api/v1/contacts`` (requires platform PR #256)"""

    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    external_id: Optional[str] = Field(None, alias="externalId")
    first_seen_at: datetime = Field(alias="firstSeenAt")
    last_seen_at: datetime = Field(alias="lastSeenAt")
    blocked: bool
    conversation_count: int = Field(alias="conversationCount")

    class Config:
        populate_by_name = True


class ContactPage(BaseModel):
    """``GET /api/v1/contacts`` (requires platform PR #256)"""

    items: List[ContactSummary] = []
    total: int
    page: int
    page_size: int = Field(alias="pageSize")

    class Config:
        populate_by_name = True


class ContactConversation(BaseModel):
    """A conversation in a contact's history"""

    id: str
    channel: str
    status: str
    started_at: datetime = Field(alias="startedAt")
    closed_at: Optional[datetime] = Field(None, alias="closedAt")
    assigned_agent_id: Optional[str] = Field(None, alias="assignedAgentId")

    class Config:
        populate_by_name = True


class ContactDetail(BaseModel):
    """``GET /api/v1/contacts/{id}`` (requires platform PR #256)"""

    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    external_id: Optional[str] = Field(None, alias="externalId")
    locale: Optional[str] = None
    first_seen_at: datetime = Field(alias="firstSeenAt")
    last_seen_at: datetime = Field(alias="lastSeenAt")
    blocked: bool
    blocked_at: Optional[datetime] = Field(None, alias="blockedAt")
    conversations: List[ContactConversation] = []

    class Config:
        populate_by_name = True


class ContactNote(BaseModel):
    """A private note on a contact (requires platform PR #256)"""

    id: str
    contact_id: str = Field(alias="contactId")
    author_id: str = Field(alias="authorId")
    author_name: Optional[str] = Field(None, alias="authorName")
    content: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    can_edit: bool = Field(alias="canEdit")
    can_delete: bool = Field(alias="canDelete")

    class Config:
        populate_by_name = True


class ContactEraseResult(BaseModel):
    """What an erasure deleted (requires platform PR #256)"""

    conversations_deleted: int = Field(alias="conversationsDeleted")
    messages_deleted: int = Field(alias="messagesDeleted")

    class Config:
        populate_by_name = True


class UserNotification(BaseModel):
    """An in-app notification for the signed-in teammate (requires platform PR #256)"""

    id: str
    type: str
    conversation_id: Optional[str] = Field(None, alias="conversationId")
    note_id: Optional[str] = Field(None, alias="noteId")
    actor_id: Optional[str] = Field(None, alias="actorId")
    actor_name: Optional[str] = Field(None, alias="actorName")
    preview: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")
    read_at: Optional[datetime] = Field(None, alias="readAt")

    class Config:
        populate_by_name = True


class MentionableMember(BaseModel):
    """A teammate who can be @mentioned in a note (requires platform PR #256)"""

    user_id: str = Field(alias="userId")
    display_name: Optional[str] = Field(None, alias="displayName")

    class Config:
        populate_by_name = True
