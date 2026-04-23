class ArAuthException implements Exception {
  final String code;
  final String message;

  const ArAuthException(this.code, this.message);

  @override
  String toString() => 'ArAuthException[$code]: $message';
}

class InvalidRequestException extends ArAuthException {
  const InvalidRequestException([String message = 'Request payload is invalid'])
      : super('invalid_request', message);
}

class InvalidCredentialsException extends ArAuthException {
  const InvalidCredentialsException([String message = 'Invalid username or password'])
      : super('invalid_credentials', message);
}

class AccountLockedException extends ArAuthException {
  const AccountLockedException([String message = 'Account is temporarily locked'])
      : super('account_locked', message);
}

class AccountDisabledException extends ArAuthException {
  const AccountDisabledException([String message = 'Account has been disabled'])
      : super('account_disabled', message);
}

class UsernameTakenException extends ArAuthException {
  const UsernameTakenException([String message = 'Username is already taken'])
      : super('username_taken', message);
}

class WrongPasswordException extends ArAuthException {
  const WrongPasswordException([String message = 'Password is incorrect'])
      : super('wrong_password', message);
}

class TokenException extends ArAuthException {
  const TokenException([String code = 'invalid_token', String message = 'Token is invalid'])
      : super(code, message);
}

class SessionTerminatedException extends ArAuthException {
  const SessionTerminatedException([String code = 'session_revoked', String message = 'Session has ended'])
      : super(code, message);
}

class NotInitializedException extends ArAuthException {
  const NotInitializedException([String message = 'Call init() before using protected APIs'])
      : super('not_initialized', message);
}

class NetworkException extends ArAuthException {
  const NetworkException([String message = 'Network error, please retry'])
      : super('network_error', message);
}

class AppAuthException extends ArAuthException {
  const AppAuthException([String message = 'Invalid app credentials'])
      : super('invalid_app', message);
}
