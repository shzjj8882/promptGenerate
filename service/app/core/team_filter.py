"""
团队过滤辅助函数
用于根据用户权限过滤数据（非超级管理员只能看到自己团队的数据）
"""
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.schemas.user import UserResponse
from app.core.cache import get_cache, set_cache, CACHE_KEY_PREFIXES, CACHE_TTL
from app.utils.json_utils import dumps as json_dumps, loads as json_loads
from typing import Optional, Any


async def filter_by_team(
    db: AsyncSession,
    current_user: UserResponse,
    query,
    created_by_column,
) -> tuple:
    """
    根据用户权限过滤查询
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        query: SQLAlchemy 查询对象
        created_by_column: 创建人字段（如 Tenant.created_by）
    
    Returns:
        (过滤后的查询, 是否需要额外过滤)
    """
    # 超级管理员可以看到所有数据
    if current_user.is_superuser:
        return query, False
    
    # 非超级管理员只能看到自己团队创建的数据
    if not current_user.team_code:
        # 如果用户没有团队代码，返回空结果
        return query.where(False), True
    
    # 优化：使用缓存存储团队用户ID列表
    cache_key = None
    redis_client = None
    
    # 尝试从缓存获取
    if hasattr(current_user, 'team_id') and current_user.team_id:
        cache_key = f"{CACHE_KEY_PREFIXES.get('team_users', 'team_users:v1:')}{current_user.team_id}"
    elif current_user.team_code:
        cache_key = f"{CACHE_KEY_PREFIXES.get('team_users', 'team_users:v1:')}{current_user.team_code}"
    
    team_user_ids = None
    if cache_key:
        try:
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                cached = await get_cache(cache_key)
                if cached:
                    team_user_ids = json_loads(cached)
        except Exception:
            pass
    
    # 如果缓存未命中，查询数据库
    if team_user_ids is None:
        if hasattr(current_user, 'team_id') and current_user.team_id:
            # 使用 team_id 直接查询（更高效）
            team_users_result = await db.execute(
                select(User.id).where(
                    and_(
                        User.team_id == current_user.team_id,
                        User.is_active == True
                    )
                )
            )
        else:
            # 使用 team_code 查询（向后兼容）
            team_users_result = await db.execute(
                select(User.id).where(
                    and_(
                        User.team_code == current_user.team_code,
                        User.is_active == True
                    )
                )
            )
        
        team_user_ids = [row[0] for row in team_users_result.fetchall()]
        
        # 写入缓存（TTL 5分钟）
        if cache_key and redis_client:
            try:
                cache_ttl = CACHE_TTL.get("team_users", 300)
                await set_cache(cache_key, json_dumps(team_user_ids), cache_ttl)
            except Exception:
                pass
    
    if not team_user_ids:
        # 如果团队没有用户，返回空结果
        return query.where(False), True
    
    # 过滤：只显示团队内用户创建的数据
    return query.where(created_by_column.in_(team_user_ids)), True
