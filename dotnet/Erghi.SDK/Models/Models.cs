using System.Text.Json.Serialization;

namespace Erghi.SDK.Models;

// ── User ──────────────────────────────────────────────────────────────────────

public record User(
    string Id,
    string Email,
    string FirstName,
    string LastName,
    string? PhoneNumber,
    string? AvatarUrl,
    string Role,
    bool EmailVerified,
    DateTime CreatedAt,
    DateTime UpdatedAt
)
{
    [JsonIgnore]
    public string FullName => $"{FirstName} {LastName}";
}

// ── Auth ──────────────────────────────────────────────────────────────────────

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    string TokenType,
    User User
);

public record RegisterRequest(
    string Email,
    string Password,
    string? FirstName = null,
    string? LastName = null,
    string? PhoneNumber = null
);

public record LoginRequest(
    string Email,
    string Password
);


// ── Workspace ─────────────────────────────────────────────────────────────────

/// <summary>A workspace of the signed-in user's account.</summary>
/// <param name="IsCurrent">True for the workspace the current token is scoped to.</param>
public record Workspace(
    string Id,
    string Name,
    string Slug,
    bool IsCurrent
);

public record CreateWorkspaceRequest(
    string Name,
    string? CompanyWebsite = null
);

public record UpdateWorkspaceRequest(
    string? Name = null,
    string? Description = null
);

// ── Conversation ──────────────────────────────────────────────────────────────

public record Conversation(
    string Id,
    string WorkspaceId,
    string WidgetId,
    string? VisitorId,
    string? AssignedAgentId,
    // As the API sends it: "Open", "Assigned", "Queued", "Snoozed", "Resolved" or "Closed".
    string Status,
    // "web_widget", "whatsapp", "telegram", "email", "slack"... new channels can appear.
    string Channel,
    DateTime StartedAt,
    DateTime? ClosedAt,
    Dictionary<string, object>? Metadata
);

public record CreateConversationRequest(
    string WidgetId,
    string? VisitorId = null,
    Dictionary<string, object>? Metadata = null
);

// ── Message ───────────────────────────────────────────────────────────────────

public record Message(
    string Id,
    string ConversationId,
    string Sender,
    string? SenderId,
    // Sender: "visitor", "agent", "bot" (the AI assistant), "system" or "user". Type: "Text", "Image", "File", "System".
    string Type,
    string Content,
    DateTime CreatedAt,
    DateTime? ReadAt,
    bool IsAI,
    string? AIModel,
    // "voice" when the visitor sent it as a voice note (Content is the transcript).
    string? Source = null
);

public record SendMessageRequest(
    string Content,
    string Type = "text"
);

// ── Widget ────────────────────────────────────────────────────────────────────

public record Widget(
    string Id,
    string WorkspaceId,
    string Name,
    string Slug,
    bool IsActive,
    WidgetConfiguration Configuration,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);

public record WidgetConfiguration(
    string? Theme = null,
    string? PrimaryColor = null,
    string? Position = null,
    string? Greeting = null,
    string? Avatar = null
);

public record CreateWidgetRequest(
    string Name,
    string Slug,
    WidgetConfiguration? Configuration = null
);

// ── Pagination ────────────────────────────────────────────────────────────────

public record PaginatedResponse<T>(
    List<T> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages
);

// ── Conversation insights ─────────────────────────────────────────────────────

/// <summary>
/// Filters shared by insights summary, list and export. All optional. <c>Sentiment</c>:
/// positive, neutral or negative. <c>Outcome</c>: resolved_by_ai, resolved_by_agent,
/// handed_off_unresolved, abandoned or spam_or_empty. <c>MinConfidence</c> is 0 to 1.
/// </summary>
public record InsightFilter(
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? Channel = null,
    string? Category = null,
    string? Topic = null,
    string? Sentiment = null,
    string? Outcome = null,
    double? MinConfidence = null
);

public record InsightCount(string Key, int Count);

/// <summary><c>AiResolvedRate</c> is AI-resolved over conversations that needed a reply (spam/empty excluded); null when none.</summary>
public record InsightSummary(
    int Total,
    double? AiResolvedRate,
    List<InsightCount> Outcomes,
    List<InsightCount> Sentiments,
    List<InsightCount>? Categories,
    List<InsightCount>? Topics,
    List<InsightCount>? Languages,
    string? Plan = null,
    List<string>? Locked = null,
    Dictionary<string, int>? LockedCounts = null,
    int? WindowDays = null,
    DateTimeOffset? From = null
);

/// <summary>
/// One classified conversation. Sentiment is Positive/Neutral/Negative; Outcome is ResolvedByAi,
/// ResolvedByAgent, HandedOffUnresolved, Abandoned or SpamOrEmpty; Language is a BCP-47 tag;
/// Stale means it was reopened and is reclassified on its next close.
/// </summary>
public record InsightConversation(
    Guid ConversationId,
    string? Topic,
    string? Category,
    string Sentiment,
    string SentimentEnd,
    string Outcome,
    string? Language,
    string? Summary,
    double? Confidence,
    DateTimeOffset ClassifiedAt,
    bool Stale
);

public record InsightPage(
    int Total,
    int Page,
    int PageSize,
    List<InsightConversation> Items,
    string? Plan = null,
    List<string>? Locked = null,
    int? WindowDays = null,
    DateTimeOffset? From = null
);

// ── WebSocket events ──────────────────────────────────────────────────────────

public record TypingEvent(string UserId, bool IsTyping);

// ── Inbox: labels, notes, saved replies, contacts, notifications ─────────────

public record ConversationLabel(string Id, string Name, string Color, string? Description);

public record ConversationLabelList(int MaxLabels, List<ConversationLabel> Labels);

/// <summary>A private (internal-only) note on a conversation. Visitors never see notes.</summary>
public record ConversationNote(
    string Id,
    string ConversationId,
    string AuthorId,
    string? AuthorName,
    string Content,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool CanEdit,
    bool CanDelete
);

public record CannedResponse(string Id, string ShortCode, string Content, DateTimeOffset UpdatedAt);

public record CannedResponseList(int MaxResponses, List<CannedResponse> Responses);

/// <summary>Requires platform PR #256.</summary>
public record ContactSummary(
    string Id,
    string? Name,
    string? Email,
    string? Phone,
    string? ExternalId,
    DateTimeOffset FirstSeenAt,
    DateTimeOffset LastSeenAt,
    bool Blocked,
    int ConversationCount
);

/// <summary>Requires platform PR #256.</summary>
public record ContactPage(List<ContactSummary> Items, int Total, int Page, int PageSize);

public record ContactConversation(
    string Id,
    string Channel,
    string Status,
    DateTimeOffset StartedAt,
    DateTimeOffset? ClosedAt,
    string? AssignedAgentId
);

/// <summary>Requires platform PR #256.</summary>
public record ContactDetail(
    string Id,
    string? Name,
    string? Email,
    string? Phone,
    string? ExternalId,
    string? Locale,
    DateTimeOffset FirstSeenAt,
    DateTimeOffset LastSeenAt,
    bool Blocked,
    DateTimeOffset? BlockedAt,
    List<ContactConversation> Conversations
);

/// <summary>Null leaves a field unchanged; an empty string clears it.</summary>
public record UpdateContactRequest(string? Name = null, string? Email = null, string? Phone = null);

/// <summary>Requires platform PR #256.</summary>
public record ContactNote(
    string Id,
    string ContactId,
    string AuthorId,
    string? AuthorName,
    string Content,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool CanEdit,
    bool CanDelete
);

public record ContactEraseResult(int ConversationsDeleted, int MessagesDeleted);

/// <summary>One side of a merge suggestion. <c>Channels</c> lists the channels the contact has an identity on.</summary>
public record MergeContact(
    string Id,
    string? Name,
    string? Email,
    string? Phone,
    List<string> Channels,
    DateTime FirstSeenAt,
    DateTime LastSeenAt
);

/// <summary>
/// Two contacts that share a verified identifier: the same email, or the same phone number (which includes
/// a WhatsApp number the platform reported). Never based on a name. <c>MatchedOn</c> is <c>email</c> or
/// <c>phone</c>; <c>SuggestedTargetId</c> is the contact seen first, the one to keep.
/// </summary>
public record ContactMergeSuggestion(string MatchedOn, MergeContact ContactA, MergeContact ContactB, string SuggestedTargetId);

/// <summary><c>MergedContactId</c> no longer exists; its history now belongs to <c>ContactId</c>.</summary>
public record ContactMergeResult(string ContactId, string MergedContactId);

/// <summary>Requires platform PR #256.</summary>
public record UserNotification(
    string Id,
    string Type,
    string? ConversationId,
    string? NoteId,
    string? ActorId,
    string? ActorName,
    string? Preview,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReadAt
);

/// <summary>Requires platform PR #256.</summary>
public record MentionableMember(string UserId, string? DisplayName);

// ── Workforce ─────────────────────────────────────────────────────────────────

/// <summary>One agent's current status. <c>Note</c> is always null for an API key.</summary>
public record AgentStatus(
    string State,
    string? ReasonId,
    string? ReasonName,
    string? ReasonColour,
    DateTimeOffset Since,
    long Seq,
    string Source,
    string? ChangedByName,
    string? Note,
    int ActiveChats,
    int Capacity,
    int? AwayReassignMinutes
);

public record AwayReason(
    string Id,
    string Name,
    string Colour,
    int? MaxMinutes,
    bool ReassignChats,
    bool IsSystem,
    string? SystemKey,
    int SortOrder,
    bool Archived
);

public record RoutingSkill(string Id, string Name, string Description, bool Archived, int AgentCount);

public record AgentProfileSkill(string Id, string Name, int Level);

public record AgentProfile(
    string UserId,
    int? MaxConcurrentChats,
    List<string> Languages,
    List<AgentProfileSkill> Skills
);

/// <summary>One skill of an agent: <c>Level</c> is 1 (basic), 2 (skilled) or 3 (expert).</summary>
public record AgentSkillLevel(string SkillId, int Level);

public record WorkforceRoutingSettings(
    bool AiRoutingEnabled,
    string LanguageMatch,
    int SkillWaitSeconds,
    string OfferMode,
    int OfferTimeoutSeconds
);

public record WorkforceFeatures(bool Analytics, bool AiRouting);

/// <summary>A null minutes/count field means the feature is off.</summary>
public record WorkforceSettings(
    WorkforceRoutingSettings Routing,
    WorkforceFeatures Features,
    string StatusOnSignIn,
    bool RequireAwayReason,
    int? IdleAwayMinutes,
    int? SignOutAfterHoursMinutes,
    int? AutoAwayAfterMissedOffers
);

/// <summary>
/// Partial update of the workforce settings: a null property is not sent and keeps its stored
/// value. <c>0</c> turns <see cref="IdleAwayMinutes"/>, <see cref="SignOutAfterHoursMinutes"/> and
/// <see cref="AutoAwayAfterMissedOffers"/> off.
/// </summary>
public record UpdateWorkforceSettingsRequest
{
    public string? StatusOnSignIn { get; init; }
    public bool? RequireAwayReason { get; init; }
    public int? IdleAwayMinutes { get; init; }
    public int? SignOutAfterHoursMinutes { get; init; }
    public int? AutoAwayAfterMissedOffers { get; init; }
    public bool? AiRoutingEnabled { get; init; }
    /// <summary><c>off</c>, <c>preferred</c> or <c>required</c>.</summary>
    public string? LanguageMatch { get; init; }
    public int? SkillWaitSeconds { get; init; }
    /// <summary><c>off</c> or <c>ring</c>.</summary>
    public string? OfferMode { get; init; }
    public int? OfferTimeoutSeconds { get; init; }
}

public record ChatOfferSummary(
    string OfferId,
    string ConversationId,
    int Attempt,
    DateTimeOffset OfferedAt,
    DateTimeOffset ExpiresAt
);

public record RoutingDecisionOffer(
    string OfferId,
    string AgentId,
    string? AgentName,
    int Attempt,
    string Outcome,
    string? CancelReason,
    DateTimeOffset OfferedAt,
    DateTimeOffset? ResolvedAt,
    double? ResponseSeconds
);

public record RoutingDecisionCandidate(
    string AgentId,
    string? AgentName,
    double? Score,
    double? Load,
    bool? LanguageMatch
);

/// <summary>Why a chat went to its agent ("why me").</summary>
public record RoutingDecision(
    string ConversationId,
    DateTimeOffset DecidedAt,
    string Step,
    string? Fallback,
    string? PickedAgentId,
    string? PickedAgentName,
    System.Text.Json.JsonElement? Classifier,
    List<RoutingDecisionCandidate> Candidates,
    List<RoutingDecisionOffer> Offers
);

// ── Social inbox ──────────────────────────────────────────────────────────────

/// <summary>
/// A connected Facebook Page or Instagram account as the moderation views list it. Readable with
/// <c>view_conversations</c> or <c>moderate_social</c>, unlike <see cref="SocialConnection"/>, which needs <c>configure_ai</c>.
/// </summary>
public record SocialInboxConnection(string Id, string ChannelType, string? Name, string Status);

public record SocialConnection(
    string Id,
    string ChannelType,
    string ExternalAccountId,
    string? Name,
    string? ParentExternalAccountId,
    string Status,
    Dictionary<string, bool>? Capabilities,
    DateTimeOffset? VerifiedAt,
    DateTimeOffset ConnectedAt,
    string? LastErrorCode,
    bool NeedsReauth,
    string? ReauthReason
);

public record SocialConnectionSettings(
    string ConnectionId,
    string ChannelType,
    string? Name,
    bool DmsEnabled,
    bool CommentsEnabled,
    bool AutoHideSpam,
    bool AutoHideScamImpersonation,
    bool AutoHideAbuse,
    string CommentReplyMode,
    bool AutoPublicRepliesEnabled,
    bool PublicAcknowledgmentEnabled,
    bool ReplyToPraise,
    int MaxAutoPublicRepliesPerPostPerHour,
    List<string> AllowedLinkDomains
);

/// <summary>
/// Partial update of a connection's settings: a null property is not sent and keeps its stored
/// value. A non-null <see cref="AllowedLinkDomains"/> replaces the list (an empty list clears it).
/// </summary>
public record UpdateSocialConnectionSettingsRequest
{
    public bool? AutoHideSpam { get; init; }
    public bool? AutoHideScamImpersonation { get; init; }
    public bool? AutoHideAbuse { get; init; }
    /// <summary><c>off</c>, <c>suggest</c> or <c>auto</c>.</summary>
    public string? CommentReplyMode { get; init; }
    public bool? AutoPublicRepliesEnabled { get; init; }
    public bool? PublicAcknowledgmentEnabled { get; init; }
    public bool? ReplyToPraise { get; init; }
    public int? MaxAutoPublicRepliesPerPostPerHour { get; init; }
    public List<string>? AllowedLinkDomains { get; init; }
    /// <summary>Turning either on is refused (400 <c>capability_requires_reconnect</c>): reconnect the account.</summary>
    public bool? DmsEnabled { get; init; }
    public bool? CommentsEnabled { get; init; }
}

public record SocialDisconnectPreview(
    string ConnectionId,
    string ChannelType,
    int OpenConversationCount,
    string OpenConversationScope
);

/// <summary>The DM reply window of a Messenger or Instagram conversation.</summary>
public record SocialReplyPolicy(
    string State,
    DateTimeOffset? WindowClosesAt,
    DateTimeOffset? HumanOnlyUntil,
    bool RequiresHumanAgentTag,
    bool HumanAgentApproved,
    string? ReauthReason,
    DateTimeOffset? LastCustomerMessageAt
);

public record SocialMessageDelivery(
    string MessageId,
    string Status,
    string? ErrorCode,
    DateTimeOffset? DeliveredAt,
    DateTimeOffset? ReadAt
);

public record SocialPost(
    string Id,
    string ConnectionId,
    string Platform,
    string ExternalPostId,
    string? Permalink,
    string? CaptionExcerpt,
    string? MediaType,
    bool IsAd,
    int CommentCount,
    int NeedsAttentionCount,
    DateTimeOffset? LastCommentAt
);

public record SocialComment(
    string Id,
    string ConnectionId,
    string PostId,
    string ConversationId,
    string Platform,
    string ExternalCommentId,
    string? ParentExternalCommentId,
    string AuthorExternalId,
    string? AuthorName,
    string Text,
    bool IsFromPage,
    string Visibility,
    string? ModeratedBy,
    string? ModeratedByUserId,
    string? ModerationReason,
    double? ModerationConfidence,
    string? Classification,
    string? Sentiment,
    string? Language,
    DateTimeOffset PostedAt,
    DateTimeOffset? PrivateReplySentAt,
    string? PrivateReplyConversationId,
    bool CanPrivateReply,
    DateTimeOffset PrivateReplyExpiresAt,
    DateTimeOffset? HandledAt,
    DateTimeOffset? AiRepliedAt,
    bool Unanswered,
    bool NeedsAttention
);

public record SocialPage<T>(List<T> Items, int Total, int Page, int PageSize);

public record SocialPrivateReplyResult(SocialComment Comment, string ConversationId);

public record SocialIgnoreResult(string ContactId, bool Ignored);

public record SocialDmVolume(string Channel, int Inbound, int Outbound);

public record SocialReport(
    DateTimeOffset From,
    DateTimeOffset To,
    int CommentsReceived,
    Dictionary<string, int> ByCategory,
    Dictionary<string, int> BySentiment,
    Dictionary<string, int> ByChannel,
    int AutoHidden,
    int AgentHidden,
    int UnhiddenByAgent,
    double? FalsePositiveRate,
    int CommentsAnswered,
    int CommentsUnanswered,
    double? MedianResponseSeconds,
    double? AvgResponseSeconds,
    int AiPublicRepliesPosted,
    int AiPublicRepliesRefused,
    List<SocialDmVolume> DmVolume
);
