import 'package:shared_preferences/shared_preferences.dart';

const _kToken = 'ar_auth_token';
const _kUserId = 'ar_auth_user_id';
const _kUsername = 'ar_auth_username';
const _kExpiresAt = 'ar_auth_expires_at'; // Unix seconds

/// Thin wrapper around SharedPreferences for persisting auth state.
class TokenStorage {
  const TokenStorage();

  Future<void> save({
    required String token,
    required String userId,
    required String username,
    required int expiresIn,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final expiresAt = DateTime.now().millisecondsSinceEpoch ~/ 1000 + expiresIn;
    await Future.wait([
      prefs.setString(_kToken, token),
      prefs.setString(_kUserId, userId),
      prefs.setString(_kUsername, username),
      prefs.setInt(_kExpiresAt, expiresAt),
    ]);
  }

  Future<StoredSession?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_kToken);
    final userId = prefs.getString(_kUserId);
    final username = prefs.getString(_kUsername);
    final expiresAt = prefs.getInt(_kExpiresAt);

    if (token == null || userId == null || username == null || expiresAt == null) {
      return null;
    }

    final nowSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    if (expiresAt <= nowSeconds) {
      await clear();
      return null;
    }

    return StoredSession(
      token: token,
      userId: userId,
      username: username,
      expiresAt: expiresAt,
    );
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await Future.wait([
      prefs.remove(_kToken),
      prefs.remove(_kUserId),
      prefs.remove(_kUsername),
      prefs.remove(_kExpiresAt),
    ]);
  }
}

class StoredSession {
  final String token;
  final String userId;
  final String username;
  final int expiresAt;

  const StoredSession({
    required this.token,
    required this.userId,
    required this.username,
    required this.expiresAt,
  });

  bool get isExpired =>
      expiresAt <= DateTime.now().millisecondsSinceEpoch ~/ 1000;
}
