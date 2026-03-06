# -*- coding: utf-8 -*-
"""
组合调试配置管理路由
"""
from fastapi import APIRouter, Depends, Query, Path, Body, status, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any, List

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.core.response import ResponseModel
from app.schemas.user import UserResponse
from app.schemas.composition import CompositionCreate, CompositionUpdate, CompositionResponse
from app.services.composition_service import CompositionService
from app.services.llmchat_api_executor import (
    execute_api_prompt_request,
    stream_llm_chat_request,
)
from app.routers.api.llmchat import LLMConfig, NotificationOption
from app.models.prompt import Prompt
from app.core.config import settings
from pydantic import BaseModel

router = APIRouter()


class CompositionLlmRequest(BaseModel):
    """组合 LLM 模式请求体（Admin 调试）"""
    additional_params: Optional[Dict[str, Any]] = {}
    llm_config: Optional[LLMConfig] = None
    user_message: str = ""
    conversation_id: Optional[str] = None
    model_id: Optional[str] = None
    mcp_id: Optional[str] = None
    mcp_tool_names: Optional[List[str]] = None


class CompositionRequestRequest(BaseModel):
    """组合接口模式请求体（Admin 调试）"""
    additional_params: Optional[Dict[str, Any]] = {}
    llm_config: Optional[LLMConfig] = None
    user_message: str = ""
    conversation_id: Optional[str] = None
    model_id: Optional[str] = None
    mcp_id: Optional[str] = None
    mcp_tool_names: Optional[List[str]] = None
    notification: Optional[NotificationOption] = None


async def _resolve_composition_prompt_admin(
    db,
    composition_id: str,
    tenant_id: str,
    prompt_id: str,
    team_id: Optional[str],
):
    """解析组合、租户、提示词，返回 (composition, prompt, tenant_code, team_id)"""
    comp = await CompositionService.get_by_id(db, composition_id)
    if not comp or not comp.is_active:
        raise HTTPException(status_code=404, detail="组合不存在或已禁用")

    prompt = await db.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="提示词不存在")

    if tenant_id != "default":
        from app.services.prompt_service import TenantService
        tenant = await TenantService.get_tenant_by_id(db, tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="租户不存在")
        if str(prompt.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=400,
                detail=f"提示词不属于该租户，期望 tenant_id={prompt.tenant_id}"
            )
        tenant_code = tenant.code_id
    else:
        if str(prompt.tenant_id) != "default":
            raise HTTPException(
                status_code=400,
                detail="路径 tenant 为 default 时，提示词须为默认提示词"
            )
        tenant_code = None

    return comp, prompt, tenant_code, team_id


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


@router.post(
    "/compositions/{composition_id}/tenant/{tenant_id}/prompt/{prompt_id}/llm",
    summary="组合 LLM 模式（SSE 流式）— Dashboard 调试",
    tags=["管理接口 > 组合"],
)
async def composition_llm_debug(
    composition_id: str = Path(..., description="组合 ID"),
    tenant_id: str = Path(..., description="租户 ID，default 表示默认提示词"),
    prompt_id: str = Path(..., description="提示词 ID"),
    request: CompositionLlmRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 组合调试 - LLM 消息模式，使用 Bearer Token，team_id 取自当前用户"""
    team_id = str(current_user.team_id) if current_user.team_id else None
    comp, prompt, tenant_code, _ = await _resolve_composition_prompt_admin(
        db, composition_id, tenant_id, prompt_id, team_id
    )
    if comp.mode != "chat":
        raise HTTPException(status_code=400, detail="该组合为接口模式，请使用 /request 端点")

    request_dict = {
        "tenantCode": tenant_code,
        "teamCode": current_user.team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id or comp.model_id,
        "mcp_id": request.mcp_id or comp.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or comp.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }

    # Admin 调试不校验配额，无次数限制

    async def sse_stream():
        async for chunk in stream_llm_chat_request(
            db=db,
            scene=prompt.scene,
            request_dict=request_dict,
            team_code=current_user.team_code,
            team_id=team_id,
        ):
            yield chunk

    return StreamingResponse(
        sse_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/compositions/{composition_id}/tenant/{tenant_id}/prompt/{prompt_id}/request",
    summary="组合接口模式（同步/异步）— Dashboard 调试",
    tags=["管理接口 > 组合"],
)
async def composition_request_debug(
    composition_id: str = Path(..., description="组合 ID"),
    tenant_id: str = Path(..., description="租户 ID，default 表示默认提示词"),
    prompt_id: str = Path(..., description="提示词 ID"),
    request: CompositionRequestRequest = Body(...),
    sync: bool = Query(False, description="设为 true 时同步等待 LLM 返回，否则走异步队列"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 组合调试 - 接口模式，使用 Bearer Token，team_id 取自当前用户"""
    team_id = str(current_user.team_id) if current_user.team_id else None
    comp, prompt, tenant_code, _ = await _resolve_composition_prompt_admin(
        db, composition_id, tenant_id, prompt_id, team_id
    )
    if comp.mode != "api":
        raise HTTPException(status_code=400, detail="该组合为 LLM 消息模式，请使用 /llm 端点")

    request_dict = {
        "tenantCode": tenant_code,
        "teamCode": current_user.team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id or comp.model_id,
        "mcp_id": request.mcp_id or comp.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or comp.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }

    notif = request.notification
    use_async = comp.task_mode == "async"
    if use_async and (comp.notification_config or (notif and notif.email_to)):
        notif_cfg = comp.notification_config or {}
        request_dict["notification"] = {
            "type": (notif.type if notif and notif.type else None) or "email",
            "email_to": (notif.email_to if notif else None) or notif_cfg.get("email_to"),
            "config_id": (notif.config_id if notif else None) or notif_cfg.get("config_id"),
            "email_content_type": (notif.email_content_type if notif else None) or notif_cfg.get("email_content_type", "html"),
        }
        if request_dict["notification"].get("email_to"):
            from app.services.llmchat_task_service import LLMChatTaskService
            task = await LLMChatTaskService.create_task(
                db=db,
                scene=prompt.scene,
                request_payload=request_dict,
                team_id=team_id,
                notification_type="email",
                notification_config=request_dict["notification"],
            )
            await db.commit()
            await LLMChatTaskService.push_task_to_stream(
                task_id=task.id,
                scene=prompt.scene,
                request_payload=request_dict,
                team_id=team_id,
                notification_type="email",
                notification_config=request_dict["notification"],
            )
            return ResponseModel.success_response(
                data={"task_id": task.id, "status": "pending", "message": "任务已提交，完成后将发送邮件通知"},
                message="异步任务已创建",
            )

    if not use_async and not sync and getattr(settings, "LLM_API_ASYNC_DEFAULT", True):
        from app.services.llmchat_task_service import LLMChatTaskService
        task = await LLMChatTaskService.create_task(
            db=db,
            scene=prompt.scene,
            request_payload=request_dict,
            team_id=team_id,
            notification_type="none",
            notification_config=None,
        )
        await db.commit()
        await LLMChatTaskService.push_task_to_stream(
            task_id=task.id,
            scene=prompt.scene,
            request_payload=request_dict,
            team_id=team_id,
            notification_type="none",
            notification_config=None,
        )
        return ResponseModel.success_response(
            data={"task_id": task.id, "status": "pending", "message": "任务已提交，请轮询 GET /api/llmchat/tasks/{task_id} 获取结果"},
            message="异步任务已创建",
        )

    content, err = await execute_api_prompt_request(
        db=db,
        scene=prompt.scene,
        request_dict=request_dict,
        team_code=current_user.team_code,
        team_id=team_id,
        skip_quota_check=True,
    )
    if err:
        raise HTTPException(status_code=500, detail=err)
    return ResponseModel.success_response(
        data={"content": content, "scene": prompt.scene, "tenant_id": tenant_id},
        message="请求成功",
    )
