# Changelog

## 1.1.0

- 新增 `buildAuthorizationHeaders()`，用于 SDK 外部受保护请求场景
- 统一受保护请求前的 token 可用性检查逻辑（自动 refresh、会话终止处理保持一致）
- 新增并发 refresh 与异常路径测试用例
- 兼容既有 API（`register/login/verify/logout/changePassword/logoutAll/deleteAccount`）
