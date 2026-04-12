# 统一认证登录系统（Cloudflare Workers + Flutter）

## Building

一个运行在 Cloudflare Workers 免费层上的统一认证服务，为用户自己开发的多个 Flutter 移动端 App 提供账号密码登录能力。用户跨 App 共享同一个账号池，一次注册到处可用。服务端同时内嵌一个管理后台，可以管理接入的 App（生成 app_key/app_secret）和用户（禁用/重置密码）。客户端提供独立的 Dart package `ar_auth`，Flutter 项目一行引入即可集成。

## Not building

- 权限/角色系统（RBAC）
- OAuth 第三方登录（Google / Apple / WeChat）
- 邮箱/短信验证
- 多租户数据隔离
- 密码找回（需要邮箱/短信通道，后续扩展）
- Refresh Token（7 天 JWT + 活跃续期即可）
- 审计日志（免费层 D1 写入有限）

---

## Approach

**Cloudflare Worker（Hono 框架）+ D1 + 内嵌管理后台 + 独立 Dart SDK**，单 Worker 部署搞定认证 API 和管理后台。

### 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Cloudflare Workers（免费层） | 全球边缘、零运维、免费额度够用 |
| 框架 | Hono | 官方推荐，<14KB，TS 原生支持 |
| 数据库 | Cloudflare D1（SQLite） | 免费层 5GB，结构化查询能力强 |
| 密码哈希 | Web Crypto PBKDF2（10 万次迭代） | Workers 原生支持，无需 bcrypt |
| 会话 | JWT (HMAC-SHA256) | 无状态，移动端友好 |
| 管理后台 | Hono JSX + 同一个 Worker | 零额外部署 |
| 客户端 | Dart package `ar_auth` | Flutter 项目直接引用 |

### 架构

```
┌─────────────────────────────────────────────┐
│        Cloudflare Worker (单一部署)          │
│                                             │
│  /api/v1/auth/*    公开 API（App 调用）      │
│    POST /register         注册              │
│    POST /login            登录 → JWT         │
│    POST /verify           验证 Token         │
│    POST /change-password  改密码             │
│    POST /logout           退出登录           │
│    POST /delete-account   删除账号           │
│                                             │
│  /admin/*          管理后台 (HTML + API)     │
│    GET  /admin/login                        │
│    GET  /admin/apps    /admin/users         │
│    POST /admin/api/*   (需管理员 JWT)        │
│                                             │
│  中间件：CORS / App 鉴权 / 管理员鉴权 / 限流  │
└──────────────────┬──────────────────────────┘
                   │
              ┌────▼────┐
              │    D1   │
              │ apps    │
              │ users   │
              │ admins  │
              └─────────┘
```

---

## Key decisions

### 1. 用户跨 App 共享，而非每 App 独立

一个 `username` 在整个系统全局唯一，用户只要注册一次就能登录所有接入的 App。**理由**：用户自己开发的这些 App 是同一个人名下的产品线，共享用户池能大幅降低用户心智成本；同时数据库设计更简单，不需要 `user_apps` 关联表。

### 2. JWT 失效用 `token_version` 字段，而非黑名单

`users` 表加 `token_version` 列，JWT payload 带 `tv` 字段；`verify` 时与 DB 中的 `token_version` 比对，不一致则拒绝。退出登录/改密码 → `token_version +1`，所有旧 Token 立即作废。**理由**：JWT 原本无状态，加黑名单会引入额外存储和查询；`token_version` 方案每次 `verify` 本来就要查用户，零额外成本。

### 3. 密码哈希用 PBKDF2 而非 bcrypt

Cloudflare Workers 运行时不支持 bcrypt（需要原生代码），但 Web Crypto API 原生支持 PBKDF2-SHA256。**理由**：10 万次迭代的 PBKDF2 对攻击者仍有足够阻力，且零依赖；bcrypt 在 Workers 上要么跑不动，要么需要 WASM 增加冷启动。

### 4. 管理后台与认证服务合并部署

管理后台用 Hono JSX + Pico.css（CDN）直接在同一个 Worker 内渲染 HTML，不单独起前端项目。**理由**：免费层 Worker 有请求数限制，但管理后台访问量极低；合并部署零构建、零额外配置，符合"轻量"目标。

### 5. 删除账号必须重新校验密码

`POST /api/v1/auth/delete-account` 要求同时提供 `password`，不能只凭 JWT 删除。**理由**：App Store/Google Play 合规要求账号删除功能，但也要防止 Token 泄露导致误删；重新校验密码是业界标准做法。

---

## 数据库设计（D1）

```sql
-- 接入的 App
CREATE TABLE apps (
  id          TEXT PRIMARY KEY,        -- UUID
  name        TEXT NOT NULL,
  app_key     TEXT NOT NULL UNIQUE,    -- 公开标识
  app_secret  TEXT NOT NULL,           -- 密钥（PBKDF2 存储）
  status      INTEGER DEFAULT 1,       -- 1=启用 0=禁用
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_apps_key ON apps(app_key);

-- 跨 App 共享的用户池
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  status        INTEGER DEFAULT 1,
  failed_count  INTEGER DEFAULT 0,     -- 防暴力破解
  locked_until  TEXT,                  -- 锁定到期时间
  token_version INTEGER DEFAULT 1,     -- 退出登录时 +1，让旧 JWT 失效
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_username ON users(username);

-- 管理员表（与普通用户隔离）
CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

---

## API 设计

所有 `/api/v1/auth/*` 请求需要在 Header 带：
```
X-App-Key: <app_key>
X-App-Secret: <app_secret>
```

### 注册 `POST /api/v1/auth/register`
```json
// req
{ "username": "alice", "password": "xxx" }
// resp
{ "user_id": "uuid", "token": "jwt...", "expires_in": 604800 }
```

### 登录 `POST /api/v1/auth/login`
```json
// req
{ "username": "alice", "password": "xxx" }
// resp
{ "user_id": "uuid", "token": "jwt...", "expires_in": 604800 }
```

### 验证 `POST /api/v1/auth/verify`
```
Header: Authorization: Bearer <jwt>
// resp
{ "valid": true, "user_id": "uuid", "username": "alice" }
```

### 改密码 `POST /api/v1/auth/change-password`
```json
{ "old_password": "xxx", "new_password": "yyy" }
```
改密码成功后自动 `token_version +1`，其他设备上的 Token 立即失效。

### 退出登录 `POST /api/v1/auth/logout`
```
Header: Authorization: Bearer <jwt>
// resp
{ "success": true }
```
服务端将对应用户的 `token_version +1`，该用户所有已签发的 JWT 立即失效。SDK 同时清除本地 Token。

### 删除账号 `POST /api/v1/auth/delete-account`
```json
// req
{ "password": "xxx" }   // 必须校验密码防止误操作
// resp
{ "success": true }
```
服务端**硬删除** `users` 表记录；相关 JWT 因用户不存在自然失效。

---

## 安全策略

1. **密码哈希**：PBKDF2-SHA256，10 万次迭代，16 字节随机盐
2. **密码强度**：最少 8 位，前端 + 后端双重校验
3. **防暴力破解**：连续失败 5 次锁定账号 15 分钟
4. **JWT**：HMAC-SHA256，密钥存 `wrangler secret`（`JWT_SECRET`），有效期 7 天；payload 带 `tv`
5. **JWT 失效**：`token_version` 机制，退出/改密码 +1，删除账号时记录消失
6. **App 鉴权**：`app_secret` 在 DB 中以 PBKDF2 哈希存储
7. **CORS**：移动端不需要；管理后台限制到固定域名
8. **管理员与用户隔离**：独立表、独立 JWT `type` 字段
9. **删除账号防误操作**：必须重新校验密码

---

## 管理后台功能

- 管理员登录页
- **Apps 管理**：列表、新建（生成 app_key/app_secret 并一次性显示）、启用/禁用、删除
- **Users 管理**：列表、搜索、禁用、重置密码
- 简单统计：用户总数、App 总数、最近注册

UI 用 Hono JSX 渲染，CSS 用 Pico.css（CDN 引入，零构建）。

---

## Flutter SDK（`ar_auth` Dart package）

**项目结构**：
```
ar_auth/
├── lib/
│   ├── ar_auth.dart            # 对外导出
│   └── src/
│       ├── client.dart          # ArAuth 主类
│       ├── models.dart          # User, AuthResult 等
│       ├── storage.dart         # Token 本地存储
│       └── exceptions.dart      # 自定义异常
├── pubspec.yaml
└── README.md
```

**依赖**：`http`、`shared_preferences`

**使用示例**：
```dart
final auth = ArAuth(
  baseUrl: 'https://auth.example.workers.dev',
  appKey: 'xxx',
  appSecret: 'yyy',
);

// 启动时恢复登录状态
await auth.init();
if (auth.isLoggedIn) { /* 跳主页 */ }

// 登录
try {
  final user = await auth.login('alice', 'password');
} on ArAuthException catch (e) {
  // e.code: invalid_credentials / account_locked / network_error
}

// 改密码
await auth.changePassword(oldPassword: 'xxx', newPassword: 'yyy');

// 退出登录（调服务端让 Token 失效 + 清本地）
await auth.logout();

// 删除账号（App Store 合规）
await auth.deleteAccount(password: 'xxx');
```

**SDK 职责**：
- 封装 HTTP 调用，自动带 `X-App-Key` / `X-App-Secret`
- Token 持久化（`SharedPreferences`）
- Token 过期自动清理
- 统一异常体系
- 提供 `ChangeNotifier` 风格的登录状态监听（便于 Provider/Riverpod）

---

## 项目结构

```
auth-worker/
├── src/
│   ├── index.ts              # Hono app 入口
│   ├── routes/
│   │   ├── auth.ts           # /api/v1/auth/*
│   │   └── admin.ts          # /admin/*
│   ├── middleware/
│   │   ├── app-auth.ts       # 验证 X-App-Key/Secret
│   │   ├── admin-auth.ts     # 验证管理员 JWT
│   │   └── rate-limit.ts     # 简单限流（基于 IP）
│   ├── lib/
│   │   ├── crypto.ts         # PBKDF2 + 随机 salt
│   │   ├── jwt.ts            # JWT 签发/验证
│   │   └── db.ts             # D1 查询封装
│   ├── views/
│   │   ├── layout.tsx
│   │   ├── login.tsx
│   │   ├── apps.tsx
│   │   └── users.tsx
│   └── types.ts
├── migrations/
│   └── 0001_initial.sql
├── wrangler.toml
├── package.json
└── tsconfig.json

ar_auth/                     # Flutter SDK（独立仓库或 monorepo 子目录）
└── ...（见上）
```

---

## 实施步骤

1. **初始化 Worker 项目**：`npm create hono@latest auth-worker`，选 `cloudflare-workers` 模板
2. **创建 D1 数据库**：`wrangler d1 create auth-db`，把 `database_id` 写入 `wrangler.toml`
3. **执行 migration**：`wrangler d1 execute auth-db --file=migrations/0001_initial.sql`
4. **设置 secrets**：`wrangler secret put JWT_SECRET`
5. **实现 `src/lib/`**：crypto.ts（PBKDF2）、jwt.ts（HMAC-SHA256）、db.ts（D1 查询）
6. **实现中间件**：app-auth、admin-auth、rate-limit
7. **实现 `/api/v1/auth/*`**：register / login / verify / change-password / logout / delete-account
8. **实现 `/admin/*`**：login 页面 + apps/users CRUD
9. **本地测试**：`wrangler dev`
10. **部署**：`wrangler deploy`
11. **创建首个管理员**：通过 `wrangler d1 execute` 手动插入一条 `admins` 记录
12. **开发 Flutter SDK**：`ar_auth` package，包含示例 app
13. **端到端联调**：示例 app 跑一遍 注册→登录→验证→改密码→退出→删除账号

---

## 验证方案

### Worker 端
- **单元测试**：`vitest` + `@cloudflare/vitest-pool-workers`，测 crypto、jwt、db 查询
- **本地集成测试**：`wrangler dev --local`，用 curl 跑一遍完整流程
- **关键用例**：
  - 注册同名用户应失败
  - 密码错 5 次应锁定 15 分钟
  - 过期 JWT 应拒绝
  - 错误的 app_secret 应拒绝
  - 禁用的 App 应拒绝所有请求
  - 禁用的用户无法登录
  - logout 后旧 Token 立即失效（verify 返回 401）
  - 改密码后所有旧 Token 失效
  - deleteAccount 必须校验密码；删除后 verify 旧 Token 返回 401

### Flutter SDK
- 示例 App：登录 + 保持登录状态 + 退出 + 改密码 + 删除账号
- Token 持久化：重启 App 后仍然登录
- 网络异常场景：断网时抛出正确的异常类型

### 管理后台
- 手动走一遍：新建 App → 一次性复制密钥 → 在示例 App 中使用 → 回后台看到新用户 → 禁用用户 → 确认该用户无法登录

---

## 关键文件清单

| 文件 | 作用 |
|---|---|
| `auth-worker/src/index.ts` | Hono 入口，挂载路由和中间件 |
| `auth-worker/src/lib/crypto.ts` | PBKDF2 密码哈希 |
| `auth-worker/src/lib/jwt.ts` | JWT 签发/验证（带 token_version 校验） |
| `auth-worker/src/routes/auth.ts` | 公开认证 API |
| `auth-worker/src/routes/admin.ts` | 管理后台路由 |
| `auth-worker/migrations/0001_initial.sql` | D1 建表 |
| `auth-worker/wrangler.toml` | Workers + D1 配置 |
| `ar_auth/lib/src/client.dart` | SDK 核心类 |
| `ar_auth/lib/src/storage.dart` | Token 本地存储 |

---

## Unknowns

- **密码找回**：deferred，需要邮箱/短信通道才能实现，owner 待定
- **审计日志**：deferred，免费层 D1 写入量有限，后续用 Cloudflare Analytics Engine，owner 待定
- **Refresh Token**：deferred，当前 7 天 JWT + 活跃用户自动续期已够用，owner 待定
