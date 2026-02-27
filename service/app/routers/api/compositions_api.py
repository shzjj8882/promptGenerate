# -*- coding: utf-8 -*-
"""
组合调用 API
产出固定的 HTTP 请求地址，供服务端调用
URL: POST /api/compositions/{compositionId}/tenant/{tenantId}/prompt/{promptId}/llm 或 request
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.api_auth import get_team_code_from_auth
from app.core.response import ResponseModel
from app.core.config import settings
from app.services.composition_service import CompositionService
from app.services.prompt_service import PromptService, TenantService, PlaceholderService
from app.services.llmchat_api_executor import execute_api_prompt_request, stream_llm_chat_request
from app.routers.api.llmchat import LLMConfig, NotificationOption
from app.models.prompt import Prompt

router = APIRouter()


class CompositionLlmRequest(BaseModel):
    """组合 LLM 模式请求体"""
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    llm_config: Optional[LLMConfig] = Body(None, description="LLM 配置")
    user_message: str = Body(..., description="用户消息")
    conversation_id: Optional[str] = Body(None, description="会话 ID")
    model_id: Optional[str] = Body(None, description="模型 ID，覆盖组合配置")
    mcp_id: Optional[str] = Body(None, description="MCP ID，覆盖组合配置")
    mcp_tool_names: Optional[List[str]] = Body(None, description="MCP 工具列表，覆盖组合配置")


class CompositionRequestRequest(BaseModel):
    """组合接口模式请求体"""
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    llm_config: Optional[LLMConfig] = Body(None, description="LLM 配置")
    user_message: str = Body(..., description="用户消息")
    conversation_id: Optional[str] = Body(None, description="会话 ID")
    model_id: Optional[str] = Body(None, description="模型 ID，覆盖组合配置")
    mcp_id: Optional[str] = Body(None, description="MCP ID，覆盖组合配置")
    mcp_tool_names: Optional[List[str]] = Body(None, description="MCP 工具列表，覆盖组合配置")
    notification: Optional[NotificationOption] = Body(None, description="通知选项（异步时）")


async def _resolve_composition_prompt(
    db,
    composition_id: str,
    tenant_id: str,
    prompt_id: str,
    team_code: Optional[str],
):
    """解析组合、租户、提示词，返回 (composition, prompt, tenant_code, team_id)"""
    comp = await CompositionService.get_by_id(db, composition_id)
    if not comp or not comp.is_active:
        raise HTTPException(status_code=404, detail="组合不存在或已禁用")

    prompt = await db.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="提示词不存在")

    # 校验 tenant：path 的 tenant_id 需与 prompt 的 tenant_id 一致
    if tenant_id != "default":
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

    team_id = None
    if team_code:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    return comp, prompt, tenant_code, team_id


@router.post(
    "/compositions/{composition_id}/tenant/{tenant_id}/prompt/{prompt_id}/llm",
    summary="组合 LLM 模式（SSE 流式）",
    tags=["应用接口 > 组合"],
)
async def composition_llm(
    composition_id: str = Path(..., description="组合 ID"),
    tenant_id: str = Path(..., description="租户 ID，default 表示默认提示词"),
    prompt_id: str = Path(..., description="提示词 ID"),
    request: CompositionLlmRequest = Body(...),
    team_code: Optional[str] = Depends(get_team_code_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    组合 LLM 消息模式 - SSE 流式响应
    
    **URL 结构：** `POST /api/compositions/{compositionId}/tenant/{tenantId}/prompt/{promptId}/llm`
    
    - 组合须为 chat 模式
    - 占位符、邮件收件人等通过请求体传入
    """
    comp, prompt, tenant_code, team_id = await _resolve_composition_prompt(
        db, composition_id, tenant_id, prompt_id, team_code
    )
    if comp.mode != "chat":
        raise HTTPException(status_code=400, detail="该组合为接口模式，请使用 /request 端点")

    request_dict = {
        "tenantCode": tenant_code,
        "teamCode": team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id or comp.model_id,
        "mcp_id": request.mcp_id or comp.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or comp.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }

    async def sse_stream():
        async for chunk in stream_llm_chat_request(
            db=db,
            scene=prompt.scene,
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


@router.post(
    "/compositions/{composition_id}/tenant/{tenant_id}/prompt/{prompt_id}/request",
    summary="组合接口模式（同步/异步）",
    tags=["应用接口 > 组合"],
)
async def composition_request(
    composition_id: str = Path(..., description="组合 ID"),
    tenant_id: str = Path(..., description="租户 ID，default 表示默认提示词"),
    prompt_id: str = Path(..., description="提示词 ID"),
    request: CompositionRequestRequest = Body(...),
    sync: bool = Query(False, description="设为 true 时同步等待 LLM 返回，否则走异步队列"),
    team_code: Optional[str] = Depends(get_team_code_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    组合接口模式 - 同步返回内容或异步返回 task_id
    
    **URL 结构：** `POST /api/compositions/{compositionId}/tenant/{tenantId}/prompt/{promptId}/request`
    
    - 组合须为 api 模式
    - 占位符、邮件收件人通过请求体传入
    - 异步任务时 notification 中提供 email_to 等
    """
    comp, prompt, tenant_code, team_id = await _resolve_composition_prompt(
        db, composition_id, tenant_id, prompt_id, team_code
    )
    if comp.mode != "api":
        raise HTTPException(status_code=400, detail="该组合为 LLM 消息模式，请使用 /llm 端点")

    request_dict = {
        "tenantCode": tenant_code,
        "teamCode": team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "conversation_id": request.conversation_id,
        "model_id": request.model_id or comp.model_id,
        "mcp_id": request.mcp_id or comp.mcp_id,
        "mcp_tool_names": request.mcp_tool_names or comp.mcp_tool_names or [],
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
    }

    # 异步模式：使用组合的 task_mode 和 notification_config，或请求体覆盖
    notif = request.notification
    use_async = comp.task_mode == "async"
    # #region agent log
    def _api_debug_log(msg: str, data: dict):
        try:
            import json, time
            from pathlib import Path
            p = Path(__file__).resolve().parent.parent.parent.parent.parent / ".cursor" / "debug.log"
            p.parent.mkdir(parents=True, exist_ok=True)
            entry = json.dumps({"message": msg, "data": data, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n"
            with open(p, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception:
            pass
    _api_debug_log("composition_request", {"use_async": use_async, "task_mode": comp.task_mode, "notif_email_to": getattr(notif, "email_to", None) if notif else None, "comp_notif_cfg": bool(comp.notification_config)})
    # #endregion
    if use_async and (comp.notification_config or (notif and notif.email_to)):
        notif_cfg = comp.notification_config or {}
        request_dict["notification"] = {
            "type": (notif.type if notif and notif.type else None) or "email",
            "email_to": (notif.email_to if notif else None) or notif_cfg.get("email_to"),
            "config_id": (notif.config_id if notif else None) or notif_cfg.get("config_id"),
            "email_content_type": (notif.email_content_type if notif else None) or notif_cfg.get("email_content_type", "html"),
        }
        # #region agent log
        _api_debug_log("notification_built", {"email_to": request_dict["notification"].get("email_to"), "will_create_task": bool(request_dict["notification"].get("email_to"))})
        # #endregion
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
            # #region agent log
            _api_debug_log("task_created", {"task_id": task.id, "scene": prompt.scene})
            # #endregion
            return ResponseModel.success_response(
                data={"task_id": task.id, "status": "pending", "message": "任务已提交，完成后将发送邮件通知"},
                message="异步任务已创建",
            )

    # 同步模式改为异步队列（减轻 API 压力），除非 sync=true
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

    # 同步模式（sync=true 时）
    content, err = await execute_api_prompt_request(
        db=db,
        scene=prompt.scene,
        request_dict=request_dict,
        team_code=team_code,
        team_id=team_id,
    )
    if err:
        raise HTTPException(status_code=500, detail=err)
    return ResponseModel.success_response(
        data={"content": content, "scene": prompt.scene, "tenant_id": tenant_id},
        message="请求成功",
    )
