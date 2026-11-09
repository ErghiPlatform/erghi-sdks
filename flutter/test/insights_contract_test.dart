import 'dart:convert';

import 'package:erghi_sdk/erghi_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;

const _row = {
  'conversationId': '7b1c0d2e-0000-4000-8000-000000000001',
  'topic': 'refund',
  'category': 'billing',
  'sentiment': 'Negative',
  'sentimentEnd': 'Neutral',
  'outcome': 'ResolvedByAgent',
  'language': 'ar-EG',
  'summary': 'Asked for a refund.',
  'confidence': 0.9,
  'classifiedAt': '2026-11-09T10:00:00Z',
  'stale': false,
};

void main() {
  late List<http.Request> seen;

  InsightsResource make(String body, {int status = 200}) {
    seen = [];
    final client = http_testing.MockClient((request) async {
      seen.add(request);
      return http.Response.bytes(utf8.encode(body), status);
    });
    final config = ErghiConfig(apiUrl: 'https://erghi.test', wsUrl: 'wss://erghi.test', apiKey: 'k');
    return InsightsResource(
      config: config,
      client: client,
      auth: AuthResource(config: config, client: client),
    );
  }

  test('summary sends only the filters that are set and maps the body', () async {
    final insights = make(jsonEncode({
      'total': 4,
      'aiResolvedRate': 0.5,
      'outcomes': [
        {'key': 'ResolvedByAi', 'count': 2}
      ],
      'sentiments': [],
      'categories': [],
      'topics': [
        {'key': 'refund', 'count': 3}
      ],
      'languages': [
        {'key': 'ar', 'count': 4}
      ],
    }));
    final result = await insights.summary(InsightFilter(
      from: DateTime.utc(2026, 11, 1),
      outcome: 'resolved_by_ai',
      minConfidence: 0.5,
      topic: '',
    ));
    expect(seen.single.method, 'GET');
    expect(seen.single.url.path, '/api/v1/insights/summary');
    expect(seen.single.url.queryParameters, {
      'from': '2026-11-01T00:00:00.000Z',
      'outcome': 'resolved_by_ai',
      'minConfidence': '0.5',
    });
    expect(result.total, 4);
    expect(result.aiResolvedRate, 0.5);
    expect(result.topics.single.key, 'refund');
  });

  test('listConversations pages and parses rows', () async {
    final insights = make(jsonEncode({'total': 1, 'page': 2, 'pageSize': 50, 'items': [_row]}));
    final page = await insights.listConversations(
      filter: const InsightFilter(channel: 'widget', sentiment: 'negative'),
      page: 2,
      pageSize: 50,
    );
    expect(seen.single.url.path, '/api/v1/insights/conversations');
    expect(seen.single.url.queryParameters,
        {'channel': 'widget', 'sentiment': 'negative', 'page': '2', 'pageSize': '50'});
    expect(page.pageSize, 50);
    expect(page.items.single.language, 'ar-EG');
    expect(page.items.single.sentimentEnd, 'Neutral');
    expect(page.items.single.classifiedAt.year, 2026);
  });

  test('exportCsv returns the body text', () async {
    final insights = make('conversation_id,classified_at\r\n');
    expect(await insights.exportCsv(InsightFilter(to: DateTime.utc(2026, 12, 1))),
        'conversation_id,classified_at\r\n');
    expect(seen.single.url.path, '/api/v1/insights/export.csv');
    expect(seen.single.url.queryParameters, {'to': '2026-12-01T00:00:00.000Z'});
  });

  test('an invalid filter becomes a ValidationException with the server message', () async {
    final insights = make(
      jsonEncode({'error': 'sentiment must be positive, neutral or negative.', 'code': 'invalid_filter'}),
      status: 400,
    );
    expect(
      insights.summary(const InsightFilter(sentiment: 'angry')),
      throwsA(isA<ValidationException>().having((e) => e.message, 'message', contains('sentiment must be'))),
    );
  });
}
