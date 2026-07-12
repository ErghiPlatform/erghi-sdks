using System.Net.Http.Headers;
using System.Net.Http.Json;
using Erghi.SDK.Errors;

namespace Erghi.SDK.Auth;

internal sealed class M2MAuthHandler : DelegatingHandler
{
    private readonly ErghiConfig _config;
    private readonly Action<string> _onTokenReceived;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public M2MAuthHandler(ErghiConfig config, Action<string> onTokenReceived)
    {
        _config = config;
        _onTokenReceived = onTokenReceived;
        InnerHandler = new HttpClientHandler();
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(_config.ClientId) && !string.IsNullOrEmpty(_config.ClientSecret) && string.IsNullOrEmpty(_config.AccessToken))
        {
            await _lock.WaitAsync(cancellationToken);
            try
            {
                if (string.IsNullOrEmpty(_config.AccessToken))
                {
                    var token = await ExchangeTokenAsync(cancellationToken);
                    _config.AccessToken = token;
                    _onTokenReceived(token);
                }
            }
            finally
            {
                _lock.Release();
            }
        }

        if (!string.IsNullOrEmpty(_config.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.AccessToken);
        }

        return await base.SendAsync(request, cancellationToken);
    }

    private async Task<string> ExchangeTokenAsync(CancellationToken ct)
    {
        using var client = new HttpClient();
        var requestBody = new
        {
            grant_type = "client_credentials",
            client_id = _config.ClientId,
            client_secret = _config.ClientSecret
        };

        var response = await client.PostAsJsonAsync(_config.ApiUrl.TrimEnd('/') + "/api/v1/auth/token", requestBody, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            throw new AuthenticationException($"Failed to authenticate: {err}");
        }

        var data = await response.Content.ReadFromJsonAsync<TokenResponseDto>(cancellationToken: ct);
        if (string.IsNullOrEmpty(data?.access_token))
        {
            throw new AuthenticationException("Token response was empty.");
        }

        return data.access_token;
    }

    private class TokenResponseDto
    {
        public string? access_token { get; set; }
        public string? token_type { get; set; }
        public int expires_in { get; set; }
    }
}
