using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Erghi.SDK.Errors;

namespace Erghi.SDK.Resources;

/// <summary>Shared request/response plumbing for the workspace (admin) resources.</summary>
internal static class ApiCall
{
    internal static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    /// <summary>Path segment for an id: escaped so an id can never add path segments.</summary>
    internal static string Seg(string value) => Uri.EscapeDataString(value);

    internal static async Task<T> SendAsync<T>(
        HttpClient http, HttpMethod method, string path, object? body, CancellationToken ct, bool serverCodes = false)
    {
        var response = await SendRawAsync(http, method, path, body, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        ThrowIfError(response.StatusCode, text, serverCodes);
        return JsonSerializer.Deserialize<T>(text, Json)
            ?? throw new ErghiException("Empty response body", "EMPTY_RESPONSE");
    }

    internal static async Task SendAsync(
        HttpClient http, HttpMethod method, string path, object? body, CancellationToken ct, bool serverCodes = false)
    {
        var response = await SendRawAsync(http, method, path, body, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        ThrowIfError(response.StatusCode, text, serverCodes);
    }

    private static Task<HttpResponseMessage> SendRawAsync(
        HttpClient http, HttpMethod method, string path, object? body, CancellationToken ct)
    {
        var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body, options: new JsonSerializerOptions(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull });
        return http.SendAsync(request, ct);
    }

    private static void ThrowIfError(HttpStatusCode status, string body, bool serverCodes = false)
    {
        var code = (int)status;
        if (code is >= 200 and < 300) return;
        var msg = TryGetMessage(body) ?? $"HTTP {code}";
        // Reply-engine calls: 403/409/... carry the platform's machine code (turn_closed, human_engaged, ...).
        if (serverCodes && code is not (401 or 404 or 429 or 400))
            throw new ErghiApiException(msg, TryGetString(body, "code") ?? "HTTP_ERROR", code, TryGetString(body, "reason"), body);
        throw code switch
        {
            401 => new AuthenticationException(msg),
            400 => new ValidationException(msg, body),
            404 => new NotFoundException(msg),
            429 => new RateLimitException(msg),
            _ => new ErghiException(msg, "HTTP_ERROR", code),
        };
    }

    private static string? TryGetString(string body, string key)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String)
                return prop.GetString();
        }
        catch { }
        return null;
    }

    private static string? TryGetMessage(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            foreach (var key in new[] { "message", "error" })
            {
                if (doc.RootElement.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String)
                    return prop.GetString();
            }
        }
        catch { }
        return null;
    }
}
