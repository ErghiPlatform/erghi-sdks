using System.Net.Http.Json;
using Erghi.SDK.Errors;

namespace Erghi.SDK.Auth;

/// <summary>
/// Exchanges an API key's client id and secret for a short-lived access token (<c>/api/v1/auth/token</c>, about 2 hours)
/// and caches it until shortly before it expires, so a long-running agent keeps working. Thread-safe.
/// </summary>
internal sealed class ClientCredentialsTokenSource
{
    private static readonly TimeSpan Skew = TimeSpan.FromSeconds(60);
    private readonly string _apiUrl;
    private readonly string _clientId;
    private readonly string _clientSecret;
    private readonly Func<DateTimeOffset> _now;
    private readonly HttpMessageHandler? _handler;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private string? _token;
    private DateTimeOffset _expiresAt;

    public ClientCredentialsTokenSource(string apiUrl, string clientId, string clientSecret,
        HttpMessageHandler? handler = null, Func<DateTimeOffset>? now = null)
    {
        _apiUrl = apiUrl.TrimEnd('/');
        _clientId = clientId;
        _clientSecret = clientSecret;
        _handler = handler;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<string> GetAsync(CancellationToken ct = default)
    {
        if (_token is not null && _now() < _expiresAt - Skew) return _token;
        await _lock.WaitAsync(ct);
        try
        {
            if (_token is not null && _now() < _expiresAt - Skew) return _token;
            return await ExchangeAsync(ct);
        }
        finally { _lock.Release(); }
    }

    /// <summary>Forget the cached token (after a 401) so the next <see cref="GetAsync"/> exchanges again.</summary>
    public void Invalidate()
    {
        _token = null;
    }

    private async Task<string> ExchangeAsync(CancellationToken ct)
    {
        using var client = _handler is null ? new HttpClient() : new HttpClient(_handler, disposeHandler: false);
        var response = await client.PostAsJsonAsync(_apiUrl + "/api/v1/auth/token",
            new { grant_type = "client_credentials", client_id = _clientId, client_secret = _clientSecret }, ct);
        if (!response.IsSuccessStatusCode)
            throw new AuthenticationException($"Failed to authenticate: {await response.Content.ReadAsStringAsync(ct)}");

        var data = await response.Content.ReadFromJsonAsync<Dto>(cancellationToken: ct);
        if (string.IsNullOrEmpty(data?.access_token)) throw new AuthenticationException("Token response was empty.");
        _token = data.access_token;
        _expiresAt = _now().AddSeconds(data.expires_in > 0 ? data.expires_in : 3600);
        return _token;
    }

    private sealed class Dto
    {
        public string? access_token { get; set; }
        public int expires_in { get; set; }
    }
}
