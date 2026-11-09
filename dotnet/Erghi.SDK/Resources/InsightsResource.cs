using System.Globalization;
using System.Text.Json;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

namespace Erghi.SDK.Resources;

/// <summary>
/// Conversation Insights: topic, sentiment and outcome of finished conversations.
/// Needs the <c>view_insights</c> workspace permission (Owner and Admin roles), so call it with a
/// signed-in user's access token. API keys and client-credentials tokens get 403. An invalid
/// filter is a 400 (<see cref="ValidationException"/>) with the code <c>invalid_filter</c>.
/// </summary>
public sealed class InsightsResource
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions _json =
        new() { PropertyNameCaseInsensitive = true };

    internal InsightsResource(HttpClient http)
    {
        _http = http;
    }

    /// <summary>Counts by outcome, sentiment, category, topic (top 20) and language, plus the AI-resolved rate.</summary>
    public async Task<InsightSummary> SummaryAsync(InsightFilter? filter = null, CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/v1/insights/summary" + Query(filter, null, null), ct);
        return await ReadAsync<InsightSummary>(response, ct);
    }

    /// <summary>Classified conversations, newest first. <paramref name="pageSize"/> is capped at 100 by the server.</summary>
    public async Task<InsightPage> ListConversationsAsync(
        InsightFilter? filter = null, int? page = null, int? pageSize = null, CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/v1/insights/conversations" + Query(filter, page, pageSize), ct);
        return await ReadAsync<InsightPage>(response, ct);
    }

    /// <summary>
    /// The same rows as CSV text (newest first, at most 10,000 rows). The server's file starts with
    /// a UTF-8 byte-order mark so Excel reads Arabic correctly; .NET strips it when decoding, so
    /// write the file with <c>new UTF8Encoding(true)</c>. Text fields that start with
    /// <c>= + - @</c> are prefixed with <c>'</c> so a spreadsheet will not run them as formulas.
    /// </summary>
    public async Task<string> ExportCsvAsync(InsightFilter? filter = null, CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/v1/insights/export.csv" + Query(filter, null, null), ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) ThrowForStatus(response.StatusCode, body);
        return body;
    }

    private static string Query(InsightFilter? f, int? page, int? pageSize)
    {
        var parts = new List<string>();
        void Add(string key, string? value)
        {
            if (!string.IsNullOrEmpty(value)) parts.Add($"{key}={Uri.EscapeDataString(value)}");
        }

        if (f is not null)
        {
            Add("from", f.From?.UtcDateTime.ToString("o", CultureInfo.InvariantCulture));
            Add("to", f.To?.UtcDateTime.ToString("o", CultureInfo.InvariantCulture));
            Add("channel", f.Channel);
            Add("category", f.Category);
            Add("topic", f.Topic);
            Add("sentiment", f.Sentiment);
            Add("outcome", f.Outcome);
            Add("minConfidence", f.MinConfidence?.ToString(CultureInfo.InvariantCulture));
        }
        Add("page", page?.ToString(CultureInfo.InvariantCulture));
        Add("pageSize", pageSize?.ToString(CultureInfo.InvariantCulture));
        return parts.Count == 0 ? "" : "?" + string.Join('&', parts);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);

        if (response.IsSuccessStatusCode)
        {
            return JsonSerializer.Deserialize<T>(body, _json)
                ?? throw new ErghiException("Empty response body", "EMPTY_RESPONSE");
        }

        ThrowForStatus(response.StatusCode, body);
        throw new ErghiException($"HTTP {(int)response.StatusCode}", "HTTP_ERROR");
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
