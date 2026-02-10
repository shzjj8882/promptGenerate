"""
Admin 认证相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.database import get_db, get_redis_optional
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.services.user_service import UserService
from app.schemas.user import (
    UserCreate, UserResponse, Token, UserLogin, UserUpdate, UserPasswordUpdate, UserAdminUpdate,
    UserInviteRequest, UserCreateByAdminRequest
)
from app.core.permissions import require_superuser

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="用户注册")
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """用户注册（需要提供团队代码）"""
    try:
        user = await UserService.create_user(db, user_data)
        token = await UserService.create_user_token(user)
        return ResponseModel.success_response(
            data={"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user).model_dump()},
            message="注册成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/login", summary="用户登录")
async def login(
    user_data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """用户登录"""
    user = await UserService.authenticate_user(db, user_data.username, user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = await UserService.create_user_token(user)
    return ResponseModel.success_response(
        data={"access_token": token, "token_type": "bearer", "user": UserResponse.model_validate(user).model_dump()},
        message="登录成功",
        code=status.HTTP_200_OK
    )


@router.get("/me", summary="获取当前用户信息")
async def get_current_user_info(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis_client=Depends(get_redis_optional),
):
    """
    获取当前登录用户信息（需要认证）
    
    根据JWT令牌获取当前登录用户的详细信息，并返回菜单/接口权限 code 列表，供前端动态菜单与路由守卫使用。
    权限码一次查询返回并可选 Redis 缓存（TTL 300s），减轻 DB 压力。
    同时返回用户所属团队的 authcode（如果存在），用于生成业务场景的 CURL 命令。
    """
    from app.services.rbac_service import RoleService
    from app.services.team_service import TeamService
    
    codes = await RoleService.get_user_permission_codes(db, current_user.id, redis_client=redis_client)
    
    # 优化：获取用户团队的 authcode（如果用户有团队）
    # 优先使用 team_id 查询（如果存在），避免通过 team_code 查询
    team_authcode = None
    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
        if team:
            team_authcode = team.authcode
    elif current_user.team_code:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
        if team:
            team_authcode = team.authcode
    
    data = {
        **current_user.model_dump(),
        "menu_permission_codes": codes["menu"],
        "api_permission_codes": codes["api"],
        "team_authcode": team_authcode,  # 团队认证码，用于生成业务场景的 CURL 命令
    }
    return ResponseModel.success_response(
        data=data,
        message="获取用户信息成功",
        code=status.HTTP_200_OK
    )


@router.put("/me", summary="更新当前用户信息")
async def update_current_user_info(
    user_update: UserUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前登录用户信息（需要认证）"""
    try:
        updated_user = await UserService.update_user(
            db=db,
            user_id=current_user.id,
            email=user_update.email,
            full_name=user_update.full_name,
        )
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在",
            )
        user_response = UserResponse.model_validate(updated_user)
        return ResponseModel.success_response(
            data=user_response.model_dump(),
            message="更新用户信息成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/me/password", summary="更新当前用户密码")
async def update_current_user_password(
    password_update: UserPasswordUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前登录用户密码（需要认证）"""
    try:
        success = await UserService.update_user_password(
            db=db,
            user_id=current_user.id,
            old_password=password_update.old_password,
            new_password=password_update.new_password,
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在",
            )
        return ResponseModel.success_response(
            data=None,
            message="更新密码成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/users", summary="获取用户列表", tags=["管理接口 > 用户管理"])
async def get_users(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    team_code: Optional[str] = Query(None, description="团队代码筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    获取用户列表
    
    - 系统超级管理员：可以看到所有团队的用户（可以通过 team_code 参数筛选）
    - 团队管理员：只能查看自己团队的用户
    """
    from app.core.permissions import require_team_admin_or_superuser
    
    # 检查权限
    require_team_admin_or_superuser(current_user)
    
    # 权限过滤
    if current_user.is_superuser:
        # 系统管理员可以看到所有团队的用户（如果指定了 team_code 则筛选该团队）
        if team_code:
            users = await UserService.get_users(
                db, skip=skip, limit=limit, is_active=is_active, team_code=team_code
            )
            total = await UserService.count_users(db, is_active=is_active, team_code=team_code)
        else:
            # 不指定 team_code 时，返回所有用户（包括系统管理员团队）
            users = await UserService.get_users(
                db, skip=skip, limit=limit, is_active=is_active
            )
            total = await UserService.count_users(db, is_active=is_active)
    elif current_user.is_team_admin:
        # 团队管理员只能查看自己团队的用户（忽略 team_code 参数）
        users = await UserService.get_users(
            db, skip=skip, limit=limit, is_active=is_active, team_code=current_user.team_code
        )
        total = await UserService.count_users(db, is_active=is_active, team_code=current_user.team_code)
    else:
        # 不应该到达这里（权限检查已确保）
        users = []
        total = 0
    
    user_list = [UserResponse.model_validate(u) for u in users]
    return ResponseModel.success_response(
        data={
            "items": user_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取用户列表成功",
        code=status.HTTP_200_OK
    )


@router.post("/users", summary="创建用户（系统管理员）", tags=["管理接口 > 用户管理"])
async def create_user_by_admin(
    user_create: UserCreateByAdminRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    系统管理员为团队创建用户
    
    - 系统超级管理员：可以为任何团队创建用户，可以设置团队管理员
    - 团队管理员：不能使用此接口（应使用邀请接口）
    """
    # 检查权限：只有系统管理员可以使用此接口
    require_superuser(current_user)
    
    # 验证团队是否存在
    from app.services.team_service import TeamService
    team = await TeamService.get_team_by_code(db, user_create.team_code)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"团队代码 '{user_create.team_code}' 不存在"
        )
    if not team.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"团队代码 '{user_create.team_code}' 已被禁用"
        )
    
    # 创建用户
    try:
        create_data = UserCreate(
            username=user_create.username,
            email=user_create.email,
            full_name=user_create.full_name,
            password=user_create.password,
            team_code=user_create.team_code
        )
        new_user = await UserService.create_user(db, create_data)
        
        # 如果指定了团队管理员，更新用户
        if user_create.is_team_admin:
            updated_user = await UserService.update_user(
                db=db,
                user_id=new_user.id,
                is_team_admin=True
            )
            if updated_user:
                new_user = updated_user
        
        user_response = UserResponse.model_validate(new_user)
        return ResponseModel.success_response(
            data=user_response.model_dump(),
            message="创建用户成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/users/invite", summary="邀请团队成员注册", tags=["管理接口 > 用户管理"])
async def invite_team_member(
    invite_request: UserInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    团队管理员邀请团队成员注册
    
    - 团队管理员：可以通过团队code邀请成员注册（自动关联到自己的团队）
    - 系统管理员：不能使用此接口（应使用创建用户接口）
    """
    # 检查权限：只有团队管理员可以使用此接口
    if not current_user.is_team_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有团队管理员可以邀请团队成员"
        )
    
    # 系统管理员不应该使用此接口
    if current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="系统管理员应使用创建用户接口"
        )
    
    # 确保用户有团队
    if not current_user.team_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户未关联团队，无法邀请成员"
        )
    
    # 创建用户（自动关联到当前用户的团队）
    try:
        user_create = UserCreate(
            username=invite_request.username,
            email=invite_request.email,
            full_name=invite_request.full_name,
            password=invite_request.password,
            team_code=current_user.team_code  # 自动使用当前用户的团队代码
        )
        new_user = await UserService.create_user(db, user_create)
        user_response = UserResponse.model_validate(new_user)
        return ResponseModel.success_response(
            data=user_response.model_dump(),
            message="邀请团队成员成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/users/{user_id}", summary="删除用户（管理员）", tags=["管理接口 > 用户管理"])
async def delete_user_admin(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    删除用户（仅系统超级管理员）
    
    - 系统超级管理员：可以删除任何用户
    - 删除用户时会同时删除用户的角色关联
    """
    # 检查权限：只有系统超级管理员可以删除用户
    require_superuser(current_user)
    
    # 获取目标用户
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 不能删除自己
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己的账户"
        )
    
    try:
        success = await UserService.delete_user(db, user_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )
        
        return ResponseModel.success_response(
            data=None,
            message="删除用户成功",
            code=status.HTTP_200_OK
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("删除用户失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除用户失败，请稍后重试"
        )


@router.put("/users/{user_id}", summary="更新用户信息（管理员）", tags=["管理接口 > 用户管理"])
async def update_user_admin(
    user_id: str,
    user_update: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    管理员更新用户信息
    
    - 系统超级管理员：可以更新所有用户，包括设置团队管理员和团队代码
    - 团队管理员：只能更新自己团队的用户，不能设置团队管理员和团队代码
    """
    from app.core.permissions import require_team_admin_or_superuser
    from app.services.team_service import TeamService
    
    # 检查权限
    require_team_admin_or_superuser(current_user)
    
    # 获取目标用户
    target_user = await UserService.get_user_by_id(db, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 团队管理员只能更新自己团队的用户
    if not current_user.is_superuser and current_user.is_team_admin:
        if target_user.team_code != current_user.team_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能管理自己团队的用户"
            )
        # 团队管理员不能设置团队管理员和团队代码
        if user_update.is_team_admin is not None or user_update.team_code is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="团队管理员无权设置团队管理员或修改团队代码"
            )
    
    # 如果更新团队代码，验证团队是否存在
    if user_update.team_code is not None and user_update.team_code != target_user.team_code:
        team = await TeamService.get_team_by_code(db, user_update.team_code)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"团队代码 '{user_update.team_code}' 不存在"
            )
        if not team.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"团队代码 '{user_update.team_code}' 已被禁用"
            )
    
    try:
        updated_user = await UserService.update_user(
            db=db,
            user_id=user_id,
            email=user_update.email,
            full_name=user_update.full_name,
            is_team_admin=user_update.is_team_admin,
            team_code=user_update.team_code,
        )
        
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在",
            )
        
        user_response = UserResponse.model_validate(updated_user)
        return ResponseModel.success_response(
            data=user_response.model_dump(),
            message="更新用户信息成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
