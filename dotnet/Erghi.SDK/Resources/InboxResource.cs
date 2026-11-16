using System.Globalization;
using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// Inbox working data: conversation labels, private notes, saved replies, and the signed-in
/// teammate's notifications. These are workspace (admin / server-side) operations; the workspace
/// comes from the API key or access token, never from a parameter.
/// Reading needs <c>view_conversations</c>; creating, editing and deleting labels and saved
/// replies needs <c>manage_inbox_settings</c>. Notes are written by workspace members: an API key
/// can list notes but gets 403 <c>member_required</c> when it writes one.
/// Members marked "requires platform PR #256" need that platform release.
/// </summary>
public sealed class InboxResource
{
    private readonly HttpClient _http;

    internal InboxResource(HttpClient http)
    {
        _http = http;
    }

    // ── Labels ───────────────────────────────────────────────────────────────

    /// <summary>The workspace's labels and the per-workspace limit.</summary>
    public Task<ConversationLabelList> ListLabelsAsync(CancellationToken ct = default) =>
        SendAsync<ConversationLabelList>(_http, HttpMethod.Get, "/api/v1/conversation-labels", null, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>. 409 <c>label_name_taken</c> / <c>label_limit_reached</c>.</summary>
    public Task<ConversationLabel> CreateLabelAsync(
        string name, string? color = null, string? description = null, CancellationToken ct = default) =>
        SendAsync<ConversationLabel>(_http, HttpMethod.Post, "/api/v1/conversation-labels",
            new { name, color, description }, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>.</summary>
    public Task<ConversationLabel> UpdateLabelAsync(
        string labelId, string name, string? color = null, string? description = null, CancellationToken ct = default) =>
        SendAsync<ConversationLabel>(_http, HttpMethod.Put, $"/api/v1/conversation-labels/{Seg(labelId)}",
            new { name, color, description }, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>. Also removes the label from every conversation.</summary>
    public Task DeleteLabelAsync(string labelId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"/api/v1/conversation-labels/{Seg(labelId)}", null, ct);

    /// <summary>The labels on one conversation.</summary>
    public Task<List<ConversationLabel>> GetConversationLabelsAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<List<ConversationLabel>>(_http, HttpMethod.Get, $"/api/v1/conversations/{Seg(conversationId)}/labels", null, ct);

    /// <summary>Replaces the conversation's labels with exactly <paramref name="labelIds"/>.</summary>
    public Task<List<ConversationLabel>> SetConversationLabelsAsync(
        string conversationId, IEnumerable<string> labelIds, CancellationToken ct = default) =>
        SendAsync<List<ConversationLabel>>(_http, HttpMethod.Put, $"/api/v1/conversations/{Seg(conversationId)}/labels",
            new { labelIds }, ct);

    /// <summary>Adds one label (a no-op if already present). Returns the conversation's labels.</summary>
    public Task<List<ConversationLabel>> AddConversationLabelAsync(
        string conversationId, string labelId, CancellationToken ct = default) =>
        SendAsync<List<ConversationLabel>>(_http, HttpMethod.Post,
            $"/api/v1/conversations/{Seg(conversationId)}/labels/{Seg(labelId)}", null, ct);

    /// <summary>Removes one label (a no-op if absent). Returns the conversation's labels.</summary>
    public Task<List<ConversationLabel>> RemoveConversationLabelAsync(
        string conversationId, string labelId, CancellationToken ct = default) =>
        SendAsync<List<ConversationLabel>>(_http, HttpMethod.Delete,
            $"/api/v1/conversations/{Seg(conversationId)}/labels/{Seg(labelId)}", null, ct);

    // ── Conversation notes ───────────────────────────────────────────────────

    public Task<List<ConversationNote>> ListNotesAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<List<ConversationNote>>(_http, HttpMethod.Get, $"/api/v1/conversations/{Seg(conversationId)}/notes", null, ct);

    /// <summary>
    /// Needs a member token (403 <c>member_required</c> for API keys).
    /// <paramref name="mentionedUserIds"/> requires platform PR #256.
    /// </summary>
    public Task<ConversationNote> CreateNoteAsync(
        string conversationId, string content, IEnumerable<string>? mentionedUserIds = null, CancellationToken ct = default) =>
        SendAsync<ConversationNote>(_http, HttpMethod.Post, $"/api/v1/conversations/{Seg(conversationId)}/notes",
            new { content, mentionedUserIds }, ct);

    /// <summary>Only the author can edit (403 <c>note_not_author</c>).</summary>
    public Task<ConversationNote> UpdateNoteAsync(
        string conversationId, string noteId, string content, IEnumerable<string>? mentionedUserIds = null,
        CancellationToken ct = default) =>
        SendAsync<ConversationNote>(_http, HttpMethod.Put,
            $"/api/v1/conversations/{Seg(conversationId)}/notes/{Seg(noteId)}", new { content, mentionedUserIds }, ct);

    /// <summary>The author or someone with <c>manage_inbox_settings</c> can delete.</summary>
    public Task DeleteNoteAsync(string conversationId, string noteId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"/api/v1/conversations/{Seg(conversationId)}/notes/{Seg(noteId)}", null, ct);

    // ── Saved replies ────────────────────────────────────────────────────────

    /// <summary>Saved replies, optionally filtered by short code prefix or content text.</summary>
    public Task<CannedResponseList> ListCannedResponsesAsync(string? search = null, CancellationToken ct = default) =>
        SendAsync<CannedResponseList>(_http, HttpMethod.Get,
            "/api/v1/canned-responses" + (string.IsNullOrEmpty(search) ? "" : "?search=" + Uri.EscapeDataString(search)),
            null, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>. 409 <c>canned_response_short_code_taken</c>.</summary>
    public Task<CannedResponse> CreateCannedResponseAsync(string shortCode, string content, CancellationToken ct = default) =>
        SendAsync<CannedResponse>(_http, HttpMethod.Post, "/api/v1/canned-responses", new { shortCode, content }, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>.</summary>
    public Task<CannedResponse> UpdateCannedResponseAsync(
        string id, string shortCode, string content, CancellationToken ct = default) =>
        SendAsync<CannedResponse>(_http, HttpMethod.Put, $"/api/v1/canned-responses/{Seg(id)}", new { shortCode, content }, ct);

    /// <summary>Needs <c>manage_inbox_settings</c>.</summary>
    public Task DeleteCannedResponseAsync(string id, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"/api/v1/canned-responses/{Seg(id)}", null, ct);

    // ── Assignment, notifications, mentions (require platform PR #256) ────────

    /// <summary>Returns the conversation to the queue. Requires platform PR #256. 409 for resolved or closed conversations.</summary>
    public Task<Conversation> UnassignConversationAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<Conversation>(_http, HttpMethod.Post, $"/api/conversations/{Seg(conversationId)}/unassign", null, ct);

    /// <summary>
    /// The signed-in teammate's notifications, newest first. Requires platform PR #256.
    /// Notifications belong to a member, so an API key gets an empty list.
    /// </summary>
    public Task<List<UserNotification>> ListNotificationsAsync(
        bool unreadOnly = false, int? limit = null, CancellationToken ct = default)
    {
        var parts = new List<string>();
        if (unreadOnly) parts.Add("unreadOnly=true");
        if (limit is { } l) parts.Add("limit=" + l.ToString(CultureInfo.InvariantCulture));
        var query = parts.Count == 0 ? "" : "?" + string.Join('&', parts);
        return SendAsync<List<UserNotification>>(_http, HttpMethod.Get, "/api/v1/notifications" + query, null, ct);
    }

    /// <summary>Requires platform PR #256.</summary>
    public async Task<int> GetUnreadNotificationCountAsync(CancellationToken ct = default) =>
        (await SendAsync<UnreadCount>(_http, HttpMethod.Get, "/api/v1/notifications/unread-count", null, ct)).Count;

    /// <summary>Requires platform PR #256.</summary>
    public Task MarkNotificationReadAsync(string notificationId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, $"/api/v1/notifications/{Seg(notificationId)}/read", null, ct);

    /// <summary>Requires platform PR #256.</summary>
    public Task MarkAllNotificationsReadAsync(CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, "/api/v1/notifications/read-all", null, ct);

    /// <summary>Teammates who can be @mentioned in a note. Requires platform PR #256.</summary>
    public Task<List<MentionableMember>> ListMentionableMembersAsync(CancellationToken ct = default) =>
        SendAsync<List<MentionableMember>>(_http, HttpMethod.Get, "/api/v1/team/mentionable", null, ct);

    private sealed record UnreadCount(int Count);
}
