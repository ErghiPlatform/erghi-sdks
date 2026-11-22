using System.Net.Http.Headers;
using Erghi.SDK.Errors;

namespace Erghi.SDK.Auth;

internal sealed class M2MAuthHandler : DelegatingHandler
{
    private readonly ErghiConfig _config;
    private readonly Action<string> _onTokenReceived;
    private readonly ClientCredentialsTokenSource? _source;
    private bool _exchanged;

    public M2MAuthHandler(ErghiConfig config, Action<string> onTokenReceived)
    {
        _config = config;
        _onTokenReceived = onTokenReceived;
        InnerHandler = new HttpClientHandler();
        if (!string.IsNullOrEmpty(config.ClientId) && !string.IsNullOrEmpty(config.ClientSecret))
            _source = new ClientCredentialsTokenSource(config.ApiUrl, config.ClientId, config.ClientSecret);
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        // Exchange on first use, and renew a token this handler obtained before it expires (about 2 hours): a
        // long-running server client would otherwise start answering 401. A token the caller supplied is never replaced.
        if (_source is not null && (string.IsNullOrEmpty(_config.AccessToken) || _exchanged))
        {
            var token = await _source.GetAsync(cancellationToken);
            if (token != _config.AccessToken)
            {
                _config.AccessToken = token;
                _exchanged = true;
                _onTokenReceived(token);
            }
        }

        // A token already on the request wins: the client's default header (set
        // after a login/refresh) or a per-request one (password recovery).
        if (request.Headers.Authorization is null && !string.IsNullOrEmpty(_config.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.AccessToken);
        }

        return await base.SendAsync(request, cancellationToken);
    }
}
