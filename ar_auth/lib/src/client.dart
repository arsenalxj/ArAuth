import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'exceptions.dart';
import 'models.dart';
import 'storage.dart';

/// Main ArAuth client.
///
/// Usage:
/// ```dart
/// final auth = ArAuth(
///   baseUrl: 'https://auth.example.workers.dev',
///   appKey: 'ark_xxx',
///   appSecret: 'ars_yyy',
/// );
/// await auth.init();
/// if (auth.isLoggedIn) { /* navigate to home */ }
/// ```
class ArAuth extends ChangeNotifier {
  final String baseUrl;
  final String appKey;
  final String appSecret;
  final TokenStorage _storage;
  final http.Client _http;

  ArAuthUser? _currentUser;

  ArAuth({
    required this.baseUrl,
    required this.appKey,
    required this.appSecret,
    TokenStorage? storage,
    http.Client? httpClient,
  })  : _storage = storage ?? const TokenStorage(),
        _http = httpClient ?? http.Client();

  // ── State ──────────────────────────────────────────────────────────────────

  /// Currently logged-in user, or null if not authenticated.
  ArAuthUser? get currentUser => _currentUser;

  /// Whether a user is currently logged in with a valid (non-expired) token.
  bool get isLoggedIn => _currentUser != null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /// Call once at app startup to restore persisted login state.
  Future<void> init() async {
    final session = await _storage.load();
    if (session == null) return;
    _currentUser = ArAuthUser(
      userId: session.userId,
      username: session.username,
      token: session.token,
      expiresIn: session.expiresAt - DateTime.now().millisecondsSinceEpoch ~/ 1000,
    );
    notifyListeners();
  }

  // ── Auth operations ────────────────────────────────────────────────────────

  /// Register a new account and return the authenticated user.
  Future<ArAuthUser> register(String username, String password) async {
    final data = await _post('/api/v1/auth/register', {
      'username': username,
      'password': password,
    });
    final user = ArAuthUser.fromJson(data, username);
    await _persist(user);
    return user;
  }

  /// Log in with username and password.
  Future<ArAuthUser> login(String username, String password) async {
    final data = await _post('/api/v1/auth/login', {
      'username': username,
      'password': password,
    });
    final user = ArAuthUser.fromJson(data, username);
    await _persist(user);
    return user;
  }

  /// Verify the current token against the server.
  Future<VerifyResult> verify() async {
    _requireLogin();
    final data = await _postWithAuth('/api/v1/auth/verify', {});
    return VerifyResult.fromJson(data);
  }

  /// Change password. All other sessions are immediately invalidated.
  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    _requireLogin();
    await _postWithAuth('/api/v1/auth/change-password', {
      'old_password': oldPassword,
      'new_password': newPassword,
    });
    // Token is now invalid; clear local state
    await _clear();
  }

  /// Log out. The server invalidates all tokens for this user.
  Future<void> logout() async {
    if (!isLoggedIn) return;
    try {
      await _postWithAuth('/api/v1/auth/logout', {});
    } catch (_) {
      // Best-effort; clear local state regardless
    }
    await _clear();
  }

  /// Delete this account permanently. Requires password confirmation.
  Future<void> deleteAccount({required String password}) async {
    _requireLogin();
    await _postWithAuth('/api/v1/auth/delete-account', {'password': password});
    await _clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  Future<void> _persist(ArAuthUser user) async {
    await _storage.save(
      token: user.token,
      userId: user.userId,
      username: user.username,
      expiresIn: user.expiresIn,
    );
    _currentUser = user;
    notifyListeners();
  }

  Future<void> _clear() async {
    await _storage.clear();
    _currentUser = null;
    notifyListeners();
  }

  void _requireLogin() {
    if (!isLoggedIn) throw const TokenException('not_logged_in', 'Not logged in');
  }

  Map<String, String> get _appHeaders => {
        'Content-Type': 'application/json',
        'X-App-Key': appKey,
        'X-App-Secret': appSecret,
      };

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    try {
      final response = await _http.post(
        Uri.parse('$baseUrl$path'),
        headers: _appHeaders,
        body: jsonEncode(body),
      );
      return _handleResponse(response);
    } on ArAuthException {
      rethrow;
    } catch (e) {
      throw NetworkException(e.toString());
    }
  }

  Future<Map<String, dynamic>> _postWithAuth(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = _currentUser?.token;
    try {
      final response = await _http.post(
        Uri.parse('$baseUrl$path'),
        headers: {
          ..._appHeaders,
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode(body),
      );
      return _handleResponse(response);
    } on ArAuthException {
      rethrow;
    } catch (e) {
      throw NetworkException(e.toString());
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final Map<String, dynamic> json = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return json;
    }

    final error = json['error'] as String? ?? 'unknown_error';
    final message = json['message'] as String? ?? 'An error occurred';

    switch (error) {
      case 'invalid_credentials':
        throw InvalidCredentialsException(message);
      case 'account_locked':
        throw AccountLockedException(message);
      case 'account_disabled':
        throw AccountDisabledException(message);
      case 'username_taken':
        throw UsernameTakenException(message);
      case 'weak_password':
        throw WeakPasswordException(message);
      case 'token_expired':
      case 'token_revoked':
      case 'invalid_token':
        throw TokenException(error, message);
      case 'invalid_app_key':
      case 'invalid_app_secret':
      case 'app_disabled':
        throw AppAuthException(message);
      case 'rate_limited':
        throw ArAuthException('rate_limited', message);
      default:
        throw ArAuthException(error, message);
    }
  }

  @override
  void dispose() {
    _http.close();
    super.dispose();
  }
}
