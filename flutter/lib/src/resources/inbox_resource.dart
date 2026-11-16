import '../models/models.dart';
import 'workspace_http.dart';

/// Inbox working data: conversation labels, private notes, saved replies and the signed-in
/// teammate's notifications.
///
/// Workspace (admin / server-side) operations: the workspace comes from the API key or
/// access token. Reading needs `view_conversations`; creating, editing and deleting labels and
/// saved replies needs `manage_inbox_settings`. Notes are written by workspace members: an API
/// key cannot hold the needed permissions (403 on all of these today) and could not write notes anyway: 403 `member_required` when it writes one. Members marked
/// "requires platform PR #256" need that platform release.
class InboxResource {
  final WorkspaceHttp _http;

  InboxResource(this._http);

  static String _s(String id) => WorkspaceHttp.seg(id);

  List<T> _list<T>(dynamic body, T Function(Map<String, dynamic>) from) =>
      (body as List<dynamic>)
          .map((e) => from(e as Map<String, dynamic>))
          .toList();

  // -- Labels ----------------------------------------------------------------

  /// The workspace's labels and the per-workspace limit.
  Future<ConversationLabelList> listLabels() async =>
      ConversationLabelList.fromJson(await _http.send(
          'GET', '/api/v1/conversation-labels') as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`. 409 `label_name_taken` / `label_limit_reached`.
  Future<ConversationLabel> createLabel(String name,
          {String? color, String? description}) async =>
      ConversationLabel.fromJson(await _http.send(
              'POST', '/api/v1/conversation-labels',
              body: {'name': name, 'color': color, 'description': description})
          as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`.
  Future<ConversationLabel> updateLabel(String labelId, String name,
          {String? color, String? description}) async =>
      ConversationLabel.fromJson(await _http.send(
              'PUT', '/api/v1/conversation-labels/${_s(labelId)}',
              body: {'name': name, 'color': color, 'description': description})
          as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`. Also removes the label from every conversation.
  Future<void> deleteLabel(String labelId) async {
    await _http.send('DELETE', '/api/v1/conversation-labels/${_s(labelId)}');
  }

  /// The labels on one conversation.
  Future<List<ConversationLabel>> getConversationLabels(
          String conversationId) async =>
      _list(
          await _http.send(
              'GET', '/api/v1/conversations/${_s(conversationId)}/labels'),
          ConversationLabel.fromJson);

  /// Replaces the conversation's labels with exactly [labelIds].
  Future<List<ConversationLabel>> setConversationLabels(
          String conversationId, List<String> labelIds) async =>
      _list(
          await _http.send(
              'PUT', '/api/v1/conversations/${_s(conversationId)}/labels',
              body: {'labelIds': labelIds}),
          ConversationLabel.fromJson);

  /// Adds one label (a no-op if already present). Returns the conversation's labels.
  Future<List<ConversationLabel>> addConversationLabel(
          String conversationId, String labelId) async =>
      _list(
          await _http.send('POST',
              '/api/v1/conversations/${_s(conversationId)}/labels/${_s(labelId)}'),
          ConversationLabel.fromJson);

  /// Removes one label (a no-op if absent). Returns the conversation's labels.
  Future<List<ConversationLabel>> removeConversationLabel(
          String conversationId, String labelId) async =>
      _list(
          await _http.send('DELETE',
              '/api/v1/conversations/${_s(conversationId)}/labels/${_s(labelId)}'),
          ConversationLabel.fromJson);

  // -- Conversation notes -----------------------------------------------------

  Future<List<InboxNote>> listNotes(String conversationId) async => _list(
      await _http.send(
          'GET', '/api/v1/conversations/${_s(conversationId)}/notes'),
      InboxNote.fromJson);

  /// Needs a member token (403 `member_required` for API keys). [mentionedUserIds] requires
  /// platform PR #256.
  Future<InboxNote> createNote(String conversationId, String content,
          {List<String>? mentionedUserIds}) async =>
      InboxNote.fromJson(await _http.send(
          'POST', '/api/v1/conversations/${_s(conversationId)}/notes',
          body: {
            'content': content,
            if (mentionedUserIds != null && mentionedUserIds.isNotEmpty)
              'mentionedUserIds': mentionedUserIds,
          }) as Map<String, dynamic>);

  /// Only the author can edit (403 `note_not_author`).
  Future<InboxNote> updateNote(
          String conversationId, String noteId, String content,
          {List<String>? mentionedUserIds}) async =>
      InboxNote.fromJson(await _http.send('PUT',
          '/api/v1/conversations/${_s(conversationId)}/notes/${_s(noteId)}',
          body: {
            'content': content,
            if (mentionedUserIds != null && mentionedUserIds.isNotEmpty)
              'mentionedUserIds': mentionedUserIds,
          }) as Map<String, dynamic>);

  /// The author or someone with `manage_inbox_settings` can delete.
  Future<void> deleteNote(String conversationId, String noteId) async {
    await _http.send('DELETE',
        '/api/v1/conversations/${_s(conversationId)}/notes/${_s(noteId)}');
  }

  // -- Saved replies ----------------------------------------------------------

  /// Saved replies, optionally filtered by short code prefix or content text.
  Future<CannedResponseList> listCannedResponses({String? search}) async =>
      CannedResponseList.fromJson(await _http.send(
          'GET', '/api/v1/canned-responses', query: {
        if (search != null && search.isNotEmpty) 'search': search
      }) as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`. 409 `canned_response_short_code_taken`.
  Future<CannedResponse> createCannedResponse(
          String shortCode, String content) async =>
      CannedResponse.fromJson(await _http.send(
              'POST', '/api/v1/canned-responses',
              body: {'shortCode': shortCode, 'content': content})
          as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`.
  Future<CannedResponse> updateCannedResponse(
          String id, String shortCode, String content) async =>
      CannedResponse.fromJson(await _http.send(
              'PUT', '/api/v1/canned-responses/${_s(id)}',
              body: {'shortCode': shortCode, 'content': content})
          as Map<String, dynamic>);

  /// Needs `manage_inbox_settings`.
  Future<void> deleteCannedResponse(String id) async {
    await _http.send('DELETE', '/api/v1/canned-responses/${_s(id)}');
  }

  // -- Assignment, notifications, mentions (require platform PR #256) ---------

  /// Returns the conversation to the queue and returns the raw conversation JSON. Requires
  /// platform PR #256. 409 for resolved or closed conversations.
  Future<Map<String, dynamic>> unassignConversation(
          String conversationId) async =>
      await _http.send(
              'POST', '/api/conversations/${_s(conversationId)}/unassign')
          as Map<String, dynamic>;

  /// The signed-in teammate's notifications, newest first. Requires platform PR #256.
  /// Notifications belong to a member, so an API key gets an empty list.
  Future<List<UserNotification>> listNotifications(
          {bool unreadOnly = false, int? limit}) async =>
      _list(
          await _http.send('GET', '/api/v1/notifications', query: {
            if (unreadOnly) 'unreadOnly': 'true',
            if (limit != null) 'limit': '$limit',
          }),
          UserNotification.fromJson);

  /// Requires platform PR #256.
  Future<int> getUnreadNotificationCount() async =>
      (await _http.send('GET', '/api/v1/notifications/unread-count')
          as Map<String, dynamic>)['count'] as int;

  /// Requires platform PR #256.
  Future<void> markNotificationRead(String notificationId) async {
    await _http.send(
        'POST', '/api/v1/notifications/${_s(notificationId)}/read');
  }

  /// Requires platform PR #256.
  Future<void> markAllNotificationsRead() async {
    await _http.send('POST', '/api/v1/notifications/read-all');
  }

  /// Teammates who can be @mentioned in a note. Requires platform PR #256.
  Future<List<MentionableMember>> listMentionableMembers() async => _list(
      await _http.send('GET', '/api/v1/team/mentionable'),
      MentionableMember.fromJson);
}
