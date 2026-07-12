import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/erghi_config.dart';
import '../exceptions/exceptions.dart';
import '../models/models.dart';
import 'auth_resource.dart';

class ChatResource {
  final ErghiConfig config;
  final http.Client client;
  final AuthResource auth;
  final String? Function()? getVisitorId;

  ChatResource({
    required this.config,
    required this.client,
    required this.auth,
    this.getVisitorId,
  });

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey != null) {
      headers['X-API-Key'] = config.apiKey!;
    } else if (auth.accessToken != null) {
      headers['Authorization'] = 'Bearer ${auth.accessToken}';
    }

    return headers;
  }

  /// Get conversation by ID
  Future<Conversation> getConversation(String conversationId) async {
    try {
      final response = await client
          .get(
            Uri.parse('${config.apiUrl}/api/conversations/$conversationId'),
            headers: _headers,
          )
          .timeout(config.timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Conversation.fromJson(data);
      } else if (response.statusCode == 404) {
        throw NotFoundException('Conversation not found');
      } else {
        final error = jsonDecode(response.body);
        throw ErghiException(
          error['message'] ?? 'Failed to get conversation',
          statusCode: response.statusCode,
          details: error,
        );
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }

  /// Create a new conversation
  Future<Conversation> createConversation({
    required String widgetId,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final payload = <String, dynamic>{
        'widgetId': widgetId,
        'metadata': metadata,
      };
      
      final vId = getVisitorId?.call();
      if (vId != null) {
        payload['visitorId'] = vId;
      }

      final response = await client
          .post(
            Uri.parse('${config.apiUrl}/api/conversations'),
            headers: _headers,
            body: jsonEncode(payload),
          )
          .timeout(config.timeout);

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return Conversation.fromJson(data);
      } else {
        final error = jsonDecode(response.body);
        throw ErghiException(
          error['message'] ?? 'Failed to create conversation',
          statusCode: response.statusCode,
          details: error,
        );
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }

  /// Get messages for a conversation
  Future<PaginatedResponse<Message>> getMessages(
    String conversationId, {
    int page = 1,
    int limit = 50,
  }) async {
    try {
      final uri = Uri.parse(
        '${config.apiUrl}/api/conversations/$conversationId/messages',
      ).replace(queryParameters: {
        'page': page.toString(),
        'limit': limit.toString(),
      });

      final response = await client
          .get(uri, headers: _headers)
          .timeout(config.timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return PaginatedResponse.fromJson(
          data,
          (json) => Message.fromJson(json as Map<String, dynamic>),
        );
      } else {
        final error = jsonDecode(response.body);
        throw ErghiException(
          error['message'] ?? 'Failed to get messages',
          statusCode: response.statusCode,
          details: error,
        );
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }

  /// Send a message
  Future<Message> sendMessage(
    String conversationId,
    SendMessageRequest request,
  ) async {
    try {
      final response = await client
          .post(
            Uri.parse(
              '${config.apiUrl}/api/conversations/$conversationId/messages',
            ),
            headers: _headers,
            body: jsonEncode(request.toJson()),
          )
          .timeout(config.timeout);

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return Message.fromJson(data);
      } else {
        final error = jsonDecode(response.body);
        throw ErghiException(
          error['message'] ?? 'Failed to send message',
          statusCode: response.statusCode,
          details: error,
        );
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }

  /// Mark messages as read
  Future<void> markAsRead(String conversationId) async {
    try {
      await client
          .put(
            Uri.parse(
              '${config.apiUrl}/api/conversations/$conversationId/read',
            ),
            headers: _headers,
          )
          .timeout(config.timeout);
    } catch (e) {
      if (config.debug) {
        print('Failed to mark as read: $e');
      }
    }
  }
}
