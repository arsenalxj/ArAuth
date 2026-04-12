/// ArAuth Flutter SDK
///
/// Provides unified authentication for Flutter apps backed by ArAuth Worker.
///
/// ```dart
/// final auth = ArAuth(
///   baseUrl: 'https://auth.example.workers.dev',
///   appKey: 'ark_xxx',
///   appSecret: 'ars_yyy',
/// );
/// await auth.init();
/// ```
library ar_auth;

export 'src/client.dart' show ArAuth;
export 'src/models.dart' show ArAuthUser, VerifyResult;
export 'src/exceptions.dart'
    show
        ArAuthException,
        InvalidCredentialsException,
        AccountLockedException,
        AccountDisabledException,
        UsernameTakenException,
        WeakPasswordException,
        TokenException,
        NetworkException,
        AppAuthException;
export 'src/storage.dart' show TokenStorage, StoredSession;
