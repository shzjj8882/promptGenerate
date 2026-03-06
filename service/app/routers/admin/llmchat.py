# -*- coding: utf-8 -*-
"""
Admin LLM Chat 调试接口
Dashboard 提示词调试使用，Bearer 认证，无配额限制
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.core.response import ResponseModel
from app.schemas.user import UserResponse
from app.services.prompt_service import PromptService, TenantService, PlaceholderService
from app.services.llmchat_api_executor import (
    stream_llm_chat_request,
    execute_api_prompt_request,
)
from app.routers.api.llmchat import (
    check_if_tenant_required,
    process_placeholders_in_content,
    LLMConfig,
    PromptConvertRequest,
    PromptChatRequest,
    PromptApiRequest,
)

router = APIRouter()


@router.get("/llmchat/tasks/{task_id}", summary="查询异步任务状态（Admin）", tags=["管理接口 > LLM Chat"])
async def get_llmchat_task_admin(
    task_id: str = Path(..., description="任务ID"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 调试：查询异步任务状态"""
    from app.services.llmchat_task_service import LLMChatTaskService
    task = await LLMChatTaskService.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ResponseModel.success_response(
        data={
            "task_id": task.id,
            "status": task.status,
            "scene": task.scene,
            "result_content": task.result_content if task.status == "completed" else None,
            "error_message": task.error_message if task.status == "failed" else None,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        },
        message="获取成功"
    )


@router.post("/llmchat/prompts/{scene}/convert", summary="转换提示词（Admin）", tags=["管理接口 > LLM Chat"])
async def convert_prompt_admin(
    scene: str = Path(..., description="场景代码"),
    request: PromptConvertRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 调试：转换提示词（无配额）"""
    team_code = request.teamCode or current_user.team_code
    tenant_id = None

    if request.tenantCode:
        tenant = await TenantService.get_tenant_by_code_id(db, request.tenantCode)
        if not tenant:
            raise HTTPException(status_code=404, detail=f"未找到租户编号为 {request.tenantCode} 的租户")
        tenant_id = tenant.id
        prompts = await PromptService.get_prompts(db, scene=scene, tenant_id=tenant_id, is_default=False)
        if prompts:
            prompt = prompts[0]
        else:
            prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)

    if not prompt:
        raise HTTPException(status_code=404, detail=f"场景 {scene} 的提示词不存在")

    team_id = None
    if team_code:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        raise HTTPException(status_code=400, detail="该提示词包含需要租户信息的占位符，请提供 tenantCode")

    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request.additional_params or {},
        team_id=team_id,
        team_code=team_code,
    )

    return ResponseModel.success_response(
        data={
            "content": processed_content,
            "scene": scene,
            "tenant_id": tenant_id or "default",
        },
        message="提示词转换成功"
    )


@router.post("/llmchat/prompts/{scene}/chat", summary="提示词聊天（Admin）", tags=["管理接口 > LLM Chat"])
async def chat_prompt_admin(
    scene: str = Path(..., description="场景代码"),
    request: PromptChatRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 调试：提示词聊天 SSE 流式（无配额）"""
    team_code = request.teamCode or current_user.team_code
    team_id = str(current_user.team_id) if current_user.team_id else None

    request_dict = {
        "tenantCode": request.tenantCode,
        "teamCode": team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id,
        "mcp_id": request.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }

    async def sse_stream():
        async for chunk in stream_llm_chat_request(
            db=db,
            scene=scene,
            request_dict=request_dict,
            team_code=team_code,
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


@router.post("/llmchat/prompts/{scene}/api", summary="提示词接口模式（Admin）", tags=["管理接口 > LLM Chat"])
async def api_prompt_admin(
    scene: str = Path(..., description="场景代码"),
    request: PromptApiRequest = Body(...),
    sync: bool = Query(True, description="Admin 调试默认同步"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_team_admin_or_superuser),
):
    """Dashboard 调试：提示词接口模式（无配额）"""
    team_code = request.teamCode or current_user.team_code
    team_id = str(current_user.team_id) if current_user.team_id else None

    request_dict = {
        "tenantCode": request.tenantCode,
        "teamCode": team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id,
        "mcp_id": request.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }
    if request.notification:
        request_dict["notification"] = request.notification.model_dump()

    content, err = await execute_api_prompt_request(
        db=db,
        scene=scene,
        request_dict=request_dict,
        team_code=team_code,
        team_id=team_id,
        skip_quota_check=True,
    )
    if err:
        raise HTTPException(status_code=500, detail=err)

    tenant_id = None
    if request_dict.get("tenantCode"):
        tenant = await TenantService.get_tenant_by_code_id(db, request_dict["tenantCode"])
        if tenant:
            tenant_id = tenant.id

    return ResponseModel.success_response(
        data={"content": content, "scene": scene, "tenant_id": tenant_id or "default"},
        message="请求成功",
    )
