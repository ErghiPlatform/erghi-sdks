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

public record RefreshTokenRequest(string RefreshToken);

// ── Workspace ─────────────────────────────────────────────────────────────────

public record Workspace(
    string Id,
    string Name,
    string Slug,
    string? Description,
    string Plan,
    string Status,
    DateTime CreatedAt
);

public record CreateWorkspaceRequest(
    string Name,
    string? Description = null
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
    string? AIModel
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

// ── WebSocket events ──────────────────────────────────────────────────────────

public record TypingEvent(string UserId, bool IsTyping);
