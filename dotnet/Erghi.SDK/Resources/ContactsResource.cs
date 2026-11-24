using System.Globalization;
using Erghi.SDK.Models;
using static Erghi.SDK.Resources.ApiCall;

namespace Erghi.SDK.Resources;

/// <summary>
/// Contacts: the people who have chatted with the workspace. Requires platform PR #256.
/// Workspace (admin / server-side) operations: the workspace comes from the API key or access
/// token. Reading needs <c>view_conversations</c>; update, block, unblock and erase need
/// <c>manage_contacts</c>. An API key can read contact notes but cannot author them. Merging needs
/// a signed-in teammate's token with <c>manage_contacts</c> who can see every conversation (a teammate limited to
/// some inboxes gets 403 <c>contact_out_of_scope</c>). API keys get 403: <c>manage_contacts</c> is never grantable to a key.
/// </summary>
public sealed class ContactsResource
{
    private readonly HttpClient _http;

    internal ContactsResource(HttpClient http)
    {
        _http = http;
    }

    /// <summary>Search matches name, email, phone or external id. <paramref name="pageSize"/> is capped at 100 by the server.</summary>
    public Task<ContactPage> ListAsync(
        string? search = null, bool? blocked = null, int? page = null, int? pageSize = null, CancellationToken ct = default)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(search)) parts.Add("search=" + Uri.EscapeDataString(search));
        if (blocked is { } b) parts.Add("blocked=" + (b ? "true" : "false"));
        if (page is { } p) parts.Add("page=" + p.ToString(CultureInfo.InvariantCulture));
        if (pageSize is { } s) parts.Add("pageSize=" + s.ToString(CultureInfo.InvariantCulture));
        var query = parts.Count == 0 ? "" : "?" + string.Join('&', parts);
        return SendAsync<ContactPage>(_http, HttpMethod.Get, "/api/v1/contacts" + query, null, ct);
    }

    public Task<ContactDetail> GetAsync(string contactId, CancellationToken ct = default) =>
        SendAsync<ContactDetail>(_http, HttpMethod.Get, $"/api/v1/contacts/{Seg(contactId)}", null, ct);

    /// <summary>Needs <c>manage_contacts</c>. Null fields are unchanged; an empty string clears one.</summary>
    public Task<ContactDetail> UpdateAsync(string contactId, UpdateContactRequest request, CancellationToken ct = default) =>
        SendAsync<ContactDetail>(_http, HttpMethod.Patch, $"/api/v1/contacts/{Seg(contactId)}", request, ct);

    /// <summary>Needs <c>manage_contacts</c>.</summary>
    public Task BlockAsync(string contactId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, $"/api/v1/contacts/{Seg(contactId)}/block", null, ct);

    /// <summary>Needs <c>manage_contacts</c>.</summary>
    public Task UnblockAsync(string contactId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, $"/api/v1/contacts/{Seg(contactId)}/unblock", null, ct);

    /// <summary>
    /// Needs <c>manage_contacts</c>. IRREVERSIBLY deletes the contact and all of their conversations
    /// and messages (GDPR erasure); the server records it in the security audit log.
    /// </summary>
    public Task<ContactEraseResult> EraseAsync(string contactId, CancellationToken ct = default) =>
        SendAsync<ContactEraseResult>(_http, HttpMethod.Delete, $"/api/v1/contacts/{Seg(contactId)}", null, ct);

    public Task<List<ContactNote>> ListNotesAsync(string contactId, CancellationToken ct = default) =>
        SendAsync<List<ContactNote>>(_http, HttpMethod.Get, $"/api/v1/contacts/{Seg(contactId)}/notes", null, ct);

    /// <summary>Needs a member token (403 <c>member_required</c> for API keys).</summary>
    public Task<ContactNote> CreateNoteAsync(string contactId, string content, CancellationToken ct = default) =>
        SendAsync<ContactNote>(_http, HttpMethod.Post, $"/api/v1/contacts/{Seg(contactId)}/notes", new { content }, ct);

    /// <summary>Only the author can edit (403 <c>note_not_author</c>).</summary>
    public Task<ContactNote> UpdateNoteAsync(string contactId, string noteId, string content, CancellationToken ct = default) =>
        SendAsync<ContactNote>(_http, HttpMethod.Put, $"/api/v1/contacts/{Seg(contactId)}/notes/{Seg(noteId)}", new { content }, ct);

    /// <summary>The author or someone with <c>manage_contacts</c> can delete.</summary>
    public Task DeleteNoteAsync(string contactId, string noteId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Delete, $"/api/v1/contacts/{Seg(contactId)}/notes/{Seg(noteId)}", null, ct);

    /// <summary>
    /// Pairs of contacts that share a verified email or phone number (at most 100). Pairs that would put two
    /// identities on one channel, and dismissed pairs, are left out.
    /// </summary>
    public Task<List<ContactMergeSuggestion>> ListMergeSuggestionsAsync(CancellationToken ct = default) =>
        SendAsync<List<ContactMergeSuggestion>>(_http, HttpMethod.Get, "/api/v1/contacts/merge-suggestions", null, ct);

    /// <summary>
    /// IRREVERSIBLY merges <paramref name="sourceContactId"/> into <paramref name="targetContactId"/>: the source's
    /// conversations, notes and channel identities move to the target, the target keeps its own name, email and
    /// phone (filling only blanks from the source), and the source contact is deleted. 400 <c>merge_same_contact</c>;
    /// 409 <c>merge_conflicting_identities</c> when both have an identity on the same channel. Sends the
    /// <c>contact.merged</c> webhook and writes the security audit log.
    /// </summary>
    public Task<ContactMergeResult> MergeAsync(string targetContactId, string sourceContactId, CancellationToken ct = default) =>
        SendAsync<ContactMergeResult>(_http, HttpMethod.Post, $"/api/v1/contacts/{Seg(targetContactId)}/merge",
            new { sourceContactId }, ct);

    /// <summary>Stops suggesting this pair. Order does not matter, and repeating it is harmless.</summary>
    public Task DismissMergeSuggestionAsync(string contactAId, string contactBId, CancellationToken ct = default) =>
        SendAsync(_http, HttpMethod.Post, "/api/v1/contacts/merge-dismissals", new { contactAId, contactBId }, ct);
}
