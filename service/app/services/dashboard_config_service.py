"""
用户工作台布局配置服务
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_dashboard_config import UserDashboardConfig
from app.models.system_dashboard_config import SystemDashboardConfig
from app.schemas.user_dashboard_config import DashboardConfigUpdate
from app.core.cache import (
    get_cache,
    set_cache,
    delete_cache,
    CACHE_KEY_PREFIXES,
    CACHE_TTL,
)
from app.utils.json_utils import dumps as json_dumps, loads as json_loads

SYSTEM_CONFIG_CACHE_KEY = f"{CACHE_KEY_PREFIXES['dashboard_config']}__system__"


def _cache_key(user_id: str) -> str:
    return f"{CACHE_KEY_PREFIXES['dashboard_config']}{user_id}"


async def get_system_config(db: AsyncSession) -> SystemDashboardConfig | None:
    """获取系统工作台配置（超级管理员）"""
    result = await db.execute(select(SystemDashboardConfig).limit(1))
    return result.scalar_one_or_none()


async def get_or_create_system_config(db: AsyncSession) -> SystemDashboardConfig:
    """获取或创建系统工作台配置"""
    cfg = await get_system_config(db)
    if cfg is not None:
        return cfg
    cfg = SystemDashboardConfig(layout=[])
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return cfg


async def get_config(db: AsyncSession, user_id: str) -> UserDashboardConfig | None:
    """获取用户工作台配置"""
    result = await db.execute(
        select(UserDashboardConfig).where(UserDashboardConfig.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_or_create_config(db: AsyncSession, user_id: str) -> UserDashboardConfig:
    """获取或创建用户工作台配置"""
    cfg = await get_config(db, user_id)
    if cfg is not None:
        return cfg
    cfg = UserDashboardConfig(user_id=user_id, layout=[])
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return cfg


async def get_config_cached(db: AsyncSession, user_id: str):
    """获取或创建用户工作台配置（带 Redis 缓存，返回带 .layout 的对象）"""
    from types import SimpleNamespace

    cache_key = _cache_key(user_id)
    cached = await get_cache(cache_key)
    if cached:
        try:
            layout = json_loads(cached)
            return SimpleNamespace(layout=layout or [])
        except Exception as e:
            logging.getLogger(__name__).warning("工作台配置缓存反序列化失败: %s", e)

    cfg = await get_or_create_config(db, user_id)
    layout = cfg.layout or []
    try:
        await set_cache(cache_key, json_dumps(layout), CACHE_TTL["dashboard_config"])
    except Exception as e:
        logging.getLogger(__name__).warning("工作台配置缓存写入失败: %s", e)
    return cfg


async def get_system_config_cached(db: AsyncSession):
    """获取系统工作台配置（带缓存，超级管理员用）"""
    from types import SimpleNamespace

    cached = await get_cache(SYSTEM_CONFIG_CACHE_KEY)
    if cached:
        try:
            layout = json_loads(cached)
            return SimpleNamespace(layout=layout or [])
        except Exception as e:
            logging.getLogger(__name__).warning("系统工作台配置缓存反序列化失败: %s", e)

    cfg = await get_or_create_system_config(db)
    layout = cfg.layout or []
    try:
        await set_cache(SYSTEM_CONFIG_CACHE_KEY, json_dumps(layout), CACHE_TTL["dashboard_config"])
    except Exception as e:
        logging.getLogger(__name__).warning("系统工作台配置缓存写入失败: %s", e)
    return cfg


async def save_system_config(db: AsyncSession, data: DashboardConfigUpdate) -> SystemDashboardConfig:
    """保存系统工作台配置"""
    cfg = await get_or_create_system_config(db)
    cfg.layout = data.layout
    await db.commit()
    await db.refresh(cfg)
    await delete_cache(SYSTEM_CONFIG_CACHE_KEY)
    return cfg


async def save_config(db: AsyncSession, user_id: str, data: DashboardConfigUpdate) -> UserDashboardConfig:
    """保存用户工作台配置"""
    cfg = await get_or_create_config(db, user_id)
    cfg.layout = data.layout
    await db.commit()
    await db.refresh(cfg)

    # 缓存失效：保存后删除缓存，下次读取时重新加载
    await delete_cache(_cache_key(user_id))

    return cfg
