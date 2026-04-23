# Access + Refresh + Session 认证改造方案

## 目标

把当前基于单 JWT + `token_version` 的登录模型，升级为 `accessToken + refreshToken + session` 三层模型，解决多 App 共用账号体系下的会话互相干扰问题。

本次改造要达成的结果：

- A App 登出后，B App 不受影响
- 同一 App 的两台设备可以独立登录、独立登出
- 支持“退出当前会话”和“退出全部设备”两种能力
- accessToken 泄露时影响窗口短
- 后续能支持设备管理、最近活跃时间、异常会话下线

## 不做什么

- 不引入 OAuth 第三方登录
- 不引入邮箱或短信验证码
- 不新增外部缓存或消息队列
- 不把 refreshToken 设计成 JWT
- 不在本次改造中重做管理后台 UI，仅补齐必要的数据展示语义

---

## 结论

采用以下组合：

- `accessToken`：短时效 JWT，默认 15 分钟
- `refreshToken`：长期随机串，默认 30 天
- `session`：D1 持久化会话记录，按“用户 + App + 设备实例”隔离

这套方案优于继续扩展 `token_version` 的原因：

- `token_version` 是“整个人”的全局开关，不适合“仅退出当前 App/设备”
- 你要解决的问题本质是“精确撤销单个会话”，最直接的结构就是 `session`
- refreshToken 必须可撤销，做成随机串 + 数据库存储最稳，不会重新掉回“JWT 不好精确失效”的坑

---

## 用户体验影响

### 用户得到的好处

- 在 A App 点退出，只退出 A 当前设备，不会把 B App 一起踢下线
- accessToken 过期后，App 可自动静默刷新，用户大多数情况下无感
- 改密码后可以安全地下线所有旧设备，防止账号被继续使用
- 后续管理后台可以显示“当前活跃设备数”和“最近活跃时间”，用户问题更容易排查

### 用户要接受的变化

- App 冷启动时会多一次 refresh 请求，用来恢复登录态
- refreshToken 失效后，用户会被要求重新登录
- 如果改密码，所有旧会话会被撤销；为了体验一致，当前设备应直接拿到新会话，不要把用户自己也踢下线

---

## 核心设计

### 1. accessToken

- 格式：JWT，`HS256`
- 有效期：15 分钟
- 存储位置：仅内存，不持久化；应用重启后由 refresh 恢复
- 用途：访问受保护接口
- 特点：短期、轻量、频繁签发

建议 payload：

```json
{
  "sub": "100001",
  "username": "alice",
  "sid": "sess_xxx",
  "aid": "app_xxx",
  "type": "access",
  "iat": 1713859200,
  "exp": 1713860100
}
```

字段含义：

- `sub`：用户 ID
- `username`：用户名，减少接口层重复查表时的辅助信息
- `sid`：session ID，用于把 accessToken 绑定到具体会话
- `aid`：app ID，用于校验 token 不能跨 App 使用
- `type`：明确 token 类型，防止 refresh/access 混用

### 2. refreshToken

- 格式：随机字符串，不是 JWT
- 有效期：30 天
- 存储位置：客户端安全存储
- 用途：换取新的 accessToken，必要时轮换 refreshToken
- 特点：长期、强可撤销、必须服务端持久化

推荐格式：

```text
<session_id>.<secret>
```

设计原因：

- `session_id` 用来快速定位记录
- `secret` 只在客户端保存，服务端只保存它的哈希
- 即使数据库泄露，也不会直接泄露 refreshToken 明文

### 3. session

每次 `login` 或 `register` 成功后创建一条新 session。session 是整套模型的中心。

session 的职责：

- 表示一个独立登录实例
- 决定当前 refreshToken 是否仍然有效
- 为 accessToken 提供精确的失效依据
- 为管理后台提供设备和活跃信息

session 粒度：

- 同一用户在 A App 登录一次，生成一条 session
- 同一用户在 B App 登录一次，再生成一条 session
- 同一用户在 A App 的第二台设备登录，再生成第三条 session

这意味着：

- A 当前设备 logout，只会撤销对应那一条 session
- B App 和 A 的其他设备都不会受影响

---

## 数据库设计

### users 表调整

保留 `users` 表现有结构，但 `token_version` 不再参与 `/api/v2/auth/*` 的普通鉴权。

`token_version` 的处理规则：

- 兼容期内保留字段，避免影响 `/api/v1/auth/*`
- 新接口全部基于 `session` 判定
- 兼容期内，凡是语义上需要“让其他已登录端失效”的操作，必须同时执行 `token_version + 1`
- 这类操作至少包括：`/api/v2/auth/logout-all`、`/api/v2/auth/change-password`、管理员后台重置密码
- 等所有客户端完成迁移后，再决定是否删除该字段

### 新增 sessions 表

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  app_id             TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active',
  device_name        TEXT,
  client_build       TEXT,
  last_seen_at       TEXT DEFAULT (datetime('now')),
  expires_at         TEXT NOT NULL,
  revoked_at         TEXT,
  revoke_reason      TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, -- 需配合 PRAGMA foreign_keys = ON 才生效；delete-account 应同时显式 DELETE sessions 作为主要保障
  FOREIGN KEY (app_id) REFERENCES apps(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status
ON sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_app_status
ON sessions(app_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions(expires_at);
```

字段说明：

- `id`：session 主键，格式 `sess_` + 32 字节 crypto random（hex 编码），Worker 中用 `crypto.getRandomValues` 生成
- `user_id`：归属用户
- `app_id`：归属 App，来自 `X-App-Key` 验证后的 app
- `refresh_token_hash`：refresh secret 的哈希值
- `status`：`active` / `revoked`
- `device_name`：客户端上传，可选，例如 `iPhone 15 Pro`
- `client_build`：客户端版本号，可选，便于排查
- `last_seen_at`：最近活跃时间，只在 refresh 成功时更新
- `expires_at`：refreshToken 绝对到期时间
- `revoked_at`：撤销时间
- `revoke_reason`：撤销原因，例如 `logout`、`logout_all`、`password_changed`

### 是否需要单独的设备表

本次不需要。

原因：

- 当前目标是“精确撤销会话”，session 已能完整表达
- 设备表会引入额外同步问题，例如一个设备多个会话、匿名设备名变化
- 真需要“设备管理”时，也可以从 session 直接聚合出来

---

## API 设计

保留现有 `/api/v1/auth/*`，新增 `/api/v2/auth/*`。新客户端走 v2，老客户端继续走 v1。

所有 `/api/v2/auth/*` 请求仍需要：

```text
X-App-Key: <app_key>
X-App-Secret: <app_secret>
```

Worker 路由挂载要求：

- 在 `auth-worker/src/index.ts` 中新增 `/api/v2/auth/*` 的 `appAuth` 中间件挂载
- `register`、`login`、`verify`、`logout`、`logout-all`、`change-password`、`delete-account` 继续走 IP 维度 `rateLimit`
- `refresh` 不挂 IP 限速，避免冷启动恢复和并发刷新时被误伤
- 新增 `app.route('/api/v2/auth', authRoutesV2)` 或等价挂载方式，确保路由真正对外可用

### 1. `POST /api/v2/auth/register`

用途：

- 创建用户
- 自动创建当前 session
- 返回第一组 access/refresh token

请求：

```json
{
  "username": "alice",
  "password": "password123",
  "device_name": "iPhone 15 Pro",
  "client_build": "1.2.0+45"
}
```

响应：

```json
{
  "user": {
    "user_id": 100001,
    "username": "alice"
  },
  "session_id": "sess_xxx",
  "access_token": "jwt...",
  "access_expires_in": 900,
  "refresh_token": "sess_xxx.secret_xxx",
  "refresh_expires_in": 2592000
}
```

### 2. `POST /api/v2/auth/login`

用途：

- 用户名密码登录
- 每次成功登录都创建新 session

请求与响应结构同 `register`。

### 3. `POST /api/v2/auth/refresh`

用途：

- 使用 refreshToken 刷新 accessToken
- 建议同时轮换 refreshToken

请求：

```json
{
  "refresh_token": "sess_xxx.secret_xxx"
}
```

响应：

```json
{
  "session_id": "sess_xxx",
  "access_token": "jwt...",
  "access_expires_in": 900,
  "refresh_token": "sess_xxx.secret_yyy",
  "refresh_expires_in": 2592000
}
```

刷新规则：

- 必须找到对应 session
- session 必须为 `active`
- session 不能过期
- 当前请求 app 必须与 session.app_id 一致
- refresh secret 哈希必须匹配
- session 对应的用户必须仍然存在且未被禁用
- 成功后更新 `refresh_token_hash`、`last_seen_at`、`expires_at`

### 4. `POST /api/v2/auth/verify`

用途：

- 验证当前 accessToken 是否有效

Header：

```text
Authorization: Bearer <access_token>
```

响应：

```json
{
  "valid": true,
  "user_id": 100001,
  "username": "alice",
  "session_id": "sess_xxx"
}
```

校验规则：

- accessToken 签名合法、未过期、`type=access`
- `sid` 对应 session 存在且 `status=active`
- session 未过期（`expires_at > datetime('now')`）
- `aid` 必须等于当前请求 app
- 用户存在且未禁用

### 5. `POST /api/v2/auth/logout`

用途：

- 退出当前 session

请求：

```json
{
  "refresh_token": "sess_xxx.secret_xxx"
}
```

响应：

```json
{
  "success": true
}
```

行为：

- 解析 refreshToken，取出 session_id，查找对应 session
- 校验 refresh secret 哈希匹配
- 校验 session.app_id 等于当前请求 app（防止跨 App 撤销他人 session）
- 把对应 session 标记为 `revoked`
- `revoke_reason='logout'`
- 只影响当前这一条 session
- `logout` 按幂等接口设计：如果 session 不存在（已被清理）、已被撤销、已过期，或 refreshToken 已轮换导致 secret 不匹配，只要请求格式合法，仍返回 `{ "success": true }`
- 客户端无论服务端返回何种可恢复结果，都必须清空本地会话状态

### 6. `POST /api/v2/auth/logout-all`

用途：

- 当前用户退出全部设备和全部 App

Header：

```text
Authorization: Bearer <access_token>
```

响应：

```json
{
  "success": true,
  "revoked_sessions": 5
}
```

行为：

- 撤销该用户所有 `status='active' AND expires_at > datetime('now')` 的 session
- `revoke_reason='logout_all'`
- 兼容期内同时执行 `users.token_version = token_version + 1`，确保旧版 `/api/v1/auth/*` token 也立即失效

### 7. `POST /api/v2/auth/change-password`

用途：

- 修改密码
- 撤销全部旧会话
- 给当前调用方签发一套新会话，避免用户自己被踢下线

Header：

```text
Authorization: Bearer <access_token>
```

请求：

```json
{
  "old_password": "old123456",
  "new_password": "new12345678",
  "device_name": "iPhone 15 Pro",
  "client_build": "1.2.0+45"
}
```

响应：

```json
{
  "success": true,
  "session_id": "sess_new",
  "access_token": "jwt...",
  "access_expires_in": 900,
  "refresh_token": "sess_new.secret_new",
  "refresh_expires_in": 2592000
}
```

行为：

- 验证当前 accessToken 与用户身份
- 校验旧密码
- 更新密码哈希
- 撤销用户所有旧 session，`revoke_reason='password_changed'`
- 兼容期内同时执行 `users.token_version = token_version + 1`，确保旧版 `/api/v1/auth/*` token 立即失效
- 立刻创建一个新的当前 session 并返回

### 8. `POST /api/v2/auth/delete-account`

用途：

- 删除账号前二次确认

Header：

```text
Authorization: Bearer <access_token>
```

请求：

```json
{
  "password": "password123"
}
```

行为：

- 校验 accessToken
- 校验密码
- 显式 `DELETE FROM sessions WHERE user_id = ?`（主要保障，不依赖 CASCADE）
- 删除用户

---

## 错误码约定

所有 v2 接口在出错时返回统一格式：

```json
{
  "error": "<error_code>",
  "message": "<human readable>"
}
```

HTTP 状态码与 error_code 对照：

| HTTP | error_code | 触发场景 |
|------|-----------|---------|
| 400 | `invalid_request` | 请求体缺少必填字段或格式错误 |
| 401 | `invalid_credentials` | `login` 时用户名不存在或密码错误；始终返回同一错误码，避免用户名枚举 |
| 401 | `invalid_token` | accessToken 签名非法或结构错误 |
| 401 | `token_expired` | accessToken 已过期 |
| 401 | `session_revoked` | accessToken 对应 session 已失效；包括已被撤销或已自然过期 |
| 401 | `invalid_refresh_token` | `refresh` 端点：refreshToken 对应 session 不存在或 secret 不匹配；`logout` 不返回此错误（走幂等路径） |
| 401 | `refresh_token_revoked` | refreshToken 对应 session 已被撤销 |
| 401 | `refresh_token_expired` | refreshToken 已过期 |
| 401 | `wrong_password` | 已认证用户在 `change-password` 或 `delete-account` 中提交的密码校验失败 |
| 403 | `account_disabled` | 用户已被管理员禁用；用于 `login`、`verify`、`refresh` 等需要检查用户状态的场景 |
| 403 | `app_mismatch` | token 的 app_id 与请求 app 不一致 |
| 403 | `account_locked` | 账号因暴力破解被临时锁定 |
| 404 | `user_not_found` | 已认证后的用户查询目标不存在；不用于 `login` |
| 409 | `username_taken` | 注册时用户名已被占用 |
| 429 | `rate_limited` | 请求频率超出限制 |

Flutter SDK 自动刷新逻辑只监听 `token_expired` 触发 refresh。

以下错误在 SDK 使用“本地已保存的当前会话凭证”时，视为当前会话已不可恢复，客户端应直接清空本地会话并回到登录态：

- `session_revoked`
- `invalid_refresh_token`
- `refresh_token_revoked`
- `refresh_token_expired`
- `account_disabled`
- `user_not_found`

以下错误不自动 refresh，直接抛出异常给上层处理：

- `invalid_credentials`
- `invalid_token`
- `wrong_password`
- `app_mismatch`
- `account_locked`

以下情况不视为会话失效，客户端不得清空本地 refreshToken：

- 网络超时
- DNS / TLS / 连接失败
- 5xx 服务端异常
- Cloudflare/Wrangler 临时不可用

---

## 服务端行为细节

### accessToken 验证链路

1. 校验 JWT 签名和过期时间
2. 校验 `type=access`
3. 读取 `sid` 对应 session
4. 校验 session 为 `active`
5. 校验 session 未过期
6. 校验 `aid` 与 session.app_id 以及当前请求 app 一致
7. 校验用户状态未禁用

这样设计的原因：

- JWT 负责快速确认“这张票是不是我签的”
- session 负责确认“这张票对应的会话现在还活着吗”
- 当 session 因 `expires_at` 自然过期时，受保护接口统一返回 `session_revoked`，SDK 不区分“主动撤销”和“自然过期”

### refreshToken 轮换策略

采用“每次 refresh 都轮换 refreshToken”。

原因：

- 降低 refreshToken 被窃取后的复用窗口
- 可以更快发现“旧 token 还在被人使用”的异常情况

轮换规则：

- refresh 成功后，更新当前 session 的 `refresh_token_hash`
- 客户端必须用新 refreshToken 覆盖本地旧值
- 如果客户端继续拿旧 refreshToken 请求，应返回 `invalid_refresh_token`

### 滑动续期策略

refresh 成功时，把 `expires_at` 延长到”当前时间 + 30 天”。不设绝对上限，活跃用户的 session 会一直续期，永不强制过期。

原因：

- 活跃用户无需频繁重新登录
- 不活跃用户会自然过期，减少长期风险
- 本系统目标场景下，强制重新登录对用户体验的损伤大于安全收益

### session 何时更新 `last_seen_at`

只在 `refresh` 成功时更新。

原因：

- `verify` 是高频只读路径，每次写 D1 会显著增加 write unit 消耗
- `refresh` 频率远低于 `verify`，足够支撑”最近活跃时间”的运维判断

### session 数量上限

不设上限。同一用户同一 App 可以存在任意数量的 active session。

原因：

- 过期 session 由 `expires_at` 自然淘汰，不会无限累积
- 加上限会引入额外的”踢最旧 session”逻辑，收益不明确

### session 清理策略

所有查询使用 `status = 'active' AND expires_at > datetime('now')` 判断有效性。`status` 字段只有 `active` 和 `revoked` 两个值，过期由 `expires_at` 判定，不存在 `expired` 状态。

清理方案：

- 用 Cloudflare Cron Trigger 每天执行一次 Worker
- 执行 `DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')` 清除过期超过 7 天的记录
- 执行 `DELETE FROM sessions WHERE status = 'revoked' AND revoked_at < datetime('now', '-7 days')` 清除 7 天前撤销的记录

### refresh 端点限速

不对 refresh 接口做 IP 限速。

原因：

- refreshToken 是高熵随机串（32 字节），暴力破解不可行
- 限速会干扰正常的并发冷启动恢复场景（多个 App 同时初始化）

---

## Flutter SDK 设计

### 客户端状态模型

当前 SDK 只有一个 `token`，改造后应拆分为：

- `accessToken`：内存中的当前访问票据
- `refreshToken`：安全存储中的长期凭证
- `user`：用户基础信息
- `sessionId`：当前会话 ID，便于排查和展示
- `isInitialized`：初始化是否完成
- `isRestoring`：是否正在用 refreshToken 恢复登录态

`sessionId` 的来源规则：

- 以服务端响应中的 `session_id` 为准
- `register`、`login`、`refresh`、`change-password` 都返回 `session_id`
- 客户端不从 `refreshToken` 的字符串前缀自行解析业务状态，避免把 token 格式和 SDK 状态机硬耦合

### 启动恢复流程

`init()` 改为：

1. 读取本地 refreshToken
2. 如果没有 refreshToken，直接进入未登录态
3. 如果有 refreshToken，调用 `/api/v2/auth/refresh`
4. 成功则恢复登录态
5. 如果返回 `refresh_token_revoked`、`refresh_token_expired`、`invalid_refresh_token`、`account_disabled` 或 `user_not_found`，清空本地状态并进入未登录态
6. 如果是网络错误或 5xx，保留本地 refreshToken 和用户基础信息，结束恢复流程，并由 `init()` 抛出可重试的网络异常交给上层重试

这样做的原因：

- 不再依赖本地 accessToken 是否还活着
- 冷启动恢复逻辑统一，不会出现“本地看似已登录，首个接口才 401”的迟滞体验
- 网络抖动不应把用户直接踢回登录页

初始化阶段要求：

- `init()` 开始时应设置 `isInitialized=false`
- 如果本地存在 refreshToken，进入恢复流程时设置 `isRestoring=true`
- `init()` 结束时无论成功、进入未登录态还是抛出可重试网络异常，都必须设置 `isRestoring=false`、`isInitialized=true`
- `init()` 未完成前，不允许发受保护请求
- 如果业务层在 `init()` 完成前调用受保护请求，SDK 统一抛出 `not_initialized` 异常，不自动等待，不偷偷发请求
- 业务层必须区分“未登录”和“正在恢复登录”
- UI 可根据 `isInitialized` / `isRestoring` 显示启动页、骨架屏或重试提示，避免先跳登录页再跳回首页

### 自动刷新策略

请求受保护接口时：

- 正常先带 accessToken
- 如果收到 `401 token_expired`，自动走一次 refresh
- 如果收到 `401 session_revoked`、`401 invalid_refresh_token`、`401 refresh_token_revoked` 或 `401 refresh_token_expired`，直接清空本地状态并跳转登录页
- 如果收到 `403 account_disabled` 或 `404 user_not_found`，直接清空本地状态并跳转登录页
- 如果收到 `401 invalid_token`，不自动 refresh，直接抛出异常
- refresh 成功后重试原请求
- 如果 refresh 返回会话终止类错误，清空本地状态并抛出登录失效异常
- 如果 refresh 因网络错误或 5xx 失败，保留本地 refreshToken，抛出可重试的网络异常，不清空登录态

### 并发刷新控制

必须保证同一时刻只有一个 refresh 在执行。

原因：

- 多个接口同时 401 时，如果并发 refresh，会导致后一个请求拿旧 refreshToken 刷新失败
- 用户会看到随机掉线，体验非常差

实现要求：

- SDK 内部维护一个共享中的 refresh Future
- 后续请求等待这一轮 refresh 结果，不再重复发起

### 本地存储

存储策略：

- `accessToken`：仅内存，不持久化；应用重启后由 refresh 恢复
- `refreshToken`：`flutter_secure_storage`（必须，不接受 SharedPreferences 替代）
- `username`、`user_id`、`session_id`：`SharedPreferences`

refreshToken 是 30 天长效凭证，明文存 SharedPreferences 在 Android 上等同不加密。

---

## 管理后台调整

### 用户列表表头变更

当前表头（`views/users.tsx`）：

```
UID | 用户名 | 状态 | 登录失败 | Token 版本 | 注册时间 | 操作
```

改造后：

```
UID | 用户名 | 状态 | 登录失败 | 活跃会话 | 最近活跃 | 注册时间 | 操作
```

变更说明：

- 删除「Token 版本」列，该列展示的 `v{token_version}` 在 v2 模型下无实际意义
- 新增「活跃会话」列：显示该用户当前 `status='active' AND expires_at > datetime('now')` 的 session 数量
- 新增「最近活跃」列：取该用户所有 session 中最大的 `last_seen_at`，格式 `YYYY-MM-DD HH:mm`，无记录时显示”—“

### 数据查询方式

用户列表已有分页查询，改造时在同一查询中加入 session 聚合，避免 N+1：

```sql
SELECT
  u.*,
  COUNT(CASE WHEN s.status = 'active' AND s.expires_at > datetime('now') THEN 1 END) AS active_sessions,
  MAX(s.last_seen_at) AS last_seen_at
FROM users u
LEFT JOIN sessions s ON s.user_id = u.id
WHERE ...
GROUP BY u.id
```

### 重置密码弹窗文案

当前弹窗说明文字（`views/users.tsx` 第 229 行）：

> 密码重置后，该用户所有已登录设备将立即下线（token_version + 1）。

改为：

> 密码重置后，该用户所有已登录会话将立即失效，设备需重新登录。

### 管理员重置密码的后端行为

管理员在后台重置用户密码时，除了更新 `users.password_hash` 和 `salt`，还必须撤销该用户全部 `active session`。

行为要求：

- 撤销该用户所有 `status='active' AND expires_at > datetime('now')` 的 session
- 统一写入 `revoke_reason='admin_password_reset'`
- 写入 `revoked_at=datetime('now')`
- 兼容期内同时执行 `users.token_version = token_version + 1`，确保旧版 `/api/v1/auth/*` token 立即失效
- 旧 accessToken 在下一次访问受保护接口时返回 `session_revoked`
- 旧 refreshToken 立刻不可再用于刷新

这样做的原因：

- v2 鉴权不再依赖 `token_version`
- 如果后台只改密码文案，不同步撤销 session，旧客户端会继续在线，和文档承诺不一致

### 本次不做的事

- 不新增用户详情页或设备列表页
- 不提供管理员手动撤销单条 session 的操作
- `token_version` 字段继续保留在 `users` 表，但后台不再展示

---

## 迁移方案

### 迁移原则

- 服务端先上线，客户端后切换
- 保留 `/api/v1/auth/*`，避免旧版本 App 立即失效
- 新增 `/api/v2/auth/*`，让新版本逐步迁移

### 实施步骤

1. 新增 D1 migration，创建 `sessions` 表
2. 在 Worker 中新增 session 相关 `db.ts` 查询封装
3. 在 `jwt.ts` 中新增 accessToken payload 结构支持 `sid` 和 `aid`
4. 在 `auth-worker/src/index.ts` 中挂载 `/api/v2/auth/*` 的 `appAuth`、对应的 `rateLimit` 策略，以及 `/api/v2/auth` 路由入口
5. 新增 `/api/v2/auth/register`
6. 新增 `/api/v2/auth/login`
7. 新增 `/api/v2/auth/refresh`
8. 新增 `/api/v2/auth/verify`
9. 新增 `/api/v2/auth/logout`
10. 新增 `/api/v2/auth/logout-all`
11. 新增 `/api/v2/auth/change-password`
12. 改造 `/api/v2/auth/delete-account`
13. 在 `auth-worker/src/index.ts` 中新增 `scheduled()` 清理入口
14. 在 `auth-worker/wrangler.toml` 中配置每天一次的 Cron Trigger，用于清理过期和撤销的 session
15. Flutter SDK：新增 `flutter_secure_storage` 依赖，更新 `pubspec.yaml`
16. Flutter SDK 新增 v2 状态模型、`not_initialized` 异常与自动 refresh
17. 示例 App 跑通完整链路
18. 管理后台：用户列表删除「Token 版本」列，新增「活跃会话」和「最近活跃」列，更新重置密码弹窗文案
19. 管理后台：管理员重置密码时同步撤销该用户全部 active session，撤销原因为 `admin_password_reset`
20. 兼容期校验：`logout-all`、`change-password`、管理员重置密码都必须同步提升 `token_version`，确保 v1/v2 同时失效

### 回滚方案

如果 v2 上线后发现问题：

- 服务端继续保留 v1
- 客户端临时回退到旧 SDK，继续走 `/api/v1/auth/*`
- `sessions` 表可保留，不需要回滚数据结构

回滚不涉及用户数据转换，因此风险可控。

---

## 风险与决策

### 风险 1：数据库查询增加

现状：

- 旧模型 verify 需要查 `users.token_version`

改造后：

- verify 需要查 `sessions`，必要时再查 `users`

判断：

- 这不是本质风险，因为你本来就不是纯无状态 JWT
- 为了换来“单会话可撤销”，这次查询是必要成本

### 风险 2：客户端状态管理更复杂

新增了 access/refresh 双 token 和自动刷新逻辑。

判断：

- 复杂度确实上升
- 但这部分复杂度由 SDK 吸收，而不是让每个 App 业务层吸收
- 对最终用户来说是明显增益，不应因为实现复杂就回避

### 风险 3：refresh 并发竞态

如果 SDK 没处理好并发刷新，会出现随机掉线。

结论：

- 这是必须提前设计的技术点，不是上线后再补
- SDK 必须内置 refresh 锁

---

## 测试方案

### Happy Path

- 注册后返回 accessToken、refreshToken、session_id
- 登录后创建新 session
- accessToken 正常访问 verify
- accessToken 过期后自动 refresh 成功
- refresh 后返回的 `session_id` 始终与原 session 相同（refresh 不创建新 session）
- `init()` 在 refresh 成功后恢复登录态，且初始化完成前不会发受保护请求
- `init()` 未完成前调用受保护请求，SDK 应抛出 `not_initialized` 异常
- `init()` 遇到 `invalid_refresh_token` 时，应清空本地状态并进入未登录态
- `init()` 遇到网络错误/5xx 时，应保留本地 refreshToken，设置 `isInitialized=true`、`isRestoring=false`，并抛出可重试网络异常

### 多 App 场景

- 用户在 A App 登录
- 用户在 B App 登录
- A App logout 后，A 的 refresh 返回 `refresh_token_revoked`
- B App verify 和 refresh 仍然成功
- 兼容期内，A 执行 `logout-all` 后，A/B 持有的旧版 `/api/v1/auth/*` token 也立即返回 401

### 多设备场景

- 同一 App 两台设备登录，生成两条 session
- 第一台设备 logout 后，第二台仍可正常使用

### 安全路径

- 使用错误 refreshToken，应返回 `invalid_refresh_token`
- 使用被撤销 refreshToken，应返回 `refresh_token_revoked`
- SDK 使用本地保存的 refreshToken 调 `/refresh` 返回 `invalid_refresh_token` 时，应清空本地会话并跳转登录页
- 用户被管理员禁用后，`refresh` 应返回 `account_disabled`
- 用户被管理员禁用后，客户端应清空本地会话并跳转登录页
- session 因 `expires_at` 自然过期后，受保护接口统一返回 `session_revoked`
- accessToken 被篡改，应返回 `invalid_token`
- App A 的 refreshToken 拿去 App B 使用，应被拒绝（`app_mismatch`）

### 高风险路径

- 两个并发请求同时触发 refresh，只允许一次真实刷新
- 改密码后，旧 session 全部失效，当前调用端拿到新 token 和新的 `session_id`
- logout-all 后，所有 App 与设备的 refresh 都失效
- 兼容期内，`change-password` 后旧版 `/api/v1/auth/*` token 立即返回 401
- 兼容期内，管理员重置密码后旧版 `/api/v1/auth/*` token 立即返回 401
- `logout` 在 session 已撤销、已过期或 refreshToken 已轮换的情况下仍返回成功，客户端本地状态被清空
- `init()` 或自动 refresh 遇到网络错误/5xx 时，不清空本地 refreshToken，客户端保持可重试状态
- Cron Trigger 每天执行一次后，超过保留窗口的过期 session 和已撤销 session 被清理
- delete-account 后，所有 token 都不可再使用

---

## 涉及文件

### Worker

- `auth-worker/src/index.ts`
- `auth-worker/src/routes/auth.ts`
- `auth-worker/src/lib/db.ts`
- `auth-worker/src/lib/jwt.ts`
- `auth-worker/src/types.ts`
- `auth-worker/migrations/0003_sessions.sql`
- `auth-worker/wrangler.toml`

### Flutter SDK

- `ar_auth/pubspec.yaml`
- `ar_auth/lib/src/client.dart`
- `ar_auth/lib/src/storage.dart`
- `ar_auth/lib/src/models.dart`
- `ar_auth/lib/src/exceptions.dart`

### 管理后台

- `auth-worker/src/routes/admin.tsx`（用户列表查询加入 session 聚合；管理员重置密码时撤销该用户全部 active session）
- `auth-worker/src/views/users.tsx`（表头、列内容、弹窗文案）
- `auth-worker/src/lib/db.ts`（新增带 session 聚合的用户查询函数；新增按用户撤销全部 session 的后台复用函数）
- `auth-worker/src/types.ts`（`UserRow` 类型新增 `active_sessions`、`last_seen_at` 字段）

---

## 最终判断

这次改造的本质，不是“把单 JWT 改成双 token”这么简单，而是把“用户级失效”改成“会话级失效”。

只要目标是：

- 多 App 共用账号体系
- A 登出不影响 B
- 同时还要保留安全可控的撤销能力

那么 `accessToken + refreshToken + session` 就不是可选优化，而是最直接、最符合问题本质的设计。

相比继续在 `token_version` 上打补丁，这个方案更稳，也更少返工。
