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
| 会话 | `accessToken + refreshToken + session` |
| 管理后台 | Hono JSX + Pico.css CDN |

### API

所有认证接口都必须携带：
```
X-App-Key: <app_key>
X-App-Secret: <app_secret>
```

#### v1（兼容旧客户端）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册，返回 JWT |
| POST | `/api/v1/auth/login` | 登录，返回 JWT |
| POST | `/api/v1/auth/verify` | 验证 Token（需 `Authorization: Bearer <jwt>`） |
| POST | `/api/v1/auth/change-password` | 改密码，所有旧 Token 立即失效 |
| POST | `/api/v1/auth/logout` | 退出登录，服务端使 Token 失效 |
| POST | `/api/v1/auth/delete-account` | 删除账号（需重新校验密码） |

#### v2（当前推荐）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v2/auth/register` | 注册并创建当前 session，返回 access/refresh token |
| POST | `/api/v2/auth/login` | 登录并创建当前 session |
| POST | `/api/v2/auth/refresh` | 使用 refreshToken 换取新的 accessToken，并轮换 refreshToken |
| POST | `/api/v2/auth/verify` | 验证当前 accessToken 是否有效 |
| POST | `/api/v2/auth/logout` | 仅退出当前 session |
| POST | `/api/v2/auth/logout-all` | 退出当前用户全部 App / 全部设备 |
| POST | `/api/v2/auth/change-password` | 改密码并撤销所有旧会话，同时返回当前端新会话 |
| POST | `/api/v2/auth/delete-account` | 删除账号（需重新校验密码） |

v2 的用户体验变化：

- A App 登出不会影响 B App
- accessToken 默认 15 分钟，refreshToken 默认 30 天
- App 启动时通过 refresh 恢复登录态，而不是持久化 accessToken
- 管理后台重置密码、用户改密码、`logout-all` 都会同时让旧版 v1 token 和新版 v2 session 失效

### 本地开发

```bash
cd auth-worker
npm install
npx wrangler dev        # 启动本地开发服务器（自动使用本地 D1）
```

本地运行 `wrangler dev` 前需要准备 `JWT_SECRET`，推荐在 `auth-worker/.dev.vars` 中写入：

```bash
JWT_SECRET=your-local-dev-secret
```

### 部署新实例

```bash
# 1. 创建 D1 数据库，将输出的 database_id 填入 wrangler.toml
npx wrangler d1 create auth-db

# 2. 建表
npx wrangler d1 execute auth-db --remote --file=migrations/0001_initial.sql
npx wrangler d1 execute auth-db --remote --file=migrations/0002_users_integer_id.sql
npx wrangler d1 execute auth-db --remote --file=migrations/0003_sessions.sql

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

从 GitHub 引用（推荐）：

```yaml
dependencies:
  ar_auth:
    git:
      url: https://github.com/arsenalxj/ArAuth.git
      ref: d37953f
      path: ar_auth
```

或引用本地路径：

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

// 注册（user.userId 为 int，如 100001；同时创建当前 session）
final user = await auth.register('alice', 'password123');

// 登录
try {
  final user = await auth.login('alice', 'password123');
} on InvalidCredentialsException catch (e) {
  // 账号或密码错误
} on AccountLockedException catch (e) {
  // 登录失败次数过多，账号已锁定
}

// 验证当前 accessToken
final result = await auth.verify();

// 改密码（成功后自动撤销所有旧会话，并保留当前端新会话）
await auth.changePassword(oldPassword: 'password123', newPassword: 'newpass456');

// 退出全部设备
await auth.logoutAll();

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

SDK 当前行为：

- `accessToken` 仅保存在内存中，不持久化
- `refreshToken` 使用 `flutter_secure_storage` 持久化
- `init()` 会主动调用 `/api/v2/auth/refresh` 恢复登录态
- 遇到 `token_expired` 时，SDK 会自动 refresh 并重试原请求
- 遇到 `session_revoked`、`refresh_token_revoked`、`refresh_token_expired`、`account_disabled`、`user_not_found` 时，SDK 会清空本地状态并回到未登录态

### 异常体系

| 异常类 | 触发场景 |
|---|---|
| `InvalidRequestException` | 请求参数缺失或格式不合法 |
| `InvalidCredentialsException` | 账号或密码错误 |
| `AccountLockedException` | 连续失败 5 次，锁定 15 分钟 |
| `AccountDisabledException` | 管理员已禁用该账号 |
| `UsernameTakenException` | 注册时用户名已存在 |
| `WrongPasswordException` | 已登录用户改密码 / 删除账号时，输入的密码不正确 |
| `TokenException` | access / refresh token 无效或已过期 |
| `SessionTerminatedException` | 当前会话已失效，需要重新登录 |
| `NotInitializedException` | 在 `init()` 完成前调用了受保护接口 |
| `NetworkException` | 网络请求失败 |
| `AppAuthException` | App Key / Secret 无效或应用已禁用 |

---

## 安全说明

- 密码以 PBKDF2-SHA256（10 万次迭代 + 16 字节随机盐）存储，从不保存明文
- v2 使用短时效 accessToken + 可撤销 refreshToken + D1 session，支持精确失效单个会话
- 兼容期内保留 `token_version`，用于让旧版 `/api/v1/auth/*` token 在改密码、后台重置密码、`logout-all` 后也立即失效
- `app_secret` 同样经 PBKDF2 哈希后存入 D1
- 连续登录失败 5 次锁定账号 15 分钟
- 删除账号必须重新校验密码，防止 Token 泄露导致误删
- 管理后台用户列表展示活跃会话数和最近活跃时间，便于排查多端登录问题
