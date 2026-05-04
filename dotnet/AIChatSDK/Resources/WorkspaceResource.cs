using System.Net.Http.Json;
using System.Text.Json;
using ChatFlow.SDK.Errors;
using ChatFlow.SDK.Models;

namespace ChatFlow.SDK.Resources;

/// <summary>
/// Provides workspace CRUD operations.
/// </summary>
public sealed class WorkspaceResource
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions _json =
        new() { PropertyNameCaseInsensitive = true };

    internal WorkspaceResource(HttpClient http)
    {
        _http = http;
    }

    /// <summary>Get the current workspace.</summary>
    public async Task<Workspace> GetAsync(string workspaceId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/workspaces/{workspaceId}", ct);
        return await ReadAsync<Workspace>(response, ct);
    }

    /// <summary>List all accessible workspaces.</summary>
    public async Task<List<Workspace>> ListAsync(CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/workspaces", ct);
        return await ReadAsync<List<Workspace>>(response, ct);
    }

    /// <summary>Create a new workspace.</summary>
    public async Task<Workspace> CreateAsync(CreateWorkspaceRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/workspaces", request, ct);
        return await ReadAsync<Workspace>(response, ct);
    }

    /// <summary>Update workspace properties.</summary>
    public async Task<Workspace> UpdateAsync(
        string workspaceId, UpdateWorkspaceRequest request, CancellationToken ct = default)
    {
        var response = await _http.PutAsJsonAsync($"/api/workspaces/{workspaceId}", request, ct);
        return await ReadAsync<Workspace>(response, ct);
    }

    /// <summary>Delete a workspace by ID.</summary>
    public async Task DeleteAsync(string workspaceId, CancellationToken ct = default)
    {
        var response = await _http.DeleteAsync($"/api/workspaces/{workspaceId}", ct);
        await EnsureSuccessAsync(response, ct);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);

        if (response.IsSuccessStatusCode)
        {
            return JsonSerializer.Deserialize<T>(body, _json)
                ?? throw new AIChatException("Empty response body", "EMPTY_RESPONSE");
        }

        ThrowForStatus(response.StatusCode, body);
        throw new AIChatException($"HTTP {(int)response.StatusCode}", "HTTP_ERROR");
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
