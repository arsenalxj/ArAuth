/// Public user identity exposed by the SDK.
class ArAuthUser {
  final int userId;
  final String username;
  final String sessionId;

  const ArAuthUser({
    required this.userId,
    required this.username,
    required this.sessionId,
  });

  factory ArAuthUser.fromAuthJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>;
    return ArAuthUser(
      userId: user['user_id'] as int,
      username: user['username'] as String,
      sessionId: json['session_id'] as String,
    );
  }

  factory ArAuthUser.fromStored({
    required int userId,
    required String username,
    required String sessionId,
  }) {
    return ArAuthUser(userId: userId, username: username, sessionId: sessionId);
  }

  ArAuthUser copyWith({
    int? userId,
    String? username,
    String? sessionId,
  }) {
    return ArAuthUser(
      userId: userId ?? this.userId,
      username: username ?? this.username,
      sessionId: sessionId ?? this.sessionId,
    );
  }

  @override
  String toString() => 'ArAuthUser(userId: $userId, username: $username, sessionId: $sessionId)';
}

class VerifyResult {
  final bool valid;
  final int userId;
  final String username;
  final String sessionId;

  const VerifyResult({
    required this.valid,
    required this.userId,
    required this.username,
    required this.sessionId,
  });

  factory VerifyResult.fromJson(Map<String, dynamic> json) {
    return VerifyResult(
      valid: json['valid'] as bool,
      userId: json['user_id'] as int,
      username: json['username'] as String,
      sessionId: json['session_id'] as String,
    );
  }
}
