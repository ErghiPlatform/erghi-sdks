import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/erghi_config.dart';
import '../exceptions/exceptions.dart';
import 'auth_resource.dart';

/// Shared request plumbing for the workspace (admin / server-side) resources. The workspace
/// comes from the API key or access token, never from a parameter.
class WorkspaceHttp {
  final ErghiConfig config;
  final http.Client client;
  final AuthResource auth;

  WorkspaceHttp(
      {required this.config, required this.client, required this.auth});

  Map<String, String> get _headers {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth.accessToken != null) {
      headers['Authorization'] = 'Bearer ${auth.accessToken}';
    } else if (config.apiKey != null) {
      headers['X-API-Key'] = config.apiKey!;
    }
    return headers;
  }

  /// Path segment for an id: escaped so an id can never add path segments.
  static String seg(String id) => Uri.encodeComponent(id);

  /// Sends the request and returns the decoded JSON body (null for an empty body).
  Future<dynamic> send(String method, String path,
      {Map<String, String>? query, Object? body}) async {
    try {
      var uri = Uri.parse('${config.apiUrl}$path');
      if (query != null && query.isNotEmpty) {
        uri = uri.replace(queryParameters: query);
      }
      final request = http.Request(method, uri)..headers.addAll(_headers);
      if (body != null) {
        request.body = jsonEncode(body);
      }
      final response = await http.Response.fromStream(
          await client.send(request).timeout(config.timeout));
      final text = utf8.decode(response.bodyBytes);
      dynamic decoded;
      if (text.isNotEmpty) {
        try {
          decoded = jsonDecode(text);
        } catch (_) {
          decoded = null;
        }
      }
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return decoded;
      }

      final message = (decoded is Map
              ? (decoded['message'] ?? decoded['error'])
              : null) as String? ??
          'Request failed (${response.statusCode})';
      switch (response.statusCode) {
        case 400:
          throw ValidationException(message, statusCode: 400, details: decoded);
        case 401:
          throw AuthenticationException(message,
              statusCode: 401, details: decoded);
        case 404:
          throw NotFoundException(message, statusCode: 404, details: decoded);
        default:
          throw ErghiException(message,
              statusCode: response.statusCode, details: decoded);
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }
}
