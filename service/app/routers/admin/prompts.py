"""
Admin 提示词管理相关路由
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.services.prompt_service import PromptService, PlaceholderService
from app.schemas.prompt import (
    PromptCreate,
    PromptUpdate,
    PromptResponse,
    PlaceholderResponse,
    PlaceholderCreate,
    PlaceholderUpdate,
)
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_permission, require_team_admin_or_superuser
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== 接口权限依赖封装（提示词管理） ====================

async def require_prompts_create_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 prompts:create 接口权限"""
    return await require_permission("prompts:create", current_user, db)


async def require_prompts_update_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 prompts:update 接口权限"""
    return await require_permission("prompts:update", current_user, db)


async def require_prompts_delete_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 prompts:delete 接口权限"""
    return await require_permission("prompts:delete", current_user, db)


@router.get("/prompts", summary="获取提示词列表")
async def get_prompts(
    scene: Optional[str] = Query(None, description="场景筛选"),
    tenant_id: Optional[str] = Query(None, description="租户ID筛选"),
    is_default: Optional[bool] = Query(None, description="是否默认提示词"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    获取提示词列表（需要认证）
    
    支持按场景、租户、是否默认等条件筛选，支持分页。
    
    查询逻辑：
    - 系统管理员：查询 team_code 为 None 的数据（全局默认提示词）
    - 团队管理员：查询 team_code 为该团队的数据（团队默认提示词）
    """
    # 系统管理员查询 team_code 为 None，团队管理员查询 team_code 为该团队
    team_code = None if current_user.is_superuser else current_user.team_code
    
    prompts = await PromptService.get_prompts(
        db, scene=scene, tenant_id=tenant_id, is_default=is_default, skip=skip, limit=limit, team_code=team_code
    )
    return ResponseModel.success_response(
        data=[PromptResponse.model_validate(p).model_dump() for p in prompts],
        message="获取提示词列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/prompts/by_scene_tenant", summary="按场景和租户获取提示词")
async def get_prompt_by_scene_tenant(
    scene: str = Query(..., description="场景"),
    tenant_id: str = Query(..., description="租户ID（default 表示默认）"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    按场景和租户获取单条提示词（需要认证）
    
    如果不存在则返回 data=None。
    """
    # 非超级管理员只能看到自己团队的数据
    team_code = None if current_user.is_superuser else current_user.team_code
    
    prompts = await PromptService.get_prompts(
        db, scene=scene, tenant_id=tenant_id, skip=0, limit=1, team_code=team_code
    )
    prompt = prompts[0] if prompts else None
    return ResponseModel.success_response(
        data=PromptResponse.model_validate(prompt).model_dump() if prompt else None,
        message="获取提示词成功",
        code=status.HTTP_200_OK,
    )


@router.get("/prompts/{prompt_id}", summary="获取单个提示词")
async def get_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    获取单个提示词详情（需要认证）
    
    根据提示词ID获取详细信息。
    """
    prompt = await PromptService.get_prompt_by_id(db, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="提示词不存在")
    return ResponseModel.success_response(
        data=PromptResponse.model_validate(prompt).model_dump(),
        message="获取提示词成功",
        code=status.HTTP_200_OK,
    )


@router.post("/prompts", summary="创建提示词")
async def create_prompt(
    prompt_data: PromptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_prompts_create_permission),
):
    """
    创建提示词（需要认证）
    
    创建新的提示词配置。如果租户已有该场景的提示词，将创建新的记录。
    如果是默认提示词（tenant_id="default"）：
    - 系统管理员：team_code 为 None（全局默认提示词）
    - 团队管理员：team_code 为该团队的 team_code（团队默认提示词）
    """
    # 如果是默认提示词，根据用户角色设置team_code
    team_code = None
    if prompt_data.tenant_id == "default":
        if current_user.is_superuser:
            # 系统管理员：team_code 为 None（全局默认提示词）
            team_code = None
        else:
            # 团队管理员：team_code 为该团队的 team_code
            team_code = current_user.team_code
    
    prompt = await PromptService.create_prompt(db, prompt_data, team_code=team_code)
    return ResponseModel.success_response(
        data=PromptResponse.model_validate(prompt).model_dump(),
        message="创建提示词成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/prompts/{prompt_id}", summary="更新提示词")
async def update_prompt(
    prompt_id: str,
    prompt_data: PromptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_prompts_update_permission),
):
    """
    更新提示词（需要认证）
    
    根据提示词ID更新提示词内容。
    
    权限检查：
    - 系统管理员：只能更新 team_code 为 None 的默认提示词
    - 团队管理员：只能更新 team_code 为该团队的默认提示词
    """
    # 先获取提示词，检查权限
    prompt = await PromptService.get_prompt_by_id(db, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="提示词不存在")
    
    # 如果是默认提示词，检查权限
    if prompt.is_default:
        if current_user.is_superuser:
            # 系统管理员只能更新 team_code 为 None 的默认提示词
            if prompt.team_code is not None:
                raise HTTPException(
                    status_code=403,
                    detail="系统管理员只能更新全局默认提示词（team_code 为 None）"
                )
        else:
            # 团队管理员只能更新 team_code 为该团队的默认提示词
            if prompt.team_code != current_user.team_code:
                raise HTTPException(
                    status_code=403,
                    detail="您只能更新自己团队的默认提示词"
                )
    
    # 更新提示词
    updated_prompt = await PromptService.update_prompt(db, prompt_id, prompt_data)
    if not updated_prompt:
        raise HTTPException(status_code=404, detail="提示词不存在")
    
    return ResponseModel.success_response(
        data=PromptResponse.model_validate(updated_prompt).model_dump(),
        message="更新提示词成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/prompts/{prompt_id}", summary="删除提示词")
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_prompts_delete_permission),
):
    """
    删除提示词（需要认证）
    
    注意：默认提示词不允许删除。
    """
    success = await PromptService.delete_prompt(db, prompt_id)
    if not success:
        raise HTTPException(status_code=404, detail="提示词不存在或不允许删除")
    return ResponseModel.success_response(
        data=None,
        message="删除成功",
        code=status.HTTP_200_OK,
    )


@router.get("/placeholders", summary="获取占位符列表")
async def get_placeholders(
    scene: Optional[str] = Query(None, description="场景筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    获取占位符列表（需要认证）
    
    支持按场景筛选。如果不传场景参数，则返回所有占位符。
    返回当前团队可见的占位符（系统管理员可以看到所有团队的占位符）。
    """
    try:
        # 获取团队信息
        team_id = current_user.team_id if not current_user.is_superuser else None
        team_code = current_user.team_code if not current_user.is_superuser else None
        
        if scene:
            placeholders = await PlaceholderService.get_placeholders_by_scene(
                db, scene, team_id=team_id, team_code=team_code
            )
        else:
            placeholders = await PlaceholderService.get_all_placeholders(
                db, team_id=team_id, team_code=team_code
            )
        
        return ResponseModel.success_response(
            data=[PlaceholderResponse.model_validate(p).model_dump() for p in placeholders],
            message="获取占位符成功",
            code=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.exception(f"获取占位符列表失败: scene={scene}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取占位符列表失败: {str(e)}"
        )


@router.post("/placeholders", status_code=status.HTTP_201_CREATED, summary="创建占位符")
async def create_placeholder(
    placeholder_data: PlaceholderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    创建占位符（需要团队管理员或系统超级管理员权限）
    
    创建新的占位符配置。key 在团队内必须唯一。
    系统管理员创建的占位符 team_id 为 None，团队管理员创建的占位符关联到其团队。
    """
    try:
        # 获取团队信息：系统管理员创建 team_id 为 None 的占位符，团队管理员创建关联到其团队的占位符
        team_id = None if current_user.is_superuser else current_user.team_id
        team_code = None if current_user.is_superuser else current_user.team_code
        
        placeholder = await PlaceholderService.create_placeholder(
            db, placeholder_data, team_id=team_id, team_code=team_code
        )
        return ResponseModel.success_response(
            data=PlaceholderResponse.model_validate(placeholder).model_dump(),
            message="创建占位符成功",
            code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/placeholders/{placeholder_id}", summary="更新占位符")
async def update_placeholder(
    placeholder_id: str,
    placeholder_data: PlaceholderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    更新占位符（需要团队管理员或系统超级管理员权限）
    
    只能更新自己团队的占位符（系统管理员可以更新 team_id 为 None 的占位符）。
    """
    try:
        # 获取团队信息：系统管理员可以更新 team_id 为 None 的占位符，团队管理员只能更新自己团队的占位符
        team_id = None if current_user.is_superuser else current_user.team_id
        team_code = None if current_user.is_superuser else current_user.team_code
        
        placeholder = await PlaceholderService.update_placeholder(
            db, placeholder_id, placeholder_data, team_id=team_id, team_code=team_code
        )
        if not placeholder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="占位符不存在或无权限访问"
            )
        return ResponseModel.success_response(
            data=PlaceholderResponse.model_validate(placeholder).model_dump(),
            message="更新占位符成功",
            code=status.HTTP_200_OK,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/placeholders/{placeholder_id}", summary="删除占位符")
async def delete_placeholder(
    placeholder_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """
    删除占位符（需要团队管理员或系统超级管理员权限，软删除）
    
    只能删除自己团队的占位符（系统管理员可以删除 team_id 为 None 的占位符）。
    """
    # 获取团队信息：系统管理员可以删除 team_id 为 None 的占位符，团队管理员只能删除自己团队的占位符
    team_id = None if current_user.is_superuser else current_user.team_id
    team_code = None if current_user.is_superuser else current_user.team_code
    
    success = await PlaceholderService.delete_placeholder(
        db, placeholder_id, team_id=team_id, team_code=team_code
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="占位符不存在或无权限访问"
        )
    return ResponseModel.success_response(
        data=None,
        message="删除占位符成功",
        code=status.HTTP_200_OK,
    )



