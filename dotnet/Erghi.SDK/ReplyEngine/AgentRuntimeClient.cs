using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR.Client;
using Erghi.SDK.Auth;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

namespace Erghi.SDK;

/// <summary>Connection settings for <see cref="AgentRuntimeClient"/>.</summary>
public sealed class AgentRuntimeOptions
{
    /// <summary>Base URL of the Erghi API, for example <c>https://api.erghi.ai</c>.</summary>
    public string ApiUrl { get; set; } = "http://localhost:5000";

    /// <summary>The live-connection engine this client serves (create it with <c>ReplyEngines.CreateAsync</c>, mode LiveConnection).</summary>
    public string EngineId { get; set; } = "";

    /// <summary>Client id of an API key holding <c>agent:runtime</c>. The token is exchanged and renewed for you.</summary>
    public string? ClientId { get; set; }

    /// <summary>Client secret of that key. Never logged by the SDK.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Alternative to client credentials: supply the bearer token yourself on every (re)connect.</summary>
    public Func<CancellationToken, Task<string>>? AccessTokenProvider { get; set; }

    /// <summary>Hub URL; derived from <see cref="ApiUrl"/> as <c>/hubs/agent-runtime</c> when not set. <c>engineId</c> is appended.</summary>
    public string? HubUrl { get; set; }

    /// <summary>Highest turn sequence you already handled (persist it across restarts to catch up). 0 = none.</summary>
    public long LastSequence { get; set; }

    /// <summary>Wait between reconnect attempts, per attempt; the last value repeats forever. Default 0s, 1s, 2s, 5s, 10s, 30s.</summary>
    public TimeSpan[] ReconnectDelays { get; set; } =
        [TimeSpan.Zero, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30)];
}

/// <summary>What a hub method answers. <see cref="Code"/> mirrors the REST error codes (<c>not_found</c>, <c>turn_closed</c>,
/// <c>turn_superseded</c>, <c>validation_failed</c>, <c>handoff_unavailable</c>, <c>human_engaged</c>...).
/// The hub does not throw for a refused call: check <see cref="Ok"/>.</summary>
public sealed record AgentRuntimeResult(
    bool Ok, string? Code = null, string? Error = null, string? Reason = null,
    List<string>? MessageIds = null, bool? Claimed = null, int? Resent = null);

/// <summary>Remembers the highest turn sequence seen and drops a turn the client already delivered
/// (the server re-sends open turns on <c>Resume</c>; clients de-duplicate on turn id).</summary>
internal sealed class TurnTracker(long lastSequence = 0, int memory = 2000)
{
    private readonly object _gate = new();
    private readonly Queue<string> _order = new();
    private readonly HashSet<string> _seen = new(StringComparer.OrdinalIgnoreCase);
    private long _last = lastSequence;

    public long LastSequence { get { lock (_gate) return _last; } }

    /// <summary>True when this turn is new and should be delivered.</summary>
    public bool Accept(string turnId, long sequence)
    {
        lock (_gate)
        {
            if (!_seen.Add(turnId)) return false;
            _order.Enqueue(turnId);
            while (_order.Count > memory) _seen.Remove(_order.Dequeue());
            if (sequence > _last) _last = sequence;
            return true;
        }
    }
}

internal sealed class ForeverRetryPolicy(TimeSpan[] delays) : IRetryPolicy
{
    public TimeSpan? NextRetryDelay(RetryContext ctx)
    {
        if (delays.Length == 0) return TimeSpan.FromSeconds(5);
        var i = (int)Math.Min(ctx.PreviousRetryCount, delays.Length - 1);
        return delays[i];
    }
}

/// <summary>
/// Live connection for a customer's own agent: connects outbound to <c>/hubs/agent-runtime</c> with an API key,
/// receives each turn Erghi dispatches to the engine and answers over the same connection. It reconnects forever with
/// backoff and, after each reconnect, calls <c>Resume(lastSequence)</c> so turns dispatched while the link was down
/// (and still open) arrive again; a turn already delivered is not raised twice.
/// <para>Typical use: <c>client.TurnRequested += async turn =&gt; { await client.AckAsync(turn.TurnId); ...;
/// await client.ReplyCompleteAsync(turn.TurnId, AgentReply.Of(key, "Hello")); };</c> then <c>await client.StartAsync()</c>.
/// Handlers run on the connection's receive loop one at a time, so do slow work (an LLM call) on another task.</para>
/// <para>Several instances of one agent may connect for the same engine (the engine's connection limit applies);
/// the first <c>Ack</c> claims a turn and the others see <c>Claimed = false</c>.</para>
/// </summary>
public sealed class AgentRuntimeClient : IAsyncDisposable
{
    private readonly AgentRuntimeOptions _options;
    private readonly ClientCredentialsTokenSource? _tokens;
    private readonly TurnTracker _tracker;
    private HubConnection? _hub;

    public AgentRuntimeClient(AgentRuntimeOptions options)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        if (string.IsNullOrWhiteSpace(options.EngineId)) throw new ArgumentException("EngineId is required.", nameof(options));
        if (options.AccessTokenProvider is null)
        {
            if (string.IsNullOrEmpty(options.ClientId) || string.IsNullOrEmpty(options.ClientSecret))
                throw new ArgumentException("Set ClientId and ClientSecret, or AccessTokenProvider.", nameof(options));
            _tokens = new ClientCredentialsTokenSource(options.ApiUrl, options.ClientId, options.ClientSecret);
        }
        _tracker = new TurnTracker(options.LastSequence);
    }

    public bool IsConnected => _hub?.State == HubConnectionState.Connected;

    /// <summary>Highest turn sequence delivered so far. Persist it to resume after a restart (<see cref="AgentRuntimeOptions.LastSequence"/>).</summary>
    public long LastSequence => _tracker.LastSequence;

    /// <summary>A turn to answer. Each turn is raised once, even if the server re-sends it.</summary>
    public event Func<TurnRequest, Task>? TurnRequested;

    /// <summary>Another instance of this engine claimed the turn first (<c>TurnClaimed</c>).</summary>
    public event Action<string>? TurnClaimed;

    /// <summary>The platform closed a turn (timeout, fallback, handoff, supersession): stop working on it. Payload is the raw event.</summary>
    public event Action<JsonElement>? TurnClosed;

    /// <summary>Raised after every successful (re)connect and its resume, with how many open turns the server re-sent.</summary>
    public event Action<int>? Resumed;

    public event Action<Exception?>? Reconnecting;
    public event Action<Exception?>? Closed;

    /// <summary>Connects (or throws <see cref="NetworkException"/>). The server refuses a missing/disabled engine, a key
    /// without <c>agent:runtime</c> and a connection over the engine's limit by aborting the connection.</summary>
    public async Task StartAsync(CancellationToken ct = default)
    {
        if (_hub is not null) return;

        var baseUrl = _options.HubUrl ?? _options.ApiUrl.TrimEnd('/') + "/hubs/agent-runtime";
        var url = baseUrl + (baseUrl.Contains('?') ? "&" : "?") + "engineId=" + Uri.EscapeDataString(_options.EngineId);
        var hub = new HubConnectionBuilder()
            .WithUrl(url, o => o.AccessTokenProvider = async () => await GetTokenAsync(CancellationToken.None))
            .WithAutomaticReconnect(new ForeverRetryPolicy(_options.ReconnectDelays))
            .Build();

        hub.On<JsonElement>("TurnRequested", payload =>
        {
            TurnRequest turn;
            try { turn = TurnRequest.Parse(payload); }
            catch (JsonException) { return Task.CompletedTask; }
            if (!_tracker.Accept(turn.TurnId, turn.Sequence)) return Task.CompletedTask;
            return TurnRequested?.Invoke(turn) ?? Task.CompletedTask;
        });
        hub.On<string>("TurnClaimed", id => TurnClaimed?.Invoke(id));
        hub.On<JsonElement>("TurnClosed", e => TurnClosed?.Invoke(e));
        hub.Reconnecting += ex => { Reconnecting?.Invoke(ex); return Task.CompletedTask; };
        hub.Closed += ex => { Closed?.Invoke(ex); return Task.CompletedTask; };
        hub.Reconnected += async _ => { await ResumeSafelyAsync(); };

        try { await hub.StartAsync(ct); }
        catch (Exception ex)
        {
            await hub.DisposeAsync();
            throw new NetworkException("Failed to connect to the Erghi agent-runtime hub.", ex);
        }
        _hub = hub;
        // Catch up on anything dispatched while we were not connected (also covers a restart with LastSequence set).
        if (_options.LastSequence > 0) await ResumeSafelyAsync();
    }

    public async Task StopAsync(CancellationToken ct = default)
    {
        if (_hub is null) return;
        await _hub.StopAsync(ct);
    }

    // ── Hub methods ───────────────────────────────────────────────────────────

    /// <summary>First ack claims the turn (<c>Claimed = true</c>). Acking also tells the platform you got it.</summary>
    public Task<AgentRuntimeResult> AckAsync(string turnId, CancellationToken ct = default) => Invoke("Ack", ct, Guid.Parse(turnId));

    public Task<AgentRuntimeResult> TypingAsync(string turnId, CancellationToken ct = default) => Invoke("Typing", ct, Guid.Parse(turnId));

    /// <summary>A text fragment of the reply being written; the widget shows it as a live draft under <paramref name="streamId"/>
    /// (up to 64 characters, one per streamed reply). Send the final text with <see cref="ReplyCompleteAsync"/> and the same stream id.</summary>
    public Task<AgentRuntimeResult> ReplyDeltaAsync(string turnId, string streamId, string delta, CancellationToken ct = default) =>
        Invoke("ReplyDelta", ct, Guid.Parse(turnId), streamId, delta);

    /// <summary>The reply (same body as the REST call). Pass the <paramref name="streamId"/> of the drafts it replaces.</summary>
    public Task<AgentRuntimeResult> ReplyCompleteAsync(string turnId, AgentReply reply, string? streamId = null, CancellationToken ct = default) =>
        Invoke("ReplyComplete", ct, Guid.Parse(turnId), reply, streamId);

    public Task<AgentRuntimeResult> HandoffAsync(string turnId, string? reason = null, CancellationToken ct = default) =>
        Invoke("Handoff", ct, Guid.Parse(turnId), reason);

    public Task<AgentRuntimeResult> DeclineAsync(string turnId, string? reason = null, CancellationToken ct = default) =>
        Invoke("Decline", ct, Guid.Parse(turnId), reason);

    public Task<AgentRuntimeResult> TakeBackAsync(string conversationId, bool force = false, CancellationToken ct = default) =>
        Invoke("TakeBack", ct, Guid.Parse(conversationId), force);

    /// <summary>Asks the server to re-send every open turn with a sequence above <paramref name="lastSequence"/>. Done for you after a reconnect.</summary>
    public Task<AgentRuntimeResult> ResumeAsync(long lastSequence, CancellationToken ct = default) => Invoke("Resume", ct, lastSequence);

    public async ValueTask DisposeAsync()
    {
        if (_hub is not null) await _hub.DisposeAsync();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private async Task<string?> GetTokenAsync(CancellationToken ct) =>
        _options.AccessTokenProvider is { } p ? await p(ct) : await _tokens!.GetAsync(ct);

    private async Task<AgentRuntimeResult> Invoke(string method, CancellationToken ct, params object?[] args)
    {
        var hub = _hub ?? throw new NetworkException("Not connected. Call StartAsync first.");
        if (hub.State != HubConnectionState.Connected)
            throw new NetworkException($"Not connected to the agent-runtime hub (state {hub.State}).");
        return await hub.InvokeCoreAsync<AgentRuntimeResult>(method, args, ct)
            ?? throw new ErghiException("Empty hub answer", "EMPTY_RESPONSE");
    }

    private async Task ResumeSafelyAsync()
    {
        try
        {
            var result = await ResumeAsync(_tracker.LastSequence);
            Resumed?.Invoke(result.Resent ?? 0);
        }
        catch (Exception)
        {
            // The next reconnect (or the next turn's own dispatch) catches up; a failed resume must not kill the loop.
        }
    }
}
