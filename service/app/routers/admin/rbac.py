"""
Admin RBAC（基于角色的访问控制）管理相关路由
"""
import json
import logging
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.core.database import get_db, get_redis_optional
from app.core.response import ResponseModel
from app.services.rbac_service import RoleService, PermissionService
from app.schemas.rbac import (
    RoleCreate, RoleUpdate, RoleResponse,
    PermissionCreate, PermissionUpdate, PermissionResponse,
    UserRoleAssign, RolePermissionAssign, MenuTreeNode,
)
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_team_admin_or_superuser
from app.services.user_service import UserService
from app.schemas.user import UserResponse
from app.models.rbac import Role, Permission

logger = logging.getLogger(__name__)


def permission_to_response(permission: Permission) -> PermissionResponse:
    """将 Permission 对象安全地转换为 PermissionResponse，避免访问未加载的关联关系"""
    perm_dict = {
        "id": permission.id,
        "name": permission.name,
        "code": permission.code,
        "resource": permission.resource,
        "action": permission.action,
        "type": permission.type,
        "description": permission.description,
        "parent_id": permission.parent_id,
        "sort_order": permission.sort_order,
        "is_active": permission.is_active,
        "created_at": permission.created_at,
        "updated_at": permission.updated_at,
        "children": [],  # 不返回子权限树，避免异步加载问题
    }
    return PermissionResponse.model_validate(perm_dict)


def role_to_response(role: Role) -> RoleResponse:
    """将 Role 对象安全地转换为 RoleResponse，避免访问未加载的关联关系"""
    # 安全地获取权限列表，避免 lazy-loading 问题
    permissions_list = []
    if role.permissions:
        # permissions 已经通过 selectinload 加载，可以直接访问
        for perm in role.permissions:
            permissions_list.append(permission_to_response(perm).model_dump())
    
    role_dict = {
        "id": role.id,
        "name": role.name,
        "code": role.code,
        "team_code": role.team_code,
        "description": role.description,
        "is_active": role.is_active,
        "permissions": permissions_list,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
    }
    return RoleResponse.model_validate(role_dict)


router = APIRouter()


# ==================== 权限管理接口 ====================

@router.get("/permissions/grouped", summary="按菜单/接口与功能组分组获取权限", tags=["管理接口 > RBAC管理"])
async def get_permissions_grouped(
    is_active: Optional[bool] = Query(True, description="是否只返回已激活"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """返回平铺的权限列表及展示顺序/文案，前端用 groupBy 按类型组合（需要团队管理员或超级管理员权限）"""
    grouped = await PermissionService.get_permissions_grouped(db, is_active=is_active)
    items = grouped.get("items") or []
    out = {
        "items": [permission_to_response(p).model_dump() for p in items],
        "resource_order": grouped.get("resource_order") or [],
        "resource_labels": grouped.get("resource_labels") or {},
    }
    return ResponseModel.success_response(
        data=out,
        message="获取成功",
        code=status.HTTP_200_OK
    )


@router.get("/menus/tree", summary="获取菜单树", tags=["管理接口 > RBAC管理"])
async def get_menu_tree(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    redis_client=Depends(get_redis_optional),
):
    """
    获取当前用户的菜单树结构（包含二级菜单）
    
    菜单顺序逻辑：
    - 优先使用团队级别的菜单配置（如果团队编辑过）
    - 如果团队没有编辑过，则使用系统管理员的全局配置
    - 仅影响团队成员
    
    返回树形结构，每个节点包含：
    - id: 权限ID
    - name: 权限名称
    - code: 权限代码
    - parent_id / parentId: 父权限ID（None 表示根节点）
    - sort_order / sortOrder: 排序顺序
    - children: 子菜单列表（数组，空数组表示叶子节点）
    
    树结构说明：
    - 根节点：parent_id 为 None 的节点
    - 子节点：parent_id 指向父节点 id 的节点
    - 支持多级嵌套（理论上无限层级）
    """
    from app.core.cache import CACHE_KEY_PREFIXES, CACHE_TTL, get_cache, set_cache
    import json
    
    # 构建缓存 key（包含用户ID和团队信息）
    cache_key = f"{CACHE_KEY_PREFIXES['menu_tree']}user:{current_user.id}:team:{current_user.team_code or 'none'}:super:{current_user.is_superuser}:admin:{current_user.is_team_admin}"
    
    # 尝试从缓存读取
    if redis_client:
        try:
            cached = await get_cache(cache_key)
            if cached:
                return ResponseModel.success_response(
                    data=json.loads(cached),
                    message="获取菜单树成功（缓存）",
                    code=status.HTTP_200_OK
                )
        except Exception as e:
            logger.warning(f"菜单树缓存读取失败: {e}")
    
    # 直接传递 team_code，让服务层处理团队ID查询（避免重复查询）
    root_perms, children_map = await PermissionService.get_menu_tree(
        db, user_id=current_user.id, is_active=True
    )
    
    # 递归构建树结构（使用字典，避免操作 SQLAlchemy 对象）
    def build_tree_node(perm: Permission) -> dict:
        """将 Permission 对象转换为树节点字典"""
        node_data = {
            "id": perm.id,
            "name": perm.name,
            "code": perm.code,
            "resource": perm.resource,
            "action": perm.action,
            "type": perm.type,
            "description": perm.description,
            "parent_id": perm.parent_id,
            "parentId": perm.parent_id,  # camelCase 格式
            "sort_order": perm.sort_order,
            "sortOrder": perm.sort_order,  # camelCase 格式
            "is_active": perm.is_active,
        }
        
        # 递归构建子节点
        if perm.id in children_map:
            node_data['children'] = [build_tree_node(child) for child in children_map[perm.id]]
        else:
            node_data['children'] = []
        
        return node_data
    
    # 构建完整的树结构
    tree_data = [build_tree_node(perm) for perm in root_perms]
    
    # 写入缓存
    if redis_client:
        try:
            await set_cache(cache_key, json.dumps(tree_data), CACHE_TTL["menu_tree"])
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"菜单树缓存写入失败: {e}")
    
    return ResponseModel.success_response(
        data=tree_data,
        message="获取菜单树成功",
        code=status.HTTP_200_OK
    )


@router.get("/permissions", summary="获取权限列表", tags=["管理接口 > RBAC管理"])
async def get_permissions(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    resource: Optional[str] = Query(None, description="资源筛选"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    type: Optional[str] = Query(None, description="权限类型：menu=菜单权限，api=接口权限"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """获取权限列表（需要团队管理员或超级管理员权限）"""
    permissions = await PermissionService.get_permissions(
        db, skip=skip, limit=limit, resource=resource, is_active=is_active, permission_type=type
    )
    total = await PermissionService.count_permissions(
        db, resource=resource, is_active=is_active, permission_type=type
    )
    # 使用辅助函数安全转换，避免访问未加载的 children 关联关系
    permission_list = [permission_to_response(p) for p in permissions]
    return ResponseModel.success_response(
        data={
            "items": permission_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取权限列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/permissions/{permission_id}", summary="获取权限详情", tags=["管理接口 > RBAC管理"])
async def get_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取权限详情（需要超级管理员权限）"""
    permission = await PermissionService.get_permission_by_id(db, permission_id)
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )
    
    return ResponseModel.success_response(
        data=permission_to_response(permission).model_dump(),
        message="获取权限成功",
        code=status.HTTP_200_OK
    )


@router.post("/permissions", status_code=status.HTTP_201_CREATED, summary="创建权限", tags=["管理接口 > RBAC管理"])
async def create_permission(
    permission_data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """创建权限（需要超级管理员权限）"""
    try:
        permission = await PermissionService.create_permission(db, permission_data)
        return ResponseModel.success_response(
            data=PermissionResponse.model_validate(permission).model_dump(),
            message="创建权限成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/permissions/{permission_id}", summary="更新权限", tags=["管理接口 > RBAC管理"])
async def update_permission(
    permission_id: str,
    permission_data: PermissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """更新权限（需要超级管理员权限）"""
    permission = await PermissionService.update_permission(db, permission_id, permission_data)
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )
    
    return ResponseModel.success_response(
        data=permission_to_response(permission).model_dump(),
        message="更新权限成功",
        code=status.HTTP_200_OK
    )


@router.put("/menus/{permission_id}/config", summary="更新菜单配置", tags=["管理接口 > RBAC管理"])
async def update_menu_config(
    permission_id: str,
    parent_id: Optional[str] = Body(None, description="父权限ID（留空表示根菜单）"),
    sort_order: int = Body(0, description="排序顺序"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    """
    更新菜单配置（支持团队级别的覆盖）
    
    - 系统管理员：更新全局配置（team_id 为 NULL），影响所有未自定义的团队
    - 团队管理员：更新自己团队的配置（team_id 为该团队的 ID），仅影响该团队的成员
    
    菜单顺序逻辑：
    - 系统管理员编辑的是全局配置
    - 团队没有修改过菜单时，团队采用系统管理员的配置
    - 如果团队编辑了以后，仅影响团队的成员
    """
    from app.models.team import Team
    
    # 检查权限是否存在且是菜单权限
    permission = await PermissionService.get_permission_by_id(db, permission_id)
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )
    
    if permission.type != Permission.TYPE_MENU:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能配置菜单权限"
        )
    
    # 确定 team_id
    team_id = None
    if current_user.is_superuser:
        # 系统管理员更新全局配置
        team_id = None
    elif current_user.is_team_admin:
        # 团队管理员更新自己团队的配置
        if not current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="团队管理员必须属于某个团队"
            )
        team_result = await db.execute(
            select(Team.id).where(Team.code == current_user.team_code)
        )
        team_row = team_result.scalar_one_or_none()
        if not team_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="团队不存在"
            )
        team_id = team_row
    
    # 更新或创建菜单配置
    config = await PermissionService.update_menu_config(
        db, permission_id, parent_id, sort_order, team_id
    )
    
    # 清除相关的菜单树缓存
    # 如果是全局配置更新，清除所有菜单树缓存；如果是团队配置更新，只清除该团队的缓存
    if redis_client:
        try:
            from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_pattern
            cache_prefix = CACHE_KEY_PREFIXES['menu_tree']
            if team_id is None:
                # 全局配置更新，清除所有菜单树缓存
                await delete_cache_pattern(f"{cache_prefix}*")
            else:
                # 团队配置更新，只清除该团队的缓存
                await delete_cache_pattern(f"{cache_prefix}*team:{current_user.team_code}*")
        except Exception as e:
            logger.warning(f"清除菜单树缓存失败: {e}")
    
    return ResponseModel.success_response(
        data={
            "id": config.id,
            "permission_id": config.permission_id,
            "team_id": config.team_id,
            "parent_id": config.parent_id,
            "sort_order": config.sort_order,
        },
        message="更新菜单配置成功",
        code=status.HTTP_200_OK
    )


@router.delete("/permissions/{permission_id}", summary="删除权限（已禁用）", tags=["管理接口 > RBAC管理"])
async def delete_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """权限不可删除，保留接口仅为兼容前端，实际调用返回 403"""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="权限不可删除",
    )


# ==================== 角色管理接口 ====================

@router.get("/roles", summary="获取角色列表", tags=["管理接口 > RBAC管理"])
async def get_roles(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取角色列表
    
    - 系统超级管理员：只能查看全局角色（team_code 为 None）
    - 团队管理员：只能查看自己团队的角色
    """
    # 系统管理员只能查看全局角色（team_code 为 None），团队管理员只能查看自己团队的角色
    if current_user.is_superuser:
        # 系统管理员只查看全局角色（team_code 为 None）
        roles = await RoleService.get_roles(db, skip=skip, limit=limit, is_active=is_active, only_global=True)
        total = await RoleService.count_roles(db, is_active=is_active, only_global=True)
    elif current_user.is_team_admin:
        # 团队管理员查看自己团队的角色
        roles = await RoleService.get_roles(db, skip=skip, limit=limit, is_active=is_active, team_code=current_user.team_code)
        total = await RoleService.count_roles(db, is_active=is_active, team_code=current_user.team_code)
    else:
        # 不应该到达这里（权限检查已确保）
        roles = []
        total = 0
    
    # 使用辅助函数安全转换，避免访问未加载的关联关系
    role_list = [role_to_response(r).model_dump() for r in roles]
    return ResponseModel.success_response(
        data={
            "items": role_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取角色列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/roles/{role_id}", summary="获取角色详情", tags=["管理接口 > RBAC管理"])
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取角色详情
    
    - 系统超级管理员：只能查看全局角色（team_code 为 None）
    - 团队管理员：只能查看自己团队的角色
    """
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能查看全局角色（team_code 为 None）
        if role.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能查看全局角色"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能查看自己团队的角色
        if role.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的角色"
            )
    
    # 使用辅助函数安全转换，避免访问未加载的关联关系
    return ResponseModel.success_response(
        data=role_to_response(role).model_dump(),
        message="获取角色成功",
        code=status.HTTP_200_OK
    )


@router.post("/roles", status_code=status.HTTP_201_CREATED, summary="创建角色", tags=["管理接口 > RBAC管理"])
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    创建角色
    
    - 系统超级管理员：只能创建全局角色（team_code为None）
    - 团队管理员：只能创建自己团队的角色（team_code自动设置为当前用户的team_code）
    """
    # 系统管理员创建的角色team_code为None（全局角色），团队管理员创建的角色team_code为当前团队
    team_code = None
    if current_user.is_superuser:
        # 系统管理员只能创建全局角色
        team_code = None
    elif current_user.is_team_admin:
        # 团队管理员创建的角色自动设置为当前团队
        team_code = current_user.team_code
    
    try:
        role = await RoleService.create_role(db, role_data, team_code=team_code)
        role_loaded = await RoleService.get_role_by_id(db, role.id)
        # 使用辅助函数安全转换，避免访问未加载的关联关系
        return ResponseModel.success_response(
            data=role_to_response(role_loaded).model_dump(),
            message="创建角色成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/roles/{role_id}", summary="更新角色", tags=["管理接口 > RBAC管理"])
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    """
    更新角色
    
    - 系统超级管理员：只能更新全局角色（team_code 为 None）
    - 团队管理员：只能更新自己团队的角色
    """
    # 获取角色
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能更新全局角色（team_code 为 None）
        if role.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能更新全局角色"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能更新自己团队的角色
        if role.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能更新自己团队的角色"
            )
    
    updated_role = await RoleService.update_role(db, role_id, role_data)
    if not updated_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    await RoleService.invalidate_user_perm_cache_for_role(db, redis_client, role_id)
    # 在当期会话中重新加载，避免 Pydantic 校验时触发惰性加载导致 MissingGreenlet
    role_loaded = await RoleService.get_role_by_id(db, role_id)
    # 使用辅助函数安全转换，避免访问未加载的关联关系
    return ResponseModel.success_response(
        data=role_to_response(role_loaded).model_dump(),
        message="更新角色成功",
        code=status.HTTP_200_OK
    )


@router.delete("/roles/{role_id}", summary="删除角色", tags=["管理接口 > RBAC管理"])
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    """
    删除角色
    
    - 系统超级管理员：只能删除全局角色（team_code 为 None）
    - 团队管理员：只能删除自己团队的角色
    """
    # 获取角色
    role = await RoleService.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能删除全局角色（team_code 为 None）
        if role.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能删除全局角色"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能删除自己团队的角色
        if role.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能删除自己团队的角色"
            )
    
    await RoleService.invalidate_user_perm_cache_for_role(db, redis_client, role_id)
    success = await RoleService.delete_role(db, role_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    return ResponseModel.success_response(
        data=None,
        message="删除角色成功",
        code=status.HTTP_200_OK
    )


# ==================== 用户角色分配接口 ====================

@router.post("/users/roles-batch", summary="批量获取用户角色", tags=["管理接口 > RBAC管理"])
async def get_user_roles_batch(
    user_ids: List[str] = Body(..., embed=True, description="用户ID列表"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    批量获取用户角色ID，返回 { user_id: [role_id, ...] }
    
    - 系统超级管理员：只能查看全局角色（team_code 为 None）
    - 团队管理员：只能查看自己团队用户的角色，且只返回属于自己团队的角色
    """
    # 权限检查和过滤
    if current_user.is_superuser:
        # 系统管理员只能查看全局角色（team_code 为 None）
        data = await RoleService.get_user_role_ids_batch(db, user_ids or [], only_global=True)
    elif current_user.is_team_admin:
        # 验证所有用户都属于当前团队
        for user_id in user_ids:
            target_user = await UserService.get_user_by_id(db, user_id)
            if target_user and target_user.team_code != current_user.team_code:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="只能查看自己团队用户的角色"
                )
        # 只返回属于自己团队的角色
        data = await RoleService.get_user_role_ids_batch(db, user_ids or [], team_code=current_user.team_code)
    else:
        data = {}
    return ResponseModel.success_response(
        data=data,
        message="批量获取用户角色成功",
        code=status.HTTP_200_OK
    )


@router.get("/users/{user_id}/roles", summary="获取用户角色", tags=["管理接口 > RBAC管理"])
async def get_user_roles(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取用户当前的角色ID列表
    
    - 系统超级管理员：只能查看全局角色（team_code 为 None）
    - 团队管理员：只能查看自己团队用户的角色，且只返回属于自己团队的角色
    """
    # 获取目标用户
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 权限检查和过滤
    if current_user.is_superuser:
        # 系统管理员只能查看全局角色（team_code 为 None）
        role_ids = await RoleService.get_user_role_ids(db, user_id, only_global=True)
    elif current_user.is_team_admin:
        # 团队管理员只能查看自己团队用户的角色
        if target_user.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队用户的角色"
            )
        # 只返回属于自己团队的角色
        role_ids = await RoleService.get_user_role_ids(db, user_id, team_code=current_user.team_code)
    else:
        role_ids = []
    return ResponseModel.success_response(
        data=role_ids,
        message="获取用户角色成功",
        code=status.HTTP_200_OK
    )


@router.post("/users/{user_id}/roles", summary="为用户分配角色", tags=["管理接口 > RBAC管理"])
async def assign_roles_to_user(
    user_id: str,
    role_ids: List[str] = Body(..., description="角色ID列表"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
    redis_client=Depends(get_redis_optional),
):
    """
    为用户分配角色
    
    - 系统超级管理员：只能为用户分配全局角色（team_code 为 None）
    - 团队管理员：只能为自己团队的用户分配角色，且只能分配属于自己团队的角色
    """
    # 获取目标用户
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 权限检查和验证
    if current_user.is_superuser:
        # 系统管理员只能分配全局角色（team_code 为 None）
        if role_ids:
            roles_result = await db.execute(
                select(Role).where(Role.id.in_(role_ids))
            )
            roles = roles_result.scalars().all()
            for role in roles:
                if role.team_code is not None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"系统管理员只能分配全局角色，角色 '{role.name}' 属于团队 '{role.team_code}'，无法分配"
                    )
    elif current_user.is_team_admin:
        # 团队管理员只能为自己团队的用户分配角色，且只能分配属于自己团队的角色
        if target_user.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能为自己团队的用户分配角色"
            )
        
        # 验证所有角色都属于当前团队
        if role_ids:
            roles_result = await db.execute(
                select(Role).where(Role.id.in_(role_ids))
            )
            roles = roles_result.scalars().all()
            for role in roles:
                if role.team_code != current_user.team_code:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"角色 '{role.name}' 不属于当前团队，无法分配"
                    )
    
    user = await RoleService.assign_roles_to_user(db, user_id, role_ids)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    await RoleService.invalidate_user_perm_cache(redis_client, user_id)
    return ResponseModel.success_response(
        data={"user_id": user_id, "role_ids": role_ids},
        message="分配角色成功",
        code=status.HTTP_200_OK
    )


@router.get("/users/{user_id}/permissions", summary="获取用户权限", tags=["管理接口 > RBAC管理"])
async def get_user_permissions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取用户的所有权限（通过角色）
    
    - 系统超级管理员：可以查看任何用户的权限
    - 团队管理员：只能查看自己团队用户的权限
    """
    # 获取目标用户
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 团队管理员只能查看自己团队用户的权限
    if not current_user.is_superuser and current_user.is_team_admin:
        if target_user.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队用户的权限"
            )
    
    permissions = await RoleService.get_user_permissions(db, user_id)
    permission_list = [permission_to_response(p) for p in permissions]
    
    return ResponseModel.success_response(
        data=permission_list,
        message="获取用户权限成功",
        code=status.HTTP_200_OK
    )

