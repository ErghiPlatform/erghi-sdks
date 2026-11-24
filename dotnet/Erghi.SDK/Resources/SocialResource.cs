using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// The Facebook and Instagram social inbox: connected accounts and their settings, comment
/// moderation, DM reply windows and the social report. Workspace (admin / server-side) operations; the
/// workspace comes from the credential. The social inbox ships dark: a workspace without it gets 403
/// <c>social_inbox_unavailable</c>.
/// <list type="bullet">
/// <item>Connections and settings need <c>configure_ai</c>.</item>
/// <item>Reading posts and comments needs <c>view_conversations</c> or an API key with <c>moderate_social</c>.</item>
/// <item>Hide, reply, private reply, done and ignore need <c>moderate_social</c>.</item>
/// <item>The report needs <c>view_insights</c>.</item>
/// </list>
/// Connecting an account is a browser-only Meta login and is not wrapped: connect in the admin portal.
/// The server's error code (<c>private_reply_used</c>, <c>private_reply_expired</c>, <c>needs_reauth</c>,
/// <c>connection_unavailable</c>, <c>use_comment_reply</c>...) is in <see cref="Errors.ErghiException.ServerCode"/>.
/// Replying to a comment conversation through the ordinary conversation send call is refused with 409
/// <c>use_comment_reply</c>; use <see cref="ReplyToCommentAsync"/> or <see cref="PrivateReplyToCommentAsync"/>.
/// </summary>
public sealed class SocialResource
{
    private readonly HttpClient _http;

    internal SocialResource(HttpClient http)
    {
        _http = http;
    }

    // ── Connections (configure_ai) ───────────────────────────────────────────

    /// <summary>Active Facebook Pages and Instagram accounts of the workspace.</summary>
    public Task<List<SocialConnection>> ListConnectionsAsync(CancellationToken ct = default) =>
        SendAsync<List<SocialConnection>>(_http, HttpMethod.Get, "/api/v1/channels/meta/connections", null, ct);

    /// <summary>
    /// The same accounts as <see cref="ListConnectionsAsync"/>, with only id, channel, name and status, for callers
    /// without <c>configure_ai</c>: needs <c>view_conversations</c> or an API key with <c>moderate_social</c>. Use it
    /// to fill a connection filter for <see cref="ListPostsAsync"/> / comments.
    /// </summary>
    public Task<List<SocialInboxConnection>> ListInboxConnectionsAsync(CancellationToken ct = default) =>
        SendAsync<List<SocialInboxConnection>>(_http, HttpMethod.Get, "/api/v1/social/connections", null, ct);

    public Task<SocialConnectionSettings> GetConnectionSettingsAsync(string connectionId, CancellationToken ct = default) =>
        SendAsync<SocialConnectionSettings>(_http, HttpMethod.Get,
            $"/api/v1/channels/meta/connections/{Seg(connectionId)}/settings", null, ct);

    /// <summary>A partial update: only the non-null properties of <paramref name="request"/> are sent.</summary>
    public Task<SocialConnectionSettings> UpdateConnectionSettingsAsync(
        string connectionId, UpdateSocialConnectionSettingsRequest request, CancellationToken ct = default) =>
        SendAsync<SocialConnectionSettings>(_http, HttpMethod.Put,
            $"/api/v1/channels/meta/connections/{Seg(connectionId)}/settings", request, ct);

    /// <summary>What disconnecting would affect. Call it before <see cref="DisconnectConnectionAsync"/>.</summary>
    public Task<SocialDisconnectPreview> GetDisconnectPreviewAsync(string connectionId, CancellationToken ct = default) =>
        SendAsync<SocialDisconnectPreview>(_http, HttpMethod.Get,
            $"/api/v1/channels/meta/connections/{Seg(connectionId)}/disconnect-preview", null, ct);

    /// <summary>Disconnects the account and deletes its stored access token. Reconnecting needs the browser Meta login.</summary>
    public Task DisconnectConnectionAsync(string connectionId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"/api/v1/channels/meta/connections/{Seg(connectionId)}", null, ct);

    // ── Direct messages ──────────────────────────────────────────────────────

    /// <summary>The DM reply window of a Messenger or Instagram conversation (needs <c>view_conversations</c>, a member token).</summary>
    public Task<SocialReplyPolicy> GetReplyPolicyAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<SocialReplyPolicy>(_http, HttpMethod.Get,
            $"/api/v1/channels/meta/conversations/{Seg(conversationId)}/reply-policy", null, ct);

    /// <summary>Delivery state of the outbound messages of a Messenger or Instagram conversation (member token).</summary>
    public Task<List<SocialMessageDelivery>> ListDeliveriesAsync(string conversationId, CancellationToken ct = default) =>
        SendAsync<List<SocialMessageDelivery>>(_http, HttpMethod.Get,
            $"/api/v1/channels/meta/conversations/{Seg(conversationId)}/deliveries", null, ct);

    // ── Posts and comments ───────────────────────────────────────────────────

    /// <summary>Posts that have comments you may see, newest comment first. <paramref name="pageSize"/> is capped at 100.</summary>
    public Task<SocialPage<SocialPost>> ListPostsAsync(
        string? connectionId = null, int? page = null, int? pageSize = null, CancellationToken ct = default) =>
        SendAsync<SocialPage<SocialPost>>(_http, HttpMethod.Get,
            "/api/v1/social/posts" + Query(("connectionId", connectionId), ("page", page), ("pageSize", pageSize)), null, ct);

    /// <summary>
    /// Comments, newest first. <paramref name="category"/> is <c>question</c>, <c>complaint</c>, <c>praise</c>,
    /// <c>spam</c>, <c>scam_impersonation</c>, <c>abuse</c> or <c>other</c> (400 <c>invalid_category</c> otherwise).
    /// </summary>
    public Task<SocialPage<SocialComment>> ListCommentsAsync(
        string? connectionId = null, string? postId = null, string? category = null, bool? hidden = null,
        bool? needsAttention = null, bool? unanswered = null, int? page = null, int? pageSize = null,
        CancellationToken ct = default) =>
        SendAsync<SocialPage<SocialComment>>(_http, HttpMethod.Get,
            "/api/v1/social/comments" + Query(("connectionId", connectionId), ("postId", postId), ("category", category),
                ("hidden", hidden), ("needsAttention", needsAttention), ("unanswered", unanswered),
                ("page", page), ("pageSize", pageSize)), null, ct);

    /// <summary>Needs <c>moderate_social</c>. Hides the comment on Meta (reversible; it is never deleted).</summary>
    public Task<SocialComment> HideCommentAsync(string commentId, CancellationToken ct = default) =>
        SendAsync<SocialComment>(_http, HttpMethod.Post, $"/api/v1/social/comments/{Seg(commentId)}/hide", null, ct);

    /// <summary>Needs <c>moderate_social</c>.</summary>
    public Task<SocialComment> UnhideCommentAsync(string commentId, CancellationToken ct = default) =>
        SendAsync<SocialComment>(_http, HttpMethod.Post, $"/api/v1/social/comments/{Seg(commentId)}/unhide", null, ct);

    /// <summary>Needs <c>moderate_social</c>. Posts a public reply. 409 <c>cannot_reply</c> / <c>needs_reauth</c> / <c>connection_unavailable</c>.</summary>
    public Task<SocialComment> ReplyToCommentAsync(string commentId, string text, CancellationToken ct = default) =>
        SendAsync<SocialComment>(_http, HttpMethod.Post, $"/api/v1/social/comments/{Seg(commentId)}/reply", new { text }, ct);

    /// <summary>
    /// Needs <c>moderate_social</c>. Sends the commenter a DM and opens the DM conversation. Meta allows one per
    /// comment within 7 days: 409 <c>private_reply_used</c> / <c>private_reply_expired</c>.
    /// </summary>
    public Task<SocialPrivateReplyResult> PrivateReplyToCommentAsync(string commentId, string text, CancellationToken ct = default) =>
        SendAsync<SocialPrivateReplyResult>(_http, HttpMethod.Post,
            $"/api/v1/social/comments/{Seg(commentId)}/private-reply", new { text }, ct);

    /// <summary>Needs <c>moderate_social</c>. Marks the comment handled (closes its conversation when nothing else is open).</summary>
    public Task<SocialComment> MarkCommentDoneAsync(string commentId, CancellationToken ct = default) =>
        SendAsync<SocialComment>(_http, HttpMethod.Post, $"/api/v1/social/comments/{Seg(commentId)}/done", null, ct);

    /// <summary>Needs <c>moderate_social</c>. Blocks the commenter inside Erghi only; Meta's block API is never called.</summary>
    public Task<SocialIgnoreResult> IgnoreCommentContactAsync(string commentId, CancellationToken ct = default) =>
        SendAsync<SocialIgnoreResult>(_http, HttpMethod.Post, $"/api/v1/social/comments/{Seg(commentId)}/ignore-contact", null, ct);

    // ── Report (view_insights) ───────────────────────────────────────────────

    /// <summary>Comment volume, moderation, response times and DM volume. The default range is 30 days.</summary>
    public Task<SocialReport> GetReportAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, CancellationToken ct = default) =>
        SendAsync<SocialReport>(_http, HttpMethod.Get,
            "/api/v1/reports/social" + Query(("from", from), ("to", to), ("timeZone", timeZone)), null, ct);

    /// <summary>The report as CSV text. .NET strips the server's byte-order mark when decoding; write the file with <c>new UTF8Encoding(true)</c>.</summary>
    public Task<string> ExportReportCsvAsync(
        DateTimeOffset? from = null, DateTimeOffset? to = null, string? timeZone = null, CancellationToken ct = default) =>
        GetTextAsync(_http, "/api/v1/reports/social/export.csv" + Query(("from", from), ("to", to), ("timeZone", timeZone)), ct);
}
