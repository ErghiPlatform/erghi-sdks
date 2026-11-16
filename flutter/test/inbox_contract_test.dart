import 'dart:convert';

import 'package:erghi_sdk/erghi_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;

const _label = {
  'id': 'l-1',
  'name': 'VIP',
  'color': '#ff0000',
  'description': null
};
const _note = {
  'id': 'n-1',
  'conversationId': 'c-1',
  'authorId': 'u-1',
  'authorName': 'Sam',
  'content': 'hi',
  'createdAt': '2026-11-10T10:00:00Z',
  'updatedAt': '2026-11-10T10:00:00Z',
  'canEdit': true,
  'canDelete': true,
};
const _contact = {
  'id': 'k-1',
  'name': 'Ann',
  'email': null,
  'phone': null,
  'externalId': null,
  'locale': 'ar',
  'firstSeenAt': '2026-11-01T10:00:00Z',
  'lastSeenAt': '2026-11-02T10:00:00Z',
  'blocked': false,
  'blockedAt': null,
  'conversations': [
    {
      'id': 'c-1',
      'channel': 'widget',
      'status': 'open',
      'startedAt': '2026-11-01T10:00:00Z',
      'closedAt': null,
      'assignedAgentId': null,
    }
  ],
};

void main() {
  late List<http.Request> seen;

  ({InboxResource inbox, ContactsResource contacts}) make(String body,
      {int status = 200}) {
    seen = [];
    final client = http_testing.MockClient((request) async {
      seen.add(request);
      return http.Response.bytes(utf8.encode(body), status);
    });
    final config = ErghiConfig(
        apiUrl: 'https://erghi.test', wsUrl: 'wss://erghi.test', apiKey: 'k');
    final h = WorkspaceHttp(
        config: config,
        client: client,
        auth: AuthResource(config: config, client: client));
    return (inbox: InboxResource(h), contacts: ContactsResource(h));
  }

  test('labels: list, create, update, delete use the right verbs and paths',
      () async {
    final r = make(jsonEncode({
      'maxLabels': 50,
      'labels': [_label]
    }));
    final list = await r.inbox.listLabels();
    expect(list.maxLabels, 50);
    expect(list.labels.single.name, 'VIP');

    final w = make(jsonEncode(_label));
    await w.inbox.createLabel('VIP', color: '#ff0000');
    expect(seen[0].method, 'POST');
    expect(seen[0].url.path, '/api/v1/conversation-labels');
    expect(jsonDecode(seen[0].body)['name'], 'VIP');
    expect(seen[0].headers['X-API-Key'], 'k');
    await w.inbox.updateLabel('l-1', 'Vip');
    expect(seen[1].method, 'PUT');
    await w.inbox.deleteLabel('l-1');
    expect(seen[2].method, 'DELETE');
    expect(seen[2].url.path, '/api/v1/conversation-labels/l-1');
  });

  test('conversation labels: set, add, remove', () async {
    final r = make(jsonEncode([_label]));
    await r.inbox.setConversationLabels('c-1', ['l-1', 'l-2']);
    expect(seen[0].method, 'PUT');
    expect(jsonDecode(seen[0].body), {
      'labelIds': ['l-1', 'l-2']
    });
    final after = await r.inbox.addConversationLabel('c-1', 'l-1');
    expect(seen[1].url.path, '/api/v1/conversations/c-1/labels/l-1');
    expect(after.single.id, 'l-1');
    await r.inbox.removeConversationLabel('c-1', 'l-1');
    expect(seen[2].method, 'DELETE');
  });

  test('notes send mentions only when given', () async {
    final r = make(jsonEncode(_note));
    final note = await r.inbox.createNote('c-1', 'hi');
    expect(note.authorName, 'Sam');
    expect(jsonDecode(seen[0].body), {'content': 'hi'});
    await r.inbox.createNote('c-1', 'hi @a', mentionedUserIds: ['u-2']);
    expect(jsonDecode(seen[1].body), {
      'content': 'hi @a',
      'mentionedUserIds': ['u-2']
    });
    await r.inbox.updateNote('c-1', 'n-1', 'x');
    expect(seen[2].url.path, '/api/v1/conversations/c-1/notes/n-1');
    await r.inbox.deleteNote('c-1', 'n-1');
    expect(seen[3].method, 'DELETE');
  });

  test('a 403 from an API key writing a note surfaces as ErghiException',
      () async {
    final r = make(
        jsonEncode({'error': 'Notes are written by workspace members.'}),
        status: 403);
    expect(
      () => r.inbox.createNote('c-1', 'hi'),
      throwsA(
          isA<ErghiException>().having((e) => e.statusCode, 'statusCode', 403)),
    );
  });

  test('saved replies: search is sent only when set', () async {
    final body = jsonEncode({
      'maxResponses': 100,
      'responses': [
        {
          'id': 'r-1',
          'shortCode': 'hi',
          'content': 'Hello',
          'updatedAt': '2026-11-10T10:00:00Z'
        }
      ],
    });
    final r = make(body);
    final list = await r.inbox.listCannedResponses();
    expect(list.responses.single.shortCode, 'hi');
    expect(seen[0].url.query, '');
    await r.inbox.listCannedResponses(search: 'hel');
    expect(seen[1].url.queryParameters, {'search': 'hel'});
  });

  test('notifications, unread count and mentionable members', () async {
    final r = make(jsonEncode([
      {
        'id': 'x-1',
        'type': 'mention',
        'conversationId': 'c-1',
        'noteId': 'n-1',
        'actorId': 'u-2',
        'actorName': 'Lee',
        'preview': 'hi',
        'createdAt': '2026-11-10T10:00:00Z',
        'readAt': null,
      }
    ]));
    final items = await r.inbox.listNotifications(unreadOnly: true, limit: 10);
    expect(items.single.actorName, 'Lee');
    expect(items.single.readAt, isNull);
    expect(seen[0].url.queryParameters, {'unreadOnly': 'true', 'limit': '10'});

    final c = make(jsonEncode({'count': 3}));
    expect(await c.inbox.getUnreadNotificationCount(), 3);

    final m = make(jsonEncode([
      {'userId': 'u-2', 'displayName': 'Lee'}
    ]));
    expect((await m.inbox.listMentionableMembers()).single.userId, 'u-2');

    final p = make('', status: 204);
    await p.inbox.markNotificationRead('x-1');
    await p.inbox.markAllNotificationsRead();
    expect(seen[0].url.path, '/api/v1/notifications/x-1/read');
    expect(seen[1].url.path, '/api/v1/notifications/read-all');
  });

  test('unassign posts and returns raw JSON', () async {
    final r = make(jsonEncode({'id': 'c-1', 'assignedAgentId': null}));
    final conv = await r.inbox.unassignConversation('c-1');
    expect(seen[0].method, 'POST');
    expect(seen[0].url.path, '/api/conversations/c-1/unassign');
    expect(conv['assignedAgentId'], isNull);
  });

  test('contacts: list filters, get, update, block, erase', () async {
    final page = jsonEncode({
      'items': [
        {
          'id': 'k-1',
          'name': 'Ann',
          'email': null,
          'phone': null,
          'externalId': 'x',
          'firstSeenAt': '2026-11-01T10:00:00Z',
          'lastSeenAt': '2026-11-02T10:00:00Z',
          'blocked': false,
          'conversationCount': 2,
        }
      ],
      'total': 1,
      'page': 2,
      'pageSize': 25,
    });
    final l = make(page);
    final result =
        await l.contacts.list(search: 'ann', blocked: false, page: 2);
    expect(result.items.single.conversationCount, 2);
    expect(seen[0].url.queryParameters,
        {'search': 'ann', 'blocked': 'false', 'page': '2'});

    final g = make(jsonEncode(_contact));
    final detail = await g.contacts.get('k-1');
    expect(detail.locale, 'ar');
    expect(detail.conversations.single.status, 'open');
    await g.contacts.update('k-1', email: '');
    expect(seen[1].method, 'PATCH');
    expect(jsonDecode(seen[1].body), {'email': ''});
    await g.contacts.block('k-1');
    expect(seen[2].url.path, '/api/v1/contacts/k-1/block');
    await g.contacts.unblock('k-1');
    expect(seen[3].url.path, '/api/v1/contacts/k-1/unblock');

    final e =
        make(jsonEncode({'conversationsDeleted': 2, 'messagesDeleted': 9}));
    final erased = await e.contacts.erase('k-1');
    expect(erased.messagesDeleted, 9);
    expect(seen[0].method, 'DELETE');
  });

  test('contact notes', () async {
    final r = make(
        jsonEncode({..._note, 'contactId': 'k-1', 'conversationId': null}));
    final note = await r.contacts.createNote('k-1', 'vip');
    expect(note.contactId, 'k-1');
    expect(jsonDecode(seen[0].body), {'content': 'vip'});
    await r.contacts.updateNote('k-1', 'n-1', 'x');
    expect(seen[1].url.path, '/api/v1/contacts/k-1/notes/n-1');
    await r.contacts.deleteNote('k-1', 'n-1');
    expect(seen[2].method, 'DELETE');
  });
}
