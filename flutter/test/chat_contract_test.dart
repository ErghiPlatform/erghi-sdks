import 'dart:convert';

import 'package:erghi_sdk/erghi_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;

void main() {
  late List<http.Request> seen;

  ChatResource make(Object? body, {String? clientId, String? clientSecret}) {
    seen = [];
    final client = http_testing.MockClient((request) async {
      seen.add(request);
      return http.Response(jsonEncode(body), 200);
    });
    final config = ErghiConfig(
      apiUrl: 'https://erghi.test',
      wsUrl: 'wss://erghi.test',
      apiKey: 'k',
      clientId: clientId,
      clientSecret: clientSecret,
    );
    return ChatResource(
      config: config,
      client: client,
      auth: AuthResource(config: config, client: client),
    );
  }

  test('listConversations reads the paginated envelope', () async {
    final chat = make({'data': <Object>[], 'total': 0, 'page': 2, 'limit': 10, 'totalPages': 0});
    final page = await chat.listConversations(page: 2, limit: 10, status: 'active');
    expect(seen.single.method, 'GET');
    expect(seen.single.url.path, '/api/conversations');
    expect(seen.single.url.queryParameters, {'page': '2', 'limit': '10', 'status': 'active'});
    expect(page.page, 2);
  });

  test('closeConversation and markAsRead POST to the server routes', () async {
    final chat = make(<String, Object>{});
    await chat.closeConversation('c-1');
    await chat.markAsRead('c-1');
    expect(seen.map((r) => '${r.method} ${r.url.path}'), [
      'POST /api/conversations/c-1/close',
      'POST /api/conversations/c-1/read',
    ]);
  });

  const conversation = {
    'id': 'c-1',
    'workspaceId': 'w-1',
    'widgetId': 'wd-1',
    'visitorId': null,
    'assignedAgentId': 'u-1',
    'status': 'Queued',
    'channel': 'telegram',
    'startedAt': '2026-11-18T10:00:00Z',
    'closedAt': null,
    'metadata': null,
  };

  test('an API key uses the key-scoped conversation endpoints', () async {
    final chat = make(conversation, clientId: 'cid', clientSecret: 's');
    await chat.getConversation('c-1');
    await chat.closeConversation('c-1');
    expect(seen.map((r) => '${r.method} ${r.url.path}'), [
      'GET /api/v1/agent/conversations/c-1',
      'POST /api/v1/agent/conversations/c-1/close',
    ]);
  });

  test('a conversation as the API sends it parses, PascalCase status included', () async {
    final chat = make(conversation);
    final c = await chat.getConversation('c-1');
    expect(c.status, ConversationStatus.queued);
    expect(c.assignedTo, 'u-1');
    expect(c.createdAt, DateTime.parse('2026-11-18T10:00:00Z'));
  });

  test('a message as the API sends it parses (sender, PascalCase type, null senderId)', () {
    final m = Message.fromJson({
      'id': 'm-1',
      'conversationId': 'c-1',
      'sender': 'bot',
      'senderId': null,
      'type': 'Text',
      'content': 'hi',
      'createdAt': '2026-11-18T10:00:00Z',
      'readAt': '2026-11-18T10:01:00Z',
    });
    expect(m.senderType, MessageSender.bot);
    expect(m.type, MessageType.text);
    expect(m.isRead, isTrue);
  });
}
