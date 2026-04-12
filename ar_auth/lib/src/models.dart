/// The authenticated user returned after login or register.
class ArAuthUser {
  final String userId;
  final String username;
  final String token;
  final int expiresIn;

  const ArAuthUser({
    required this.userId,
    required this.username,
    required this.token,
    required this.expiresIn,
  });

  factory ArAuthUser.fromJson(Map<String, dynamic> json, String username) {
    return ArAuthUser(
      userId: json['user_id'] as String,
      username: username,
      token: json['token'] as String,
      expiresIn: json['expires_in'] as int,
    );
  }

  @override
  String toString() => 'ArAuthUser(userId: $userId, username: $username)';
}

/// Result of token verification.
class VerifyResult {
  final bool valid;
  final String userId;
  final String username;

  const VerifyResult({
    required this.valid,
    required this.userId,
    required this.username,
  });

  factory VerifyResult.fromJson(Map<String, dynamic> json) {
    return VerifyResult(
      valid: json['valid'] as bool,
      userId: json['user_id'] as String,
      username: json['username'] as String,
    );
  }
}
