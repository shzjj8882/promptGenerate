"""
权限管理模块
"""
from fastapi import HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.rbac_service import RoleService
from app.schemas.user import UserResponse


def require_superuser(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """
    要求用户必须是系统超级管理员
    
    Args:
        current_user: 当前登录用户
    
    Returns:
        当前用户（如果是系统超级管理员）
    
    Raises:
        HTTPException: 如果用户不是系统超级管理员
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要系统超级管理员权限",
        )
    return current_user


def require_team_admin_or_superuser(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """
    要求用户必须是团队管理员或系统超级管理员
    
    Args:
        current_user: 当前登录用户
    
    Returns:
        当前用户（如果是团队管理员或系统超级管理员）
    
    Raises:
        HTTPException: 如果用户不是团队管理员或系统超级管理员
    """
    if not current_user.is_superuser and not current_user.is_team_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要团队管理员或系统超级管理员权限",
        )
    return current_user


async def require_same_team_or_admin(
    target_team_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    要求用户必须是目标团队的管理员/成员，或者是系统超级管理员（可以访问所有团队）
    
    Args:
        target_team_id: 目标团队ID
        current_user: 当前登录用户
        db: 数据库会话
    
    Returns:
        当前用户（如果满足条件）
    
    Raises:
        HTTPException: 如果用户不满足条件
    """
    from app.core.team_data_filter import check_team_access
    
    # 检查用户是否有权限访问该团队
    has_access = await check_team_access(db, current_user, target_team_id)
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该团队的数据",
        )
    
    return current_user


def require_active_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """
    要求用户必须是激活状态
    
    Args:
        current_user: 当前登录用户
    
    Returns:
        当前用户（如果是激活状态）
    
    Raises:
        HTTPException: 如果用户未激活
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )
    return current_user


def require_same_user_or_superuser(
    target_user_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """
    要求用户必须是目标用户本人或者是超级管理员
    
    Args:
        target_user_id: 目标用户ID
        current_user: 当前登录用户
    
    Returns:
        当前用户（如果满足条件）
    
    Raises:
        HTTPException: 如果用户不满足条件
    """
    if current_user.id != target_user_id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该资源",
        )
    return current_user


async def require_permission(
    permission_code: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    要求用户必须拥有指定权限（优化：使用缓存）
    
    Args:
        permission_code: 权限代码（如：tenant:create）
        current_user: 当前登录用户
        db: 数据库会话
    
    Returns:
        当前用户（如果拥有权限）
    
    Raises:
        HTTPException: 如果用户没有权限
    """
    # 系统超级管理员和团队管理员都拥有所有权限
    if current_user.is_superuser or current_user.is_team_admin:
        return current_user
    
    # 优化：传入 redis_client 以使用缓存
    from app.core.database import get_redis_optional
    redis_client = await get_redis_optional()
    
    # 检查用户是否拥有指定权限（使用缓存优化）
    has_permission = await RoleService.user_has_permission(
        db, current_user.id, permission_code, redis_client
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"需要权限: {permission_code}",
        )
    
    return current_user

