import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'exceptions.dart';
import 'models.dart';
import 'storage.dart';

const _terminalSessionCodes = <String>{
  'session_revoked',
  'invalid_refresh_token',
  'refresh_token_revoked',
  'refresh_token_expired',
  'account_disabled',
  'user_not_found',
};

class ArAuth extends ChangeNotifier {
  final String baseUrl;
  final String appKey;
  final String appSecret;
  final TokenStorage _storage;
  final http.Client _http;

  ArAuthUser? _currentUser;
  String? _accessToken;
  DateTime? _accessTokenExpiresAt;
  bool _isInitialized = false;
  bool _isRestoring = false;
  Future<void>? _refreshFuture;

  ArAuth({
    required this.baseUrl,
    required this.appKey,
    required this.appSecret,
    TokenStorage? storage,
    http.Client? httpClient,
  })  : _storage = storage ?? const TokenStorage(),
        _http = httpClient ?? http.Client();

  ArAuthUser? get currentUser => _currentUser;

  bool get isLoggedIn => _currentUser != null && _accessToken != null;

  bool get isInitialized => _isInitialized;

  bool get isRestoring => _isRestoring;

  DateTime? get accessTokenExpiresAt => _accessTokenExpiresAt;

  Future<void> init() async {
    _isInitialized = false;
    _isRestoring = false;
    _clearAccessState();
    notifyListeners();

    final stored = await _storage.load();
    if (stored == null) {
      _currentUser = null;
      _isInitialized = true;
      notifyListeners();
      return;
    }

    _currentUser = ArAuthUser.fromStored(
      userId: stored.userId,
      username: stored.username,
      sessionId: stored.sessionId,
    );
    _isRestoring = true;
    notifyListeners();

    try {
      await _refreshSession();
    } on ArAuthException catch (e) {
      if (_terminalSessionCodes.contains(e.code)) {
        await _clearLocalState(notify: false);
      }
      _isRestoring = false;
      _isInitialized = true;
      notifyListeners();
      rethrow;
    } catch (e) {
      _isRestoring = false;
      _isInitialized = true;
      notifyListeners();
      throw NetworkException(e.toString());
    }

    _isRestoring = false;
    _isInitialized = true;
    notifyListeners();
  }

  Future<ArAuthUser> register(
    String username,
    String password, {
    String? deviceName,
    String? clientBuild,
  }) async {
    final data = await _post('/api/v2/auth/register', {
      'username': username,
      'password': password,
      if (deviceName != null) 'device_name': deviceName,
      if (clientBuild != null) 'client_build': clientBuild,
    });
    final user = ArAuthUser.fromAuthJson(data);
    await _applyAuthSuccess(
      user: user,
      accessToken: data['access_token'] as String,
      accessExpiresIn: data['access_expires_in'] as int,
      refreshToken: data['refresh_token'] as String,
      refreshExpiresIn: data['refresh_expires_in'] as int,
    );
    return user;
  }

  Future<ArAuthUser> login(
    String username,
    String password, {
    String? deviceName,
    String? clientBuild,
  }) async {
    final data = await _post('/api/v2/auth/login', {
      'username': username,
      'password': password,
      if (deviceName != null) 'device_name': deviceName,
      if (clientBuild != null) 'client_build': clientBuild,
    });
    final user = ArAuthUser.fromAuthJson(data);
    await _applyAuthSuccess(
      user: user,
      accessToken: data['access_token'] as String,
      accessExpiresIn: data['access_expires_in'] as int,
      refreshToken: data['refresh_token'] as String,
      refreshExpiresIn: data['refresh_expires_in'] as int,
    );
    return user;
  }

  Future<VerifyResult> verify() async {
    final data = await _postWithAuth('/api/v2/auth/verify', const {});
    return VerifyResult.fromJson(data);
  }

  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
    String? deviceName,
    String? clientBuild,
  }) async {
    final current = _requireCurrentUser();
    final data = await _postWithAuth('/api/v2/auth/change-password', {
      'old_password': oldPassword,
      'new_password': newPassword,
      if (deviceName != null) 'device_name': deviceName,
      if (clientBuild != null) 'client_build': clientBuild,
    });

    await _applyAuthSuccess(
      user: current.copyWith(sessionId: data['session_id'] as String),
      accessToken: data['access_token'] as String,
      accessExpiresIn: data['access_expires_in'] as int,
      refreshToken: data['refresh_token'] as String,
      refreshExpiresIn: data['refresh_expires_in'] as int,
    );
  }

  Future<void> logout() async {
    if (!_isInitialized) {
      throw const NotInitializedException();
    }

    final stored = await _storage.load();
    try {
      if (stored != null) {
        await _post('/api/v2/auth/logout', {
          'refresh_token': stored.refreshToken,
        });
      }
    } on ArAuthException {
      // Best effort: local logout should still succeed.
    } catch (_) {
      // Ignore network failures for local logout.
    } finally {
      await _clearLocalState();
    }
  }

  Future<void> logoutAll() async {
    await _postWithAuth('/api/v2/auth/logout-all', const {});
    await _clearLocalState();
  }

  Future<void> deleteAccount({required String password}) async {
    await _postWithAuth('/api/v2/auth/delete-account', {
      'password': password,
    });
    await _clearLocalState();
  }

  Future<Map<String, String>> buildAuthorizationHeaders({
    Map<String, String>? baseHeaders,
    Duration minValidity = const Duration(seconds: 30),
  }) async {
    final accessToken = await _ensureValidAccessToken(
      minValidity: minValidity,
    );
    return <String, String>{
      ...?baseHeaders,
      'Authorization': 'Bearer $accessToken',
    };
  }

  Future<void> _applyAuthSuccess({
    required ArAuthUser user,
    required String accessToken,
    required int accessExpiresIn,
    required String refreshToken,
    required int refreshExpiresIn,
  }) async {
    _currentUser = user;
    _accessToken = accessToken;
    _accessTokenExpiresAt = DateTime.now().add(Duration(seconds: accessExpiresIn));

    await _storage.save(
      refreshToken: refreshToken,
      userId: user.userId,
      username: user.username,
      sessionId: user.sessionId,
      refreshExpiresIn: refreshExpiresIn,
    );

    notifyListeners();
  }

  Future<void> _clearLocalState({bool notify = true}) async {
    await _storage.clear();
    _currentUser = null;
    _clearAccessState();
    if (notify) {
      notifyListeners();
    }
  }

  void _clearAccessState() {
    _accessToken = null;
    _accessTokenExpiresAt = null;
  }

  ArAuthUser _requireCurrentUser() {
    if (_currentUser == null) {
      throw const SessionTerminatedException('not_logged_in', 'Not logged in');
    }
    return _currentUser!;
  }

  void _ensureReadyForProtectedRequest() {
    if (!_isInitialized) {
      throw const NotInitializedException();
    }
  }

  Map<String, String> get _appHeaders => {
        'Content-Type': 'application/json',
        'X-App-Key': appKey,
        'X-App-Secret': appSecret,
      };

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body, {
    String? accessToken,
  }) async {
    try {
      final response = await _http.post(
        Uri.parse('$baseUrl$path'),
        headers: {
          ..._appHeaders,
          if (accessToken != null) 'Authorization': 'Bearer $accessToken',
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

  Future<Map<String, dynamic>> _postWithAuth(
    String path,
    Map<String, dynamic> body, {
    bool allowRetry = true,
  }) async {
    final accessToken = await _ensureValidAccessToken();

    try {
      return await _post(path, body, accessToken: accessToken);
    } on ArAuthException catch (e) {
      if (e.code == 'token_expired' && allowRetry) {
        await _refreshSession();
        return _postWithAuth(path, body, allowRetry: false);
      }
      await _rethrowIfSessionTerminated(e);
      rethrow;
    }
  }

  Future<String> _ensureValidAccessToken({
    Duration minValidity = Duration.zero,
  }) async {
    _ensureReadyForProtectedRequest();

    final normalizedMinValidity = minValidity.isNegative
        ? Duration.zero
        : minValidity;
    final threshold = DateTime.now().add(normalizedMinValidity);
    final expiresAt = _accessTokenExpiresAt;
    final needsRefresh =
        _accessToken == null || expiresAt == null || !expiresAt.isAfter(threshold);

    if (needsRefresh) {
      await _refreshSession();
    }

    final accessToken = _accessToken;
    if (accessToken == null) {
      throw const SessionTerminatedException('not_logged_in', 'Not logged in');
    }
    return accessToken;
  }

  Future<void> _rethrowIfSessionTerminated(ArAuthException error) async {
    if (_terminalSessionCodes.contains(error.code)) {
      await _clearLocalState();
      throw SessionTerminatedException(error.code, error.message);
    }
  }

  Future<void> _refreshSession() {
    final existing = _refreshFuture;
    if (existing != null) {
      return existing;
    }

    final future = _performRefresh();
    _refreshFuture = future.whenComplete(() {
      if (identical(_refreshFuture, future)) {
        _refreshFuture = null;
      }
    });
    return _refreshFuture!;
  }

  Future<void> _performRefresh() async {
    final stored = await _storage.load();
    if (stored == null) {
      await _clearLocalState();
      throw const SessionTerminatedException('not_logged_in', 'No stored refresh token');
    }

    try {
      final data = await _post('/api/v2/auth/refresh', {
        'refresh_token': stored.refreshToken,
      });

      final user = (_currentUser ?? ArAuthUser.fromStored(
            userId: stored.userId,
            username: stored.username,
            sessionId: stored.sessionId,
          ))
          .copyWith(sessionId: data['session_id'] as String);

      await _applyAuthSuccess(
        user: user,
        accessToken: data['access_token'] as String,
        accessExpiresIn: data['access_expires_in'] as int,
        refreshToken: data['refresh_token'] as String,
        refreshExpiresIn: data['refresh_expires_in'] as int,
      );
    } on ArAuthException catch (e) {
      if (_terminalSessionCodes.contains(e.code)) {
        await _clearLocalState();
        throw SessionTerminatedException(e.code, e.message);
      }
      rethrow;
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final dynamic decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    final json = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return json;
    }

    final error = json['error'] as String? ?? 'unknown_error';
    final message = json['message'] as String? ?? 'An error occurred';

    switch (error) {
      case 'invalid_request':
        throw InvalidRequestException(message);
      case 'invalid_credentials':
        throw InvalidCredentialsException(message);
      case 'account_locked':
        throw AccountLockedException(message);
      case 'account_disabled':
        throw AccountDisabledException(message);
      case 'username_taken':
        throw UsernameTakenException(message);
      case 'wrong_password':
        throw WrongPasswordException(message);
      case 'token_expired':
      case 'invalid_token':
      case 'invalid_refresh_token':
      case 'refresh_token_revoked':
      case 'refresh_token_expired':
      case 'session_revoked':
      case 'user_not_found':
        throw TokenException(error, message);
      case 'invalid_app_key':
      case 'invalid_app_secret':
      case 'app_disabled':
      case 'app_mismatch':
        throw AppAuthException(message);
      case 'rate_limited':
        throw ArAuthException('rate_limited', message);
      default:
        if (response.statusCode >= 500) {
          throw NetworkException(message);
        }
        throw ArAuthException(error, message);
    }
  }

  @override
  void dispose() {
    _http.close();
    super.dispose();
  }
}
