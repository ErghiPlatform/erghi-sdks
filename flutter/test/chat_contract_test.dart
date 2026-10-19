import 'dart:convert';

import 'package:erghi_sdk/erghi_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;

void main() {
  late List<http.Request> seen;

  ChatResource make(Object? body) {
    seen = [];
    final client = http_testing.MockClient((request) async {
      seen.add(request);
      return http.Response(jsonEncode(body), 200);
    });
    final config = ErghiConfig(apiUrl: 'https://erghi.test', wsUrl: 'wss://erghi.test', apiKey: 'k');
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
}
