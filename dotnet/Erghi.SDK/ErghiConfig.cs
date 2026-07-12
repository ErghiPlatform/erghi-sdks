namespace Erghi.SDK;

/// <summary>
/// Configuration options for the Erghi SDK client.
/// </summary>
public sealed class ErghiConfig
{
    /// <summary>
    /// Base URL of the Erghi API gateway. Defaults to http://localhost:5000.
    /// </summary>
    public string ApiUrl { get; set; } = "http://localhost:5000";

    /// <summary>
    /// Optional SignalR hub URL. Derived from ApiUrl when not set.
    /// </summary>
    public string? HubUrl { get; set; }

    /// <summary>
    /// API key for widget/server-side authentication.
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// JWT access token for user authentication.
    /// </summary>
    public string? AccessToken { get; set; }

    /// <summary>
    /// Client ID for M2M authentication.
    /// </summary>
    public string? ClientId { get; set; }

    /// <summary>
    /// Client Secret for M2M authentication.
    /// </summary>
    public string? ClientSecret { get; set; }

    /// <summary>
    /// Workspace ID to include in every request header.
    /// </summary>
    public string? WorkspaceId { get; set; }

    /// <summary>
    /// Authenticated Visitor ID for widget sessions.
    /// </summary>
    public string? VisitorId { get; set; }

    /// <summary>
    /// HTTP request timeout. Defaults to 30 seconds.
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Enable debug logging to the console.
    /// </summary>
    public bool Debug { get; set; }

    /// <summary>
    /// Derives the SignalR hub URL from ApiUrl if HubUrl is not explicitly set.
    /// </summary>
    internal string ResolvedHubUrl =>
        HubUrl ?? $"{ApiUrl.TrimEnd('/')}/hubs/chat";
}
