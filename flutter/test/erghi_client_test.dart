import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:http/http.dart' as http;
import 'package:erghi_sdk/erghi_sdk.dart';

import 'erghi_client_test.mocks.dart';

@GenerateMocks([http.Client])
void main() {
  late ErghiClient client;
  late MockClient mockHttpClient;
  late ErghiConfig config;

  setUp(() {
    mockHttpClient = MockClient();
    config = ErghiConfig(
      apiUrl: 'https://api.test.com',
      wsUrl: 'wss://api.test.com',
    );
    
    client = ErghiClient(config: config, httpClient: mockHttpClient);
  });

  group('ErghiClient', () {
    test('initializes correctly', () {
      expect(client.config.apiUrl, 'https://api.test.com');
      expect(client.isConnected, isFalse);
    });

    test('has Auth and Chat resources', () {
      expect(client.auth, isNotNull);
      expect(client.chat, isNotNull);
    });

    // WebSockets require a mock WebSocketChannel which is harder to inject
    // since WebSocketChannel.connect is used directly.
    // We will test state and config setup here.
  });
}
