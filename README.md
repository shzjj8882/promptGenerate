# AILY

AILY 是一款智能体占位符 SaaS 平台，提供占位符生成、结构化接口和聊天接口，支持多租户、多场景的提示词管理。

## 功能特性

- **占位符系统**：灵活配置占位符，支持动态数据注入
- **提示词管理**：多场景（调研、PPT、销售等）提示词配置
- **接口模式**：提供结构化 API 和流式聊天接口
- **通知中心**：邮件通知（SendCloud）配置，异步任务完成提醒
- **多维表格**：表格配置与数据管理
- **模型管理**：LLM 模型配置（支持多模型）
- **MCP 集成**：Model Context Protocol 配置
- **RBAC 权限**：角色、权限、菜单管理
- **多租户**：租户隔离，团队管理

## 技术栈

| 后端 | 前端 |
|------|------|
| FastAPI | Next.js 16 (App Router) |
| SQLAlchemy + PostgreSQL | TypeScript |
| Redis | Tailwind CSS + Radix UI |
| JWT 认证 | MobX |

## 项目结构

```
promptGenerate/
├── service/          # 后端 (FastAPI)
├── app/              # 前端 (Next.js)
└── docker/           # Docker 部署
```

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### 后端

```bash
cd service
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp env.template .env     # 配置数据库、Redis、API Key
python3 scripts/init_db.py
./start.sh
```

### 前端

```bash
cd app
pnpm install
pnpm dev
```

访问：http://localhost:3000

### Docker 部署

```bash
cd docker
cp .env.example .env
make build && make up
make init-db
```

## 环境变量

**后端** `service/.env`：数据库、Redis、`SECRET_KEY`、`DEEPSEEK_API_KEY`、`API_KEY` 等

**前端** `app/.env.local`：`NEXT_PUBLIC_API_BASE_URL`（默认 `http://localhost:8000`）

## API 文档

启动后端后访问：http://localhost:8000/docs

## 许可证

[待添加]
