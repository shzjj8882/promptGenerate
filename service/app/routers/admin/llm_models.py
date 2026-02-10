"""
LLM 模型管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.services.llm_model_service import LLMModelService
from app.schemas.llm_model import LLMModelCreate, LLMModelUpdate, LLMModelResponse
from app.schemas.user import UserResponse
from app.models.team import Team
from sqlalchemy import select

router = APIRouter()


@router.get("/models", summary="获取模型列表", tags=["管理接口 > 模型管理"])
async def get_models(
    team_id: Optional[str] = Query(None, description="团队ID，不传则返回全局配置"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    获取模型列表
    
    - 系统管理员：可以查看全局配置和所有团队的配置
    - 团队管理员：只能查看自己团队的配置和全局配置
    """
    # 权限检查和过滤
    if current_user.is_superuser:
        # 系统管理员可以查看所有配置
        target_team_id = team_id
    elif current_user.is_team_admin:
        # 团队管理员只能查看自己团队的配置和全局配置
        if team_id and team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的配置"
            )
        target_team_id = current_user.team_id if not team_id else team_id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要团队管理员或系统管理员权限"
        )
    
    # 团队管理员：可以看到自己团队的配置 + 全局配置
    # 系统管理员：可以查看指定团队的配置或全局配置
    if current_user.is_team_admin and not current_user.is_superuser:
        # 团队管理员：获取自己团队的模型 + 全局模型
        team_models = await LLMModelService.get_models(
            db, team_id=current_user.team_id, is_active=is_active, skip=0, limit=1000
        )
        global_models = await LLMModelService.get_models(
            db, team_id=None, is_active=is_active, skip=0, limit=1000
        )
        # 合并结果（去重）
        all_models = {m.id: m for m in team_models}
        for m in global_models:
            if m.id not in all_models:
                all_models[m.id] = m
        models = list(all_models.values())
        # 应用分页
        models = models[skip:skip + limit]
    else:
        # 系统管理员：按指定 team_id 查询
        models = await LLMModelService.get_models(
            db, team_id=target_team_id, is_active=is_active, skip=skip, limit=limit
        )
    
    total = len(models)  # 简化处理，实际应该查询总数
    
    return ResponseModel.success_response(
        data={
            "items": [LLMModelResponse.model_validate(m).model_dump() for m in models],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取模型列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/models/{model_id}", summary="获取模型详情", tags=["管理接口 > 模型管理"])
async def get_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """获取模型详情"""
    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser and current_user.is_team_admin:
        if model.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的配置"
            )
    
    return ResponseModel.success_response(
        data=LLMModelResponse.model_validate(model).model_dump(),
        message="获取模型成功",
        code=status.HTTP_200_OK
    )


@router.post("/models", status_code=status.HTTP_201_CREATED, summary="创建模型", tags=["管理接口 > 模型管理"])
async def create_model(
    model_data: LLMModelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    创建模型配置
    
    - 系统管理员：可以创建全局配置和任何团队的配置
    - 团队管理员：只能创建自己团队的配置
    """
    team_id = None
    
    if current_user.is_superuser:
        # 系统管理员可以创建全局配置或指定团队的配置
        team_id = model_data.team_id
    elif current_user.is_team_admin:
        # 团队管理员只能创建自己团队的配置
        if model_data.team_id and model_data.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能创建自己团队的配置"
            )
        team_id = current_user.team_id
    
    model = await LLMModelService.create_model(db, model_data, team_id=team_id)
    
    return ResponseModel.success_response(
        data=LLMModelResponse.model_validate(model).model_dump(),
        message="创建模型成功",
        code=status.HTTP_201_CREATED
    )


@router.put("/models/{model_id}", summary="更新模型", tags=["管理接口 > 模型管理"])
async def update_model(
    model_id: str,
    model_data: LLMModelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """更新模型配置"""
    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser and current_user.is_team_admin:
        if model.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能更新自己团队的配置"
            )
    
    updated_model = await LLMModelService.update_model(db, model_id, model_data)
    
    return ResponseModel.success_response(
        data=LLMModelResponse.model_validate(updated_model).model_dump(),
        message="更新模型成功",
        code=status.HTTP_200_OK
    )


@router.delete("/models/{model_id}", summary="删除模型", tags=["管理接口 > 模型管理"])
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """删除模型配置"""
    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser and current_user.is_team_admin:
        if model.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能删除自己团队的配置"
            )
    
    success = await LLMModelService.delete_model(db, model_id)
    
    return ResponseModel.success_response(
        data=None,
        message="删除模型成功",
        code=status.HTTP_200_OK
    )


@router.get("/models/default", summary="获取默认模型", tags=["管理接口 > 模型管理"])
async def get_default_model(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取当前团队的默认模型（优先团队配置，其次全局配置）"""
    team_id = current_user.team_id if current_user.team_id else None
    
    model = await LLMModelService.get_default_model(db, team_id=team_id)
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到默认模型配置"
        )
    
    return ResponseModel.success_response(
        data=LLMModelResponse.model_validate(model).model_dump(),
        message="获取默认模型成功",
        code=status.HTTP_200_OK
    )
