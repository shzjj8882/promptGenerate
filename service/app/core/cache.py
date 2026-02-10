# -*- coding: utf-8 -*-
"""缓存工具：统一管理 Redis 缓存 key、TTL 和序列化"""
import logging
from typing import Optional, Any, TypeVar, Callable, List
from app.core.database import get_redis_optional
from app.utils.json_utils import dumps as json_dumps, loads as json_loads
import redis.asyncio as redis

logger = logging.getLogger(__name__)

T = TypeVar('T')

# 缓存 key 前缀
CACHE_KEY_PREFIXES = {
    "prompt": "prompt:v1:",
    "prompt_default": "prompt:default:v1:",
    "tenant": "tenant:v1:",
    "scene": "scene:v1:",
    "placeholder": "placeholder:v1:",
    "user_role": "user_role_ids:v1:",  # 用户角色ID缓存
    "user_perm": "user_perm_codes:v1:",  # 用户权限代码缓存
    "menu_tree": "menu_tree:v1:",  # 菜单树缓存
    "team_users": "team_users:v1:",  # 团队用户ID列表缓存
}

# 缓存 TTL（秒）
CACHE_TTL = {
    "prompt": 300,  # 5 分钟
    "prompt_default": 600,  # 10 分钟
    "tenant": 300,  # 5 分钟
    "scene": 3600,  # 1 小时（预置数据，变更频率低）
    "placeholder": 600,  # 10 分钟
    "user_role": 300,  # 5 分钟
    "user_perm": 300,  # 5 分钟
    "menu_tree": 1800,  # 30 分钟（变更频率低）
    "team_users": 300,  # 5 分钟
}


async def get_cache(key: str) -> Optional[str]:
    """
    获取缓存值
    
    Args:
        key: 缓存 key
    
    Returns:
        缓存值（字符串），如果不存在或出错则返回 None
    """
    redis = await get_redis_optional()
    if not redis:
        return None
    try:
        return await redis.get(key)
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis 连接错误: {e}")
        return None
    except Exception as e:
        logger.warning(f"Redis get 失败，key={key}: {e}")
        return None


async def set_cache(key: str, value: str, ttl: int) -> None:
    """
    设置缓存值
    
    Args:
        key: 缓存 key
        value: 缓存值（字符串）
        ttl: 过期时间（秒）
    """
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        await redis.setex(key, ttl, value)
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis 连接错误: {e}")
    except Exception as e:
        logger.warning(f"Redis set 失败，key={key}: {e}")


async def delete_cache(key: str) -> None:
    """
    删除缓存
    
    Args:
        key: 缓存 key
    """
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        await redis.delete(key)
    except (redis.ConnectionError, redis.TimeoutError) as e:
        logger.warning(f"Redis 连接错误: {e}")
    except Exception as e:
        logger.warning(f"Redis delete 失败，key={key}: {e}")


async def delete_cache_pattern(pattern: str) -> None:
    """
    按模式删除缓存（性能警告：keys() 会阻塞 Redis）
    
    注意：此方法仅用于兼容性，新代码应避免使用。
    推荐使用 delete_cache_keys() 直接删除已知的 key 列表。
    """
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        # 警告：keys() 在生产环境中可能阻塞 Redis
        # 仅在缓存 key 数量较少时使用
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
            logger.debug(f"删除缓存模式 {pattern}，共 {len(keys)} 个 key")
    except Exception as e:
        logger.warning(f"Redis delete pattern 失败: {e}")


async def delete_cache_keys(keys: List[str]) -> None:
    """
    批量删除指定的缓存 key（推荐使用）
    
    Args:
        keys: 要删除的缓存 key 列表
    """
    if not keys:
        return
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        await redis.delete(*keys)
        logger.debug(f"删除缓存 key，共 {len(keys)} 个")
    except Exception as e:
        logger.warning(f"Redis delete keys 失败: {e}")


async def add_cache_key_to_set(set_key: str, cache_key: str) -> None:
    """
    将缓存 key 添加到 Set 中（用于管理相关缓存）
    
    Args:
        set_key: Set 的 key（如 "user_role_cache_keys:user_id"）
        cache_key: 要添加的缓存 key
    """
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        await redis.sadd(set_key, cache_key)
    except Exception as e:
        logger.warning(f"Redis sadd 失败: {e}")


async def delete_cache_by_set(set_key: str) -> None:
    """
    通过 Set 删除所有相关的缓存 key（推荐用于批量删除）
    
    Args:
        set_key: Set 的 key（如 "user_role_cache_keys:user_id"）
    """
    redis = await get_redis_optional()
    if not redis:
        return
    try:
        keys = await redis.smembers(set_key)
        if keys:
            keys_list = list(keys)
            await redis.delete(*keys_list)
            await redis.delete(set_key)  # 删除 Set 本身
            logger.debug(f"通过 Set {set_key} 删除缓存，共 {len(keys_list)} 个 key")
    except Exception as e:
        logger.warning(f"Redis delete by set 失败: {e}")


async def cached(
    cache_type: str,
    key_suffix: str,
    ttl: Optional[int] = None,
    serialize: Callable[[Any], str] = json_dumps,
    deserialize: Callable[[str], T] = json_loads,
) -> Callable:
    """
    缓存装饰器（简化版，用于函数返回值缓存）
    
    Args:
        cache_type: 缓存类型（prompt, tenant 等）
        key_suffix: key 后缀（如 scene:research:team:xxx）
        ttl: TTL（秒），默认使用 CACHE_TTL[cache_type]
        serialize: 序列化函数
        deserialize: 反序列化函数
    """
    async def decorator(func: Callable) -> Callable:
        async def wrapper(*args, **kwargs):
            cache_key = f"{CACHE_KEY_PREFIXES.get(cache_type, 'cache:')}{key_suffix}"
            cache_ttl = ttl or CACHE_TTL.get(cache_type, 300)
            
            # 尝试从缓存读取
            cached_value = await get_cache(cache_key)
            if cached_value:
                try:
                    return deserialize(cached_value)
                except Exception as e:
                    logger.warning(f"缓存反序列化失败: {e}")
            
            # 执行函数
            result = await func(*args, **kwargs)
            
            # 写入缓存
            try:
                serialized = serialize(result)
                await set_cache(cache_key, serialized, cache_ttl)
            except Exception as e:
                logger.warning(f"缓存序列化/写入失败: {e}")
            
            return result
        return wrapper
    return decorator
