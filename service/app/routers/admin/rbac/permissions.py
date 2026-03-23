"""权限与菜单管理路由"""
import json
import logging
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db, get_redis_optional
from app.core.response import ResponseModel
from app.services.rbac_service import PermissionService
from app.schemas.rbac import PermissionCreate, PermissionUpdate, PermissionResponse
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_team_admin_or_superuser
from app.models.rbac import Permission

from ._common import permission_to_response

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/permissions/grouped", summary="按菜单/接口与功能组分组获取权限", tags=["管理接口 > RBAC管理"])
async def get_permissions_grouped(
    is_active: Optional[bool] = Query(True, description="是否只返回已激活"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    exclude_team_admin_only = current_user.is_team_admin and not current_user.is_superuser
    grouped = await PermissionService.get_permissions_grouped(db, is_active=is_active, exclude_team_admin_only=exclude_team_admin_only)
    items = grouped.get("items") or []
    out = {
        "items": [permission_to_response(p).model_dump() for p in items],
        "resource_order": grouped.get("resource_order") or [],
        "resource_labels": grouped.get("resource_labels") or {},
        "type_menu_values": ["menu", "button"],
        "type_api_values": ["api"],
    }
    return ResponseModel.success_response(data=out, message="获取成功", code=status.HTTP_200_OK)


@router.get("/menus/tree", summary="获取菜单树", tags=["管理接口 > RBAC管理"])
async def get_menu_tree(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    redis_client=Depends(get_redis_optional),
):
    from app.core.cache import CACHE_KEY_PREFIXES, CACHE_TTL, get_cache, set_cache

    cache_key = f"{CACHE_KEY_PREFIXES['menu_tree']}user:{current_user.id}:team:{current_user.team_code or 'none'}:super:{current_user.is_superuser}:admin:{current_user.is_team_admin}"

    if redis_client:
        try:
            cached = await get_cache(cache_key)
            if cached:
                return ResponseModel.success_response(data=json.loads(cached), message="获取菜单树成功（缓存）", code=status.HTTP_200_OK)
        except Exception as e:
            logger.warning("菜单树缓存读取失败: %s", e)

    root_perms, children_map = await PermissionService.get_menu_tree(db, user_id=current_user.id, is_active=True)

    def build_tree_node(perm: Permission) -> dict:
        node_data = {
            "id": perm.id,
            "name": perm.name,
            "code": perm.code,
            "resource": perm.resource,
            "action": perm.action,
            "type": perm.type,
            "description": perm.description,
            "parent_id": perm.parent_id,
            "parentId": perm.parent_id,
            "sort_order": perm.sort_order,
            "sortOrder": perm.sort_order,
            "is_active": perm.is_active,
        }
        node_data["children"] = [build_tree_node(c) for c in children_map.get(perm.id, [])]
        return node_data

    tree_data = [build_tree_node(perm) for perm in root_perms]

    if redis_client:
        try:
            await set_cache(cache_key, json.dumps(tree_data), CACHE_TTL["menu_tree"])
        except Exception as e:
            logger.warning("菜单树缓存写入失败: %s", e)

    return ResponseModel.success_response(data=tree_data, message="获取菜单树成功", code=status.HTTP_200_OK)


@router.get("/permissions", summary="获取权限列表", tags=["管理接口 > RBAC管理"])
async def get_permissions(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    resource: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
):
    exclude_team_admin_only = current_user.is_team_admin and not current_user.is_superuser
    permissions = await PermissionService.get_permissions(
        db, skip=skip, limit=limit, resource=resource, is_active=is_active, permission_type=type,
        exclude_team_admin_only=exclude_team_admin_only,
    )
    total = await PermissionService.count_permissions(
        db, resource=resource, is_active=is_active, permission_type=type,
        exclude_team_admin_only=exclude_team_admin_only,
    )
    return ResponseModel.success_response(
        data={"items": [permission_to_response(p).model_dump() for p in permissions], "total": total, "skip": skip, "limit": limit},
        message="获取权限列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/permissions/{permission_id}", summary="获取权限详情", tags=["管理接口 > RBAC管理"])
async def get_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_superuser),
):
    permission = await PermissionService.get_permission_by_id(db, permission_id)
    if not permission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权限不存在")
    return ResponseModel.success_response(data=permission_to_response(permission).model_dump(), message="获取权限成功", code=status.HTTP_200_OK)


@router.post("/permissions", status_code=status.HTTP_201_CREATED, summary="创建权限", tags=["管理接口 > RBAC管理"])
async def create_permission(
    permission_data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_superuser),
):
    try:
        permission = await PermissionService.create_permission(db, permission_data)
        return ResponseModel.success_response(data=PermissionResponse.model_validate(permission).model_dump(), message="创建权限成功", code=status.HTTP_201_CREATED)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/permissions/{permission_id}", summary="更新权限", tags=["管理接口 > RBAC管理"])
async def update_permission(
    permission_id: str,
    permission_data: PermissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_superuser),
):
    permission = await PermissionService.update_permission(db, permission_id, permission_data)
    if not permission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权限不存在")
    return ResponseModel.success_response(data=permission_to_response(permission).model_dump(), message="更新权限成功", code=status.HTTP_200_OK)


@router.put("/menus/{permission_id}/config", summary="更新菜单配置", tags=["管理接口 > RBAC管理"])
async def update_menu_config(
    permission_id: str,
    parent_id: Optional[str] = Body(None),
    sort_order: int = Body(0),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    from app.models.team import Team
    from sqlalchemy import select

    permission = await PermissionService.get_permission_by_id(db, permission_id)
    if not permission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="权限不存在")
    if permission.type != Permission.TYPE_MENU:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能配置菜单权限")

    team_id = None
    if current_user.is_team_admin:
        if not current_user.team_code:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="团队管理员必须属于某个团队")
        team_row = (await db.execute(select(Team.id).where(Team.code == current_user.team_code))).scalar_one_or_none()
        if not team_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")
        team_id = team_row

    config = await PermissionService.update_menu_config(db, permission_id, parent_id, sort_order, team_id)

    if redis_client:
        try:
            from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_pattern
            cache_prefix = CACHE_KEY_PREFIXES["menu_tree"]
            if team_id is None:
                await delete_cache_pattern(f"{cache_prefix}*")
            else:
                await delete_cache_pattern(f"{cache_prefix}*team:{current_user.team_code}*")
        except Exception as e:
            logger.warning("清除菜单树缓存失败: %s", e)

    return ResponseModel.success_response(
        data={"id": config.id, "permission_id": config.permission_id, "team_id": config.team_id, "parent_id": config.parent_id, "sort_order": config.sort_order},
        message="更新菜单配置成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/permissions/{permission_id}", summary="删除权限（已禁用）", tags=["管理接口 > RBAC管理"])
async def delete_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_superuser),
):
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不可删除")
