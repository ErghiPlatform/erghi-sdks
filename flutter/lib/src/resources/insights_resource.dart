import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/erghi_config.dart';
import '../exceptions/exceptions.dart';
import '../models/models.dart';
import 'auth_resource.dart';

/// Conversation Insights: topic, sentiment and outcome of finished conversations.
///
/// Needs the `view_insights` workspace permission (Owner and Admin roles), so use a
/// signed-in user's access token. API keys and client-credentials tokens get 403. An
/// invalid filter is a 400 ([ValidationException]) with the code `invalid_filter`.
class InsightsResource {
  final ErghiConfig config;
  final http.Client client;
  final AuthResource auth;

  InsightsResource({required this.config, required this.client, required this.auth});

  // A user's token first: an API key can never hold view_insights.
  Map<String, String> get _headers {
    final headers = <String, String>{};
    if (auth.accessToken != null) {
      headers['Authorization'] = 'Bearer ${auth.accessToken}';
    } else if (config.apiKey != null) {
      headers['X-API-Key'] = config.apiKey!;
    }
    return headers;
  }

  /// Counts by outcome, sentiment, category, topic (top 20) and language, plus the
  /// AI-resolved rate.
  Future<InsightSummary> summary([InsightFilter filter = const InsightFilter()]) async {
    final body = await _get('/api/v1/insights/summary', filter.toQuery());
    return InsightSummary.fromJson(jsonDecode(body) as Map<String, dynamic>);
  }

  /// Classified conversations, newest first. [pageSize] is capped at 100 by the server.
  Future<InsightPage> listConversations({
    InsightFilter filter = const InsightFilter(),
    int? page,
    int? pageSize,
  }) async {
    final body = await _get('/api/v1/insights/conversations', {
      ...filter.toQuery(),
      if (page != null) 'page': '$page',
      if (pageSize != null) 'pageSize': '$pageSize',
    });
    return InsightPage.fromJson(jsonDecode(body) as Map<String, dynamic>);
  }

  /// The same rows as CSV text (newest first, at most 10,000 rows). The server's file starts
  /// with a UTF-8 byte-order mark so Excel reads Arabic correctly; Dart's decoder drops it, so
  /// prepend U+FEFF when saving a file for Excel. Text fields that start with `= + - @` are
  /// prefixed with `'` so a spreadsheet will not run them as formulas.
  Future<String> exportCsv([InsightFilter filter = const InsightFilter()]) =>
      _get('/api/v1/insights/export.csv', filter.toQuery());

  Future<String> _get(String path, Map<String, String> query) async {
    try {
      var uri = Uri.parse('${config.apiUrl}$path');
      if (query.isNotEmpty) uri = uri.replace(queryParameters: query);
      final response = await client.get(uri, headers: _headers).timeout(config.timeout);
      if (response.statusCode == 200) return utf8.decode(response.bodyBytes);

      dynamic error;
      try {
        error = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        error = null;
      }
      final message = (error is Map ? (error['message'] ?? error['error']) : null) as String? ??
          'Insights request failed';
      switch (response.statusCode) {
        case 400:
          throw ValidationException(message, statusCode: 400, details: error);
        case 401:
          throw AuthenticationException(message, statusCode: 401, details: error);
        case 404:
          throw NotFoundException(message, details: error);
        default:
          throw ErghiException(message, statusCode: response.statusCode, details: error);
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }
}
