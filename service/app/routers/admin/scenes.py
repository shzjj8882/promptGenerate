# -*- coding: utf-8 -*-
"""
Admin 场景管理相关路由
场景数据持久化在 DB，事务在 SceneService 内提交。
"""
from fastapi import APIRouter, Depends, status, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_permission
from app.core.database import get_db
from app.schemas.user import UserResponse
from app.services.scene_service import SceneService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


async def require_scenes_list_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("scenes:list", current_user, db)


async def require_scenes_create_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("scenes:create", current_user, db)


async def require_scenes_update_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("scenes:update", current_user, db)


async def require_scenes_delete_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("scenes:delete", current_user, db)


class PlaceholderItem(BaseModel):
    key: str
    label: str
    description: Optional[str] = None


class SceneCreate(BaseModel):
    code: str
    name: str
    placeholders: Optional[List[PlaceholderItem]] = None


class SceneUpdate(BaseModel):
    name: str
    placeholders: Optional[List[PlaceholderItem]] = None


@router.get("/scenes", summary="获取场景列表")
async def get_scenes(
    current_user: UserResponse = Depends(require_scenes_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取场景列表（按用户角色过滤）。"""
    filtered_scenes = await SceneService.list_scenes(db, current_user)
    return ResponseModel.success_response(
        data=filtered_scenes,
        message="获取场景列表成功",
        code=status.HTTP_200_OK,
    )


@router.post("/scenes", status_code=status.HTTP_201_CREATED, summary="创建场景")
async def create_scene(
    scene_data: SceneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_scenes_create_permission),
):
    """创建场景及占位符，事务在 Service 内提交。"""
    placeholders = None
    if scene_data.placeholders:
        placeholders = [p.model_dump() for p in scene_data.placeholders]
    try:
        new_scene = await SceneService.create_scene(
            db, scene_data.code, scene_data.name, current_user, placeholders=placeholders
        )
        return ResponseModel.success_response(
            data=new_scene,
            message="创建场景成功",
            code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("创建场景失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建场景失败，请稍后重试",
        )


@router.put("/scenes/{scene_code}", summary="更新场景")
async def update_scene(
    scene_code: str,
    scene_data: SceneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_scenes_update_permission),
):
    """更新场景名称及占位符，事务在 Service 内提交。"""
    placeholders = None
    if scene_data.placeholders is not None:
        placeholders = [p.model_dump() for p in scene_data.placeholders]
    try:
        updated = await SceneService.update_scene(
            db, scene_code, scene_data.name, current_user, placeholders=placeholders
        )
        return ResponseModel.success_response(
            data=updated,
            message="更新场景成功",
            code=status.HTTP_200_OK,
        )
    except ValueError as e:
        if "不存在" in str(e):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("更新场景失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新场景失败，请稍后重试",
        )


@router.delete("/scenes/{scene_code}", summary="删除场景")
async def delete_scene(
    scene_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_scenes_delete_permission),
):
    """删除场景及其提示词、占位符，事务在 Service 内提交。预置场景不可删除。"""
    try:
        result = await SceneService.delete_scene(db, scene_code, current_user)
        return ResponseModel.success_response(
            data=result,
            message=f"删除场景成功，已删除 {result.get('deleted_prompts_count', 0)} 个提示词和 {result.get('deleted_placeholders_count', 0)} 个占位符",
            code=status.HTTP_200_OK,
        )
    except ValueError as e:
        if "预置场景" in str(e):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        if "不存在" in str(e):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("删除场景失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除场景失败，请稍后重试",
        )
