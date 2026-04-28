import 'dart:convert';
import 'dart:io';

import 'package:ar_auth/ar_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class InMemoryTokenStorage extends TokenStorage {
  StoredSession? _stored;

  bool get hasStoredSession => _stored != null;

  @override
  Future<void> save({
    required String refreshToken,
    required int userId,
    required String username,
    required String sessionId,
    required int refreshExpiresIn,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    _stored = StoredSession(
      refreshToken: refreshToken,
      userId: userId,
      username: username,
      sessionId: sessionId,
      refreshExpiresAt: now + refreshExpiresIn,
    );
  }

  @override
  Future<StoredSession?> load() async => _stored;

  @override
  Future<void> clear() async {
    _stored = null;
  }
}

class FakeAuthServer {
  int refreshCalls = 0;
  int verifyCalls = 0;
  int logoutCalls = 0;
  int logoutAllCalls = 0;
  int changePasswordCalls = 0;
  int deleteAccountCalls = 0;

  int loginExpiresIn = 900;
  int refreshExpiresIn = 900;
  int changePasswordExpiresIn = 900;
  Duration refreshDelay = Duration.zero;

  bool refreshNetworkError = false;
  String? refreshErrorCode;

  String loginAccessToken = 'access_login';
  String loginRefreshToken = 'sess_old.secret_old';
  String refreshAccessToken = 'access_refresh';
  String refreshRefreshToken = 'sess_old.secret_new';
  String changePasswordAccessToken = 'access_changed';
  String changePasswordRefreshToken = 'sess_new.secret_new';

  String sessionId = 'sess_old';
  String changedSessionId = 'sess_new';

  http.Client buildClient() {
    return MockClient((request) async {
      final path = request.url.path;
      switch (path) {
        case '/api/v2/auth/login':
          return _jsonResponse({
            'user': {'user_id': 100001, 'username': 'alice'},
            'session_id': sessionId,
            'access_token': loginAccessToken,
            'access_expires_in': loginExpiresIn,
            'refresh_token': loginRefreshToken,
            'refresh_expires_in': 2592000,
          });
        case '/api/v2/auth/register':
          return _jsonResponse({
            'user': {'user_id': 100001, 'username': 'alice'},
            'session_id': sessionId,
            'access_token': loginAccessToken,
            'access_expires_in': loginExpiresIn,
            'refresh_token': loginRefreshToken,
            'refresh_expires_in': 2592000,
          });
        case '/api/v2/auth/refresh':
          refreshCalls += 1;
          if (refreshDelay > Duration.zero) {
            await Future<void>.delayed(refreshDelay);
          }
          if (refreshNetworkError) {
            throw const SocketException('network down');
          }
          if (refreshErrorCode != null) {
            return _jsonResponse(
              {'error': refreshErrorCode, 'message': 'refresh failed'},
              statusCode: 401,
            );
          }
          return _jsonResponse({
            'session_id': sessionId,
            'access_token': refreshAccessToken,
            'access_expires_in': refreshExpiresIn,
            'refresh_token': refreshRefreshToken,
            'refresh_expires_in': 2592000,
          });
        case '/api/v2/auth/verify':
          verifyCalls += 1;
          return _jsonResponse({
            'valid': true,
            'user_id': 100001,
            'username': 'alice',
            'session_id': sessionId,
          });
        case '/api/v2/auth/logout':
          logoutCalls += 1;
          return _jsonResponse({'success': true});
        case '/api/v2/auth/logout-all':
          logoutAllCalls += 1;
          return _jsonResponse({'success': true, 'revoked_sessions': 3});
        case '/api/v2/auth/change-password':
          changePasswordCalls += 1;
          return _jsonResponse({
            'success': true,
            'session_id': changedSessionId,
            'access_token': changePasswordAccessToken,
            'access_expires_in': changePasswordExpiresIn,
            'refresh_token': changePasswordRefreshToken,
            'refresh_expires_in': 2592000,
          });
        case '/api/v2/auth/delete-account':
          deleteAccountCalls += 1;
          return _jsonResponse({'success': true});
        default:
          return _jsonResponse({'error': 'not_found'}, statusCode: 404);
      }
    });
  }

  http.Response _jsonResponse(
    Map<String, dynamic> body, {
    int statusCode = 200,
  }) {
    return http.Response(
      jsonEncode(body),
      statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}

ArAuth createAuth({
  required InMemoryTokenStorage storage,
  required FakeAuthServer server,
}) {
  return ArAuth(
    baseUrl: 'https://auth.example.com',
    appKey: 'app_key',
    appSecret: 'app_secret',
    storage: storage,
    httpClient: server.buildClient(),
  );
}

void main() {
  group('buildAuthorizationHeaders', () {
    test('throws NotInitializedException before init', () async {
      final auth = createAuth(
        storage: InMemoryTokenStorage(),
        server: FakeAuthServer(),
      );

      expect(
        auth.buildAuthorizationHeaders(),
        throwsA(isA<NotInitializedException>()),
      );
    });

    test('returns bearer header without refresh when access token is valid', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer();
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      final headers = await auth.buildAuthorizationHeaders();

      expect(headers['Authorization'], 'Bearer ${server.loginAccessToken}');
      expect(server.refreshCalls, 0);
    });

    test('refreshes when access token is near expiry', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer()
        ..loginExpiresIn = 1
        ..refreshAccessToken = 'access_after_refresh';
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      final headers = await auth.buildAuthorizationHeaders(
        minValidity: const Duration(seconds: 30),
      );

      expect(headers['Authorization'], 'Bearer access_after_refresh');
      expect(server.refreshCalls, 1);
    });

    test('coalesces concurrent refresh requests', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer()
        ..loginExpiresIn = 1
        ..refreshDelay = const Duration(milliseconds: 120);
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      final results = await Future.wait([
        auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30)),
        auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30)),
      ]);

      expect(server.refreshCalls, 1);
      expect(
        results.map((headers) => headers['Authorization']).toSet(),
        {'Bearer ${server.refreshAccessToken}'},
      );
    });

    test('throws SessionTerminatedException and clears local state on terminal refresh error', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer()
        ..loginExpiresIn = 1
        ..refreshErrorCode = 'invalid_refresh_token';
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      await expectLater(
        auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30)),
        throwsA(
          isA<SessionTerminatedException>().having(
            (e) => e.code,
            'code',
            'invalid_refresh_token',
          ),
        ),
      );
      expect(auth.currentUser, isNull);
      expect(auth.isLoggedIn, isFalse);
      expect(storage.hasStoredSession, isFalse);
    });

    test('clears refresh lock after completion so sequential calls each refresh', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer()
        ..loginExpiresIn = 1
        ..refreshExpiresIn = 1;
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      await auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30));
      expect(server.refreshCalls, 1);

      // Second sequential call: refreshed token also expired in 1s, so another refresh must fire.
      await auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30));
      expect(server.refreshCalls, 2);
    });

    test('throws NetworkException without clearing local state on refresh network failure', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer()
        ..loginExpiresIn = 1
        ..refreshNetworkError = true;
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');

      await expectLater(
        auth.buildAuthorizationHeaders(minValidity: const Duration(seconds: 30)),
        throwsA(isA<NetworkException>()),
      );
      expect(auth.currentUser, isNotNull);
      expect(storage.hasStoredSession, isTrue);
    });
  });

  group('regression smoke', () {
    test('register/login/verify/logout flow still works', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer();
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      final registered = await auth.register('alice', 'password');
      expect(registered.userId, 100001);

      final loggedIn = await auth.login('alice', 'password');
      expect(loggedIn.username, 'alice');

      final verifyResult = await auth.verify();
      expect(verifyResult.valid, isTrue);
      expect(server.verifyCalls, 1);

      await auth.logout();
      expect(server.logoutCalls, 1);
      expect(auth.isLoggedIn, isFalse);
    });

    test('changePassword/logoutAll/deleteAccount semantics stay consistent', () async {
      final storage = InMemoryTokenStorage();
      final server = FakeAuthServer();
      final auth = createAuth(storage: storage, server: server);

      await auth.init();
      await auth.login('alice', 'password');
      await auth.changePassword(
        oldPassword: 'old123456',
        newPassword: 'new123456',
      );

      final headers = await auth.buildAuthorizationHeaders();
      expect(headers['Authorization'], 'Bearer ${server.changePasswordAccessToken}');
      expect(auth.currentUser?.sessionId, server.changedSessionId);
      expect(server.changePasswordCalls, 1);

      await auth.logoutAll();
      expect(server.logoutAllCalls, 1);
      expect(auth.isLoggedIn, isFalse);

      await auth.login('alice', 'password');
      await auth.deleteAccount(password: 'password');
      expect(server.deleteAccountCalls, 1);
      expect(auth.isLoggedIn, isFalse);
    });
  });
}
