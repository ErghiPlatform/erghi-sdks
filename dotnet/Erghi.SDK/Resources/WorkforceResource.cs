using System.Text.Json;
using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// Agent status, the live board, away reasons, routing skills and profiles, workforce settings,
/// chat offers, "why me" routing decisions and the status/performance reports. These are workspace
/// (admin / server-side) operations; the workspace comes from the credential, never from a parameter.
/// <list type="bullet">
/// <item><c>manage_workforce</c> (an API key can hold it): force a status, sign an agent out, write away
/// reasons, skills, profiles and settings; it can also read the live board, away reasons, skills and settings.</item>
/// <item><c>view_conversations</c> (a signed-in teammate; an API key can never hold it): own status, own
/// offers, accept and decline, and <see cref="GetRoutingDecisionAsync"/>. Those answer 403 for an API key.</item>
/// <item><c>view_insights</c>: the reports. Plan gated: 403 <c>plan_required</c> without workforce analytics.</item>
/// </list>
/// The server's error code (<c>offer_taken</c>, <c>reason_name_taken</c>, <c>skill_limit</c>...) is in
/// <see cref="Errors.ErghiException.ServerCode"/>.
/// </summary>
public sealed class WorkforceResource
{
    private readonly HttpClient _http;

    internal WorkforceResource(HttpClient http)
    {
        _http = http;
    }

    // ── Status ───────────────────────────────────────────────────────────────

    /// <summary>Member token. The signed-in teammate's own status.</summary>
    public Task<AgentStatus> GetMyStatusAsync(CancellationToken ct = default) =>
        SendAsync<AgentStatus>(_http, HttpMethod.Get, "/api/v1/workforce/me/status", null, ct);

    /// <summary>
    /// Member token. <paramref name="state"/> is <c>ready</c>, <c>away</c> or <c>offline</c>.
    /// <paramref name="reasonId"/> is required when the workspace requires an away reason and the
    /// state is <c>away</c>; <paramref name="returnChats"/> sends the agent's chats back to the queue.
    /// </summary>
    public Task<AgentStatus> SetMyStatusAsync(
        string state, string? reasonId = null, string? note = null, bool? returnChats = null, CancellationToken ct = default) =>
        SendAsync<AgentStatus>(_http, HttpMethod.Put, "/api/v1/workforce/me/status",
            new { state, reasonId, note, returnChats }, ct);

    /// <summary>Needs <c>manage_workforce</c>. Forces an agent's status (audited as <c>workforce.status_forced</c>).</summary>
    public Task<AgentStatus> SetAgentStatusAsync(
        string agentId, string state, string? reasonId = null, string? note = null, bool? returnChats = null,
        CancellationToken ct = default) =>
        SendAsync<AgentStatus>(_http, HttpMethod.Put, $"/api/v1/workforce/agents/{Seg(agentId)}/status",
            new { state, reasonId, note, returnChats }, ct);

    /// <summary>Needs <c>manage_workforce</c>. Sets the agent Offline now and returns their chats to the queue.</summary>
    public Task<AgentStatus> SignOutAgentAsync(string agentId, CancellationToken ct = default) =>
        SendAsync<AgentStatus>(_http, HttpMethod.Post, $"/api/v1/workforce/agents/{Seg(agentId)}/sign-out", null, ct);

    /// <summary>
    /// Live agents, their state and load, and the queue (<c>queue</c> and <c>agents</c>). Needs
    /// <c>view_conversations</c> or <c>manage_workforce</c>; without <c>view_insights</c> only the caller is listed.
    /// The server builds this object ad hoc and it grows, so it is returned as a <see cref="JsonElement"/>.
    /// </summary>
    public Task<JsonElement> GetLiveAsync(CancellationToken ct = default) =>
        SendAsync<JsonElement>(_http, HttpMethod.Get, "/api/v1/workforce/live", null, ct);

    // ── Away reasons ─────────────────────────────────────────────────────────

    /// <summary><paramref name="includeArchived"/> is honoured only for a caller with <c>manage_workforce</c>.</summary>
    public Task<List<AwayReason>> ListAwayReasonsAsync(bool includeArchived = false, CancellationToken ct = default) =>
        SendAsync<List<AwayReason>>(_http, HttpMethod.Get,
            "/api/v1/workforce/away-reasons" + Query(("includeArchived", includeArchived ? true : null)), null, ct);

    /// <summary>Needs <c>manage_workforce</c>. 409 <c>reason_name_taken</c> / <c>reason_limit</c> (30 active).</summary>
    public Task<AwayReason> CreateAwayReasonAsync(
        string name, string? color = null, int? maxMinutes = null, bool? reassignChats = null, int? sortOrder = null,
        CancellationToken ct = default) =>
        SendAsync<AwayReason>(_http, HttpMethod.Post, "/api/v1/workforce/away-reasons",
            new { name, color, maxMinutes, reassignChats, sortOrder }, ct);

    /// <summary>
    /// Needs <c>manage_workforce</c>. Only the arguments you pass are sent. Pass <paramref name="reassignChats"/>
    /// on every update: the server reads an omitted value as false. <paramref name="archived"/> false restores
    /// an archived reason, true archives it.
    /// </summary>
    public Task<AwayReason> UpdateAwayReasonAsync(
        string reasonId, string? name = null, string? color = null, int? maxMinutes = null, bool? reassignChats = null,
        int? sortOrder = null, bool? archived = null, CancellationToken ct = default) =>
        SendAsync<AwayReason>(_http, HttpMethod.Put, $"/api/v1/workforce/away-reasons/{Seg(reasonId)}",
            new { name, color, maxMinutes, reassignChats, sortOrder, archived }, ct);

    /// <summary>Needs <c>manage_workforce</c>. Archives (never deletes); 409 <c>reason_protected</c> for the default Away reason.</summary>
    public Task<AwayReason> ArchiveAwayReasonAsync(string reasonId, CancellationToken ct = default) =>
        SendAsync<AwayReason>(_http, HttpMethod.Delete, $"/api/v1/workforce/away-reasons/{Seg(reasonId)}", null, ct);

    // ── Routing skills ───────────────────────────────────────────────────────

    public Task<List<RoutingSkill>> ListSkillsAsync(bool includeArchived = false, CancellationToken ct = default) =>
        SendAsync<List<RoutingSkill>>(_http, HttpMethod.Get,
            "/api/v1/workforce/skills" + Query(("includeArchived", includeArchived ? true : null)), null, ct);

    /// <summary>Needs <c>manage_workforce</c>. 409 <c>skill_name_taken</c> / <c>skill_limit</c>.</summary>
    public Task<RoutingSkill> CreateSkillAsync(string name, string description, CancellationToken ct = default) =>
        SendAsync<RoutingSkill>(_http, HttpMethod.Post, "/api/v1/workforce/skills", new { name, description }, ct);

    /// <summary>Needs <c>manage_workforce</c>. Only the arguments you pass are sent; <paramref name="archived"/> restores or archives.</summary>
    public Task<RoutingSkill> UpdateSkillAsync(
        string skillId, string? name = null, string? description = null, bool? archived = null, CancellationToken ct = default) =>
        SendAsync<RoutingSkill>(_http, HttpMethod.Put, $"/api/v1/workforce/skills/{Seg(skillId)}",
            new { name, description, archived }, ct);

    /// <summary>Needs <c>manage_workforce</c>. Archives (never deletes) the skill.</summary>
    public Task<RoutingSkill> ArchiveSkillAsync(string skillId, CancellationToken ct = default) =>
        SendAsync<RoutingSkill>(_http, HttpMethod.Delete, $"/api/v1/workforce/skills/{Seg(skillId)}", null, ct);

    // ── Agent routing profile ────────────────────────────────────────────────

    /// <summary>Needs <c>manage_workforce</c>. 404 for an id that is not a member of this workspace.</summary>
    public Task<AgentProfile> GetAgentProfileAsync(string agentId, CancellationToken ct = default) =>
        SendAsync<AgentProfile>(_http, HttpMethod.Get, $"/api/v1/workforce/agents/{Seg(agentId)}/profile", null, ct);

    /// <summary>
    /// Needs <c>manage_workforce</c>. Send the whole profile: the server resets an omitted
    /// <paramref name="maxConcurrentChats"/> to the workspace default and an omitted <paramref name="languages"/>
    /// to empty. <paramref name="skills"/>, when given, replaces the agent's skills (an empty list clears them);
    /// when null the skills are left alone. 404 <c>skill_not_found</c> for an unknown skill id.
    /// </summary>
    public Task<AgentProfile> SaveAgentProfileAsync(
        string agentId, int? maxConcurrentChats = null, IEnumerable<string>? languages = null,
        IEnumerable<AgentSkillLevel>? skills = null, CancellationToken ct = default) =>
        SendAsync<AgentProfile>(_http, HttpMethod.Put, $"/api/v1/workforce/agents/{Seg(agentId)}/profile",
            new { maxConcurrentChats, languages, skills }, ct);

    // ── Settings ─────────────────────────────────────────────────────────────

    /// <summary>Needs <c>view_conversations</c> or <c>manage_workforce</c>.</summary>
    public Task<WorkforceSettings> GetSettingsAsync(CancellationToken ct = default) =>
        SendAsync<WorkforceSettings>(_http, HttpMethod.Get, "/api/v1/workforce/settings", null, ct);

    /// <summary>
    /// Needs <c>manage_workforce</c>. A partial update: only the non-null properties of
    /// <paramref name="request"/> are sent, so everything else keeps its stored value. 403
    /// <c>plan_required</c> when turning AI routing on without plan support.
    /// </summary>
    public Task<WorkforceSettings> UpdateSettingsAsync(UpdateWorkforceSettingsRequest request, CancellationToken ct = default)
    {
        var r = request;
        object? routing = r.AiRoutingEnabled is null && r.LanguageMatch is null && r.SkillWaitSeconds is null
                          && r.OfferMode is null && r.OfferTimeoutSeconds is null
            ? null
            : new
            {
                aiRoutingEnabled = r.AiRoutingEnabled,
                languageMatch = r.LanguageMatch,
                skillWaitSeconds = r.SkillWaitSeconds,
                offerMode = r.OfferMode,
                offerTimeoutSeconds = r.OfferTimeoutSeconds,
            };
        var body = new
        {
            statusOnSignIn = r.StatusOnSignIn,
            requireAwayReason = r.RequireAwayReason,
            idleAwayMinutes = r.IdleAwayMinutes,
            signOutAfterHoursMinutes = r.SignOutAfterHoursMinutes,
            autoAwayAfterMissedOffers = r.AutoAwayAfterMissedOffers,
            routing,
        };
        return SendAsync<WorkforceSettings>(_http, HttpMethod.Put, "/api/v1/workforce/settings", body, ct);
    }

    // ── Chat offers (offer mode "ring"; member token) ────────────────────────

    private sealed record OfferList(List<ChatOfferSummary> Items);
    private sealed record AcceptResult(string ConversationId);

    /// <summary>Member token. The caller's open offers, for a client that reconnected after the push.</summary>
    public async Task<List<ChatOfferSummary>> ListMyOffersAsync(CancellationToken ct = default) =>
        (await SendAsync<OfferList>(_http, HttpMethod.Get, "/api/v1/workforce/offers/mine", null, ct)).Items;

    /// <summary>
    /// Member token. Returns the assigned conversation id. 404 <c>offer_not_found</c>; 409 <c>offer_expired</c> /
    /// <c>offer_taken</c> / <c>offer_closed</c>; 403 <c>access_revoked</c>.
    /// </summary>
    public async Task<string> AcceptOfferAsync(string offerId, CancellationToken ct = default) =>
        (await SendAsync<AcceptResult>(_http, HttpMethod.Post, $"/api/v1/workforce/offers/{Seg(offerId)}/accept", null, ct)).ConversationId;

    /// <summary>Member token. 404 <c>offer_not_found</c>; 409 <c>offer_expired</c> / <c>offer_closed</c>.</summary>
    public Task DeclineOfferAsync(string offerId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, $"/api/v1/workforce/offers/{Seg(offerId)}/decline", null, ct);

    // ── Why me ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Why a chat went to its agent. Needs <c>view_conversations</c> (a member token): a supervisor
    /// (<c>view_insights</c>) sees every candidate and offer, the assignee only their own rows; anyone else gets 404.
    /// </summary>
    public Task<RoutingDecision> GetRoutingDecisionAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<RoutingDecision>(_http, HttpMethod.Get, $"/api/v1/conversations/{Seg(conversationId)}/routing-decision", null, ct);

    // ── Reports (view_insights, plan gated, range at most 92 days) ───────────
    // The report bodies are built ad hoc by the server and grow, so they come back as JsonElement.

    /// <summary>Time per status and reason, per agent, team or day (<paramref name="groupBy"/>).</summary>
    public Task<JsonElement> GetAgentStatusReportAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, string? groupBy = null,
        CancellationToken ct = default) =>
        SendAsync<JsonElement>(_http, HttpMethod.Get,
            "/api/v1/reports/agent-status" + Query(("from", from), ("to", to), ("timeZone", timeZone), ("groupBy", groupBy)), null, ct);

    /// <summary>Status intervals of one agent. The supervisor <c>note</c> is null for an API key.</summary>
    public Task<JsonElement> GetAgentStatusTimelineAsync(
        string agentId, DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null,
        CancellationToken ct = default) =>
        SendAsync<JsonElement>(_http, HttpMethod.Get,
            "/api/v1/reports/agent-status/timeline" + Query(("agentId", agentId), ("from", from), ("to", to), ("timeZone", timeZone)), null, ct);

    /// <summary>Workload, utilisation and offer metrics per agent, team or day.</summary>
    public Task<JsonElement> GetAgentPerformanceReportAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, string? groupBy = null,
        CancellationToken ct = default) =>
        SendAsync<JsonElement>(_http, HttpMethod.Get,
            "/api/v1/reports/agent-performance" + Query(("from", from), ("to", to), ("timeZone", timeZone), ("groupBy", groupBy)), null, ct);

    /// <summary>The status report as CSV text. .NET strips the server's byte-order mark when decoding; write the file with <c>new UTF8Encoding(true)</c>.</summary>
    public Task<string> ExportAgentStatusCsvAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, CancellationToken ct = default) =>
        GetTextAsync(_http, "/api/v1/reports/agent-status/export.csv" + Query(("from", from), ("to", to), ("timeZone", timeZone)), ct);

    /// <summary>The performance report as CSV text.</summary>
    public Task<string> ExportAgentPerformanceCsvAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, string? groupBy = null,
        CancellationToken ct = default) =>
        GetTextAsync(_http, "/api/v1/reports/agent-performance/export.csv" + Query(("from", from), ("to", to), ("timeZone", timeZone), ("groupBy", groupBy)), ct);
}
