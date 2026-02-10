# Docker 管理 Makefile

.PHONY: help build up down restart logs clean init-db

help: ## 显示帮助信息
	@echo "可用命令:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo ""
	@echo "目录结构:"
	@echo "  docker/"
	@echo "    ├── docker-compose.yml  - Docker Compose 配置"
	@echo "    ├── nginx/              - Nginx 反向代理配置"
	@echo "    │   ├── Dockerfile      - Nginx 镜像构建文件"
	@echo "    │   └── nginx.conf      - Nginx 配置文件（支持 SSE）"
	@echo "    ├── .env               - 环境变量配置（请根据实际情况修改）"
	@echo "    ├── service/           - 后端服务 Dockerfile"
	@echo "    └── app/               - 前端应用 Dockerfile"

build: ## 构建所有镜像
	docker-compose build

build-no-cache: ## 强制重建所有镜像（不使用缓存）
	docker-compose build --no-cache

up: ## 启动所有服务（后台运行）
	docker-compose up -d

down: ## 停止所有服务
	docker-compose down

down-v: ## 停止所有服务并删除数据卷（谨慎使用）
	docker-compose down -v

restart: ## 重启所有服务
	docker-compose restart

restart-service: ## 重启后端服务
	docker-compose restart service

restart-app: ## 重启前端应用
	docker-compose restart app

restart-nginx: ## 重启 Nginx 服务
	docker-compose restart nginx

logs: ## 查看所有服务日志
	docker-compose logs -f

logs-service: ## 查看后端服务日志
	docker-compose logs -f service

logs-app: ## 查看前端应用日志
	docker-compose logs -f app

logs-nginx: ## 查看 Nginx 日志
	docker-compose logs -f nginx

logs-db: ## 查看数据库日志
	docker-compose logs -f postgres

logs-redis: ## 查看 Redis 日志
	docker-compose logs -f redis

ps: ## 查看服务状态
	docker-compose ps

exec-service: ## 进入后端服务容器
	docker-compose exec service bash

exec-app: ## 进入前端应用容器
	docker-compose exec app sh

exec-nginx: ## 进入 Nginx 容器
	docker-compose exec nginx sh

exec-db: ## 进入数据库容器
	docker-compose exec postgres psql -U postgres -d aily_db

init-db: ## 初始化数据库
	docker-compose exec service python3 scripts/init_db.py

migrate: ## 执行数据库迁移（需要指定迁移脚本）
	@echo "用法: make migrate SCRIPT=migrate_tenants.py"
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/$(SCRIPT)"

migrate-placeholder-keys: ## 更新占位符 key 名称（sys.conversation_id -> conversationId 等）
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_placeholder_keys.py"

migrate-rbac: ## 初始化 RBAC 表结构
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_rbac.py"

migrate-api-permissions: ## 初始化 API 权限数据
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_api_permissions.py"

migrate-menu-permissions: ## 初始化菜单权限数据
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_permission_menu_type.py"

migrate-all-permissions: ## 初始化所有权限数据（RBAC表 + API权限 + 菜单权限）
	@echo "正在初始化 RBAC 表结构..."
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_rbac.py"
	@echo "正在初始化 API 权限..."
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_api_permissions.py"
	@echo "正在初始化菜单权限..."
	docker-compose exec service bash -c "cd /app && PYTHONPATH=/app python3 scripts/migrate_permission_menu_type.py"
	@echo "✅ 所有权限数据初始化完成"

clean: ## 清理未使用的镜像和容器
	docker system prune -f

clean-all: ## 清理所有未使用的资源（包括数据卷）
	docker system prune -a -f --volumes

backup-db: ## 备份数据库
	docker-compose exec postgres pg_dump -U postgres aily_db > backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "数据库备份完成"

restore-db: ## 恢复数据库（需要指定备份文件）
	@echo "用法: make restore-db FILE=backup.sql"
	docker-compose exec -T postgres psql -U postgres aily_db < $(FILE)
