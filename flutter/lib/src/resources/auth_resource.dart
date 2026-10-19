import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/erghi_config.dart';
import '../exceptions/exceptions.dart';
import '../models/models.dart';

class AuthResource {
  final ErghiConfig config;
  final http.Client client;
  String? _accessToken;
  String? _refreshToken;

  AuthResource({
    required this.config,
    required this.client,
  });

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey != null) {
      headers['X-API-Key'] = config.apiKey!;
    } else if (_accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }

    return headers;
  }

  /// Register a new user.
  ///
  /// `/api/auth/*` is the platform's GoTrue auth server behind the gateway, so
  /// bodies are GoTrue's snake_case shapes. Tokens are empty while the platform
  /// waits for email confirmation (see [verifyEmail]).
  Future<AuthResponse> register(RegisterRequest request) async {
    final data = await _send('POST', '/api/auth/register', {
      'email': request.email,
      'password': request.password,
      if (request.phoneNumber != null) 'phone': request.phoneNumber,
      'data': {'first_name': request.firstName, 'last_name': request.lastName},
    });
    return _store(AuthResponse.fromGoTrue(data));
  }

  /// Login with email and password
  Future<AuthResponse> login(LoginRequest request) async {
    final data = await _send('POST', '/api/auth/login', {
      'email': request.email,
      'password': request.password,
    });
    return _store(AuthResponse.fromGoTrue(data));
  }

  /// Refresh access token
  Future<AuthResponse> refresh() async {
    if (_refreshToken == null) {
      throw AuthenticationException('No refresh token available');
    }
    final data = await _send(
      'POST',
      '/api/auth/token?grant_type=refresh_token',
      {'refresh_token': _refreshToken},
    );
    return _store(AuthResponse.fromGoTrue(data));
  }

  /// Get current user
  Future<User> me() async {
    final data = await _send('GET', '/api/auth/user', null);
    return User.fromGoTrue(data);
  }

  /// Logout
  Future<void> logout() async {
    try {
      await client
          .post(
            Uri.parse('${config.apiUrl}/api/auth/logout'),
            headers: _headers,
          )
          .timeout(config.timeout);
    } finally {
      _accessToken = null;
      _refreshToken = null;
    }
  }

  /// Confirm a signup with the token from the confirmation email link.
  Future<void> verifyEmail(String token) async {
    final data = await _send('POST', '/api/auth/verify', {
      'type': 'signup',
      'token_hash': token,
    });
    _store(AuthResponse.fromGoTrue(data));
  }

  /// Send a password reset email.
  Future<void> forgotPassword(String email) async {
    await _send('POST', '/api/auth/recover', {'email': email});
  }

  /// Set a new password using the token from the reset email link: the token
  /// is exchanged for a recovery session, which then updates the password.
  Future<void> resetPassword(String token, String newPassword) async {
    final session = await _send('POST', '/api/auth/verify', {
      'type': 'recovery',
      'token_hash': token,
    });
    final recoveryToken = session['access_token'];
    if (recoveryToken is! String || recoveryToken.isEmpty) {
      throw AuthenticationException('Password reset token was not accepted');
    }
    await _send(
      'PUT',
      '/api/auth/user',
      {'password': newPassword},
      bearer: recoveryToken,
    );
  }

  AuthResponse _store(AuthResponse auth) {
    if (auth.accessToken.isNotEmpty) {
      _accessToken = auth.accessToken;
      _refreshToken = auth.refreshToken;
    }
    return auth;
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path,
    Map<String, dynamic>? body, {
    String? bearer,
  }) async {
    final request = http.Request(method, Uri.parse('${config.apiUrl}$path'))
      ..headers.addAll(_headers);
    if (bearer != null) {
      request.headers.remove('X-API-Key');
      request.headers['Authorization'] = 'Bearer $bearer';
    }
    if (body != null) request.body = jsonEncode(body);

    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await client.send(request).timeout(config.timeout),
      );
    } catch (e) {
      throw NetworkException('Network error: $e');
    }

    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    final json = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    if (response.statusCode >= 200 && response.statusCode < 300) return json;

    // GoTrue reports errors as `msg` / `error_description`.
    final message = (json['msg'] ?? json['error_description'] ?? json['message'] ?? json['error'])
            ?.toString() ??
        'Request failed';
    if (response.statusCode == 400 || response.statusCode == 422) {
      throw ValidationException(message, statusCode: response.statusCode, details: json);
    }
    if (response.statusCode == 404) {
      throw NotFoundException(message, details: json);
    }
    throw AuthenticationException(message, statusCode: response.statusCode, details: json);
  }

  /// Authenticate using Client Credentials to obtain a JWT token
  Future<String> authenticate() async {
    if (config.clientId == null || config.clientSecret == null) {
      throw AuthenticationException('Client ID and Client Secret are required for token exchange');
    }

    try {
      final response = await client.post(
        Uri.parse('${config.apiUrl}/api/v1/auth/token'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'grant_type': 'client_credentials',
          'client_id': config.clientId,
          'client_secret': config.clientSecret,
        }),
      ).timeout(config.timeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _accessToken = data['access_token'];
        return _accessToken!;
      } else {
        final error = jsonDecode(response.body);
        throw AuthenticationException(
          error['message'] ?? 'Client authentication failed',
          statusCode: response.statusCode,
          details: error,
        );
      }
    } catch (e) {
      if (e is ErghiException) rethrow;
      throw NetworkException('Network error: $e');
    }
  }

  /// Set tokens manually (e.g., from storage)
  void setTokens({String? accessToken, String? refreshToken}) {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }
}
