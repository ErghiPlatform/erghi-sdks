using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// Runtime side of the reply engine, for the code that answers a turn Erghi sent to your agent (webhook, live connection
/// or queue). Needs an API key (client id and secret) holding <c>agent:runtime</c>; the workspace is the key's.
/// A turn or conversation of another workspace is a 404 (<see cref="Errors.NotFoundException"/>), never a 403.
/// A turn that already ended answers 409: <see cref="Errors.ErghiApiException.Code"/> is <c>turn_closed</c>
/// (see <c>Reason</c>) or <c>turn_superseded</c>; stop work on it, nothing was posted.
/// </summary>
public sealed class AgentRuntimeResource
{
    private readonly HttpClient _http;

    internal AgentRuntimeResource(HttpClient http) => _http = http;

    private static string Turn(string turnId) => $"/api/v1/agent/turns/{Seg(turnId)}";
    private static string Conversation(string id) => $"/api/v1/agent/conversations/{Seg(id)}";

    /// <summary>Status, deadline and reply count of a turn.</summary>
    public Task<AgentTurn> GetTurnAsync(string turnId, CancellationToken ct = default) =>
        SendAsync<AgentTurn>(_http, HttpMethod.Get, Turn(turnId), null, ct, serverCodes: true);

    /// <summary>Posts the reply as bot messages. Safe to retry with the same <see cref="AgentReply.IdempotencyKey"/>.
    /// A reply carrying <c>Handoff</c> also hands the conversation to a person.</summary>
    public Task<AgentReplyResult> ReplyAsync(string turnId, AgentReply reply, CancellationToken ct = default) =>
        SendAsync<AgentReplyResult>(_http, HttpMethod.Post, Turn(turnId) + "/replies", reply, ct, serverCodes: true);

    /// <summary>Shows the typing indicator in the widget for a few seconds. Never extends the turn's deadline.</summary>
    public Task TypingAsync(string turnId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, Turn(turnId) + "/typing", null, ct, serverCodes: true);

    /// <summary>Gives the conversation to a person. 409 <c>handoff_unavailable</c> when the workspace turned handoff off.</summary>
    public Task HandoffAsync(string turnId, string? reason = null, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, Turn(turnId) + "/handoff", new AgentHandoff(reason), ct, serverCodes: true);

    /// <summary>Says this agent will not answer, so the engine's fallback applies right away instead of at the deadline.</summary>
    public Task DeclineAsync(string turnId, string? reason = null, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, Turn(turnId) + "/decline", new { reason }, ct, serverCodes: true);

    /// <summary>Takes a conversation back from a person (or Erghi AI) for this engine. 409 <c>human_engaged</c> when a
    /// teammate already replied, unless <paramref name="force"/>; 409 <c>conversation_closed</c> when it is closed.</summary>
    public Task TakeBackAsync(string conversationId, bool force = false, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, Conversation(conversationId) + "/take-back", new { force }, ct, serverCodes: true);

    /// <summary>Posts a bot message into a conversation this engine holds, outside any turn (for example a proactive
    /// follow-up). 409 <c>not_held</c> when no engine holds the conversation. Idempotent per key.</summary>
    public Task<BotMessageResult> PostBotMessageAsync(
        string conversationId, string idempotencyKey, string content, CancellationToken ct = default) =>
        SendAsync<BotMessageResult>(_http, HttpMethod.Post, Conversation(conversationId) + "/bot-messages",
            new { idempotency_key = idempotencyKey, content }, ct, serverCodes: true);
}
