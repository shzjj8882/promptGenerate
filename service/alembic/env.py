# -*- coding: utf-8 -*-
"""
Alembic 迁移环境配置

- 从 app.core.config 读取数据库 URL
- 支持 async PostgreSQL (asyncpg)
- 加载 app.models 中所有模型的 metadata 用于 autogenerate
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 加载 alembic.ini 配置
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 从应用配置获取数据库 URL（覆盖 alembic.ini 中的占位）
from app.core.config import settings

DATABASE_URL = (
    f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
    f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
)
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# 加载所有模型以注册到 Base.metadata（autogenerate 需要）
from app.core.database import Base
import app.models  # noqa: F401
import app.models.rbac  # noqa: F401 - Role, Permission, MenuConfig, user_roles, role_permissions
from app.models.composition import Composition  # noqa: F401
from app.models.system_dashboard_config import SystemDashboardConfig  # noqa: F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：生成 SQL 脚本，不连接数据库"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """在 sync 上下文中执行迁移（供 run_sync 调用）"""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """使用 async 引擎执行迁移"""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = DATABASE_URL
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """在线模式：连接数据库执行迁移"""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
