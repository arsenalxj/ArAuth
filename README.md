# ArAuth

运行在 Cloudflare Workers 免费层上的统一认证服务，为多个 Flutter 移动端 App 提供账号密码登录能力。用户跨 App 共享同一账号池，一次注册到处可用。

---

## 项目结构

```
auth-worker/   Cloudflare Worker（Hono + D1）— 认证 API + 管理后台
ar_auth/       Flutter Dart SDK — 客户端封装包
```

---

## auth-worker

### 技术栈

| 层 | 选型 |
|---|---|
| 运行时 | Cloudflare Workers（免费层） |
| 框架 | Hono v4 |
| 数据库 | Cloudflare D1（SQLite） |
| 密码哈希 | PBKDF2-SHA256，10 万次迭代 |
| 会话 | JWT（HMAC-SHA256），7 天有效期 |
| 管理后台 | Hono JSX + Pico.css CDN |

### API

所有 `/api/v1/auth/*` 请求必须携带：
```
X-App-Key: <app_key>
X-App-Secret: <app_secret>
```

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册，返回 JWT |
| POST | `/api/v1/auth/login` | 登录，返回 JWT |
| POST | `/api/v1/auth/verify` | 验证 Token（需 `Authorization: Bearer <jwt>`） |
| POST | `/api/v1/auth/change-password` | 改密码，所有旧 Token 立即失效 |
| POST | `/api/v1/auth/logout` | 退出登录，服务端使 Token 失效 |
| POST | `/api/v1/auth/delete-account` | 删除账号（需重新校验密码） |

### 本地开发

```bash
cd auth-worker
npm install
npx wrangler dev        # 启动本地开发服务器（自动使用本地 D1）
```

### 部署新实例

```bash
# 1. 创建 D1 数据库，将输出的 database_id 填入 wrangler.toml
npx wrangler d1 create auth-db

# 2. 建表
npx wrangler d1 execute auth-db --remote --file=migrations/0001_initial.sql

# 3. 设置 JWT 密钥
npx wrangler secret put JWT_SECRET

# 4. 部署
npx wrangler deploy

# 5. 创建首个管理员（仅可调用一次，之后返回 admin_exists）
curl -X POST https://<your-worker>.workers.dev/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password","init_key":""}'
```

---

## ar_auth（Flutter SDK）

### 安装

在 `pubspec.yaml` 中引用本地路径（或发布到 pub.dev 后用包名引入）：

```yaml
dependencies:
  ar_auth:
    path: ../ar_auth
```

### 使用

```dart
import 'package:ar_auth/ar_auth.dart';

final auth = ArAuth(
  baseUrl: 'https://auth-worker.arsenalxj.workers.dev',
  appKey: 'ark_xxxxxxxx',
  appSecret: 'ars_xxxxxxxxxxxxxxxxxxxxxxxx',
);

// App 启动时恢复登录状态
await auth.init();
if (auth.isLoggedIn) { /* 跳转主页 */ }

// 注册
final user = await auth.register('alice', 'password123');

// 登录
try {
  final user = await auth.login('alice', 'password123');
} on InvalidCredentialsException catch (e) {
  // 账号或密码错误
} on AccountLockedException catch (e) {
  // 登录失败次数过多，账号已锁定
}

// 改密码（成功后自动退出所有其他设备）
await auth.changePassword(oldPassword: 'password123', newPassword: 'newpass456');

// 退出登录
await auth.logout();

// 删除账号（App Store / Google Play 合规要求）
await auth.deleteAccount(password: 'password123');
```

### 与 Provider 集成

`ArAuth` 继承自 `ChangeNotifier`，可直接作为 Provider 使用：

```dart
ChangeNotifierProvider(create: (_) => ArAuth(...))

// 在 Widget 中监听登录状态
final isLoggedIn = context.watch<ArAuth>().isLoggedIn;
```

### 异常体系

| 异常类 | 触发场景 |
|---|---|
| `InvalidCredentialsException` | 账号或密码错误 |
| `AccountLockedException` | 连续失败 5 次，锁定 15 分钟 |
| `AccountDisabledException` | 管理员已禁用该账号 |
| `UsernameTakenException` | 注册时用户名已存在 |
| `WeakPasswordException` | 密码不足 8 位 |
| `TokenException` | JWT 无效或已过期 |
| `NetworkException` | 网络请求失败 |
| `AppAuthException` | App Key / Secret 无效或应用已禁用 |

---

## 安全说明

- 密码以 PBKDF2-SHA256（10 万次迭代 + 16 字节随机盐）存储，从不保存明文
- JWT 携带 `token_version` 字段，退出登录 / 改密码时服务端递增版本号，旧 Token 立即失效
- `app_secret` 同样经 PBKDF2 哈希后存入 D1
- 连续登录失败 5 次锁定账号 15 分钟
- 删除账号必须重新校验密码，防止 Token 泄露导致误删
