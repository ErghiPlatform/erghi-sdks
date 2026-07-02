using System.Net.Http.Json;
using System.Text.Json;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

namespace Erghi.SDK.Resources;

/// <summary>
/// Provides authentication operations: register, login, refresh, logout, profile.
/// </summary>
public sealed class AuthResource
{
    private readonly HttpClient _http;
    private readonly AIChatClient _client;

    public string? AccessToken { get; private set; }
    public string? RefreshToken { get; private set; }

    internal AuthResource(HttpClient http, AIChatClient client)
    {
        _http = http;
        _client = client;
    }

    /// <summary>Register a new user account.</summary>
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/register", request, ct);
        var auth = await ReadResponseAsync<AuthResponse>(response, ct);
        StoreTokens(auth);
        return auth;
    }

    /// <summary>Authenticate an existing user and obtain tokens.</summary>
    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/login", request, ct);
        var auth = await ReadResponseAsync<AuthResponse>(response, ct);
        StoreTokens(auth);
        return auth;
    }

    /// <summary>Refresh the access token using the stored refresh token.</summary>
    public async Task<AuthResponse> RefreshAsync(CancellationToken ct = default)
    {
        if (RefreshToken is null)
            throw new AuthenticationException("No refresh token available. Call LoginAsync first.");

        var response = await _http.PostAsJsonAsync("/api/auth/refresh",
            new RefreshTokenRequest(RefreshToken), ct);
        var auth = await ReadResponseAsync<AuthResponse>(response, ct);
        StoreTokens(auth);
        return auth;
    }

    /// <summary>Invalidate the current session tokens.</summary>
    public async Task LogoutAsync(CancellationToken ct = default)
    {
        await _http.PostAsync("/api/auth/logout", null, ct);
        AccessToken = null;
        RefreshToken = null;
        _client.ClearAccessToken();
    }

    /// <summary>Get the authenticated user's profile.</summary>
    public async Task<User> MeAsync(CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/auth/me", ct);
        return await ReadResponseAsync<User>(response, ct);
    }

    /// <summary>Send a password reset email.</summary>
    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/forgot-password",
            new { email }, ct);
        await EnsureSuccessAsync(response, ct);
    }

    /// <summary>Reset password using the token received by email.</summary>
    public async Task ResetPasswordAsync(string token, string newPassword, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword }, ct);
        await EnsureSuccessAsync(response, ct);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private void StoreTokens(AuthResponse auth)
    {
        AccessToken = auth.AccessToken;
        RefreshToken = auth.RefreshToken;
        _client.SetAccessToken(auth.AccessToken);
    }

    internal void StoreM2MTokens(string token)
    {
        AccessToken = token;
    }

    private static async Task<T> ReadResponseAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);

        if (response.IsSuccessStatusCode)
        {
            return JsonSerializer.Deserialize<T>(body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new AIChatException("Empty response body", "EMPTY_RESPONSE");
        }

        ThrowForStatus(response.StatusCode, body);
        throw new AIChatException($"HTTP {(int)response.StatusCode}", "HTTP_ERROR", (int)response.StatusCode);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            ThrowForStatus(response.StatusCode, body);
        }
    }

    private static void ThrowForStatus(System.Net.HttpStatusCode status, string body)
    {
        var code = (int)status;
        var msg = TryGetMessage(body) ?? $"HTTP {code}";
        throw code switch
        {
            401 => new AuthenticationException(msg),
            400 => new ValidationException(msg, body),
            404 => new NotFoundException(msg),
            429 => new RateLimitException(msg),
            _ => new AIChatException(msg, "HTTP_ERROR", code),
        };
    }

    private static string? TryGetMessage(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("message", out var prop))
                return prop.GetString();
        }
        catch { }
        return null;
    }
}
