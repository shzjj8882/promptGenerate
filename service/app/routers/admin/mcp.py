"""
MCP 配置管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.services.mcp_service import MCPService
from app.schemas.mcp import (
    MCPConfigCreate,
    MCPConfigUpdate,
    MCPConfigResponse,
    MCPVerifyRequest,
    MCPVerifyResponse,
)
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/mcp", summary="获取 MCP 配置列表", tags=["管理接口 > MCP 配置"])
async def list_mcps(
    team_id: Optional[str] = Query(None, description="团队ID，不传则返回全局配置"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取 MCP 配置列表
    - 系统管理员：可查看全局配置和指定团队的配置
    - 团队管理员：只能查看自己团队的配置和全局配置
    """
    if current_user.is_superuser:
        if team_id:
            mcps = await MCPService.list_mcps(db, team_id=team_id, is_active=is_active, skip=skip, limit=limit)
        else:
            # 超管不传 team_id 时返回所有配置
            mcps = await MCPService.list_all_mcps(db, is_active=is_active, skip=skip, limit=limit)
    else:
        # 团队管理员：团队配置 + 全局配置
        mcps = await MCPService.list_mcps(
            db,
            team_id=current_user.team_id,
            is_active=is_active,
            skip=skip,
            limit=limit,
            include_global=True,
        )

    total = len(mcps)

    return ResponseModel.success_response(
        data={
            "items": [MCPConfigResponse.model_validate(m).model_dump() for m in mcps],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取 MCP 列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/mcp/list-for-debug", summary="获取用于调试的 MCP 列表", tags=["管理接口 > MCP 配置"])
async def list_mcps_for_debug(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取当前用户可用的 MCP 配置（用于场景调试中的 MCP 选择）"""
    mcps = await MCPService.list_mcps_for_team(
        db,
        team_id=current_user.team_id,
        is_active=True,
    )
    return ResponseModel.success_response(
        data={
            "items": [MCPConfigResponse.model_validate(m).model_dump() for m in mcps],
        },
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.get("/mcp/{mcp_id}", summary="获取 MCP 配置详情", tags=["管理接口 > MCP 配置"])
async def get_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """获取 MCP 配置详情"""
    mcp = await MCPService.get_by_id(db, mcp_id)
    if not mcp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP 配置不存在")

    if not current_user.is_superuser and current_user.is_team_admin:
        if mcp.team_id and mcp.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能查看自己团队的配置")

    return ResponseModel.success_response(
        data=MCPConfigResponse.model_validate(mcp).model_dump(),
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.post("/mcp/verify", summary="验证 MCP 连接", tags=["管理接口 > MCP 配置"])
async def verify_mcp(
    body: MCPVerifyRequest,
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """验证 MCP 服务联通性并获取工具列表（创建前调用）"""
    transport_type = getattr(body, "transport_type", None) or "sse"
    success, message, tools = await MCPService.verify_connection(
        body.url, body.auth_info, transport_type
    )
    return ResponseModel.success_response(
        data=MCPVerifyResponse(success=success, message=message, tools=tools).model_dump(),
        message="验证完成",
        code=status.HTTP_200_OK,
    )


@router.post("/mcp", status_code=status.HTTP_201_CREATED, summary="创建 MCP 配置", tags=["管理接口 > MCP 配置"])
async def create_mcp(
    body: MCPConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    创建 MCP 配置（创建前会自动验证联通并获取工具列表）
    - 系统管理员：可创建全局配置或指定团队的配置
    - 团队管理员：只能创建自己团队的配置
    """
    team_id = None
    if current_user.is_superuser:
        team_id = body.team_id
    elif current_user.is_team_admin:
        if body.team_id and body.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能创建自己团队的配置")
        team_id = current_user.team_id

    mcp = await MCPService.create_mcp(db, body, team_id=team_id)

    return ResponseModel.success_response(
        data=MCPConfigResponse.model_validate(mcp).model_dump(),
        message="创建 MCP 配置成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/mcp/{mcp_id}", summary="更新 MCP 配置", tags=["管理接口 > MCP 配置"])
async def update_mcp(
    mcp_id: str,
    body: MCPConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """更新 MCP 配置"""
    mcp = await MCPService.get_by_id(db, mcp_id)
    if not mcp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP 配置不存在")

    if not current_user.is_superuser and current_user.is_team_admin:
        if mcp.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能更新自己团队的配置")

    try:
        updated = await MCPService.update_mcp(db, mcp_id, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return ResponseModel.success_response(
        data=MCPConfigResponse.model_validate(updated).model_dump(),
        message="更新成功",
        code=status.HTTP_200_OK,
    )


@router.post("/mcp/{mcp_id}/refresh", summary="刷新 MCP 工具列表", tags=["管理接口 > MCP 配置"])
async def refresh_mcp_tools(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """刷新 MCP 配置的工具列表"""
    mcp = await MCPService.get_by_id(db, mcp_id)
    if not mcp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP 配置不存在")

    if not current_user.is_superuser and current_user.is_team_admin:
        if mcp.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能刷新自己团队的配置")

    try:
        updated = await MCPService.refresh_tools(db, mcp_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return ResponseModel.success_response(
        data=MCPConfigResponse.model_validate(updated).model_dump(),
        message="刷新成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/mcp/{mcp_id}", summary="删除 MCP 配置", tags=["管理接口 > MCP 配置"])
async def delete_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """删除 MCP 配置"""
    mcp = await MCPService.get_by_id(db, mcp_id)
    if not mcp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP 配置不存在")

    if not current_user.is_superuser and current_user.is_team_admin:
        if mcp.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己团队的配置")

    await MCPService.delete_mcp(db, mcp_id)

    return ResponseModel.success_response(
        data=None,
        message="删除成功",
        code=status.HTTP_200_OK,
    )
