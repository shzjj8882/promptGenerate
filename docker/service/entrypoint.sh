#!/bin/sh
set -e

# 等待 Postgres 就绪（docker-compose depends_on 已处理，此处作双重保障）
echo ">>> Running DB init and migrations..."
python3 scripts/init_db.py
alembic upgrade head
echo ">>> RBAC/菜单 迁移..."
python3 scripts/run_rbac_migrations.py
echo ">>> Init admin (if not exists)..."
python3 scripts/init_admin_once.py
echo ">>> Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 "$@"
