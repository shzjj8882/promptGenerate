"""用户角色分配路由"""
from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db, get_redis_optional
from app.core.response import ResponseModel
from app.services.rbac_service import RoleService
from app.services.user_service import UserService
from app.core.permissions import require_team_admin_or_superuser
from app.models.rbac import Role

from ._common import permission_to_response

router = APIRouter()


@router.post("/users/roles-batch", summary="批量获取用户角色", tags=["管理接口 > RBAC管理"])
async def get_user_roles_batch(
    user_ids: List[str] = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    if current_user.is_superuser:
        data = await RoleService.get_user_role_ids_batch(db, user_ids or [], only_global=True)
    elif current_user.is_team_admin:
        for user_id in user_ids:
            target_user = await UserService.get_user_by_id(db, user_id)
            if target_user and target_user.team_code != current_user.team_code:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能查看自己团队用户的角色")
        data = await RoleService.get_user_role_ids_batch(db, user_ids or [], team_code=current_user.team_code)
    else:
        data = {}
    return ResponseModel.success_response(data=data, message="批量获取用户角色成功", code=status.HTTP_200_OK)


@router.get("/users/{user_id}/roles", summary="获取用户角色", tags=["管理接口 > RBAC管理"])
async def get_user_roles(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if current_user.is_superuser:
        role_ids = await RoleService.get_user_role_ids(db, user_id, only_global=True)
    elif current_user.is_team_admin:
        if target_user.team_code != current_user.team_code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能查看自己团队用户的角色")
        role_ids = await RoleService.get_user_role_ids(db, user_id, team_code=current_user.team_code)
    else:
        role_ids = []
    return ResponseModel.success_response(data=role_ids, message="获取用户角色成功", code=status.HTTP_200_OK)


@router.post("/users/{user_id}/roles", summary="为用户分配角色", tags=["管理接口 > RBAC管理"])
async def assign_roles_to_user(
    user_id: str,
    role_ids: List[str] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if current_user.is_superuser and role_ids:
        roles = (await db.execute(select(Role).where(Role.id.in_(role_ids)))).scalars().all()
        for role in roles:
            if role.team_code is not None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"系统管理员只能分配全局角色，角色 '{role.name}' 属于团队 '{role.team_code}'，无法分配")
    elif current_user.is_team_admin:
        if target_user.team_code != current_user.team_code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能为自己团队的用户分配角色")
        if role_ids:
            roles = (await db.execute(select(Role).where(Role.id.in_(role_ids)))).scalars().all()
            for role in roles:
                if role.team_code != current_user.team_code:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"角色 '{role.name}' 不属于当前团队，无法分配")

    user = await RoleService.assign_roles_to_user(db, user_id, role_ids)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    await RoleService.invalidate_user_perm_cache(redis_client, user_id)
    return ResponseModel.success_response(data={"user_id": user_id, "role_ids": role_ids}, message="分配角色成功", code=status.HTTP_200_OK)


@router.get("/users/{user_id}/permissions", summary="获取用户权限", tags=["管理接口 > RBAC管理"])
async def get_user_permissions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if current_user.is_team_admin and target_user.team_code != current_user.team_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能查看自己团队用户的权限")

    permissions = await RoleService.get_user_permissions(db, user_id)
    return ResponseModel.success_response(
        data=[permission_to_response(p).model_dump() for p in permissions],
        message="获取用户权限成功",
        code=status.HTTP_200_OK,
    )
