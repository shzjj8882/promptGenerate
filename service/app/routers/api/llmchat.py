"""
LLM Chat 相关接口
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Optional, Any, List
from pydantic import BaseModel, field_validator
from app.core.database import get_db
from app.core.api_auth import get_team_code_from_auth
from app.core.response import ResponseModel
from app.services.team_quota_service import TeamQuotaService
from app.services.prompt_service import TenantService
from app.services.llmchat_api_executor import (
    POINTS_PER_LLM_CALL,
    resolve_team_code_for_scene,
    execute_convert_prompt,
    execute_api_prompt_request,
    check_llm_quota_before_stream,
    stream_llm_chat_request,
)
from app.services.team_service import TeamService
from app.core.config import settings
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class LLMConfig(BaseModel):
    """LLM配置"""
    temperature: Optional[float] = Body(0.3, description="温度参数")
    max_tokens: Optional[int] = Body(None, description="最大token数")


def _validate_additional_params(v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """校验 additional_params JSON 大小，防止超大请求"""
    if v is None:
        return {}
    size = len(json.dumps(v, ensure_ascii=False).encode("utf-8"))
    if size > settings.REQUEST_ADDITIONAL_PARAMS_MAX_BYTES:
        raise ValueError(
            f"占位符参数过大（{size} 字节），最大允许 {settings.REQUEST_ADDITIONAL_PARAMS_MAX_BYTES} 字节"
        )
    return v


class PromptConvertRequest(BaseModel):
    """提示词转换请求"""
    tenantCode: Optional[str] = Body(None, description="租户编号（当提示词包含需要租户信息的占位符时必填）")
    teamCode: Optional[str] = Body(None, description="团队代码（用于获取团队的默认提示词）")
    # 占位符参数：动态字段，key 为占位符的 key，value 为对应的值
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    user_message: Optional[str] = Body(
        None,
        max_length=settings.REQUEST_USER_MESSAGE_MAX_LENGTH,
        description="用户消息，如果提供则调用LLM生成回复",
    )

    @field_validator("additional_params", mode="before")
    @classmethod
    def validate_additional_params(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return _validate_additional_params(v)


class PromptChatRequest(BaseModel):
    """提示词聊天请求（流式）"""
    tenantCode: Optional[str] = Body(None, description="租户编号（当提示词包含需要租户信息的占位符时必填）")
    teamCode: Optional[str] = Body(None, description="团队代码（用于获取团队的默认提示词）")
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    user_message: str = Body(
        ...,
        max_length=settings.REQUEST_USER_MESSAGE_MAX_LENGTH,
        description="用户消息",
    )
    # 会话ID（用于上下文）
    conversation_id: Optional[str] = Body(None, description="会话ID，如果提供则使用会话历史作为上下文")
    # 模型ID（用于指定使用的模型）
    model_id: Optional[str] = Body(None, description="模型ID，如果不提供则使用团队的默认模型")
    # MCP 配置（用于 LLM 调用 MCP 工具）
    mcp_id: Optional[str] = Body(None, description="MCP 配置标识（ID 或名称），选择后 LLM 可调用该 MCP 的工具")
    mcp_tool_names: Optional[List[str]] = Body(None, description="勾选的 MCP 工具名称列表，为空则使用全部工具")

    @field_validator("additional_params", mode="before")
    @classmethod
    def validate_additional_params(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return _validate_additional_params(v)


class NotificationOption(BaseModel):
    """通知选项"""
    type: Optional[str] = Body(None, description="通知类型：none | email")
    config_id: Optional[str] = Body(None, description="通知配置 ID（如邮件配置）")
    email_to: Optional[str] = Body(None, description="收件人邮箱（邮件通知时必填）")
    email_content_type: Optional[str] = Body(
        "html",
        description="邮件正文格式：html（富文本）| plain（纯文本）| file（文件附件）",
    )


class PromptApiRequest(BaseModel):
    """提示词接口模式请求（非流式）"""
    tenantCode: Optional[str] = Body(None, description="租户编号（当提示词包含需要租户信息的占位符时必填）")
    teamCode: Optional[str] = Body(None, description="团队代码（用于获取团队的默认提示词）")
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    user_message: str = Body(
        ...,
        max_length=settings.REQUEST_USER_MESSAGE_MAX_LENGTH,
        description="用户消息",
    )
    # 会话ID（用于上下文）
    conversation_id: Optional[str] = Body(None, description="会话ID，如果提供则使用会话历史作为上下文")
    # 模型ID（用于指定使用的模型）
    model_id: Optional[str] = Body(None, description="模型ID，如果不提供则使用团队的默认模型")
    # MCP 配置（用于 LLM 调用 MCP 工具）
    mcp_id: Optional[str] = Body(None, description="MCP 配置标识（ID 或名称）")
    mcp_tool_names: Optional[List[str]] = Body(None, description="勾选的 MCP 工具名称列表")
    notification: Optional[NotificationOption] = Body(None, description="通知选项，不传或 type=none 则为同步模式")

    @field_validator("additional_params", mode="before")
    @classmethod
    def validate_additional_params(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return _validate_additional_params(v)


class PromptApiResponse(BaseModel):
    """提示词接口模式响应"""
    content: str = Body(..., description="LLM回复内容")
    scene: str = Body(..., description="场景代码")
    tenant_id: str = Body(..., description="租户ID")


class PromptConvertResponse(BaseModel):
    """提示词转换响应"""
    content: str = Body(..., description="处理后的提示词内容")
    scene: str = Body(..., description="场景代码")
    tenant_id: str = Body(..., description="租户ID")


def _api_error_to_http_status(err: str) -> int:
    """将 executor 返回的错误信息映射为 HTTP 状态码"""
    if not err:
        return 400
    if "未找到" in err or "不存在" in err:
        return 404
    if "不属于" in err:
        return 403
    return 400


@router.get("/llmchat/tasks/{task_id}", summary="查询异步任务状态", tags=["应用接口 > LLM Chat"])
async def get_llmchat_task(
    task_id: str = Path(..., description="任务ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    查询异步任务状态（无需认证）
    当 api 接口使用邮件通知时返回 task_id，可轮询此接口获取 status 和 result_content
    """
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


@router.post("/llmchat/prompts/{scene}/convert", summary="转换提示词（非流式）", tags=["应用接口 > LLM Chat"])
async def convert_prompt(
    scene: str = Path(..., description="场景代码（如：dev、custom_scene）", examples=["dev"]),
    request: PromptConvertRequest = Body(...),
    team_code_from_auth: Optional[str] = Depends(get_team_code_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    提示词转换接口（应用接口，无需认证）- 非流式响应
    根据场景代码获取提示词，并将占位符替换为实际值。不调用 LLM。
    """
    team_code = await resolve_team_code_for_scene(
        db, scene, request.teamCode, team_code_from_auth
    )
    team_id = None
    if team_code:
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    request_dict = {
        "tenantCode": request.tenantCode,
        "additional_params": request.additional_params or {},
    }
    content, out_scene, tenant_id = await execute_convert_prompt(
        db, scene, request_dict, team_code=team_code, team_id=team_id
    )
    return ResponseModel.success_response(
        data=PromptConvertResponse(
            content=content,
            scene=out_scene,
            tenant_id=tenant_id,
        ).model_dump(),
        message="提示词转换成功",
    )


@router.post("/llmchat/prompts/{scene}/chat", summary="提示词聊天（SSE流式）", tags=["应用接口 > LLM Chat"])
async def chat_prompt(
    scene: str = Path(..., description="场景代码（如：dev、custom_scene）", examples=["dev"]),
    request: PromptChatRequest = Body(...),
    team_code_from_auth: Optional[str] = Depends(get_team_code_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    提示词聊天接口（应用接口，无需认证）- SSE流式响应
    
    根据场景代码获取提示词，处理占位符，然后调用LLM生成回复并返回SSE流式响应。
    
    **参数说明：**
    - `scene`: 场景代码（路径参数）
    - `tenantCode`: 租户编号（可选，当提示词包含需要租户信息的占位符时必填）
    - `teamCode`: 团队代码（可选，未传时可由 X-Team-AuthCode 或 Bearer Token 推导）
    - `additional_params`: 占位符参数（请求体，可选）
    - `llm_config`: LLM配置（请求体，可选），包含：
      - `temperature`: 温度参数（默认0.3）
      - `max_tokens`: 最大token数（可选）
      - 注意：API密钥、API基础URL、模型名称均从环境变量读取，不支持在请求体中传入
    - `user_message`: 用户消息（请求体，必填）
    
    **获取逻辑：**
    1. 获取提示词（如果提供了 tenantCode，优先获取租户自定义提示词）
    2. 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
    3. 检查提示词是否需要租户信息
    4. 如果需要租户信息但未提供 tenantCode，返回错误
    5. 处理提示词中的占位符
    6. 调用LLM生成回复并返回SSE流式响应
    
    **占位符处理：**
    - 支持 `{占位符key}` 和 `{ 占位符key }` 格式
    - 占位符值优先从配置的方法获取，其次从 `additional_params` 获取
    
    **SSE响应格式：**
    - 每个数据块格式：`data: {json}\n\n`
    - 最后发送：`data: [DONE]\n\n`
    """
    if not request.model_id:
        raise HTTPException(status_code=400, detail="必须指定模型ID（model_id）")

    team_code = await resolve_team_code_for_scene(
        db, scene, request.teamCode, team_code_from_auth
    )
    team_id = None
    if team_code:
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    await check_llm_quota_before_stream(
        db, team_id, request.model_id,
        {"user_message": request.user_message, "llm_config": request.llm_config.model_dump() if request.llm_config else {}},
    )

    request_dict = {
        "tenantCode": request.tenantCode,
        "teamCode": request.teamCode or team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "model_id": request.model_id,
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
        "conversation_id": request.conversation_id,
        "mcp_id": request.mcp_id,
        "mcp_tool_names": request.mcp_tool_names,
    }
    return StreamingResponse(
        stream_llm_chat_request(db, scene, request_dict, team_code=team_code, team_id=team_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/llmchat/prompts/{scene}/api", summary="提示词接口模式（非流式）", tags=["应用接口 > LLM Chat"])
async def api_prompt(
    scene: str = Path(..., description="场景代码（如：dev、custom_scene）", examples=["dev"]),
    request: PromptApiRequest = Body(...),
    sync: bool = Query(False, description="设为 true 时同步等待 LLM 返回，否则走异步队列"),
    team_code_from_auth: Optional[str] = Depends(get_team_code_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    提示词接口模式（应用接口，无需认证）- 非流式HTTP响应
    
    根据场景代码获取提示词，处理占位符，然后调用LLM生成回复并返回完整响应。
    
    **参数说明：**
    - `scene`: 场景代码（路径参数）
    - `tenantCode`: 租户编号（可选，当提示词包含需要租户信息的占位符时必填）
    - `teamCode`: 团队代码（可选，未传时可由 X-Team-AuthCode 或 Bearer Token 推导）
    - `additional_params`: 占位符参数（请求体，可选）
    - `llm_config`: LLM配置（请求体，可选），包含：
      - `temperature`: 温度参数（默认0.3）
      - `max_tokens`: 最大token数（可选）
      - 注意：API密钥、API基础URL、模型名称均从环境变量读取，不支持在请求体中传入
    - `user_message`: 用户消息（请求体，必填）
    
    **获取逻辑：**
    1. 获取提示词（如果提供了 tenantCode，优先获取租户自定义提示词）
    2. 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
    3. 检查提示词是否需要租户信息
    4. 如果需要租户信息但未提供 tenantCode，返回错误
    5. 处理提示词中的占位符
    6. 调用LLM生成回复并返回完整响应
    
    **占位符处理：**
    - 支持 `{占位符key}` 和 `{ 占位符key }` 格式
    - 占位符值优先从配置的方法获取，其次从 `additional_params` 获取
    """
    team_code = await resolve_team_code_for_scene(
        db, scene, request.teamCode, team_code_from_auth
    )
    team_id = None
    if team_code:
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    request_dict = {
        "tenantCode": request.tenantCode,
        "teamCode": request.teamCode or team_code,
        "additional_params": request.additional_params or {},
        "user_message": request.user_message,
        "model_id": request.model_id,
        "llm_config": request.llm_config.model_dump() if request.llm_config else {},
        "conversation_id": request.conversation_id,
        "mcp_id": request.mcp_id,
        "mcp_tool_names": request.mcp_tool_names,
    }

    # 异步模式：有通知时创建任务、推队列、立即返回 task_id
    notif = request.notification
    if notif and notif.type and notif.type != "none":
        from app.services.llmchat_task_service import LLMChatTaskService
        if notif.type == "email" and notif.email_to:
            # 预扣积点，失败时 Worker 补偿退还
            if team_id:
                await TeamQuotaService.check_and_consume_tokens(
                    db=db, team_id=team_id, requested_tokens=POINTS_PER_LLM_CALL
                )
                request_dict["_quota_pre_consumed"] = True
            notif_cfg = {
                "email_to": notif.email_to,
                "config_id": notif.config_id,
                "content_type": notif.email_content_type or "html",
            }
            task = await LLMChatTaskService.create_task(
                db=db,
                scene=scene,
                request_payload=request_dict,
                team_id=team_id,
                notification_type="email",
                notification_config=notif_cfg,
            )
            await db.commit()
            await LLMChatTaskService.push_task_to_stream(
                task_id=task.id,
                scene=scene,
                request_payload=request_dict,
                team_id=team_id,
                notification_type="email",
                notification_config=notif_cfg,
            )
            return ResponseModel.success_response(
                data={"task_id": task.id, "status": "pending", "message": "任务已提交，完成后将发送邮件通知"},
                message="异步任务已创建"
            )
        if notif.type == "email":
            raise HTTPException(status_code=400, detail="邮件通知需提供 email_to")

    # 异步队列模式：无通知时也走队列（减轻 API 压力），除非 sync=true
    if not sync and getattr(settings, "LLM_API_ASYNC_DEFAULT", True):
        from app.services.llmchat_task_service import LLMChatTaskService
        if not request.model_id:
            raise HTTPException(status_code=400, detail="必须指定模型ID（model_id）")
        # 预扣积点，失败时 Worker 补偿退还
        if team_id:
            await TeamQuotaService.check_and_consume_tokens(
                db=db, team_id=team_id, requested_tokens=POINTS_PER_LLM_CALL
            )
            request_dict["_quota_pre_consumed"] = True
        task = await LLMChatTaskService.create_task(
            db=db,
            scene=scene,
            request_payload=request_dict,
            team_id=team_id,
            notification_type="none",
            notification_config=None,
        )
        await db.commit()
        await LLMChatTaskService.push_task_to_stream(
            task_id=task.id,
            scene=scene,
            request_payload=request_dict,
            team_id=team_id,
            notification_type="none",
            notification_config=None,
        )
        return ResponseModel.success_response(
            data={"task_id": task.id, "status": "pending", "message": "任务已提交，请轮询 GET /api/llmchat/tasks/{task_id} 获取结果"},
            message="异步任务已创建"
        )

    # 同步模式：直接调用 executor
    content, err = await execute_api_prompt_request(
        db, scene, request_dict,
        team_code=team_code,
        team_id=team_id,
    )
    if err:
        raise HTTPException(
            status_code=_api_error_to_http_status(err),
            detail=err,
        )
    tenant_id = "default"
    if request.tenantCode:
        tenant = await TenantService.get_tenant_by_code_id(db, request.tenantCode)
        if tenant:
            tenant_id = tenant.id
    return ResponseModel.success_response(
        data=PromptApiResponse(
            content=content,
            scene=scene,
            tenant_id=tenant_id,
        ).model_dump(),
        message="接口调用成功",
    )
