using System.Net.Http.Json;
using System.Text.Json;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;

namespace Erghi.SDK.Resources;

/// <summary>
/// Workspaces of the signed-in user's account. The platform exposes list and
/// create; renaming and deleting a workspace are done in the admin portal.
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

    /// <summary>Get one of the account's workspaces by ID.</summary>
    public async Task<Workspace> GetAsync(string workspaceId, CancellationToken ct = default)
    {
        var workspaces = await ListAsync(ct);
        return workspaces.FirstOrDefault(w => w.Id == workspaceId)
            ?? throw new NotFoundException($"Workspace {workspaceId} not found in this account");
    }

    /// <summary>List the workspaces of the signed-in user's account.</summary>
    public async Task<List<Workspace>> ListAsync(CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/v1/accounts/workspaces", ct);
        var rows = await ReadAsync<List<AccountWorkspaceSummary>>(response, ct);
        return rows.Select(r => new Workspace(r.WorkspaceId, r.Name, r.Slug ?? "", r.IsCurrent)).ToList();
    }

    /// <summary>Create a new workspace in the signed-in user's account.</summary>
    public async Task<Workspace> CreateAsync(CreateWorkspaceRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/v1/accounts/workspaces",
            new { workspaceName = request.Name, companyWebsite = request.CompanyWebsite }, ct);
        var created = await ReadAsync<CreateWorkspaceResult>(response, ct);
        return new Workspace(created.WorkspaceId, created.WorkspaceName, "", false);
    }

    /// <summary>Not supported: the API has no workspace update endpoint. Always throws.</summary>
    [Obsolete("The platform API has no workspace update endpoint; rename a workspace in the admin portal.")]
    public Task<Workspace> UpdateAsync(
        string workspaceId, UpdateWorkspaceRequest request, CancellationToken ct = default) =>
        throw new ErghiException("Updating a workspace is not supported by the API", "NOT_SUPPORTED");

    /// <summary>Not supported: the API has no workspace delete endpoint. Always throws.</summary>
    [Obsolete("The platform API has no workspace delete endpoint; delete a workspace in the admin portal.")]
    public Task DeleteAsync(string workspaceId, CancellationToken ct = default) =>
        throw new ErghiException("Deleting a workspace is not supported by the API", "NOT_SUPPORTED");

    private sealed record AccountWorkspaceSummary(string WorkspaceId, string Name, string? Slug, bool IsCurrent);

    private sealed record CreateWorkspaceResult(string WorkspaceId, string WorkspaceName);

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
