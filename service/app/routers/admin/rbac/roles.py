"""角色管理路由"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db, get_redis_optional
from app.core.response import ResponseModel
from app.services.rbac_service import RoleService
from app.schemas.rbac import RoleCreate, RoleUpdate
from app.core.permissions import require_team_admin_or_superuser

from ._common import role_to_response

router = APIRouter()


@router.get("/roles", summary="获取角色列表", tags=["管理接口 > RBAC管理"])
async def get_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    if current_user.is_superuser:
        roles = await RoleService.get_roles(db, skip=skip, limit=limit, is_active=is_active, only_global=True)
        total = await RoleService.count_roles(db, is_active=is_active, only_global=True)
    elif current_user.is_team_admin:
        roles = await RoleService.get_roles(db, skip=skip, limit=limit, is_active=is_active, team_code=current_user.team_code)
        total = await RoleService.count_roles(db, is_active=is_active, team_code=current_user.team_code)
    else:
        roles, total = [], 0

    return ResponseModel.success_response(
        data={"items": [role_to_response(r).model_dump() for r in roles], "total": total, "skip": skip, "limit": limit},
        message="获取角色列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/roles/{role_id}", summary="获取角色详情", tags=["管理接口 > RBAC管理"])
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if current_user.is_superuser and role.team_code is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="系统管理员只能查看全局角色")
    if current_user.is_team_admin and role.team_code != current_user.team_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能查看自己团队的角色")
    return ResponseModel.success_response(data=role_to_response(role).model_dump(), message="获取角色成功", code=status.HTTP_200_OK)


@router.post("/roles", status_code=status.HTTP_201_CREATED, summary="创建角色", tags=["管理接口 > RBAC管理"])
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    team_code = None if current_user.is_superuser else current_user.team_code
    try:
        role = await RoleService.create_role(db, role_data, team_code=team_code)
        role_loaded = await RoleService.get_role_by_id(db, role.id)
        return ResponseModel.success_response(data=role_to_response(role_loaded).model_dump(), message="创建角色成功", code=status.HTTP_201_CREATED)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/roles/{role_id}", summary="更新角色", tags=["管理接口 > RBAC管理"])
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if current_user.is_superuser and role.team_code is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="系统管理员只能更新全局角色")
    if current_user.is_team_admin and role.team_code != current_user.team_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能更新自己团队的角色")

    updated_role = await RoleService.update_role(db, role_id, role_data)
    if not updated_role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    await RoleService.invalidate_user_perm_cache_for_role(db, redis_client, role_id)
    role_loaded = await RoleService.get_role_by_id(db, role_id)
    return ResponseModel.success_response(data=role_to_response(role_loaded).model_dump(), message="更新角色成功", code=status.HTTP_200_OK)


@router.delete("/roles/{role_id}", summary="删除角色", tags=["管理接口 > RBAC管理"])
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    if current_user.is_superuser and role.team_code is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="系统管理员只能删除全局角色")
    if current_user.is_team_admin and role.team_code != current_user.team_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己团队的角色")

    await RoleService.invalidate_user_perm_cache_for_role(db, redis_client, role_id)
    success = await RoleService.delete_role(db, role_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="角色不存在")
    return ResponseModel.success_response(data=None, message="删除角色成功", code=status.HTTP_200_OK)
