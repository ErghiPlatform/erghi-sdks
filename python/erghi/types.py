"""Type definitions for Erghi SDK"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
    # As the API sends it: "visitor", "agent", "bot" (the AI assistant), "system", "user".
    sender: str
    sender_id: Optional[str] = Field(None, alias="senderId")
    # The API sends PascalCase ("Text", "Image", "File", "System"); normalised to lowercase.
    type: str
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

    @field_validator("type", mode="before")
    @classmethod
    def _lower_type(cls, value: Any) -> Any:
        return value.lower() if isinstance(value, str) else value


class Conversation(BaseModel):
    """Chat conversation"""

    id: str
    workspace_id: str = Field(alias="workspaceId")
    widget_id: str = Field(alias="widgetId")
    visitor_id: Optional[str] = Field(None, alias="visitorId")
    assigned_agent_id: Optional[str] = Field(None, alias="assignedAgentId")
    # The API sends PascalCase ("Open", "Assigned", "Queued", "Snoozed", "Resolved", "Closed");
    # normalised to lowercase so ``conversation.status == "open"`` holds. Unknown future values pass
    # through (lowercased) instead of failing validation.
    status: str
    # "web_widget", "whatsapp", "telegram", "email", "slack"... new channels can appear.
    channel: str
    started_at: datetime = Field(alias="startedAt")
    closed_at: Optional[datetime] = Field(None, alias="closedAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True

    @field_validator("status", mode="before")
    @classmethod
    def _lower_status(cls, value: Any) -> Any:
        return value.lower() if isinstance(value, str) else value


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


# ---------------------------------------------------------------------------
# Workforce (agent status, routing, offers) and the social inbox
# ---------------------------------------------------------------------------


class _Wire(BaseModel):
    """Base for the workforce and social models: camelCase on the wire, snake_case in Python.

    Unknown fields are kept (``extra="allow"``) so a newer server never breaks an older client.
    """

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class AgentStatus(_Wire):
    """One agent's current status. ``note`` is always ``None`` for an API key."""

    state: str
    reason_id: Optional[str] = Field(None, alias="reasonId")
    reason_name: Optional[str] = Field(None, alias="reasonName")
    reason_colour: Optional[str] = Field(None, alias="reasonColour")
    since: datetime
    seq: int
    source: str
    changed_by_name: Optional[str] = Field(None, alias="changedByName")
    note: Optional[str] = None
    active_chats: int = Field(alias="activeChats")
    capacity: int
    away_reassign_minutes: Optional[int] = Field(None, alias="awayReassignMinutes")


class AwayReason(_Wire):
    id: str
    name: str
    colour: str
    max_minutes: Optional[int] = Field(None, alias="maxMinutes")
    reassign_chats: bool = Field(alias="reassignChats")
    is_system: bool = Field(alias="isSystem")
    system_key: Optional[str] = Field(None, alias="systemKey")
    sort_order: int = Field(alias="sortOrder")
    archived: bool


class RoutingSkill(_Wire):
    id: str
    name: str
    description: str
    archived: bool
    agent_count: int = Field(alias="agentCount")


class AgentProfileSkill(_Wire):
    id: str
    name: str
    level: int


class AgentProfile(_Wire):
    user_id: str = Field(alias="userId")
    max_concurrent_chats: Optional[int] = Field(None, alias="maxConcurrentChats")
    languages: List[str] = []
    skills: List[AgentProfileSkill] = []


class WorkforceRoutingSettings(_Wire):
    ai_routing_enabled: bool = Field(alias="aiRoutingEnabled")
    language_match: str = Field(alias="languageMatch")
    skill_wait_seconds: int = Field(alias="skillWaitSeconds")
    offer_mode: str = Field(alias="offerMode")
    offer_timeout_seconds: int = Field(alias="offerTimeoutSeconds")


class WorkforceFeatures(_Wire):
    analytics: bool
    ai_routing: bool = Field(alias="aiRouting")


class WorkforceSettings(_Wire):
    """``GET /api/v1/workforce/settings``. ``None`` on a minutes/count field means the feature is off."""

    routing: WorkforceRoutingSettings
    features: WorkforceFeatures
    status_on_sign_in: str = Field(alias="statusOnSignIn")
    require_away_reason: bool = Field(alias="requireAwayReason")
    idle_away_minutes: Optional[int] = Field(None, alias="idleAwayMinutes")
    sign_out_after_hours_minutes: Optional[int] = Field(None, alias="signOutAfterHoursMinutes")
    auto_away_after_missed_offers: Optional[int] = Field(None, alias="autoAwayAfterMissedOffers")


class ChatOfferSummary(_Wire):
    offer_id: str = Field(alias="offerId")
    conversation_id: str = Field(alias="conversationId")
    attempt: int
    offered_at: datetime = Field(alias="offeredAt")
    expires_at: datetime = Field(alias="expiresAt")


class RoutingDecisionOffer(_Wire):
    offer_id: str = Field(alias="offerId")
    agent_id: str = Field(alias="agentId")
    agent_name: Optional[str] = Field(None, alias="agentName")
    attempt: int
    outcome: str
    cancel_reason: Optional[str] = Field(None, alias="cancelReason")
    offered_at: datetime = Field(alias="offeredAt")
    resolved_at: Optional[datetime] = Field(None, alias="resolvedAt")
    response_seconds: Optional[float] = Field(None, alias="responseSeconds")


class RoutingDecisionCandidate(_Wire):
    agent_id: str = Field(alias="agentId")
    agent_name: Optional[str] = Field(None, alias="agentName")
    score: Optional[float] = None
    load: Optional[float] = None
    language_match: Optional[bool] = Field(None, alias="languageMatch")


class RoutingDecision(_Wire):
    """Why a chat went to its agent ("why me")."""

    conversation_id: str = Field(alias="conversationId")
    decided_at: datetime = Field(alias="decidedAt")
    step: str
    fallback: Optional[str] = None
    picked_agent_id: Optional[str] = Field(None, alias="pickedAgentId")
    picked_agent_name: Optional[str] = Field(None, alias="pickedAgentName")
    classifier: Optional[Dict[str, Any]] = None
    candidates: List[RoutingDecisionCandidate] = []
    offers: List[RoutingDecisionOffer] = []


class MergeContact(_Wire):
    """One side of a merge suggestion. ``channels`` lists the channels the contact has an identity on."""

    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    channels: List[str] = []
    first_seen_at: datetime = Field(alias="firstSeenAt")
    last_seen_at: datetime = Field(alias="lastSeenAt")


class ContactMergeSuggestion(_Wire):
    """Two contacts that share a verified email or phone number (never a name).

    ``matched_on`` is ``email`` or ``phone``; ``suggested_target_id`` is the contact seen first,
    the one to keep.
    """

    matched_on: str = Field(alias="matchedOn")
    contact_a: MergeContact = Field(alias="contactA")
    contact_b: MergeContact = Field(alias="contactB")
    suggested_target_id: str = Field(alias="suggestedTargetId")


class ContactMergeResult(_Wire):
    """``merged_contact_id`` no longer exists; its history now belongs to ``contact_id``."""

    contact_id: str = Field(alias="contactId")
    merged_contact_id: str = Field(alias="mergedContactId")


class SocialInboxConnection(_Wire):
    """A connected account as the moderation views list it.

    Readable with ``view_conversations`` or ``moderate_social``, unlike :class:`SocialConnection`,
    which needs ``configure_ai``.
    """

    id: str
    channel_type: str = Field(alias="channelType")
    name: Optional[str] = None
    status: str


class SocialConnection(_Wire):
    id: str
    channel_type: str = Field(alias="channelType")
    external_account_id: str = Field(alias="externalAccountId")
    name: Optional[str] = None
    parent_external_account_id: Optional[str] = Field(None, alias="parentExternalAccountId")
    status: str
    capabilities: Optional[Dict[str, bool]] = None
    verified_at: Optional[datetime] = Field(None, alias="verifiedAt")
    connected_at: datetime = Field(alias="connectedAt")
    last_error_code: Optional[str] = Field(None, alias="lastErrorCode")
    needs_reauth: bool = Field(alias="needsReauth")
    reauth_reason: Optional[str] = Field(None, alias="reauthReason")


class SocialConnectionSettings(_Wire):
    connection_id: str = Field(alias="connectionId")
    channel_type: str = Field(alias="channelType")
    name: Optional[str] = None
    dms_enabled: bool = Field(alias="dmsEnabled")
    comments_enabled: bool = Field(alias="commentsEnabled")
    auto_hide_spam: bool = Field(alias="autoHideSpam")
    auto_hide_scam_impersonation: bool = Field(alias="autoHideScamImpersonation")
    auto_hide_abuse: bool = Field(alias="autoHideAbuse")
    comment_reply_mode: str = Field(alias="commentReplyMode")
    auto_public_replies_enabled: bool = Field(alias="autoPublicRepliesEnabled")
    public_acknowledgment_enabled: bool = Field(alias="publicAcknowledgmentEnabled")
    reply_to_praise: bool = Field(alias="replyToPraise")
    max_auto_public_replies_per_post_per_hour: int = Field(
        alias="maxAutoPublicRepliesPerPostPerHour"
    )
    allowed_link_domains: List[str] = Field([], alias="allowedLinkDomains")


class SocialDisconnectPreview(_Wire):
    connection_id: str = Field(alias="connectionId")
    channel_type: str = Field(alias="channelType")
    open_conversation_count: int = Field(alias="openConversationCount")
    open_conversation_scope: str = Field(alias="openConversationScope")


class SocialReplyPolicy(_Wire):
    """The DM reply window of a Messenger or Instagram conversation."""

    state: str
    window_closes_at: Optional[datetime] = Field(None, alias="windowClosesAt")
    human_only_until: Optional[datetime] = Field(None, alias="humanOnlyUntil")
    requires_human_agent_tag: bool = Field(alias="requiresHumanAgentTag")
    human_agent_approved: bool = Field(alias="humanAgentApproved")
    reauth_reason: Optional[str] = Field(None, alias="reauthReason")
    last_customer_message_at: Optional[datetime] = Field(None, alias="lastCustomerMessageAt")


class SocialMessageDelivery(_Wire):
    message_id: str = Field(alias="messageId")
    status: str
    error_code: Optional[str] = Field(None, alias="errorCode")
    delivered_at: Optional[datetime] = Field(None, alias="deliveredAt")
    read_at: Optional[datetime] = Field(None, alias="readAt")


class SocialPost(_Wire):
    id: str
    connection_id: str = Field(alias="connectionId")
    platform: str
    external_post_id: str = Field(alias="externalPostId")
    permalink: Optional[str] = None
    caption_excerpt: Optional[str] = Field(None, alias="captionExcerpt")
    media_type: Optional[str] = Field(None, alias="mediaType")
    is_ad: bool = Field(alias="isAd")
    comment_count: int = Field(alias="commentCount")
    needs_attention_count: int = Field(alias="needsAttentionCount")
    last_comment_at: Optional[datetime] = Field(None, alias="lastCommentAt")


class SocialComment(_Wire):
    id: str
    connection_id: str = Field(alias="connectionId")
    post_id: str = Field(alias="postId")
    conversation_id: str = Field(alias="conversationId")
    platform: str
    external_comment_id: str = Field(alias="externalCommentId")
    parent_external_comment_id: Optional[str] = Field(None, alias="parentExternalCommentId")
    author_external_id: str = Field(alias="authorExternalId")
    author_name: Optional[str] = Field(None, alias="authorName")
    text: str
    is_from_page: bool = Field(alias="isFromPage")
    visibility: str
    moderated_by: Optional[str] = Field(None, alias="moderatedBy")
    moderated_by_user_id: Optional[str] = Field(None, alias="moderatedByUserId")
    moderation_reason: Optional[str] = Field(None, alias="moderationReason")
    moderation_confidence: Optional[float] = Field(None, alias="moderationConfidence")
    classification: Optional[str] = None
    sentiment: Optional[str] = None
    language: Optional[str] = None
    posted_at: datetime = Field(alias="postedAt")
    private_reply_sent_at: Optional[datetime] = Field(None, alias="privateReplySentAt")
    private_reply_conversation_id: Optional[str] = Field(None, alias="privateReplyConversationId")
    can_private_reply: bool = Field(alias="canPrivateReply")
    private_reply_expires_at: datetime = Field(alias="privateReplyExpiresAt")
    handled_at: Optional[datetime] = Field(None, alias="handledAt")
    ai_replied_at: Optional[datetime] = Field(None, alias="aiRepliedAt")
    unanswered: bool
    needs_attention: bool = Field(alias="needsAttention")


class SocialPostPage(_Wire):
    items: List[SocialPost] = []
    total: int
    page: int
    page_size: int = Field(alias="pageSize")


class SocialCommentPage(_Wire):
    items: List[SocialComment] = []
    total: int
    page: int
    page_size: int = Field(alias="pageSize")


class SocialPrivateReplyResult(_Wire):
    comment: SocialComment
    conversation_id: str = Field(alias="conversationId")


class SocialIgnoreResult(_Wire):
    contact_id: str = Field(alias="contactId")
    ignored: bool


class SocialDmVolume(_Wire):
    channel: str
    inbound: int
    outbound: int


class SocialReport(_Wire):
    from_: datetime = Field(alias="from")
    to: datetime
    comments_received: int = Field(alias="commentsReceived")
    by_category: Dict[str, int] = Field({}, alias="byCategory")
    by_sentiment: Dict[str, int] = Field({}, alias="bySentiment")
    by_channel: Dict[str, int] = Field({}, alias="byChannel")
    auto_hidden: int = Field(alias="autoHidden")
    agent_hidden: int = Field(alias="agentHidden")
    unhidden_by_agent: int = Field(alias="unhiddenByAgent")
    false_positive_rate: Optional[float] = Field(None, alias="falsePositiveRate")
    comments_answered: int = Field(alias="commentsAnswered")
    comments_unanswered: int = Field(alias="commentsUnanswered")
    median_response_seconds: Optional[float] = Field(None, alias="medianResponseSeconds")
    avg_response_seconds: Optional[float] = Field(None, alias="avgResponseSeconds")
    ai_public_replies_posted: int = Field(alias="aiPublicRepliesPosted")
    ai_public_replies_refused: int = Field(alias="aiPublicRepliesRefused")
    dm_volume: List[SocialDmVolume] = Field([], alias="dmVolume")
