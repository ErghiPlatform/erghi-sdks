import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'config/erghi_config.dart';
import 'resources/resources.dart';
import 'models/models.dart';
import 'exceptions/exceptions.dart';

/// ASP.NET Core SignalR's JSON Hub Protocol terminates every frame with this character.
const String _recordSeparator = '\x1e';

/// Real hub broadcast names (Erghi.Conversation/Api/Hubs/ChatHub.cs /
/// ConversationRealtimeNotifier.cs) this client listens for.
const String _messageReceivedTarget = 'MessageReceived';

/// Main Erghi SDK Client
class ErghiClient {
  final ErghiConfig config;
  late final http.Client _httpClient;
  late final AuthResource auth;
  late final ChatResource chat;

  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSubscription;
  StreamController<Message>? _messageController;
  Timer? _keepaliveTimer;
  bool _isConnected = false;
  final Map<String, Completer<dynamic>> _pendingInvocations = {};
  String? visitorId;

  ErghiClient({required this.config, http.Client? httpClient}) {
    final innerClient = httpClient ?? http.Client();
    final m2mClient = M2MHttpClient(innerClient, config);
    _httpClient = m2mClient;
    auth = AuthResource(config: config, client: _httpClient);
    m2mClient.auth = auth;
    chat = ChatResource(
      config: config,
      client: _httpClient,
      auth: auth,
      getVisitorId: () => visitorId,
    );
  }

  /// Check if the real-time hub is connected
  bool get isConnected => _isConnected;

  /// Connect to the real-time hub for real-time updates.
  ///
  /// Was a raw `web_socket_channel` connection speaking a hand-rolled {type, conversationId}
  /// envelope directly at /hubs/chat -- that never completes the SignalR negotiate/handshake a
  /// real ASP.NET Core SignalR hub requires (a POST to /negotiate for a connection token, then
  /// a JSON handshake record before any invocation frames are accepted), so it could not
  /// actually exchange messages with the real backend. This implements that protocol directly
  /// on top of the same `web_socket_channel` package, since no official/maintained SignalR
  /// client exists for Dart/Flutter. Also fixes a standing bug where the auth headers this
  /// method built were never actually attached to the connection -- auth now travels the way
  /// the real hub actually expects it (an `access_token` query parameter, the same mechanism
  /// browsers use since they can't set custom headers on a WebSocket upgrade either).
  Future<void> connectWebSocket() async {
    if (_isConnected) return;

    try {
      final connectionToken = await _negotiate();
      final accessToken = config.apiKey ?? auth.accessToken ?? '';
      final wsUri = Uri.parse('${config.websocketUrl}/hubs/chat').replace(
        queryParameters: {
          'id': connectionToken,
          'access_token': accessToken,
        },
      );

      _wsChannel = WebSocketChannel.connect(wsUri);
      await _wsChannel!.ready;

      _messageController = StreamController<Message>.broadcast();

      // WebSocketChannel.stream is single-subscription, so the handshake response and every
      // later frame have to flow through the one listener below -- a separate temporary
      // .listen() call just for the handshake (as a first draft of this method did) throws
      // "Stream has already been listened to" the moment the real frame listener attaches.
      final handshakeCompleter = Completer<void>();
      var handshakeDone = false;

      _wsSubscription = _wsChannel!.stream.listen(
        (data) {
          if (!handshakeDone) {
            handshakeDone = true;
            final text = data is List<int> ? utf8.decode(data) : data as String;
            final record = text.split(_recordSeparator).first;
            final response = record.isEmpty ? <String, dynamic>{} : jsonDecode(record) as Map<String, dynamic>;
            if (response['error'] != null) {
              handshakeCompleter.completeError(WebSocketException('Hub handshake failed: ${response['error']}'));
            } else {
              _isConnected = true;
              handshakeCompleter.complete();
            }
            return;
          }
          _handleFrame(data);
        },
        onError: (error) {
          if (config.debug) {
            print('Hub error: $error');
          }
          _isConnected = false;
          if (!handshakeCompleter.isCompleted) handshakeCompleter.completeError(error);
        },
        onDone: () {
          _isConnected = false;
          if (config.debug) {
            print('Hub connection closed');
          }
        },
      );

      _wsChannel!.sink.add(jsonEncode({'protocol': 'json', 'version': 1}) + _recordSeparator);
      await handshakeCompleter.future;

      _keepaliveTimer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (_isConnected) {
          _wsChannel?.sink.add(jsonEncode({'type': 6}) + _recordSeparator);
        }
      });
    } catch (e) {
      throw WebSocketException('Failed to connect to hub: $e');
    }
  }

  /// POST /hubs/chat/negotiate to obtain the connection token the WebSocket URL needs.
  Future<String> _negotiate() async {
    final uri = Uri.parse('${config.apiUrl}/hubs/chat/negotiate')
        .replace(queryParameters: {'negotiateVersion': '1'});
    final headers = <String, String>{};
    if (config.apiKey != null) {
      headers['X-API-Key'] = config.apiKey!;
    } else if (auth.accessToken != null) {
      headers['Authorization'] = 'Bearer ${auth.accessToken}';
    }

    final response = await _httpClient.post(uri, headers: headers);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw WebSocketException('Hub negotiate failed: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (data['url'] != null) {
      // Azure SignalR-style redirect to a different endpoint -- not used by this platform's
      // self-hosted deployment, but fail clearly instead of silently connecting elsewhere.
      throw WebSocketException('Hub negotiate returned a redirect target; not supported');
    }

    final token = data['connectionToken'] ?? data['connectionId'];
    if (token == null) {
      throw WebSocketException('Hub negotiate response had no connection token');
    }
    return token.toString();
  }

  void _handleFrame(dynamic data) {
    final text = data is List<int> ? utf8.decode(data) : data as String;
    for (final record in text.split(_recordSeparator)) {
      if (record.isEmpty) continue;
      try {
        _handleRecord(jsonDecode(record) as Map<String, dynamic>);
      } catch (e) {
        if (config.debug) {
          print('Failed to parse hub message: $e');
        }
      }
    }
  }

  void _handleRecord(Map<String, dynamic> message) {
    final type = message['type'];

    if (type == 1) {
      // Invocation from the server -- a hub broadcast (MessageReceived, UserTyping, ...).
      final target = message['target'];
      final arguments = (message['arguments'] as List?) ?? const [];
      if (target == _messageReceivedTarget && arguments.isNotEmpty) {
        try {
          _messageController?.add(Message.fromJson(arguments[0] as Map<String, dynamic>));
        } catch (e) {
          if (config.debug) {
            print('Failed to parse MessageReceived payload: $e');
          }
        }
      }
    } else if (type == 3) {
      // Completion -- the response to one of our own invoke() calls.
      final invocationId = message['invocationId'];
      final completer = invocationId != null ? _pendingInvocations.remove(invocationId) : null;
      if (completer != null && !completer.isCompleted) {
        if (message['error'] != null) {
          completer.completeError(HubException(message['error'].toString()));
        } else {
          completer.complete(message['result']);
        }
      }
    } else if (type == 7) {
      // Server-initiated close.
      if (config.debug) {
        print('Hub sent close: ${message['error']}');
      }
      _isConnected = false;
    }
    // Type 6 (ping) needs no application-level response beyond our own keepalive timer.
    // Types 2/4/5 (streaming) are not used by ChatHub/VisitorChatHub.
  }

  /// Invoke a real hub method (e.g. "SendTyping", "JoinConversation", "MarkAsRead").
  ///
  /// When [waitForResult] is true (the default), waits for the server's Completion message and
  /// throws [HubException] if the server rejected the call -- notably including
  /// ConversationOwnershipHubFilter denying access to a conversation outside the caller's own
  /// workspace, which the previous transport could never have surfaced since it never spoke to
  /// a real hub at all.
  Future<dynamic> invoke(String method, List<dynamic> arguments, {bool waitForResult = true}) async {
    if (!_isConnected || _wsChannel == null) {
      throw WebSocketException('Hub is not connected');
    }

    final message = <String, dynamic>{'type': 1, 'target': method, 'arguments': arguments};

    Completer<dynamic>? completer;
    String? invocationId;
    if (waitForResult) {
      invocationId = '${DateTime.now().microsecondsSinceEpoch}-$method';
      message['invocationId'] = invocationId;
      completer = Completer<dynamic>();
      _pendingInvocations[invocationId] = completer;
    }

    _wsChannel!.sink.add(jsonEncode(message) + _recordSeparator);

    if (completer != null) {
      try {
        return await completer.future.timeout(config.timeout);
      } finally {
        if (invocationId != null) {
          _pendingInvocations.remove(invocationId);
        }
      }
    }
    return null;
  }

  /// Disconnect from the hub.
  Future<void> disconnectWebSocket() async {
    _keepaliveTimer?.cancel();
    _keepaliveTimer = null;
    await _wsSubscription?.cancel();
    _wsSubscription = null;
    for (final completer in _pendingInvocations.values) {
      if (!completer.isCompleted) completer.completeError(WebSocketException('Hub disconnected'));
    }
    _pendingInvocations.clear();
    await _wsChannel?.sink.close();
    await _messageController?.close();
    _wsChannel = null;
    _messageController = null;
    _isConnected = false;
  }

  /// Stream of real-time messages (MessageReceived broadcasts).
  Stream<Message>? get messageStream => _messageController?.stream;

  /// Send typing indicator. Fire-and-forget, matching this method's previous behavior.
  void sendTyping(String conversationId) {
    if (!_isConnected) return;
    invoke('SendTyping', [conversationId], waitForResult: false).catchError((e) {
      if (config.debug) {
        print('Failed to send typing indicator: $e');
      }
    });
  }

  /// Join a conversation's real-time group -- required before UserTyping/MessageRead events
  /// for that conversation are delivered to this connection. Throws [HubException] if the
  /// conversation isn't in the caller's own workspace.
  Future<void> joinConversation(String conversationId) async {
    if (!_isConnected) return;
    await invoke('JoinConversation', [conversationId]);
  }

  /// Leave a conversation's real-time group.
  Future<void> leaveConversation(String conversationId) async {
    if (!_isConnected) return;
    await invoke('LeaveConversation', [conversationId], waitForResult: false);
  }

  /// Authenticate a visitor using a signed JWT from the customer's backend.
  Future<String> authenticateVisitor(String widgetId, String jwtToken) async {
    try {
      final url = Uri.parse('${config.apiUrl}/api/conversations/identity');
      final response = await _httpClient.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'widgetId': widgetId,
          'jwtToken': jwtToken,
        }),
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body);
        visitorId = data['visitorId']?.toString() ?? data['VisitorId']?.toString();
        if (visitorId != null) {
          return visitorId!;
        }
        throw AuthenticationException('Visitor ID not found in identity response.');
      } else {
        throw AuthenticationException('Failed to authenticate visitor: ${response.body}');
      }
    } catch (e) {
      if (e is AuthenticationException) rethrow;
      throw AuthenticationException('Failed to authenticate visitor: $e');
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
  final ErghiConfig config;
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

    if (config.workspaceId != null) {
      request.headers['X-Workspace-Id'] = config.workspaceId!;
    }

    if (config.accountId != null) {
      request.headers['X-Account-Id'] = config.accountId!;
    }

    return _inner.send(request);
  }
}
