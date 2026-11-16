import '../models/models.dart';
import 'workspace_http.dart';

/// Contacts: the people who have chatted with the workspace. Requires platform PR #256.
///
/// Workspace (admin / server-side) operations: the workspace comes from the API key or
/// access token. Reading needs `view_conversations`; update, block, unblock and erase need
/// `manage_contacts`. An API key can read contact notes but cannot author them.
class ContactsResource {
  final WorkspaceHttp _http;

  ContactsResource(this._http);

  static String _s(String id) => WorkspaceHttp.seg(id);

  /// [search] matches name, email, phone or external id. [pageSize] is capped at 100.
  Future<ContactPage> list(
          {String? search, bool? blocked, int? page, int? pageSize}) async =>
      ContactPage.fromJson(await _http.send('GET', '/api/v1/contacts', query: {
        if (search != null && search.isNotEmpty) 'search': search,
        if (blocked != null) 'blocked': blocked ? 'true' : 'false',
        if (page != null) 'page': '$page',
        if (pageSize != null) 'pageSize': '$pageSize',
      }) as Map<String, dynamic>);

  Future<ContactDetail> get(String contactId) async => ContactDetail.fromJson(
      await _http.send('GET', '/api/v1/contacts/${_s(contactId)}')
          as Map<String, dynamic>);

  /// Needs `manage_contacts`. Omitted fields are unchanged; an empty string clears one.
  Future<ContactDetail> update(String contactId,
          {String? name, String? email, String? phone}) async =>
      ContactDetail.fromJson(
          await _http.send('PATCH', '/api/v1/contacts/${_s(contactId)}', body: {
        if (name != null) 'name': name,
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
      }) as Map<String, dynamic>);

  /// Needs `manage_contacts`.
  Future<void> block(String contactId) async {
    await _http.send('POST', '/api/v1/contacts/${_s(contactId)}/block');
  }

  /// Needs `manage_contacts`.
  Future<void> unblock(String contactId) async {
    await _http.send('POST', '/api/v1/contacts/${_s(contactId)}/unblock');
  }

  /// Needs `manage_contacts`. IRREVERSIBLY deletes the contact and all of their conversations
  /// and messages (GDPR erasure); the server records it in the security audit log.
  Future<ContactEraseResult> erase(String contactId) async =>
      ContactEraseResult.fromJson(
          await _http.send('DELETE', '/api/v1/contacts/${_s(contactId)}')
              as Map<String, dynamic>);

  Future<List<InboxNote>> listNotes(String contactId) async =>
      ((await _http.send('GET', '/api/v1/contacts/${_s(contactId)}/notes'))
              as List<dynamic>)
          .map((e) => InboxNote.fromJson(e as Map<String, dynamic>))
          .toList();

  /// Needs a member token (403 `member_required` for API keys).
  Future<InboxNote> createNote(String contactId, String content) async =>
      InboxNote.fromJson(await _http.send(
          'POST', '/api/v1/contacts/${_s(contactId)}/notes',
          body: {'content': content}) as Map<String, dynamic>);

  /// Only the author can edit (403 `note_not_author`).
  Future<InboxNote> updateNote(
          String contactId, String noteId, String content) async =>
      InboxNote.fromJson(await _http.send(
          'PUT', '/api/v1/contacts/${_s(contactId)}/notes/${_s(noteId)}',
          body: {'content': content}) as Map<String, dynamic>);

  /// The author or someone with `manage_contacts` can delete.
  Future<void> deleteNote(String contactId, String noteId) async {
    await _http.send(
        'DELETE', '/api/v1/contacts/${_s(contactId)}/notes/${_s(noteId)}');
  }
}
