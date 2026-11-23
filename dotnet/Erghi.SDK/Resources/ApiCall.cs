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

    /// <summary>GET that returns the body as text (CSV exports).</summary>
    internal static async Task<string> GetTextAsync(HttpClient http, string path, CancellationToken ct)
    {
        var response = await SendRawAsync(http, HttpMethod.Get, path, null, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        ThrowIfError(response.StatusCode, text);
        return text;
    }

    /// <summary>Builds <c>?a=1&amp;b=2</c> from the non-null parameters (empty when there are none).</summary>
    internal static string Query(params (string Key, object? Value)[] parameters)
    {
        var parts = new List<string>();
        foreach (var (key, value) in parameters)
        {
            var text = value switch
            {
                null => null,
                bool b => b ? "true" : "false",
                DateTimeOffset d => d.UtcDateTime.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                IFormattable f => f.ToString(null, System.Globalization.CultureInfo.InvariantCulture),
                _ => value.ToString(),
            };
            if (!string.IsNullOrEmpty(text)) parts.Add($"{key}={Uri.EscapeDataString(text)}");
        }
        return parts.Count == 0 ? "" : "?" + string.Join('&', parts);
    }

    private static void ThrowIfError(HttpStatusCode status, string body, bool serverCodes = false)
    {
        var code = (int)status;
        if (code is >= 200 and < 300) return;
        var msg = TryGetMessage(body) ?? $"HTTP {code}";
        var serverCode = TryGetString(body, "code");
        // Reply-engine calls: 403/409/... carry the platform's machine code (turn_closed, human_engaged, ...).
        if (serverCodes && code is not (401 or 404 or 429 or 400))
            throw new ErghiApiException(msg, serverCode ?? "HTTP_ERROR", code, TryGetString(body, "reason"), body) { ServerCode = serverCode };
        throw code switch
        {
            401 => new AuthenticationException(msg) { ServerCode = serverCode },
            400 => new ValidationException(msg, body) { ServerCode = serverCode },
            404 => new NotFoundException(msg) { ServerCode = serverCode },
            429 => new RateLimitException(msg) { ServerCode = serverCode },
            _ => new ErghiException(msg, "HTTP_ERROR", code, body) { ServerCode = serverCode },
        };
    }

    private static string? TryGetMessage(string body) => TryGetString(body, "message", "error");

    private static string? TryGetString(string body, params string[] keys)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            foreach (var key in keys)
            {
                if (doc.RootElement.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String)
                    return prop.GetString();
            }
        }
        catch { }
        return null;
    }
}
