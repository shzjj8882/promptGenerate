"""
团队数据过滤工具
用于根据用户权限过滤数据，实现团队数据隔离
"""
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.schemas.user import UserResponse
from app.models.user import User
from app.models.team import Team


async def filter_by_team_data(
    db: AsyncSession,
    current_user: UserResponse,
    query,
    team_id_column,
) -> tuple:
    """
    根据用户权限过滤团队数据
    
    规则：
    1. 系统管理员（is_superuser=True）：可以看到所有团队的数据（用于管理平台）
    2. 团队管理员（is_team_admin=True）：只能看到自己团队的数据
    3. 普通用户：只能看到自己团队的数据
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        query: SQLAlchemy 查询对象
        team_id_column: 团队ID字段（如 Tenant.team_id）
    
    Returns:
        (过滤后的查询, 是否需要额外过滤)
    """
    # 系统管理员：可以看到所有团队的数据（不添加过滤条件）
    if current_user.is_superuser:
        return query, False
    
    # 团队管理员和普通用户：只能看到自己团队的数据
    if not current_user.team_id:
        # 如果用户没有团队，返回空结果
        return query.where(False), True
    
    # 只返回用户所属团队的数据
    return query.where(team_id_column == current_user.team_id), False


async def check_team_access(
    db: AsyncSession,
    current_user: UserResponse,
    target_team_id: str,
) -> bool:
    """
    检查用户是否有权限访问指定团队的数据
    
    Args:
        db: 数据库会话
        current_user: 当前用户
        target_team_id: 目标团队ID
    
    Returns:
        True 如果有权限，False 否则
    """
    # 系统管理员：可以访问所有团队（用于管理）
    if current_user.is_superuser:
        return True
    
    # 团队管理员和普通用户：只能访问自己团队
    return current_user.team_id == target_team_id


async def get_user_accessible_team_ids(
    db: AsyncSession,
    current_user: UserResponse,
) -> List[str]:
    """
    获取用户可访问的团队ID列表
    
    Args:
        db: 数据库会话
        current_user: 当前用户
    
    Returns:
        可访问的团队ID列表（系统管理员返回所有团队ID，其他用户返回自己团队ID）
    """
    # 系统管理员：可以访问所有团队（用于管理）
    if current_user.is_superuser:
        all_teams_result = await db.execute(
            select(Team.id).where(Team.is_active == True)
        )
        return [row[0] for row in all_teams_result.fetchall()]
    
    # 团队管理员和普通用户：只能访问自己团队
    if current_user.team_id:
        return [current_user.team_id]
    
    return []
