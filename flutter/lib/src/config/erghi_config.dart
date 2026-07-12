import 'package:equatable/equatable.dart';

/// Configuration for ErghiClient
class ErghiConfig extends Equatable {
  /// Base API URL
  final String apiUrl;

  /// WebSocket URL
  final String? wsUrl;

  /// API Key (optional, can use JWT instead)
  final String? apiKey;

  /// Client ID for M2M authentication
  final String? clientId;

  /// Client Secret for M2M authentication
  final String? clientSecret;

  /// Request timeout duration
  final Duration timeout;

  /// Enable debug logging
  final bool debug;

  const ErghiConfig({
    required this.apiUrl,
    this.wsUrl,
    this.apiKey,
    this.clientId,
    this.clientSecret,
    this.timeout = const Duration(seconds: 30),
    this.debug = false,
  });

  /// Get WebSocket URL (derive from apiUrl if not provided)
  String get websocketUrl {
    if (wsUrl != null) return wsUrl!;
    if (apiUrl.startsWith('https://')) {
      return apiUrl.replaceFirst('https://', 'wss://');
    }
    return apiUrl.replaceFirst('http://', 'ws://');
  }

  ErghiConfig copyWith({
    String? apiUrl,
    String? wsUrl,
    String? apiKey,
    String? clientId,
    String? clientSecret,
    Duration? timeout,
    bool? debug,
  }) {
    return ErghiConfig(
      apiUrl: apiUrl ?? this.apiUrl,
      wsUrl: wsUrl ?? this.wsUrl,
      apiKey: apiKey ?? this.apiKey,
      clientId: clientId ?? this.clientId,
      clientSecret: clientSecret ?? this.clientSecret,
      timeout: timeout ?? this.timeout,
      debug: debug ?? this.debug,
    );
  }

  @override
  List<Object?> get props => [apiUrl, wsUrl, apiKey, clientId, clientSecret, timeout, debug];
}
