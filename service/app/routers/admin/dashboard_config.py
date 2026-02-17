"""
用户工作台布局配置路由
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.response import ResponseModel
from app.services.dashboard_config_service import get_config_cached, save_config
from app.schemas.user import UserResponse
from app.schemas.user_dashboard_config import DashboardConfigResponse, DashboardConfigUpdate

router = APIRouter()


@router.get("/dashboard-config", summary="获取工作台配置", tags=["管理接口 > 工作台配置"])
async def get_dashboard_config(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取当前用户的工作台布局配置"""
    cfg = await get_config_cached(db, current_user.id)
    return ResponseModel.success_response(
        data=DashboardConfigResponse(layout=cfg.layout or []).model_dump(),
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.put("/dashboard-config", summary="保存工作台配置", tags=["管理接口 > 工作台配置"])
async def save_dashboard_config(
    data: DashboardConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """保存当前用户的工作台布局配置（全量覆盖）"""
    cfg = await save_config(db, current_user.id, data)
    return ResponseModel.success_response(
        data=DashboardConfigResponse(layout=cfg.layout or []).model_dump(),
        message="保存成功",
        code=status.HTTP_200_OK,
    )
