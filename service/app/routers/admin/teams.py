"""
Admin 团队管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_permission
from app.services.team_service import TeamService
from app.schemas.team import TeamCreate, TeamUpdate, TeamResponse
from app.schemas.user import UserResponse

router = APIRouter()


@router.post("/teams", status_code=status.HTTP_201_CREATED, summary="创建团队", tags=["管理接口 > 团队管理"])
async def create_team(
    team_data: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    创建团队（需要超级管理员权限）
    
    创建新的团队代码，用于用户注册时的团队验证。
    """
    try:
        team = await TeamService.create_team(db, team_data)
        team_response = TeamResponse.model_validate(team)
        return ResponseModel.success_response(
            data=team_response.model_dump(),
            message="创建团队成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/teams", summary="获取团队列表", tags=["管理接口 > 团队管理"])
async def get_teams(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队列表（需要超级管理员权限）"""
    teams = await TeamService.get_teams(db, skip=skip, limit=limit, is_active=is_active)
    total = await TeamService.count_teams(db, is_active=is_active)
    
    # 为每个团队添加成员数量
    team_list = []
    for team in teams:
        team_dict = TeamResponse.model_validate(team).model_dump()
        member_count = await TeamService.get_team_member_count(db, team.code)
        team_dict["member_count"] = member_count
        team_list.append(team_dict)
    
    return ResponseModel.success_response(
        data={
            "items": team_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取团队列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/{team_id}", summary="获取团队详情", tags=["管理接口 > 团队管理"])
async def get_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队详情（需要超级管理员权限）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="获取团队详情成功",
        code=status.HTTP_200_OK
    )


@router.put("/teams/{team_id}", summary="更新团队", tags=["管理接口 > 团队管理"])
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """更新团队信息（需要超级管理员权限）"""
    try:
        team = await TeamService.update_team(db, team_id, team_data)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="团队不存在"
            )
        
        team_response = TeamResponse.model_validate(team)
        return ResponseModel.success_response(
            data=team_response.model_dump(),
            message="更新团队成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/teams/{team_id}/reset-authcode", summary="重置团队认证码", tags=["管理接口 > 团队管理"])
async def reset_team_authcode(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """重置团队的 API 认证码（需要超级管理员权限）"""
    team = await TeamService.reset_team_authcode(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="重置认证码成功",
        code=status.HTTP_200_OK
    )


@router.delete("/teams/{team_id}", summary="删除团队", tags=["管理接口 > 团队管理"])
async def delete_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """删除团队（需要超级管理员权限）"""
    success = await TeamService.delete_team(db, team_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    return ResponseModel.success_response(
        data=None,
        message="删除团队成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/my-team", summary="获取当前用户的团队信息", tags=["管理接口 > 团队管理"])
async def get_my_team(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取当前登录用户所属团队的信息（包括 authcode）"""
    if not current_user.team_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未关联团队"
        )
    
    # 优化：优先使用 team_id 查询（如果存在），避免通过 team_code 查询
    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
    else:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="获取团队信息成功",
        code=status.HTTP_200_OK
    )


async def _require_team_reset_authcode(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 team:reset_authcode 接口权限"""
    return await require_permission("team:reset_authcode", current_user, db)


@router.post("/teams/my-team/reset-authcode", summary="重置当前用户的团队认证码", tags=["管理接口 > 团队管理"])
async def reset_my_team_authcode(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(_require_team_reset_authcode),
):
    """重置当前登录用户所属团队的 API 认证码（需要 team:reset_authcode 权限，只能重置自己团队的认证码）"""
    if not current_user.team_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未关联团队"
        )
    
    # 优化：优先使用 team_id 查询（如果存在），避免通过 team_code 查询
    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
    else:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    # 重置认证码
    updated_team = await TeamService.reset_team_authcode(db, team.id)
    if not updated_team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(updated_team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="重置认证码成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/{team_id}/members", summary="获取团队成员列表", tags=["管理接口 > 团队管理"])
async def get_team_members(
    team_id: str,
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    search: Optional[str] = Query(None, description="搜索关键词（用户名、邮箱、全名）"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队成员列表（需要超级管理员权限）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    members = await TeamService.get_team_members(db, team.code, skip=skip, limit=limit, search=search)
    total = await TeamService.get_team_member_count(db, team.code, search=search)
    
    return ResponseModel.success_response(
        data={
            "items": members,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取团队成员列表成功",
        code=status.HTTP_200_OK
    )
