using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

namespace Erghi.SDK.Resources;

/// <summary>
/// Email/password authentication, backed by the platform's GoTrue auth server.
/// The gateway forwards <c>/api/auth/*</c> to GoTrue unchanged, so requests and
/// responses use GoTrue's snake_case shapes and are mapped onto the SDK models
/// here. Server-to-server integrations should use API keys
/// (<c>ClientId</c>/<c>ClientSecret</c>) instead.
/// </summary>
public sealed class AuthResource
{
    private readonly HttpClient _http;
    private readonly ErghiClient _client;

    public string? AccessToken { get; private set; }
    public string? RefreshToken { get; private set; }

    internal AuthResource(HttpClient http, ErghiClient client)
    {
        _http = http;
        _client = client;
    }

    /// <summary>
    /// Register a new user account. Tokens are empty while the platform waits for
    /// email confirmation (see <see cref="VerifyEmailAsync"/>).
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/register", new
        {
            email = request.Email,
            password = request.Password,
            phone = request.PhoneNumber,
            data = new { first_name = request.FirstName, last_name = request.LastName },
        }, ct);
        return StoreTokens(await ReadSessionAsync(response, ct));
    }

    /// <summary>Authenticate an existing user and obtain tokens.</summary>
    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/login",
            new { email = request.Email, password = request.Password }, ct);
        return StoreTokens(await ReadSessionAsync(response, ct));
    }

    /// <summary>Refresh the access token using the stored refresh token.</summary>
    public async Task<AuthResponse> RefreshAsync(CancellationToken ct = default)
    {
        if (RefreshToken is null)
            throw new AuthenticationException("No refresh token available. Call LoginAsync first.");

        var response = await _http.PostAsJsonAsync("/api/auth/token?grant_type=refresh_token",
            new { refresh_token = RefreshToken }, ct);
        return StoreTokens(await ReadSessionAsync(response, ct));
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
        var response = await _http.GetAsync("/api/auth/user", ct);
        return (await ReadResponseAsync<GoTrueUser>(response, ct)).ToUser();
    }

    /// <summary>Confirm a signup with the token from the confirmation email link.</summary>
    public async Task VerifyEmailAsync(string token, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/verify",
            new { type = "signup", token_hash = token }, ct);
        StoreTokens(await ReadSessionAsync(response, ct));
    }

    /// <summary>Send a password reset email.</summary>
    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/recover", new { email }, ct);
        await EnsureSuccessAsync(response, ct);
    }

    /// <summary>
    /// Set a new password using the token from the reset email link: the token is
    /// exchanged for a recovery session, which then updates the password.
    /// </summary>
    public async Task ResetPasswordAsync(string token, string newPassword, CancellationToken ct = default)
    {
        var verified = await _http.PostAsJsonAsync("/api/auth/verify",
            new { type = "recovery", token_hash = token }, ct);
        var session = await ReadResponseAsync<GoTrueSession>(verified, ct);
        if (string.IsNullOrEmpty(session.AccessToken))
            throw new AuthenticationException("Password reset token was not accepted");

        using var update = new HttpRequestMessage(HttpMethod.Put, "/api/auth/user")
        {
            Content = JsonContent.Create(new { password = newPassword }),
        };
        update.Headers.Authorization = new("Bearer", session.AccessToken);
        var response = await _http.SendAsync(update, ct);
        await EnsureSuccessAsync(response, ct);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    private AuthResponse StoreTokens(AuthResponse auth)
    {
        if (string.IsNullOrEmpty(auth.AccessToken))
            return auth;

        AccessToken = auth.AccessToken;
        RefreshToken = auth.RefreshToken;
        _client.SetAccessToken(auth.AccessToken);
        return auth;
    }

    private static async Task<AuthResponse> ReadSessionAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await ReadResponseAsync<GoTrueSession>(response, ct);
        return body.ToAuthResponse();
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
                ?? throw new ErghiException("Empty response body", "EMPTY_RESPONSE");
        }

        ThrowForStatus(response.StatusCode, body);
        throw new ErghiException($"HTTP {(int)response.StatusCode}", "HTTP_ERROR", (int)response.StatusCode);
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
            _ => new ErghiException(msg, "HTTP_ERROR", code),
        };
    }

    private static string? TryGetMessage(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            foreach (var key in new[] { "message", "error", "msg", "error_description" })
            {
                if (doc.RootElement.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String)
                    return prop.GetString();
            }
        }
        catch { }
        return null;
    }
}

/// <summary>GoTrue session (or, from signup pending confirmation, a bare user).</summary>
internal sealed class GoTrueSession
{
    [JsonPropertyName("access_token")] public string? AccessToken { get; set; }
    [JsonPropertyName("refresh_token")] public string? RefreshToken { get; set; }
    [JsonPropertyName("expires_in")] public int? ExpiresIn { get; set; }
    [JsonPropertyName("token_type")] public string? TokenType { get; set; }
    [JsonPropertyName("user")] public GoTrueUser? User { get; set; }

    // Bare-user fields, present when signup returns no session.
    [JsonPropertyName("id")] public string? Id { get; set; }
    [JsonExtensionData] public Dictionary<string, JsonElement>? Rest { get; set; }

    public AuthResponse ToAuthResponse()
    {
        var user = User ?? BareUser();
        return new AuthResponse(
            AccessToken ?? "",
            RefreshToken ?? "",
            ExpiresIn ?? 0,
            TokenType ?? "bearer",
            user.ToUser());
    }

    private GoTrueUser BareUser()
    {
        var json = JsonSerializer.Serialize(Rest ?? new Dictionary<string, JsonElement>());
        var user = JsonSerializer.Deserialize<GoTrueUser>(json) ?? new GoTrueUser();
        user.Id = Id ?? user.Id;
        return user;
    }
}

internal sealed class GoTrueUser
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("phone")] public string? Phone { get; set; }
    [JsonPropertyName("role")] public string? Role { get; set; }
    [JsonPropertyName("email_confirmed_at")] public DateTime? EmailConfirmedAt { get; set; }
    [JsonPropertyName("created_at")] public DateTime? CreatedAt { get; set; }
    [JsonPropertyName("updated_at")] public DateTime? UpdatedAt { get; set; }
    [JsonPropertyName("user_metadata")] public Dictionary<string, JsonElement>? UserMetadata { get; set; }

    public User ToUser() => new(
        Id,
        Email ?? "",
        Metadata("first_name") ?? "",
        Metadata("last_name") ?? "",
        string.IsNullOrEmpty(Phone) ? null : Phone,
        Metadata("avatar_url"),
        Role ?? "authenticated",
        EmailConfirmedAt is not null,
        CreatedAt ?? default,
        UpdatedAt ?? CreatedAt ?? default);

    private string? Metadata(string key) =>
        UserMetadata is not null
        && UserMetadata.TryGetValue(key, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
