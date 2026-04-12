/// Base exception for all ArAuth errors.
class ArAuthException implements Exception {
  final String code;
  final String message;

  const ArAuthException(this.code, this.message);

  @override
  String toString() => 'ArAuthException[$code]: $message';
}

/// Invalid username or password.
class InvalidCredentialsException extends ArAuthException {
  const InvalidCredentialsException([String message = 'Invalid username or password'])
      : super('invalid_credentials', message);
}

/// Account is temporarily locked due to too many failed attempts.
class AccountLockedException extends ArAuthException {
  const AccountLockedException([String message = 'Account is temporarily locked'])
      : super('account_locked', message);
}

/// Account has been disabled by an administrator.
class AccountDisabledException extends ArAuthException {
  const AccountDisabledException([String message = 'Account has been disabled'])
      : super('account_disabled', message);
}

/// Username is already taken during registration.
class UsernameTakenException extends ArAuthException {
  const UsernameTakenException([String message = 'Username is already taken'])
      : super('username_taken', message);
}

/// Password does not meet minimum requirements.
class WeakPasswordException extends ArAuthException {
  const WeakPasswordException([String message = 'Password must be at least 8 characters'])
      : super('weak_password', message);
}

/// JWT token is invalid or has expired.
class TokenException extends ArAuthException {
  const TokenException([String code = 'invalid_token', String message = 'Token is invalid or expired'])
      : super(code, message);
}

/// Network or HTTP transport error.
class NetworkException extends ArAuthException {
  const NetworkException([String message = 'Network error, please check your connection'])
      : super('network_error', message);
}

/// The app key or secret is invalid.
class AppAuthException extends ArAuthException {
  const AppAuthException([String message = 'Invalid app credentials'])
      : super('invalid_app', message);
}
