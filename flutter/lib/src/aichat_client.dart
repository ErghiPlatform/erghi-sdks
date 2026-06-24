import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'config/aichat_config.dart';
import 'resources/resources.dart';
import 'models/models.dart';
import 'exceptions/exceptions.dart';

/// Main AI Chat SDK Client
class AIChatClient {
  final AIChatConfig config;
  late final http.Client _httpClient;
  late final AuthResource auth;
  late final ChatResource chat;

  WebSocketChannel? _wsChannel;
  StreamController<Message>? _messageController;
  bool _isConnected = false;

  AIChatClient({required this.config}) {
    final innerClient = http.Client();
    final m2mClient = M2MHttpClient(innerClient, config);
    _httpClient = m2mClient;
    auth = AuthResource(config: config, client: _httpClient);
    m2mClient.auth = auth;
    chat = ChatResource(config: config, client: _httpClient, auth: auth);
  }

  /// Check if WebSocket is connected
  bool get isConnected => _isConnected;

  /// Connect to WebSocket for real-time updates
  Future<void> connectWebSocket() async {
    if (_isConnected) return;

    try {
      final wsUrl = '${config.websocketUrl}/hubs/chat';
      final headers = <String, String>{};

      if (config.apiKey != null) {
        headers['X-API-Key'] = config.apiKey!;
      } else if (auth.accessToken != null) {
        headers['Authorization'] = 'Bearer ${auth.accessToken}';
      }

      _wsChannel = WebSocketChannel.connect(
        Uri.parse(wsUrl),
      );

      _messageController = StreamController<Message>.broadcast();
      _isConnected = true;

      _wsChannel!.stream.listen(
        (data) {
          try {
            final json = jsonDecode(data);
            if (json['type'] == 'message') {
              final message = Message.fromJson(json['data']);
              _messageController?.add(message);
            }
          } catch (e) {
            if (config.debug) {
              print('WebSocket message parse error: $e');
            }
          }
        },
        onError: (error) {
          if (config.debug) {
            print('WebSocket error: $error');
          }
          _isConnected = false;
        },
        onDone: () {
          _isConnected = false;
          if (config.debug) {
            print('WebSocket connection closed');
          }
        },
      );
    } catch (e) {
      throw WebSocketException('Failed to connect to WebSocket: $e');
    }
  }

  /// Disconnect WebSocket
  void disconnectWebSocket() {
    _wsChannel?.sink.close();
    _messageController?.close();
    _wsChannel = null;
    _messageController = null;
    _isConnected = false;
  }

  /// Stream of real-time messages
  Stream<Message>? get messageStream => _messageController?.stream;

  /// Send typing indicator
  void sendTyping(String conversationId) {
    if (!_isConnected || _wsChannel == null) return;

    try {
      _wsChannel!.sink.add(jsonEncode({
        'type': 'typing',
        'conversationId': conversationId,
      }));
    } catch (e) {
      if (config.debug) {
        print('Failed to send typing indicator: $e');
      }
    }
  }

  /// Join a conversation room (for WebSocket updates)
  void joinConversation(String conversationId) {
    if (!_isConnected || _wsChannel == null) return;

    try {
      _wsChannel!.sink.add(jsonEncode({
        'type': 'join',
        'conversationId': conversationId,
      }));
    } catch (e) {
      if (config.debug) {
        print('Failed to join conversation: $e');
      }
    }
  }

  /// Leave a conversation room
  void leaveConversation(String conversationId) {
    if (!_isConnected || _wsChannel == null) return;

    try {
      _wsChannel!.sink.add(jsonEncode({
        'type': 'leave',
        'conversationId': conversationId,
      }));
    } catch (e) {
      if (config.debug) {
        print('Failed to leave conversation: $e');
      }
    }
  }

  /// Dispose the client and clean up resources
  void dispose() {
    disconnectWebSocket();
    _httpClient.close();
  }
}

class M2MHttpClient extends http.BaseClient {
  final http.Client _inner;
  final AIChatConfig config;
  AuthResource? auth;

  M2MHttpClient(this._inner, this.config);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request.url.path.endsWith('/api/v1/auth/token')) {
      return _inner.send(request);
    }

    if (config.clientId != null && config.clientSecret != null && auth?.accessToken == null) {
      try {
        await auth?.authenticate();
      } catch (e) {
        // Auto-auth failed
      }
    }
    return _inner.send(request);
  }
}
