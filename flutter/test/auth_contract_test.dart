import 'dart:convert';

import 'package:erghi_sdk/erghi_sdk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;

/// Pins the wire contract: `/api/auth/*` is GoTrue behind the gateway, so
/// paths and bodies are GoTrue's (snake_case).
void main() {
  const user = {
    'id': 'u-1',
    'email': 'qa@example.com',
    'role': 'authenticated',
    'email_confirmed_at': '2026-10-01T00:00:00Z',
    'created_at': '2026-10-01T00:00:00Z',
    'user_metadata': {'first_name': 'Q', 'last_name': 'A'},
  };
  const session = {
    'access_token': 'at-1',
    'refresh_token': 'rt-1',
    'expires_in': 3600,
    'token_type': 'bearer',
    'user': user,
  };

  late List<http.Request> seen;

  AuthResource make(Object? Function(http.Request) respond, {int status = 200}) {
    seen = [];
    final client = http_testing.MockClient((request) async {
      seen.add(request);
      return http.Response(jsonEncode(respond(request)), status);
    });
    return AuthResource(
      config: ErghiConfig(apiUrl: 'https://erghi.test', wsUrl: 'wss://erghi.test'),
      client: client,
    );
  }

  test('login sends credentials and maps the snake_case session', () async {
    final auth = make((_) => session);
    final result = await auth.login(const LoginRequest(email: 'qa@example.com', password: 'pw'));
    expect(seen.single.url.path, '/api/auth/login');
    expect(jsonDecode(seen.single.body), {'email': 'qa@example.com', 'password': 'pw'});
    expect(result.accessToken, 'at-1');
    expect(result.user.firstName, 'Q');
    expect(result.user.emailVerified, isTrue);
    expect(auth.accessToken, 'at-1');
  });

  test('refresh uses the token grant', () async {
    final auth = make((_) => session);
    auth.setTokens(refreshToken: 'rt-0');
    await auth.refresh();
    expect(seen.single.url.path, '/api/auth/token');
    expect(seen.single.url.queryParameters['grant_type'], 'refresh_token');
    expect(jsonDecode(seen.single.body), {'refresh_token': 'rt-0'});
  });

  test('register pending confirmation returns no tokens', () async {
    final auth = make((_) => {...user, 'email_confirmed_at': null});
    final result = await auth.register(const RegisterRequest(
      email: 'qa@example.com',
      password: 'pw',
      firstName: 'Q',
      lastName: 'A',
    ));
    expect((jsonDecode(seen.single.body) as Map)['data'], {'first_name': 'Q', 'last_name': 'A'});
    expect(result.accessToken, isEmpty);
    expect(result.user.emailVerified, isFalse);
    expect(auth.accessToken, isNull);
  });

  test('me and forgotPassword use GoTrue paths', () async {
    final auth = make((r) => r.method == 'GET' ? user : <String, Object>{});
    final me = await auth.me();
    await auth.forgotPassword('qa@example.com');
    expect(seen[0].url.path, '/api/auth/user');
    expect(me.id, 'u-1');
    expect(seen[1].url.path, '/api/auth/recover');
  });

  test('resetPassword updates with the recovery session token', () async {
    final auth = make((r) => r.method == 'POST' ? {'access_token': 'recovery-at'} : <String, Object>{});
    await auth.resetPassword('hash-1', 'new-pw');
    expect(jsonDecode(seen[0].body), {'type': 'recovery', 'token_hash': 'hash-1'});
    expect(seen[1].method, 'PUT');
    expect(seen[1].url.path, '/api/auth/user');
    expect(seen[1].headers['Authorization'], 'Bearer recovery-at');
  });

  test('GoTrue error text is surfaced', () async {
    final auth = make((_) => {'code': 400, 'msg': 'Invalid login credentials'}, status: 400);
    expect(
      () => auth.login(const LoginRequest(email: 'qa@example.com', password: 'x')),
      throwsA(isA<ValidationException>().having((e) => e.message, 'message', 'Invalid login credentials')),
    );
  });
}
