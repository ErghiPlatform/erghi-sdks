using Microsoft.AspNetCore.SignalR.Client;
using ChatFlow.SDK.Errors;
using ChatFlow.SDK.Models;
using ChatFlow.SDK.Resources;
using ChatFlow.SDK.Auth;

namespace ChatFlow.SDK;

/// <summary>
/// Main entry point for the ChatFlow SDK.
/// Provides authenticated HTTP resources and a real-time SignalR connection.
/// </summary>
public sealed class AIChatClient : IAsyncDisposable
{
    private readonly AIChatConfig _config;
    private readonly HttpClient _http;
    private HubConnection? _hub;

    // ── Resource accessors ───────────────────────────────────────────────────

    public AuthResource Auth { get; }
    public ChatResource Chat { get; }
    public WorkspaceResource Workspace { get; }

    // ── Connection state ─────────────────────────────────────────────────────

    public bool IsConnected => _hub?.State == HubConnectionState.Connected;

    // ── Events ────────────────────────────────────────────────────────────────

    /// <summary>Fires when a new chat message is received via SignalR.</summary>
    public event Action<Message>? MessageReceived;

    /// <summary>Fires when a user typing indicator is received.</summary>
    public event Action<TypingEvent>? UserTyping;

    /// <summary>Fires when a user comes online.</summary>
    public event Action<string>? UserOnline;

    /// <summary>Fires when a user goes offline.</summary>
    public event Action<string>? UserOffline;

    /// <summary>Fires when the SignalR connection is established.</summary>
    public event Action? Connected;

    /// <summary>Fires when the SignalR connection is dropped.</summary>
    public event Action<Exception?>? Disconnected;

    // ── Constructor ───────────────────────────────────────────────────────────

    public AIChatClient(AIChatConfig config)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));

        Auth = new AuthResource(null!, this); // Dummy HTTP client for now, initialized properly below
        Chat = new ChatResource(null!, this);
        Workspace = new WorkspaceResource(null!);

        var handler = new M2MAuthHandler(config, token =>
        {
            Auth.StoreM2MTokens(token);
        });

        _http = new HttpClient(handler)
        {
            BaseAddress = new Uri(config.ApiUrl.TrimEnd('/') + "/"),
            Timeout = config.Timeout,
        };

        _http.DefaultRequestHeaders.Add("Accept", "application/json");
        _http.DefaultRequestHeaders.Add("X-SDK-Version", "2.0.0");
        _http.DefaultRequestHeaders.Add("X-SDK-Language", "dotnet");

        if (config.ApiKey is not null)
            _http.DefaultRequestHeaders.Add("X-API-Key", config.ApiKey);

        if (config.WorkspaceId is not null)
            _http.DefaultRequestHeaders.Add("X-Workspace-Id", config.WorkspaceId);

        if (config.AccessToken is not null)
            SetAccessToken(config.AccessToken);

        // Re-initialize resource structures with the actual HttpClient that uses the M2M handler
        Auth = new AuthResource(_http, this);
        Chat = new ChatResource(_http, this);
        Workspace = new WorkspaceResource(_http);
    }

    // ── SignalR ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Connect to the ChatFlow SignalR hub and begin receiving real-time events.
    /// Must be authenticated before calling this method.
    /// </summary>
    public async Task ConnectAsync(CancellationToken ct = default)
    {
        if (IsConnected) return;

        if (Auth.AccessToken is null)
            throw new AuthenticationException("Must be authenticated before connecting to the hub.");

        _hub = new HubConnectionBuilder()
            .WithUrl(_config.ResolvedHubUrl, opts =>
            {
                opts.AccessTokenProvider = () => Task.FromResult<string?>(Auth.AccessToken);
            })
            .WithAutomaticReconnect()
            .Build();

        RegisterHubHandlers();

        _hub.Closed += ex =>
        {
            if (_config.Debug)
                Console.Error.WriteLine($"[ChatFlow] Hub disconnected: {ex?.Message}");
            Disconnected?.Invoke(ex);
            return Task.CompletedTask;
        };

        _hub.Reconnected += _ =>
        {
            if (_config.Debug)
                Console.WriteLine("[ChatFlow] Hub reconnected.");
            Connected?.Invoke();
            return Task.CompletedTask;
        };

        try
        {
            await _hub.StartAsync(ct);
            if (_config.Debug)
                Console.WriteLine($"[ChatFlow] Connected to hub: {_config.ResolvedHubUrl}");
            Connected?.Invoke();
        }
        catch (Exception ex)
        {
            throw new NetworkException("Failed to connect to ChatFlow hub.", ex);
        }
    }

    /// <summary>Disconnect from the SignalR hub.</summary>
    public async Task DisconnectAsync(CancellationToken ct = default)
    {
        if (_hub is not null)
        {
            await _hub.StopAsync(ct);
            if (_config.Debug)
                Console.WriteLine("[ChatFlow] Disconnected from hub.");
        }
    }

    /// <summary>Join a conversation room to receive its messages.</summary>
    public async Task JoinConversationAsync(string conversationId, CancellationToken ct = default)
    {
        EnsureConnected();
        await _hub!.InvokeAsync("JoinConversation", conversationId, ct);
    }

    /// <summary>Leave a conversation room.</summary>
    public async Task LeaveConversationAsync(string conversationId, CancellationToken ct = default)
    {
        EnsureConnected();
        await _hub!.InvokeAsync("LeaveConversation", conversationId, ct);
    }

    /// <summary>Broadcast a typing indicator to other participants.</summary>
    public async Task SendTypingAsync(string conversationId, bool isTyping, CancellationToken ct = default)
    {
        if (!IsConnected) return;
        await _hub!.InvokeAsync("SendTyping", conversationId, isTyping, ct);
    }

    // ── Token management ──────────────────────────────────────────────────────

    internal void SetAccessToken(string token)
    {
        _http.DefaultRequestHeaders.Remove("Authorization");
        _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
    }

    internal void ClearAccessToken()
    {
        _http.DefaultRequestHeaders.Remove("Authorization");
    }

    // ── IAsyncDisposable ──────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        if (_hub is not null)
        {
            await _hub.DisposeAsync();
        }
        _http.Dispose();
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private void RegisterHubHandlers()
    {
        _hub!.On<Message>("ReceiveMessage", msg =>
        {
            if (_config.Debug)
                Console.WriteLine($"[ChatFlow] Message from {msg.Sender}: {msg.Content}");
            MessageReceived?.Invoke(msg);
        });

        _hub.On<TypingEvent>("UserTyping", evt =>
        {
            if (_config.Debug)
                Console.WriteLine($"[ChatFlow] Typing: {evt.UserId} isTyping={evt.IsTyping}");
            UserTyping?.Invoke(evt);
        });

        _hub.On<string>("UserOnline", userId =>
        {
            if (_config.Debug)
                Console.WriteLine($"[ChatFlow] Online: {userId}");
            UserOnline?.Invoke(userId);
        });

        _hub.On<string>("UserOffline", userId =>
        {
            if (_config.Debug)
                Console.WriteLine($"[ChatFlow] Offline: {userId}");
            UserOffline?.Invoke(userId);
        });
    }

    private void EnsureConnected()
    {
        if (!IsConnected)
            throw new NetworkException("Not connected to ChatFlow hub. Call ConnectAsync first.");
    }
}
