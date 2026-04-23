import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kRefreshToken = 'ar_auth_refresh_token';
const _kUserId = 'ar_auth_user_id';
const _kUsername = 'ar_auth_username';
const _kSessionId = 'ar_auth_session_id';
const _kRefreshExpiresAt = 'ar_auth_refresh_expires_at';

class TokenStorage {
  final FlutterSecureStorage _secureStorage;

  const TokenStorage({
    FlutterSecureStorage secureStorage = const FlutterSecureStorage(),
  }) : _secureStorage = secureStorage;

  Future<void> save({
    required String refreshToken,
    required int userId,
    required String username,
    required String sessionId,
    required int refreshExpiresIn,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final refreshExpiresAt = DateTime.now().millisecondsSinceEpoch ~/ 1000 + refreshExpiresIn;

    await Future.wait([
      _secureStorage.write(key: _kRefreshToken, value: refreshToken),
      prefs.setString(_kUserId, userId.toString()),
      prefs.setString(_kUsername, username),
      prefs.setString(_kSessionId, sessionId),
      prefs.setInt(_kRefreshExpiresAt, refreshExpiresAt),
    ]);
  }

  Future<StoredSession?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final refreshToken = await _secureStorage.read(key: _kRefreshToken);
    final userIdStr = prefs.getString(_kUserId);
    final username = prefs.getString(_kUsername);
    final sessionId = prefs.getString(_kSessionId);
    final refreshExpiresAt = prefs.getInt(_kRefreshExpiresAt);

    if (refreshToken == null || userIdStr == null || username == null || sessionId == null) {
      if (refreshToken != null || userIdStr != null || username != null || sessionId != null) {
        await clear();
      }
      return null;
    }

    final userId = int.tryParse(userIdStr);
    if (userId == null) {
      await clear();
      return null;
    }

    return StoredSession(
      refreshToken: refreshToken,
      userId: userId,
      username: username,
      sessionId: sessionId,
      refreshExpiresAt: refreshExpiresAt,
    );
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      _secureStorage.delete(key: _kRefreshToken),
      prefs.remove(_kUserId),
      prefs.remove(_kUsername),
      prefs.remove(_kSessionId),
      prefs.remove(_kRefreshExpiresAt),
    ]);
  }
}

class StoredSession {
  final String refreshToken;
  final int userId;
  final String username;
  final String sessionId;
  final int? refreshExpiresAt;

  const StoredSession({
    required this.refreshToken,
    required this.userId,
    required this.username,
    required this.sessionId,
    required this.refreshExpiresAt,
  });
}
