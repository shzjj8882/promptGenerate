# Docker 一键部署

一键构建、编译并启动完整环境：PostgreSQL、Redis、后端服务、前端应用、Nginx、LLMChat Worker。

## 拉取镜像超时（国内网络）

若出现 `dial tcp ... i/o timeout` 或 `failed to fetch anonymous token`，需配置 Docker 镜像加速：

**macOS**：Docker Desktop → Settings → Docker Engine，在 JSON 中加入：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.xuanyuan.me"
  ]
}
```

保存后 Apply & Restart。

**Linux**：编辑 `/etc/docker/daemon.json`，加入上述 `registry-mirrors` 后执行：
```bash
sudo systemctl daemon-reload && sudo systemctl restart docker
```

参考配置见 `docker/daemon.json.example`。

## 快速启动

```bash
# 1. 进入 docker 目录
cd docker

# 2. 复制环境变量（可选，有默认值）
cp .env.example .env
# 编辑 .env，设置 DEEPSEEK_API_KEY 等

# 3. 构建并启动（会打包前端、编译后端、创建数据库、执行迁移）
docker compose build && docker compose up -d

# 4. 查看日志
docker compose logs -f
```

首次启动前，在 `.env` 中设置 `INITIAL_ADMIN_PASSWORD`（≥6 位）。若无超级管理员，会自动创建默认账号：
- 用户名：`admin`
- 密码：您设置的 `INITIAL_ADMIN_PASSWORD`

已存在 admin 则不输出任何内容。

**忘记密码？** 可重置：
```bash
docker compose run --rm --entrypoint "" service python scripts/reset_admin_password.py 你的新密码
```

## 访问地址

- **前端应用**：http://localhost:3000
- **API 文档**：http://localhost:3000/docs
- **健康检查**：http://localhost:3000/health

## 服务说明

| 服务 | 说明 |
|------|------|
| postgres | PostgreSQL 15 数据库 |
| redis | Redis 7 缓存与队列 |
| service | FastAPI 后端（启动时自动执行 init_db + Alembic 迁移） |
| llmchat_worker | LLM 异步任务 Worker（消费 Redis Stream） |
| app | Next.js 前端（端口 3000 内部） |
| nginx | 反向代理，统一入口（对外端口 3000） |

## 常用命令

```bash
# 停止
docker compose down

# 停止并删除数据卷
docker compose down -v

# 仅重新构建后端
docker compose build service llmchat_worker

# 仅重新构建前端
docker compose build app

# 查看服务状态
docker compose ps

# 执行数据库迁移（service 启动时自动执行，亦可手动运行）
docker compose run --rm service sh -c "alembic upgrade head"
```

## 环境变量

详见 `.env.example`。关键配置：

- `POSTGRES_*`：数据库（使用 docker-compose 时由内部服务名连接，通常不需改）
- `DEEPSEEK_API_KEY`：DeepSeek API 密钥（LLM 功能必需）
- `SECRET_KEY`：生产环境务必修改
- `INITIAL_ADMIN_PASSWORD`：首次创建 admin 时必须设置（≥6 位），已存在 admin 则不输出。忘记密码可用 `reset_admin_password.py` 脚本重置
- `APP_PORT`：对外端口，默认 3000
