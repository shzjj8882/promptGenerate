# -*- coding: utf-8 -*-
"""
组合调试配置管理路由
"""
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.core.response import ResponseModel
from app.schemas.user import UserResponse
from app.schemas.composition import CompositionCreate, CompositionUpdate, CompositionResponse
from app.services.composition_service import CompositionService

router = APIRouter()


@router.get("/compositions", summary="获取组合列表", tags=["管理接口 > 组合"])
async def list_compositions(
    skip: int = Query(0, ge=0, description="跳过条数"),
    limit: int = Query(10, ge=1, le=100, description="每页条数"),
    keyword: Optional[str] = Query(None, description="按名称搜索"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """获取当前团队可见的组合列表（支持分页和关键词搜索）"""
    team_id = current_user.team_id if not current_user.is_superuser else None
    items, total = await CompositionService.list_compositions(
        db, team_id=team_id, keyword=keyword, skip=skip, limit=limit
    )
    return ResponseModel.success_response(
        data={
            "items": [CompositionResponse.model_validate(c).model_dump() for c in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.post("/compositions", status_code=status.HTTP_201_CREATED, summary="创建组合", tags=["管理接口 > 组合"])
async def create_composition(
    data: CompositionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """创建组合配置"""
    team_id = current_user.team_id if not current_user.is_superuser else None
    comp = await CompositionService.create(db, data, team_id=team_id)
    return ResponseModel.success_response(
        data=CompositionResponse.model_validate(comp).model_dump(),
        message="创建成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/compositions/{composition_id}", summary="更新组合", tags=["管理接口 > 组合"])
async def update_composition(
    composition_id: str,
    data: CompositionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """更新组合配置"""
    comp = await CompositionService.get_by_id(db, composition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="组合不存在")
    if not current_user.is_superuser and comp.team_id and comp.team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="无权限操作此组合")
    updated = await CompositionService.update(db, composition_id, data)
    return ResponseModel.success_response(
        data=CompositionResponse.model_validate(updated).model_dump(),
        message="更新成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/compositions/{composition_id}", summary="删除组合", tags=["管理接口 > 组合"])
async def delete_composition(
    composition_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """删除组合配置"""
    comp = await CompositionService.get_by_id(db, composition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="组合不存在")
    if not current_user.is_superuser and comp.team_id and comp.team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="无权限操作此组合")
    await CompositionService.delete(db, composition_id)
    return ResponseModel.success_response(
        data=None,
        message="删除成功",
        code=status.HTTP_200_OK,
    )
