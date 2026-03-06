# Dashboard 接口与 CURL 审计报告

## 一、Dashboard 请求调用（应使用 /admin）

### ✅ 已正确使用 /admin 的模块

| 模块 | 文件 | 路径 |
|------|------|------|
| 团队管理 | lib/api/teams.ts | /admin/teams/* |
| 多维表格 | lib/api/multi-dimension-tables.ts | /admin/multi-dimension-tables/* |
| 提示词/占位符 | lib/api/prompts.ts | /admin/prompts/*, /admin/placeholders/* |
| 组合管理 | lib/api/compositions.ts | /admin/compositions/* |
| 工作台配置 | lib/api/dashboard-config.ts | /admin/dashboard-config |
| 通知配置 | lib/api/notification-config.ts | /admin/notification-config/* |
| MCP | lib/api/mcp.ts | /admin/mcp/* |
| 用户/RBAC | lib/api/users.ts, rbac.ts | /admin/auth/*, /admin/rbac/* |
| 租户 | lib/api/tenants.ts | /admin/tenants/* |
| 场景 | lib/api/scenes.ts | /admin/scenes/* |
| 模型 | lib/api/llm-models.ts | /admin/models/* |
| 会话 | lib/api/conversations.ts | /admin/conversations/* |
| 认证 | lib/api/auth.ts | /admin/auth/* |
| **组合调试请求** | prompt-debug-dialog apiUrl | /admin/compositions/.../llm|request |

### ✅ 已修正：普通提示词调试统一使用 /admin

| 场景 | 文件 | 路径 |
|------|------|------|
| 普通提示词调试（chat/api） | lib/api/llmchat.ts | /admin/llmchat/prompts/{scene}/chat, /api ✓ |
| 提示词转换 | lib/api/llmchat.ts | /admin/llmchat/prompts/{scene}/convert ✓ |
| 异步任务轮询 | lib/api/llmchat.ts | /admin/llmchat/tasks/{taskId} ✓ |

后端已新增 `service/app/routers/admin/llmchat.py`，提供上述端点，Bearer 认证，无配额限制。

---

## 二、CURL 复制（应使用 /api + X-Team-AuthCode）

### ✅ 已正确使用 /api 的

| 场景 | 文件 | 路径 | 认证 |
|------|------|------|------|
| 组合调试 CURL | prompt-debug-dialog handleCopyCurl | /api/compositions/.../llm\|request | X-Team-AuthCode |
| 普通提示词 CURL | use-prompt-debug generateCurl | /api/llmchat/prompts/{scene}/chat\|api | X-Team-AuthCode |

### ✅ 已修正：表格 CURL 已改为 /api

| 场景 | 文件 | 当前 |
|------|------|------|
| 表格按条件查询 CURL | use-row-query.ts | /api/.../rows, X-Team-AuthCode ✓ |
| 表格按条件编辑/删除 CURL | row-condition-dialog.tsx | /api/.../rows/by-condition, X-Team-AuthCode ✓ |
| 表格增删改记录 CURL | row-record-dialog.tsx | /api/.../rows, X-Team-AuthCode ✓ |

---

## 三、后端接口处理合理性

### 1. /admin 与 /api 职责划分

| 类型 | 认证 | 配额 | 用途 |
|------|------|------|------|
| /admin | Bearer Token | 无限制（调试） | Dashboard 管理、调试 |
| /api | X-Team-AuthCode / X-API-Key / Bearer | 有配额 | 业务/外部调用 |

### 2. 当前实现

- **Admin 组合调试**：已正确实现无配额、Bearer 认证 ✓
- **API 组合/表格**：有配额校验 ✓
- **API llmchat**：支持 Bearer（调试）、X-Team-AuthCode，有配额 ✓

### 3. 工作台配置（超级管理员 vs 普通用户）

| 用户类型 | 配置来源 | 表 |
|----------|----------|-----|
| 超级管理员 (is_superuser) | 系统级配置 | system_dashboard_config |
| 普通用户 | 个人配置 | user_dashboard_config |

超级管理员使用独立的系统级工作台布局，不与团队用户混用。

### 4. 多维表格（超级管理员 vs 普通用户）

| 用户类型 | 可见表格 | 说明 |
|----------|----------|------|
| 超级管理员 | 仅系统级表格（team_id 为空） | 不显示、不可访问各团队表格 |
| 普通用户 | 本团队表格 | 按 team_id 过滤 |

超级管理员在控制台仅能管理系统级多维表格，不能查看或操作团队表格。

### 5. 当前状态

- Dashboard 请求已统一使用 /admin ✓
- CURL 复制已统一使用 /api + X-Team-AuthCode ✓
