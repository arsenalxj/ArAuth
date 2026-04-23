# ar_auth

ArAuth Flutter SDK（v2 会话模型）：
- `accessToken` 仅保存在内存
- `refreshToken` 仅保存在安全存储
- 应用冷启动通过 refresh 自动恢复登录态

## 安装

```yaml
dependencies:
  ar_auth:
    git:
      url: https://github.com/arsenalxj/ArAuth.git
      ref: main
      path: ar_auth
```

## 基础用法

```dart
import 'package:ar_auth/ar_auth.dart';

final auth = ArAuth(
  baseUrl: 'https://auth-worker.example.com',
  appKey: 'ark_xxx',
  appSecret: 'ars_xxx',
);

await auth.init();

if (!auth.isLoggedIn) {
  await auth.login('alice', 'password123');
}

final verify = await auth.verify();
print(verify.valid);
```

## 外部受保护请求（如 STS Worker）

当你在 SDK 外部发起请求（例如同步 Worker、私有业务网关），可以使用：

```dart
final headers = await auth.buildAuthorizationHeaders(
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  minValidity: const Duration(seconds: 30),
);

final response = await http.post(
  Uri.parse('https://sync-worker.example.com/sts/token'),
  headers: headers,
  body: jsonEncode({'namespace_hash': '...'}),
);
```

### 行为说明

- `init()` 完成前调用会抛出 `NotInitializedException`
- 当 accessToken 不存在或将过期（`minValidity`）时，会先自动 refresh
- 会话不可恢复时抛 `SessionTerminatedException`
- 网络问题抛 `NetworkException`

## 安全注意事项

- `buildAuthorizationHeaders()` 只返回本次请求需要的 `Authorization` 头
- SDK 不暴露 refreshToken
- 不建议业务层持久化 accessToken
