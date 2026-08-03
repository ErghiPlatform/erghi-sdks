// Drives ErghiClient.connectWebSocket()/invoke()/sendTyping() against a small local server
// that speaks the actual SignalR wire protocol (negotiate response + JSON handshake +
// record-separator framing), not a mock of the client's own internals -- this is what proves
// the client can complete a real negotiate/handshake and correctly frame/parse hub
// invocations, which the previous raw-WebSocket transport never could against a real
// ASP.NET Core SignalR hub.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:erghi_sdk/erghi_sdk.dart';

const _recordSeparator = '\x1e';

class MockHub {
  late HttpServer _server;
  WebSocket? _socket;
  final List<Map<String, dynamic>> receivedRecords = [];
  final _connected = Completer<void>.sync();

  Future<int> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      if (request.uri.path == '/hubs/chat/negotiate') {
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'connectionToken': 'test-connection-token',
          'negotiateVersion': 1,
        }));
        await request.response.close();
        return;
      }

      if (WebSocketTransformer.isUpgradeRequest(request)) {
        final socket = await WebSocketTransformer.upgrade(request);
        _socket = socket;
        socket.listen((data) {
          final text = data as String;
          for (final record in text.split(_recordSeparator)) {
            if (record.isEmpty) continue;
            final decoded = jsonDecode(record) as Map<String, dynamic>;
            if (!_connected.isCompleted) {
              // First frame in is the handshake request.
              socket.add(jsonEncode({}) + _recordSeparator);
              _connected.complete();
            } else {
              receivedRecords.add(decoded);
            }
          }
        });
      }
    });
    return _server.port;
  }

  Future<void> waitConnected() => _connected.future;

  void sendInvocation(String target, List<dynamic> arguments) {
    _socket?.add(jsonEncode({'type': 1, 'target': target, 'arguments': arguments}) + _recordSeparator);
  }

  void sendCompletion(String invocationId, {String? error, dynamic result}) {
    final message = <String, dynamic>{'type': 3, 'invocationId': invocationId};
    if (error != null) {
      message['error'] = error;
    } else {
      message['result'] = result;
    }
    _socket?.add(jsonEncode(message) + _recordSeparator);
  }

  Future<void> stop() async {
    await _socket?.close();
    await _server.close(force: true);
  }
}

void main() {
  late MockHub hub;
  late int port;
  late ErghiClient client;

  setUp(() async {
    hub = MockHub();
    port = await hub.start();
    client = ErghiClient(
      config: ErghiConfig(
        apiUrl: 'http://127.0.0.1:$port',
        wsUrl: 'ws://127.0.0.1:$port',
        debug: false,
      ),
    );
  });

  tearDown(() async {
    await client.disconnectWebSocket();
    await hub.stop();
  });

  test('connectWebSocket completes a real SignalR negotiate + handshake', () async {
    await client.connectWebSocket();
    await hub.waitConnected();

    expect(client.isConnected, isTrue);
  });

  test('server MessageReceived invocation is delivered on messageStream', () async {
    await client.connectWebSocket();
    await hub.waitConnected();

    final messages = <Message>[];
    final sub = client.messageStream!.listen(messages.add);

    hub.sendInvocation('MessageReceived', [
      {
        'id': 'msg-1',
        'conversationId': 'conv-1',
        'senderId': 'agent-1',
        'senderType': 'user',
        'content': 'hello',
        'type': 'text',
        'createdAt': DateTime.now().toIso8601String(),
      }
    ]);

    await Future.delayed(const Duration(milliseconds: 100));

    expect(messages, hasLength(1));
    expect(messages.first.content, 'hello');
    await sub.cancel();
  });

  test('sendTyping sends a real SendTyping invocation frame', () async {
    await client.connectWebSocket();
    await hub.waitConnected();

    client.sendTyping('conv-1');
    await Future.delayed(const Duration(milliseconds: 100));

    expect(hub.receivedRecords.last['target'], 'SendTyping');
    expect(hub.receivedRecords.last['arguments'], ['conv-1']);
  });

  test('joinConversation throws HubException on server rejection', () async {
    await client.connectWebSocket();
    await hub.waitConnected();

    unawaited(() async {
      await Future.delayed(const Duration(milliseconds: 100));
      final sent = hub.receivedRecords.last;
      hub.sendCompletion(sent['invocationId'] as String, error: 'Conversation not found');
    }());

    expect(
      () => client.joinConversation('someone-elses-conversation'),
      throwsA(isA<HubException>()),
    );
  });
}
