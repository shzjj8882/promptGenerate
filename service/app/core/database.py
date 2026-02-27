import logging

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings
import redis.asyncio as redis
from typing import Optional

logger = logging.getLogger(__name__)

# PostgreSQL 数据库引擎
DATABASE_URL = (
    f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
    f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_size=20,  # 增加连接池大小
    max_overflow=10,  # 增加溢出连接数
    pool_recycle=3600,  # 1 小时回收连接（避免长时间连接失效）
    pool_timeout=30,  # 获取连接超时 30 秒
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


# Redis 连接池
redis_pool: Optional[redis.ConnectionPool] = None
redis_client: Optional[redis.Redis] = None


async def init_db():
    """初始化数据库连接"""
    global redis_pool, redis_client

    # 导入所有模型以确保表被创建
    from app.models import (
        Prompt, Tenant, Placeholder, User, PlaceholderDataSource,
        Scene, MultiDimensionTable, MultiDimensionTableRow, MultiDimensionTableCell,
        UserDashboardConfig,
    )
    from app.models.sales_order import DMUReport, CustomerHistory
    from app.models.rbac import Role, Permission
    from app.models.llm_model import LLMModel
    from app.models.conversation import Conversation, ConversationMessage
    from app.models.mcp import MCPConfig
    from app.models.notification_config import NotificationConfig
    from app.models.llmchat_task import LLMChatTask

    # 初始化 Redis（连接池优化：限制最大连接数，避免资源耗尽）
    redis_pool = redis.ConnectionPool(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD if settings.REDIS_PASSWORD else None,
        db=settings.REDIS_DB,
        decode_responses=True,
        max_connections=50,
    )
    redis_client = redis.Redis(connection_pool=redis_pool)

    # 测试 Redis 连接
    try:
        await redis_client.ping()
        logger.info("Redis connection established")
    except Exception as e:
        logger.warning("Redis connection failed: %s", e)

    # 数据库 schema 版本检查：一致则跳过建表，不一致则执行并记录版本
    from app.core.schema_version import needs_migration, write_applied_version

    need, current, applied = needs_migration()
    if need:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        write_applied_version(current)
        logger.info("Database schema updated, version: %s", current)
    else:
        logger.info("Database schema up to date, version: %s", current)


async def get_db() -> AsyncSession:
    """获取数据库会话"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_redis() -> redis.Redis:
    """获取 Redis 客户端"""
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    return redis_client


async def get_redis_optional() -> Optional[redis.Redis]:
    """获取 Redis 客户端（未初始化时返回 None，用于可选缓存）"""
    return redis_client


async def close_db():
    """关闭数据库连接"""
    global redis_client, redis_pool
    
    if redis_client:
        await redis_client.close()
    if redis_pool:
        await redis_pool.disconnect()
    await engine.dispose()

