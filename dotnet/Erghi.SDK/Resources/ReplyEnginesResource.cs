using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// Admin side of the reply engine: create and manage the customer's own agents that answer a widget's visitors
/// instead of Erghi AI, and choose which one answers which widget. Every call needs <c>configure_ai</c>
/// (the names list and reading a widget's binding also admit <c>manage_widgets</c>); the workspace is the credential's,
/// never a parameter. Another workspace's id is a plain 404 (<see cref="Errors.NotFoundException"/>).
/// Refusals with a machine code (<c>mode_immutable</c> is a 400 <see cref="Errors.ValidationException"/>) and 403/409
/// answers throw <see cref="Errors.ErghiApiException"/>.
/// </summary>
public sealed class ReplyEnginesResource
{
    private const string Base = "/api/v1/reply-engines";
    private readonly HttpClient _http;

    internal ReplyEnginesResource(HttpClient http) => _http = http;

    /// <summary>All engines, with the modes the plan allows and (for queue assume-role) Erghi's principal ARN.</summary>
    public Task<ReplyEngineList> ListAsync(CancellationToken ct = default) =>
        SendAsync<ReplyEngineList>(_http, HttpMethod.Get, Base, null, ct, serverCodes: true);

    /// <summary>Id, name, mode and status only.</summary>
    public Task<List<ReplyEngineName>> ListNamesAsync(CancellationToken ct = default) =>
        SendAsync<List<ReplyEngineName>>(_http, HttpMethod.Get, Base + "?view=names", null, ct, serverCodes: true);

    public Task<ReplyEngine> GetAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Get, $"{Base}/{Seg(engineId)}", null, ct, serverCodes: true);

    /// <summary>Creates an engine (starts enabled). For Webhook and Queue the response carries the generated
    /// <c>whsec_</c> signing secret in <see cref="ReplyEngine.Secret"/>: shown once, store it now.</summary>
    public Task<ReplyEngine> CreateAsync(CreateReplyEngineRequest request, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Post, Base, request, ct, serverCodes: true);

    /// <summary>Changes only the fields you set. Mode cannot change.</summary>
    public Task<ReplyEngine> UpdateAsync(string engineId, UpdateReplyEngineRequest request, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Patch, $"{Base}/{Seg(engineId)}", request, ct, serverCodes: true);

    /// <summary>Soft-deletes the engine, removes its bindings and closes its open turns.</summary>
    public Task DeleteAsync(string engineId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"{Base}/{Seg(engineId)}", null, ct, serverCodes: true);

    /// <summary>A disabled engine keeps its bindings but is skipped: its widgets are answered by Erghi AI.</summary>
    public Task<ReplyEngine> EnableAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Post, $"{Base}/{Seg(engineId)}/enable", null, ct, serverCodes: true);

    public Task<ReplyEngine> DisableAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Post, $"{Base}/{Seg(engineId)}/disable", null, ct, serverCodes: true);

    /// <summary>Issues a new signing secret (returned once in <see cref="ReplyEngine.Secret"/>). The previous one keeps
    /// signing for a 24 hour grace window, see <see cref="ReplyEngine.PreviousSecretExpiresAt"/>.</summary>
    public Task<ReplyEngine> RotateSecretAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngine>(_http, HttpMethod.Post, $"{Base}/{Seg(engineId)}/rotate-secret", null, ct, serverCodes: true);

    /// <summary>Sends a test turn to the saved config. A failing test is a normal answer with <c>Ok = false</c> and an
    /// <c>ErrorCode</c> (<c>timeout</c>, <c>http_status</c>, <c>no_live_client</c>...), not an exception.</summary>
    public Task<ReplyEngineTestResult> TestAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngineTestResult>(_http, HttpMethod.Post, $"{Base}/{Seg(engineId)}/test", null, ct, serverCodes: true);

    /// <summary>The last 24 hours: turns, replied, fell back, failed, timed out, p50/p95 and the circuit breaker.</summary>
    public Task<ReplyEngineHealth> HealthAsync(string engineId, CancellationToken ct = default) =>
        SendAsync<ReplyEngineHealth>(_http, HttpMethod.Get, $"{Base}/{Seg(engineId)}/health", null, ct, serverCodes: true);

    /// <summary>Turn log, newest first. Pass the previous page's <c>NextCursor</c> as <paramref name="cursor"/>; limit up to 100.</summary>
    public Task<ReplyTurnLogPage> ListTurnsAsync(
        string engineId, string? cursor = null, int? limit = null, bool includeTests = false, CancellationToken ct = default)
    {
        var query = new List<string>();
        if (cursor is not null) query.Add("cursor=" + Uri.EscapeDataString(cursor));
        if (limit is not null) query.Add("limit=" + limit.Value);
        if (includeTests) query.Add("includeTests=true");
        var qs = query.Count > 0 ? "?" + string.Join("&", query) : "";
        return SendAsync<ReplyTurnLogPage>(_http, HttpMethod.Get, $"{Base}/{Seg(engineId)}/turns{qs}", null, ct, serverCodes: true);
    }

    /// <summary>Which engine answers the widget (and each of its channels).</summary>
    public Task<WidgetReplyEngine> GetWidgetBindingAsync(string widgetId, CancellationToken ct = default) =>
        SendAsync<WidgetReplyEngine>(_http, HttpMethod.Get, $"/api/v1/widgets/{Seg(widgetId)}/reply-engine", null, ct, serverCodes: true);

    /// <summary>Replaces the widget's bindings. <c>Default = "erghi"</c> pins Erghi AI explicitly; null removes the binding.
    /// Erghi AI turned off on the widget always wins over a binding.</summary>
    public Task SetWidgetBindingAsync(string widgetId, WidgetReplyEngineBinding binding, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Put, $"/api/v1/widgets/{Seg(widgetId)}/reply-engine",
            new { @default = binding.Default, channels = binding.Channels }, ct, serverCodes: true);
}
