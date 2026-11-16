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
    string Status,
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
