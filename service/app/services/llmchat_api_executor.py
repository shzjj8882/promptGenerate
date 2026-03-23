"""
LLM Chat API 执行器
供 api_prompt、异步 Worker、组合 API 共用
"""
import json
import logging
from typing import Optional, Tuple, Dict, Any, AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.prompt_service import PromptService, TenantService, PlaceholderService
from app.services.llm_model_service import LLMModelService
from app.services.llm_service import LLMService
from app.services.mcp_service import MCPService
from app.services.mcp_llm_integration import chat_with_mcp_tools
from app.services.team_quota_service import TeamQuotaService
from app.services.team_usage_log_service import log_team_usage
from app.services.team_service import TeamService
from app.services.llmchat_helpers import (
    check_if_tenant_required,
    process_placeholders_in_content,
    LLMConfig,
)
from app.domain.exceptions import NotFoundError, ValidationError
from app.core.config import settings

logger = logging.getLogger(__name__)

# LLM 每次调用消耗的平台积点数（与 LLM token 无关，类似多维表格 TABLE_API_TOKENS_PER_CALL）
POINTS_PER_LLM_CALL = 1


async def resolve_team_code_for_scene(
    db: AsyncSession,
    scene: str,
    team_code_from_request: Optional[str],
    team_code_from_auth: Optional[str],
) -> Optional[str]:
    """解析 team_code：请求体 > 场景关联 > 鉴权推导"""
    if team_code_from_request:
        return team_code_from_request
    from app.services.scene_service import SceneService

    scene_obj = await SceneService.get_by_code(db, scene, team_id=None)
    if scene_obj and scene_obj.team_code:
        return scene_obj.team_code
    return team_code_from_auth


async def execute_convert_prompt(
    db: AsyncSession,
    scene: str,
    request_dict: Dict[str, Any],
    team_code: Optional[str] = None,
    team_id: Optional[str] = None,
) -> Tuple[str, str, str]:
    """
    执行提示词转换（占位符替换，不调用 LLM）

    Returns:
        (content, scene, tenant_id)
    """
    tenant_id = None
    if request_dict.get("tenantCode"):
        tenant = await TenantService.get_tenant_by_code_id(
            db, request_dict["tenantCode"]
        )
        if not tenant:
            raise NotFoundError(
                "租户", request_dict.get("tenantCode"), f"未找到租户编号为 {request_dict['tenantCode']} 的租户"
            )
        tenant_id = tenant.id
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        prompt = (
            prompts[0]
            if prompts
            else await PromptService.get_default_prompt(
                db, scene, team_code=team_code
            )
        )
    else:
        prompt = await PromptService.get_default_prompt(
            db, scene, team_code=team_code
        )

    if not prompt:
        raise NotFoundError("提示词", scene, f"场景 {scene} 的提示词不存在")

    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        raise ValidationError(
            "该提示词包含需要租户信息的占位符，请提供 tenantCode"
        )

    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request_dict.get("additional_params") or {},
        team_id=team_id,
        team_code=team_code,
    )
    return (
        processed_content,
        scene,
        tenant_id or "default",
    )


async def check_llm_quota_before_stream(
    db: AsyncSession,
    team_id: Optional[str],
    model_id: Optional[str],
    request_dict: Dict[str, Any],
) -> None:
    """
    在流式响应开始前校验并扣减配额。必须在返回 StreamingResponse 之前调用，
    否则 429 会在流已启动后抛出，导致 "response already started" 错误。
    """
    if not model_id:
        return
    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        return
    await TeamQuotaService.check_and_consume_tokens(
        db=db,
        team_id=team_id,
        requested_tokens=POINTS_PER_LLM_CALL,
    )


async def execute_api_prompt_request(
    db: AsyncSession,
    scene: str,
    request_dict: Dict[str, Any],
    team_code: Optional[str] = None,
    team_id: Optional[str] = None,
    *,
    skip_quota_check: bool = False,
) -> Tuple[Optional[str], Optional[str]]:
    """
    执行 API 模式的 LLM 调用

    Args:
        db: 数据库会话
        scene: 场景代码
        request_dict: 请求体（tenantCode, tenant_id, additional_params, user_message, model_id, llm_config, etc.）
        team_code: 团队代码
        team_id: 团队ID（可选，用于过滤）

    Returns:
        (content, error_message)
        - 成功时 content 有值，error_message 为 None
        - 失败时 content 为 None，error_message 有值
    """
    # 解析请求
    tenant_id = None
    if request_dict.get("tenantCode"):
        tenant = await TenantService.get_tenant_by_code_id(db, request_dict["tenantCode"])
        if not tenant:
            return None, f"未找到租户编号为 {request_dict['tenantCode']} 的租户"
        tenant_id = tenant.id
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        if prompts:
            prompt = prompts[0]
        else:
            prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)

    if not prompt:
        return None, f"场景 {scene} 的提示词不存在"

    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        return None, "该提示词包含需要租户信息的占位符，请提供 tenantCode"

    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request_dict.get("additional_params") or {},
        team_id=team_id,
        team_code=team_code,
    )

    model_id = request_dict.get("model_id")
    if not model_id:
        return None, "必须指定模型ID（model_id）"

    # 异步任务从 Redis 读取时 team_id 可能丢失，用 team_code 兜底解析（确保配额扣减）
    if not team_id and team_code:
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        return None, "指定的模型不存在"
    if team_id and model.team_id and model.team_id != team_id:
        return None, "模型不属于当前团队"

    llm_config_raw = request_dict.get("llm_config") or {}
    llm_config = LLMConfig(
        temperature=llm_config_raw.get("temperature") or 0.3,
        max_tokens=llm_config_raw.get("max_tokens"),
    )
    if model.default_temperature:
        try:
            llm_config.temperature = float(model.default_temperature)
        except (ValueError, TypeError):
            pass
    if model.default_max_tokens:
        llm_config.max_tokens = model.default_max_tokens

    # 预扣时 API 已扣，此处跳过；否则扣减
    skip = skip_quota_check or request_dict.get("_quota_pre_consumed") is True
    consumed_here = not skip and team_id
    if not skip:
        await TeamQuotaService.check_and_consume_tokens(
            db=db,
            team_id=team_id,
            requested_tokens=POINTS_PER_LLM_CALL,
        )

    async def _refund_if_needed():
        if consumed_here and not request_dict.get("_from_worker"):
            try:
                await TeamQuotaService.refund_points(db, team_id, POINTS_PER_LLM_CALL)
            except Exception as ref_err:
                logger.warning("配额退还失败 team_id=%s: %s", team_id, ref_err)

    llm_service = LLMService(
        api_key=model.api_key or getattr(settings, "DEEPSEEK_API_KEY", ""),
        api_base=model.api_base or getattr(settings, "DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
        model=model.model or getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat"),
    )

    user_message = request_dict.get("user_message") or ""
    conversation_history = []
    if request_dict.get("conversation_id"):
        from app.services.conversation_service import ConversationService
        conversation = await ConversationService.get_conversation_by_id(
            db, request_dict["conversation_id"], include_messages=False
        )
        if conversation and (not team_id or conversation.team_id == team_id):
            conversation_history = await ConversationService.get_conversation_history_for_context(
                db, request_dict["conversation_id"], max_messages=10
            )

    messages = [{"role": "system", "content": processed_content}]
    for hist_msg in conversation_history:
        if hist_msg["role"] != "system":
            messages.append({"role": hist_msg["role"], "content": hist_msg["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        if request_dict.get("mcp_id"):
            mcp = await MCPService.get_by_id_or_name(db, request_dict["mcp_id"], team_id=team_id)
            if not mcp:
                await _refund_if_needed()
                return None, "MCP 配置不存在"
            if team_id and mcp.team_id and mcp.team_id != team_id:
                await _refund_if_needed()
                return None, "MCP 配置不属于当前团队"
            tools_raw = mcp.tools_cache
            if isinstance(tools_raw, str):
                try:
                    tools_raw = json.loads(tools_raw) if tools_raw else []
                except Exception as e:
                    logger.warning("MCP tools_cache 解析失败，mcp_id=%s: %s", mcp.id, e)
                    tools_raw = []
            mcp_tools = tools_raw or []
            if request_dict.get("mcp_tool_names"):
                name_set = set(request_dict["mcp_tool_names"])
                mcp_tools = [t for t in mcp_tools if t.get("name") in name_set]
            if not mcp_tools:
                await _refund_if_needed()
                return None, "未找到可用的 MCP 工具"
            auth_info = None
            if mcp.auth_info:
                try:
                    auth_info = json.loads(mcp.auth_info) if isinstance(mcp.auth_info, str) else mcp.auth_info
                except Exception as e:
                    logger.warning("MCP auth_info 解析失败，mcp_id=%s: %s", mcp.id, e)
            mcp_transport = getattr(mcp, "transport_type", None) or "sse"
            response_text = await chat_with_mcp_tools(
                llm_service=llm_service,
                messages=messages,
                mcp_url=mcp.url,
                mcp_tools=mcp_tools,
                mcp_auth_info=auth_info,
                mcp_transport_type=mcp_transport,
                temperature=llm_config.temperature or 0.3,
                max_tokens=llm_config.max_tokens,
            )
        else:
            response = await llm_service.chat(
                messages=messages,
                temperature=llm_config.temperature or 0.3,
                max_tokens=llm_config.max_tokens,
            )
            response_text = (
                response["choices"][0]["message"]["content"]
                if response.get("choices") and len(response["choices"]) > 0
                else ""
            )
        # 用量统计：预扣时 API 已记录，此处不再重复；否则记录
        if team_id and not request_dict.get("_quota_pre_consumed"):
            await log_team_usage(
                db, team_id, usage_type=5,
                tokens_used=POINTS_PER_LLM_CALL,
                extra_info=json.dumps({"scene": scene, "mode": "api_sync"}),
                business_name="组合接口",
            )
            await db.commit()
        return response_text, None
    except Exception as e:
        await _refund_if_needed()
        return None, str(e)


async def stream_llm_chat_request(
    db: AsyncSession,
    scene: str,
    request_dict: Dict[str, Any],
    team_code: Optional[str] = None,
    team_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    流式执行 LLM 调用，yield SSE 格式的 data 行（不含 "data: " 前缀，由调用方添加）
    与 execute_api_prompt_request 共享前置逻辑
    """
    tenant_id = None
    if request_dict.get("tenantCode"):
        tenant = await TenantService.get_tenant_by_code_id(db, request_dict["tenantCode"])
        if not tenant:
            yield json.dumps({"error": "未找到租户"}, ensure_ascii=False) + "\n\n"
            return
        tenant_id = tenant.id
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        prompt = prompts[0] if prompts else await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)

    if not prompt:
        yield json.dumps({"error": f"场景 {scene} 的提示词不存在"}, ensure_ascii=False) + "\n\n"
        return

    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        yield json.dumps({"error": "该提示词包含需要租户信息的占位符，请提供 tenantCode"}, ensure_ascii=False) + "\n\n"
        return

    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request_dict.get("additional_params") or {},
        team_id=team_id,
        team_code=team_code,
    )

    model_id = request_dict.get("model_id")
    if not model_id:
        yield json.dumps({"error": "必须指定模型ID（model_id）"}, ensure_ascii=False) + "\n\n"
        return

    model = await LLMModelService.get_model_by_id(db, model_id)
    if not model:
        yield json.dumps({"error": "指定的模型不存在"}, ensure_ascii=False) + "\n\n"
        return
    if team_id and model.team_id and model.team_id != team_id:
        yield json.dumps({"error": "模型不属于当前团队"}, ensure_ascii=False) + "\n\n"
        return

    llm_config_raw = request_dict.get("llm_config") or {}
    llm_config = LLMConfig(
        temperature=llm_config_raw.get("temperature") or 0.3,
        max_tokens=llm_config_raw.get("max_tokens"),
    )
    if model.default_temperature:
        try:
            llm_config.temperature = float(model.default_temperature)
        except (ValueError, TypeError):
            pass
    if model.default_max_tokens:
        llm_config.max_tokens = model.default_max_tokens

    # 配额已在流开始前校验（check_llm_quota_before_stream），此处不再重复

    llm_service = LLMService(
        api_key=model.api_key or getattr(settings, "DEEPSEEK_API_KEY", ""),
        api_base=model.api_base or getattr(settings, "DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
        model=model.model or getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat"),
    )

    user_message = request_dict.get("user_message") or ""
    conversation_history = []
    conversation = None
    if request_dict.get("conversation_id"):
        from app.services.conversation_service import ConversationService
        conversation = await ConversationService.get_conversation_by_id(
            db, request_dict["conversation_id"], include_messages=False
        )
        if conversation and (not team_id or conversation.team_id == team_id):
            conversation_history = await ConversationService.get_conversation_history_for_context(
                db, request_dict["conversation_id"], max_messages=10
            )

    messages = [{"role": "system", "content": processed_content}]
    for hist_msg in conversation_history:
        if hist_msg["role"] != "system":
            messages.append({"role": hist_msg["role"], "content": hist_msg["content"]})
    messages.append({"role": "user", "content": user_message})

    full_response = ""
    try:
        if request_dict.get("mcp_id"):
            mcp = await MCPService.get_by_id_or_name(db, request_dict["mcp_id"], team_id=team_id)
            if not mcp:
                yield json.dumps({"error": "MCP 配置不存在"}, ensure_ascii=False) + "\n\n"
                return
            if team_id and mcp.team_id and mcp.team_id != team_id:
                yield json.dumps({"error": "MCP 配置不属于当前团队"}, ensure_ascii=False) + "\n\n"
                return
            tools_raw = mcp.tools_cache
            if isinstance(tools_raw, str):
                try:
                    tools_raw = json.loads(tools_raw) if tools_raw else []
                except Exception as e:
                    logger.warning("MCP tools_cache 解析失败，mcp_id=%s: %s", mcp.id, e)
                    tools_raw = []
            mcp_tools = tools_raw or []
            if request_dict.get("mcp_tool_names"):
                name_set = set(request_dict["mcp_tool_names"])
                mcp_tools = [t for t in mcp_tools if t.get("name") in name_set]
            if not mcp_tools:
                yield json.dumps({"error": "未找到可用的 MCP 工具"}, ensure_ascii=False) + "\n\n"
                return
            auth_info = None
            if mcp.auth_info:
                try:
                    auth_info = json.loads(mcp.auth_info) if isinstance(mcp.auth_info, str) else mcp.auth_info
                except Exception as e:
                    logger.warning("MCP auth_info 解析失败，mcp_id=%s: %s", mcp.id, e)
            mcp_transport = getattr(mcp, "transport_type", None) or "sse"
            full_response = await chat_with_mcp_tools(
                llm_service=llm_service,
                messages=messages,
                mcp_url=mcp.url,
                mcp_tools=mcp_tools,
                mcp_auth_info=auth_info,
                mcp_transport_type=mcp_transport,
                temperature=llm_config.temperature or 0.3,
                max_tokens=llm_config.max_tokens,
            )
            if full_response:
                yield f"data: {json.dumps({'content': full_response}, ensure_ascii=False)}\n\n"
        else:
            async for chunk in llm_service.chat_stream(
                messages=messages,
                temperature=llm_config.temperature or 0.3,
                max_tokens=llm_config.max_tokens,
            ):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
        # 保存会话消息
        if full_response:
            from app.services.conversation_service import ConversationService
            from app.schemas.conversation import (
                ConversationCreate,
                ConversationMessageCreate,
            )
            if conversation:
                await ConversationService.add_message(
                    db,
                    request_dict["conversation_id"],
                    ConversationMessageCreate(
                        role="user",
                        content=user_message,
                        metadata={"model_id": request_dict.get("model_id")},
                    ),
                )
                await ConversationService.add_message(
                    db,
                    request_dict["conversation_id"],
                    ConversationMessageCreate(
                        role="assistant",
                        content=full_response,
                        metadata={
                            "model_id": request_dict.get("model_id"),
                            "model_name": model.model if model else None,
                            "temperature": llm_config.temperature or 0.3,
                            "max_tokens": llm_config.max_tokens,
                        },
                    ),
                )
            elif team_id:
                new_conv = await ConversationService.create_conversation(
                    db,
                    ConversationCreate(scene=scene, tenant_id=tenant_id or ""),
                    team_id=team_id,
                )
                await ConversationService.add_message(
                    db,
                    new_conv.id,
                    ConversationMessageCreate(
                        role="user",
                        content=user_message,
                        metadata={"model_id": request_dict.get("model_id")},
                    ),
                )
                await ConversationService.add_message(
                    db,
                    new_conv.id,
                    ConversationMessageCreate(
                        role="assistant",
                        content=full_response,
                        metadata={
                            "model_id": request_dict.get("model_id"),
                            "model_name": model.model if model else None,
                            "temperature": llm_config.temperature or 0.3,
                            "max_tokens": llm_config.max_tokens,
                        },
                    ),
                )
        # 用量统计：5=组合 LLM、接口查询（记录平台积点消耗，非 LLM token）
        if team_id:
            await log_team_usage(
                db, team_id, usage_type=5,
                tokens_used=POINTS_PER_LLM_CALL,
                extra_info=json.dumps({"scene": scene, "mode": "prompt_chat"}),
                business_name="组合LLM接口",
            )
            await db.commit()
        yield "data: [DONE]\n\n"
    except Exception as e:
        logger.exception("LLM 流式调用失败")
        yield f"data: {json.dumps({'error': 'LLM调用失败，请稍后重试'}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"
