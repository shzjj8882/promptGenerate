"""
Admin 租户管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.database import get_db
from app.core.response import ResponseModel
from app.services.prompt_service import TenantService
from app.schemas.prompt import TenantCreate, TenantUpdate, TenantResponse, TenantListItem
from app.core.auth import get_current_user
from app.core.permissions import require_permission
from app.schemas.user import UserResponse

router = APIRouter()


# ==================== 接口权限依赖封装（租户管理） ====================


async def require_tenant_list_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 tenant:list 接口权限"""
    return await require_permission("tenant:list", current_user, db)


async def require_tenant_detail_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 tenant:detail 接口权限"""
    return await require_permission("tenant:detail", current_user, db)


async def require_tenant_create_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 tenant:create 接口权限"""
    return await require_permission("tenant:create", current_user, db)


async def require_tenant_update_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 tenant:update 接口权限"""
    return await require_permission("tenant:update", current_user, db)


async def require_tenant_delete_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 tenant:delete 接口权限"""
    return await require_permission("tenant:delete", current_user, db)


@router.get("", summary="获取租户列表")
async def get_tenants(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    include_deleted: bool = Query(False, description="是否包含已删除的租户"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_tenant_list_permission),
):
    """
    获取租户列表（需要认证）
    
    支持分页查询。列表接口不返回 `app_id` 和 `app_secret` 字段。
    
    数据隔离规则：
    - 系统管理员：只能查看系统管理员团队的租户
    - 团队管理员和普通用户：只能查看自己团队的租户
    """
    from app.core.team_data_filter import get_user_accessible_team_ids
    
    # 根据用户权限过滤租户数据
    # 系统管理员：可以看到所有团队的租户（不添加过滤条件）
    # 团队管理员和普通用户：只能看到自己团队的租户
    if current_user.is_superuser:
        # 系统管理员可以看到所有租户
        tenants = await TenantService.get_tenants(
            db, skip=skip, limit=limit, include_deleted=include_deleted
        )
        total = await TenantService.count_tenants(db, include_deleted=include_deleted)
    elif current_user.team_id:
        # 优先使用 team_id 查询
        tenants = await TenantService.get_tenants(
            db, skip=skip, limit=limit, include_deleted=include_deleted, team_id=current_user.team_id
        )
        total = await TenantService.count_tenants(db, include_deleted=include_deleted, team_id=current_user.team_id)
    elif current_user.team_code:
        # 兼容旧代码：使用 team_code
        tenants = await TenantService.get_tenants(
            db, skip=skip, limit=limit, include_deleted=include_deleted, team_code=current_user.team_code
        )
        total = await TenantService.count_tenants(db, include_deleted=include_deleted, team_code=current_user.team_code)
    else:
        # 用户没有团队，返回空结果
        tenants = []
        total = 0
    # 列表接口不返回 app_id 和 app_secret
    tenant_list = [TenantListItem.model_validate(t) for t in tenants]
    return ResponseModel.success_response(
        data={
            "items": tenant_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取租户列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/{tenant_id}", summary="获取单个租户")
async def get_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_tenant_detail_permission),
):
    """
    获取单个租户详情（需要认证）
    
    根据租户ID获取详细信息，包括 `app_id` 和 `app_secret`。
    
    - 系统超级管理员：只能查看系统创建的租户（team_code 为 None）
    - 团队管理员：只能查看自己团队的租户
    """
    tenant = await TenantService.get_tenant_by_id(db, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="租户不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能查看系统创建的租户（team_code 为 None）
        if tenant.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能查看系统创建的租户"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能查看自己团队的租户
        if tenant.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的租户"
            )
    
    return ResponseModel.success_response(
        data=TenantResponse.model_validate(tenant).model_dump(),
        message="获取租户信息成功",
        code=status.HTTP_200_OK
    )


@router.post("", status_code=status.HTTP_201_CREATED, summary="创建租户")
async def create_tenant(
    tenant_data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_tenant_create_permission),
):
    """
    创建租户（需要认证）
    
    创建新的租户配置。`code_id` 由用户输入，`id` 为自增主键。
    
    - 系统超级管理员：创建的数据 team_code 为 None
    - 团队管理员：创建的数据 team_code 为该团队的 team_code
    """
    # 根据用户角色设置team_code
    team_code = None
    if current_user.is_superuser:
        # 系统管理员创建的数据 team_code 为 None
        team_code = None
    elif current_user.is_team_admin:
        # 团队管理员创建的数据 team_code 为该团队的 team_code
        team_code = current_user.team_code
    
    try:
        tenant = await TenantService.create_tenant(
            db, tenant_data, created_by=current_user.id, team_code=team_code
        )
        return ResponseModel.success_response(
            data=TenantResponse.model_validate(tenant).model_dump(),
            message="创建租户成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{tenant_id}", summary="更新租户")
async def update_tenant(
    tenant_id: str,
    tenant_data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_tenant_update_permission),
):
    """
    更新租户信息（需要认证）
    
    根据租户ID更新租户配置。
    
    - 系统超级管理员：只能更新系统创建的租户（team_code 为 None）
    - 团队管理员：只能更新自己团队的租户
    """
    # 先获取租户，检查权限
    tenant = await TenantService.get_tenant_by_id(db, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="租户不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能更新系统创建的租户（team_code 为 None）
        if tenant.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能更新系统创建的租户"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能更新自己团队的租户
        if tenant.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能更新自己团队的租户"
            )
    
    try:
        updated_tenant = await TenantService.update_tenant(
            db, tenant_id, tenant_data, updated_by=current_user.id
        )
        if not updated_tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="租户不存在"
            )
        
        return ResponseModel.success_response(
            data=TenantResponse.model_validate(updated_tenant).model_dump(),
            message="更新租户成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{tenant_id}", summary="删除租户")
async def delete_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_tenant_delete_permission),
):
    """
    删除租户（逻辑删除，需要认证）
    
    执行逻辑删除，不会物理删除数据。如果租户有关联的提示词，需要先处理这些关联数据。
    
    - 系统超级管理员：只能删除系统创建的租户（team_code 为 None）
    - 团队管理员：只能删除自己团队的租户
    """
    # 先获取租户，检查权限
    tenant = await TenantService.get_tenant_by_id(db, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="租户不存在"
        )
    
    # 权限检查
    if current_user.is_superuser:
        # 系统管理员只能删除系统创建的租户（team_code 为 None）
        if tenant.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统管理员只能删除系统创建的租户"
            )
    elif current_user.is_team_admin:
        # 团队管理员只能删除自己团队的租户
        if tenant.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能删除自己团队的租户"
            )
    
    success = await TenantService.delete_tenant(
        db, tenant_id, updated_by=current_user.id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="租户不存在或已被删除"
        )
    
    return ResponseModel.success_response(
        data=None,
        message="删除租户成功",
        code=status.HTTP_200_OK
    )

