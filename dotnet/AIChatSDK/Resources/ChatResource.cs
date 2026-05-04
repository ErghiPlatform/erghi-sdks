using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ChatFlow.SDK.Errors;
using ChatFlow.SDK.Models;

namespace ChatFlow.SDK.Resources;

/// <summary>
/// Provides chat operations: conversations, messages, typing indicators.
/// </summary>
public sealed class ChatResource
{
    private readonly HttpClient _http;
    private readonly AIChatClient _client;

    private static readonly JsonSerializerOptions _json =
        new() { PropertyNameCaseInsensitive = true };

    internal ChatResource(HttpClient http, AIChatClient client)
    {
        _http = http;
        _client = client;
    }

    // ── Conversations ────────────────────────────────────────────────────────

    /// <summary>Get a single conversation by ID.</summary>
    public async Task<Conversation> GetConversationAsync(string conversationId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/conversations/{conversationId}", ct);
        return await ReadAsync<Conversation>(response, ct);
    }

    /// <summary>List conversations with optional pagination.</summary>
    public async Task<PaginatedResponse<Conversation>> ListConversationsAsync(
        int page = 1, int limit = 20, string? status = null, CancellationToken ct = default)
    {
        var query = $"?page={page}&limit={limit}";
        if (status is not null) query += $"&status={status}";

        var response = await _http.GetAsync($"/api/conversations{query}", ct);
        return await ReadAsync<PaginatedResponse<Conversation>>(response, ct);
    }

    /// <summary>Create a new conversation for a widget.</summary>
    public async Task<Conversation> CreateConversationAsync(
        CreateConversationRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/conversations", request, ct);
        return await ReadAsync<Conversation>(response, ct);
    }

    /// <summary>Close an open conversation.</summary>
    public async Task<Conversation> CloseConversationAsync(string conversationId, CancellationToken ct = default)
    {
        var response = await _http.PostAsync($"/api/conversations/{conversationId}/close", null, ct);
        return await ReadAsync<Conversation>(response, ct);
    }

    /// <summary>Assign a conversation to an agent.</summary>
    public async Task<Conversation> AssignConversationAsync(
        string conversationId, string agentId, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync(
            $"/api/conversations/{conversationId}/assign", new { agentId }, ct);
        return await ReadAsync<Conversation>(response, ct);
    }

    // ── Messages ─────────────────────────────────────────────────────────────

    /// <summary>Get paginated messages for a conversation.</summary>
    public async Task<PaginatedResponse<Message>> GetMessagesAsync(
        string conversationId, int page = 1, int limit = 50, CancellationToken ct = default)
    {
        var response = await _http.GetAsync(
            $"/api/conversations/{conversationId}/messages?page={page}&limit={limit}", ct);
        return await ReadAsync<PaginatedResponse<Message>>(response, ct);
    }

    /// <summary>Send a text message to a conversation.</summary>
    public async Task<Message> SendMessageAsync(
        string conversationId, SendMessageRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync(
            $"/api/conversations/{conversationId}/messages", request, ct);
        return await ReadAsync<Message>(response, ct);
    }

    /// <summary>Send a message with file attachments (multipart form).</summary>
    public async Task<Message> SendMessageWithAttachmentAsync(
        string conversationId, string content, Stream file, string fileName,
        string contentType = "application/octet-stream", CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(content), "content");
        form.Add(new StreamContent(file) { Headers = { ContentType = new(contentType) } },
            "attachments", fileName);

        var response = await _http.PostAsync(
            $"/api/conversations/{conversationId}/messages", form, ct);
        return await ReadAsync<Message>(response, ct);
    }

    /// <summary>Mark all messages in a conversation as read.</summary>
    public async Task MarkAsReadAsync(string conversationId, CancellationToken ct = default)
    {
        var response = await _http.PostAsync(
            $"/api/conversations/{conversationId}/messages/read", null, ct);
        await EnsureSuccessAsync(response, ct);
    }

    /// <summary>Send a typing indicator via SignalR hub.</summary>
    public async Task SendTypingAsync(string conversationId, bool isTyping, CancellationToken ct = default)
    {
        await _client.SendTypingAsync(conversationId, isTyping, ct);
    }

    // ── Widgets ──────────────────────────────────────────────────────────────

    /// <summary>Get a widget by its ID.</summary>
    public async Task<Widget> GetWidgetAsync(string widgetId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/widgets/{widgetId}", ct);
        return await ReadAsync<Widget>(response, ct);
    }

    /// <summary>List all widgets for the current workspace.</summary>
    public async Task<List<Widget>> ListWidgetsAsync(CancellationToken ct = default)
    {
        var response = await _http.GetAsync("/api/widgets", ct);
        return await ReadAsync<List<Widget>>(response, ct);
    }

    /// <summary>Create a new chat widget.</summary>
    public async Task<Widget> CreateWidgetAsync(CreateWidgetRequest request, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/widgets", request, ct);
        return await ReadAsync<Widget>(response, ct);
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
