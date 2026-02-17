"""
用户工作台布局配置服务
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_dashboard_config import UserDashboardConfig
from app.schemas.user_dashboard_config import DashboardConfigUpdate
from app.core.cache import (
    get_cache,
    set_cache,
    delete_cache,
    CACHE_KEY_PREFIXES,
    CACHE_TTL,
)
from app.utils.json_utils import dumps as json_dumps, loads as json_loads


def _cache_key(user_id: str) -> str:
    return f"{CACHE_KEY_PREFIXES['dashboard_config']}{user_id}"


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
        except Exception:
            pass

    cfg = await get_or_create_config(db, user_id)
    layout = cfg.layout or []
    try:
        await set_cache(cache_key, json_dumps(layout), CACHE_TTL["dashboard_config"])
    except Exception:
        pass
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
