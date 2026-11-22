using System.Text.Json;
using System.Text.Json.Serialization;

namespace Erghi.SDK.Models;

// Reply engine: the customer's own agent answers a widget's visitors instead of Erghi AI.
// Admin calls (camelCase JSON) need the `configure_ai` scope. Runtime calls (snake_case JSON) need an API key with
// `agent:runtime`. Values the server sends as enum names ("Webhook", "LiveConnection", "Active"...) are kept as
// strings so a new server value never breaks deserialisation; compare case-insensitively.

/// <summary>The four ways a reply engine receives a turn. Values are what the server expects in <c>mode</c>.</summary>
public static class ReplyEngineModes
{
    public const string Webhook = "Webhook";
    public const string CustomModel = "CustomModel";
    public const string LiveConnection = "LiveConnection";
    public const string Queue = "Queue";
}

/// <summary>What happens when the engine does not answer in time. Values for <c>fallback</c>.</summary>
public static class ReplyEngineFallbacks
{
    public const string ErghiAi = "ErghiAi";
    public const string Human = "Human";
    public const string FixedMessage = "FixedMessage";
}

/// <summary>Every writable field of an engine. Null means "not sent": on update the stored value is kept (PATCH).
/// <c>Mode</c> is immutable after create. Write-only secrets (<c>ApiKey</c>, header values, AWS keys) are never returned.</summary>
public class ReplyEngineWrite
{
    public string? Name { get; set; }
    public int? TimeoutSeconds { get; set; }
    public string? Fallback { get; set; }
    public Dictionary<string, string>? FallbackMessages { get; set; }
    public int? HistoryLimit { get; set; }
    public bool? IncludeContactDetails { get; set; }
    public bool? ObserveHumanMessages { get; set; }
    public bool? AcceptSupersededReplies { get; set; }
    public int? CircuitFailureThreshold { get; set; }

    // Webhook
    public string? Url { get; set; }
    public string? ResponseMode { get; set; }

    // Custom model
    public string? BaseUrl { get; set; }
    public string? Model { get; set; }
    public string? ContextMode { get; set; }
    public bool? Stream { get; set; }
    public double? Temperature { get; set; }
    public int? MaxTokens { get; set; }
    public string? ApiKey { get; set; }
    public Dictionary<string, string>? ExtraHeaders { get; set; }

    // Live connection
    public int? MaxConnections { get; set; }

    // Queue
    public string? TurnsQueueUrl { get; set; }
    public string? RepliesQueueUrl { get; set; }
    public string? Region { get; set; }
    public string? Auth { get; set; }
    public string? RoleArn { get; set; }
    public string? AccessKeyId { get; set; }
    public string? SecretAccessKey { get; set; }
}

/// <summary>Body of create. <c>Mode</c> is one of <see cref="ReplyEngineModes"/>.</summary>
public sealed class CreateReplyEngineRequest : ReplyEngineWrite
{
    public string? Mode { get; set; }
}

/// <summary>Body of update (PATCH): only the fields you set change. A different <c>Mode</c> is refused (400 <c>mode_immutable</c>).</summary>
public sealed class UpdateReplyEngineRequest : ReplyEngineWrite
{
    public string? Mode { get; set; }
}

/// <summary>An engine as the API returns it. Secrets are never here, only whether they exist.
/// <c>Secret</c> is set only on the create and rotate-secret responses, and only when Erghi generated one: store it then.</summary>
public sealed record ReplyEngine
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Mode { get; init; } = "";
    public string Status { get; init; } = "";
    public int TimeoutSeconds { get; init; }
    public string Fallback { get; init; } = "";
    public Dictionary<string, string>? FallbackMessages { get; init; }
    public int HistoryLimit { get; init; }
    public bool IncludeContactDetails { get; init; }
    public bool ObserveHumanMessages { get; init; }
    public bool AcceptSupersededReplies { get; init; }
    public int CircuitFailureThreshold { get; init; }
    public bool HasSecret { get; init; }
    public DateTime? SecretRotatedAt { get; init; }
    public DateTime? PreviousSecretExpiresAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int BindingCount { get; init; }
    public string? Url { get; init; }
    public string? ResponseMode { get; init; }
    public string? BaseUrl { get; init; }
    public string? Model { get; init; }
    public string? ContextMode { get; init; }
    public bool? Stream { get; init; }
    public double? Temperature { get; init; }
    public int? MaxTokens { get; init; }
    public bool? HasApiKey { get; init; }
    public List<string>? ExtraHeaders { get; init; }
    public int? MaxConnections { get; init; }
    public string? TurnsQueueUrl { get; init; }
    public string? RepliesQueueUrl { get; init; }
    public string? Region { get; init; }
    public string? Auth { get; init; }
    public string? RoleArn { get; init; }
    public string? ExternalId { get; init; }
    public bool? HasAccessKeys { get; init; }
    public string? Secret { get; init; }
}

public sealed record ReplyEngineList(List<ReplyEngine> Items, List<string> AllowedModes, string? ErghiPrincipalArn);

/// <summary>One row of <c>GET /api/v1/reply-engines?view=names</c> (also allowed with <c>manage_widgets</c>).</summary>
public sealed record ReplyEngineName(string Id, string Name, string Mode, string Status);

public sealed record ReplyEngineTestResult(bool Ok, long LatencyMs, string? ErrorCode, string? Detail, int? Status);

public sealed record ReplyEngineCircuit(string State, DateTime? OpenedAt, DateTime? RetryAt, int ConsecutiveFailures);

public sealed record ReplyEngineHealth(
    int WindowHours, int Turns, int Replied, int FellBack, int Failed, int TimedOut,
    double? SuccessRate, long? P50FirstReplyMs, long? P95FirstReplyMs, ReplyEngineCircuit Circuit);

public sealed record ReplyTurnLogItem(
    string Id, string ConversationId, string Status, bool IsTest, long Sequence, DateTime CreatedAt, DateTime? DispatchedAt,
    DateTime? FirstReplyAt, DateTime? ClosedAt, long? FirstReplyMs, string? CloseReason, string? FallbackUsed,
    string? ErrorCode, string? ErrorDetail, int ReplyCount);

public sealed record ReplyTurnLogPage(List<ReplyTurnLogItem> Items, string? NextCursor);

/// <summary>Which engine answers a widget. <c>Default</c>: an engine id, <c>"erghi"</c> (explicitly Erghi AI) or null (no binding).
/// <c>Channels</c>: channel key (e.g. <c>"telegram"</c>) to an engine id, <c>"erghi"</c> or null/<c>"default"</c>.</summary>
public sealed record WidgetReplyEngineBinding(
    string? Default, Dictionary<string, string?>? Channels = null);

/// <summary>Current bindings of a widget plus the channels it has connections for.</summary>
public sealed record WidgetReplyEngine(string? Default, Dictionary<string, string> Channels, List<string> AvailableChannels);

// ── Runtime (snake_case on the wire) ─────────────────────────────────────────

/// <summary>One message of an engine's reply (1-4000 characters, markdown like AI replies).
/// <c>Actions</c> is passed through and validated against the workspace's chat-action policy.</summary>
public sealed record AgentReplyMessage(
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("actions")] JsonElement? Actions = null);

/// <summary>Hand the conversation to a person, optionally alongside messages.</summary>
public sealed record AgentHandoff([property: JsonPropertyName("reason")] string? Reason = null);

/// <summary>The reply body. <c>IdempotencyKey</c> is required (at most 100 characters, unique per turn): a repeat with the same
/// key returns the first answer and posts nothing again, so reuse the key when you retry. 1 to 5 messages (none with a handoff).
/// <c>Final = false</c> keeps the turn open for more messages.</summary>
public sealed record AgentReply(
    [property: JsonPropertyName("idempotency_key")] string IdempotencyKey,
    [property: JsonPropertyName("messages")] List<AgentReplyMessage>? Messages,
    [property: JsonPropertyName("final")] bool? Final = null,
    [property: JsonPropertyName("handoff")] AgentHandoff? Handoff = null)
{
    /// <summary>A reply of plain text messages.</summary>
    public static AgentReply Of(string idempotencyKey, params string[] messages) =>
        new(idempotencyKey, messages.Select(m => new AgentReplyMessage(m)).ToList());
}

/// <summary>Answer to a reply: the ids of the messages posted (empty for a handoff-only reply).</summary>
public sealed record AgentReplyResult(
    [property: JsonPropertyName("turn_id")] string TurnId,
    [property: JsonPropertyName("message_ids")] List<string> MessageIds);

/// <summary>The state of one turn.</summary>
public sealed record AgentTurn(
    [property: JsonPropertyName("turn_id")] string TurnId,
    [property: JsonPropertyName("conversation_id")] string ConversationId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("deadline_at")] DateTime? DeadlineAt,
    [property: JsonPropertyName("is_test")] bool IsTest,
    [property: JsonPropertyName("reply_count")] int ReplyCount,
    [property: JsonPropertyName("close_reason")] string? CloseReason);

public sealed record BotMessageResult([property: JsonPropertyName("message_ids")] List<string> MessageIds);

// ── The turn Erghi sends (webhook body, SignalR TurnRequested, queue message) ─

public sealed record TurnAttachment(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("file_name")] string? FileName,
    [property: JsonPropertyName("content_type")] string? ContentType,
    [property: JsonPropertyName("size")] long Size);

public sealed record TurnMessage(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("conversation_id")] string ConversationId,
    [property: JsonPropertyName("sender")] string Sender,
    [property: JsonPropertyName("sender_id")] string? SenderId,
    [property: JsonPropertyName("is_ai")] bool IsAi,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("content")] string? Content,
    [property: JsonPropertyName("attachments")] List<TurnAttachment>? Attachments,
    [property: JsonPropertyName("created_at")] DateTime CreatedAt,
    [property: JsonPropertyName("reply_origin")] string? ReplyOrigin,
    [property: JsonPropertyName("reply_engine_name")] string? ReplyEngineName);

/// <summary>Visitor fields. Name, email and phone are present only when the engine has "include contact details" on.</summary>
public sealed record TurnVisitor(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("phone")] string? Phone);

public sealed record TurnConversation(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("channel")] string? Channel,
    [property: JsonPropertyName("widget_id")] string? WidgetId,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("metadata")] JsonElement? Metadata,
    [property: JsonPropertyName("verified_identity")] JsonElement? VerifiedIdentity,
    [property: JsonPropertyName("visitor")] TurnVisitor? Visitor,
    [property: JsonPropertyName("summary")] string? Summary);

/// <summary>REST endpoints of this turn, as the platform built them.</summary>
public sealed record TurnReplyUrls(
    [property: JsonPropertyName("url")] string? Url,
    [property: JsonPropertyName("typing_url")] string? TypingUrl,
    [property: JsonPropertyName("handoff_url")] string? HandoffUrl,
    [property: JsonPropertyName("decline_url")] string? DeclineUrl);

/// <summary>A <c>turn.requested</c> event: the visitor's unanswered messages and recent history. Answer before
/// <see cref="DeadlineAt"/>. <see cref="IsTest"/> turns come from "Test connection": answer or ack them, nothing is stored.</summary>
public sealed record TurnRequest(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("api_version")] string? ApiVersion,
    [property: JsonPropertyName("turn_id")] string TurnId,
    [property: JsonPropertyName("sequence")] long Sequence,
    [property: JsonPropertyName("engine_id")] string EngineId,
    [property: JsonPropertyName("workspace_id")] string WorkspaceId,
    [property: JsonPropertyName("deadline_at")] DateTime? DeadlineAt,
    [property: JsonPropertyName("is_test")] bool IsTest,
    [property: JsonPropertyName("conversation")] TurnConversation Conversation,
    [property: JsonPropertyName("messages")] List<TurnMessage> Messages,
    [property: JsonPropertyName("history")] List<TurnMessage> History,
    [property: JsonPropertyName("reply")] TurnReplyUrls? Reply)
{
    internal static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Parses the raw JSON of a turn (a webhook body or a queue message). Verify a webhook's signature first.</summary>
    public static TurnRequest Parse(string json) =>
        JsonSerializer.Deserialize<TurnRequest>(json, Options)
        ?? throw new Errors.ErghiException("Empty turn body", "EMPTY_RESPONSE");

    /// <summary>Parses a turn delivered as a <see cref="JsonElement"/> (SignalR).</summary>
    public static TurnRequest Parse(JsonElement element) =>
        element.Deserialize<TurnRequest>(Options)
        ?? throw new Errors.ErghiException("Empty turn body", "EMPTY_RESPONSE");
}
