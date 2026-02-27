"""
LLM Chat 相关接口
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Optional, Any, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.api_auth import get_team_code_from_auth
from app.core.response import ResponseModel
from app.services.prompt_service import PromptService, TenantService, PlaceholderService, PlaceholderDataSourceService
from app.services.llm_service import LLMService
from app.services.mcp_service import MCPService, TRANSPORT_SSE
from app.services.mcp_llm_integration import chat_with_mcp_tools
from app.core.config import settings
import re
import json
import asyncio
import inspect
import traceback
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class LLMConfig(BaseModel):
    """LLM配置"""
    temperature: Optional[float] = Body(0.3, description="温度参数")
    max_tokens: Optional[int] = Body(None, description="最大token数")


class PromptConvertRequest(BaseModel):
    """提示词转换请求"""
    tenantCode: Optional[str] = Body(None, description="租户编号（当提示词包含需要租户信息的占位符时必填）")
    teamCode: Optional[str] = Body(None, description="团队代码（用于获取团队的默认提示词）")
    # 占位符参数：动态字段，key 为占位符的 key，value 为对应的值
    # 使用 Dict[str, Any] 来接收任意占位符参数
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    # LLM配置
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    # 用户消息
    user_message: Optional[str] = Body(None, description="用户消息，如果提供则调用LLM生成回复")


class PromptChatRequest(BaseModel):
    """提示词聊天请求（流式）"""
    tenantCode: Optional[str] = Body(None, description="租户编号（当提示词包含需要租户信息的占位符时必填）")
    teamCode: Optional[str] = Body(None, description="团队代码（用于获取团队的默认提示词）")
    # 占位符参数：动态字段，key 为占位符的 key，value 为对应的值
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    # LLM配置
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    # 用户消息（必填）
    user_message: str = Body(..., description="用户消息")
    # 会话ID（用于上下文）
    conversation_id: Optional[str] = Body(None, description="会话ID，如果提供则使用会话历史作为上下文")
    # 模型ID（用于指定使用的模型）
    model_id: Optional[str] = Body(None, description="模型ID，如果不提供则使用团队的默认模型")
    # MCP 配置（用于 LLM 调用 MCP 工具）
    mcp_id: Optional[str] = Body(None, description="MCP 配置 ID，选择后 LLM 可调用该 MCP 的工具")
    mcp_tool_names: Optional[List[str]] = Body(None, description="勾选的 MCP 工具名称列表，为空则使用全部工具")


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
    # 占位符参数：动态字段，key 为占位符的 key，value 为对应的值
    additional_params: Optional[Dict[str, Any]] = Body(default={}, description="占位符参数")
    # LLM配置
    llm_config: Optional[LLMConfig] = Body(None, description="LLM配置，不传则使用环境变量配置")
    # 用户消息（必填）
    user_message: str = Body(..., description="用户消息")
    # 会话ID（用于上下文）
    conversation_id: Optional[str] = Body(None, description="会话ID，如果提供则使用会话历史作为上下文")
    # 模型ID（用于指定使用的模型）
    model_id: Optional[str] = Body(None, description="模型ID，如果不提供则使用团队的默认模型")
    # MCP 配置（用于 LLM 调用 MCP 工具）
    mcp_id: Optional[str] = Body(None, description="MCP 配置 ID")
    mcp_tool_names: Optional[List[str]] = Body(None, description="勾选的 MCP 工具名称列表")
    # 通知选项：无通知=同步，有通知=异步（返回 task_id，Worker 完成后发邮件）
    notification: Optional[NotificationOption] = Body(None, description="通知选项，不传或 type=none 则为同步模式")


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


def check_if_tenant_required(prompt_content: str, placeholders: list) -> bool:
    """
    检查提示词是否需要租户信息
    
    提示词中可以没有占位符，此时直接返回 False（不需要租户）。
    
    Args:
        prompt_content: 提示词内容
        placeholders: 占位符配置列表
    
    Returns:
        是否需要租户信息
    """
    # 需要租户信息的占位符 key 列表（英文格式）
    tenant_required_keys = {
        "conversationId",  # 系统对话ID（需要租户上下文）
    }
    
    # 需要租户信息的中文占位符映射
    tenant_required_chinese_keys = {
        "系统对话ID",
    }
    
    # 从提示词内容中提取所有占位符
    placeholder_pattern = r"\{([^{}]+)\}"
    placeholder_keys = set(re.findall(placeholder_pattern, prompt_content))
    
    # 检查是否有需要租户的占位符
    for key in placeholder_keys:
        key_stripped = key.strip()
        # 检查英文格式的占位符 key
        if key_stripped in tenant_required_keys:
            return True
        
        # 检查中文格式的占位符 key
        if key_stripped in tenant_required_chinese_keys:
            return True
        
        # 检查占位符配置中是否有需要租户的方法
        for placeholder in placeholders:
            if placeholder.key == key_stripped and placeholder.tenant_param_key:
                return True
    
    return False


async def process_placeholders_in_content(
    db: AsyncSession,
    prompt_content: str,
    scene: str,
    tenant_id: Optional[str],
    additional_params: Dict[str, Any],
    team_id: Optional[str] = None,
    team_code: Optional[str] = None,
) -> str:
    """
    处理提示词内容中的占位符。提示词中可以没有占位符，此时原样返回。
    
    支持新格式：
    - 用户输入类型：{input.key} - 从 additional_params 中获取 input.key 的值
    - 多维表格类型：{table.key.row_id} - 从多维表格中查询数据
    
    也支持旧格式（向后兼容）：
    - {key} 或 {label} - 从 additional_params 中获取值
    
    Args:
        db: 数据库会话
        prompt_content: 提示词内容
        scene: 场景代码
        tenant_id: 租户ID
        additional_params: 额外的占位符参数
        team_id: 团队ID（可选，用于过滤占位符）
        team_code: 团队代码（可选，用于过滤占位符）
    
    Returns:
        处理后的提示词内容
    """
    from app.models.multi_dimension_table import MultiDimensionTable, MultiDimensionTableRow, MultiDimensionTableCell
    from sqlalchemy import select, and_
    
    # 1. 从提示词内容中提取所有占位符
    placeholder_pattern = r"\{([^{}]+)\}"
    placeholder_keys = list(set(re.findall(placeholder_pattern, prompt_content)))
    
    # 2. 获取该场景下的所有占位符配置（使用 Service 层，按团队过滤）
    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    
    # 3. 构建占位符 key 和 label 到配置的映射（支持按 key 或 label 查找）
    placeholder_map_by_key = {p.key: p for p in placeholders}
    placeholder_map_by_label = {p.label: p for p in placeholders}
    
    # 4. 处理每个占位符
    processed_content = prompt_content
    
    # 收集需要异步处理的占位符任务
    async_tasks = {}  # {placeholder_key: task}
    placeholder_values = {}  # {placeholder_key: value}
    
    # 第一遍：收集所有需要异步处理的占位符
    for placeholder_key in placeholder_keys:
        placeholder_key_stripped = placeholder_key.strip()
        
        # 兼容旧格式：{input.key} 或 {table.key.row_id}
        if placeholder_key_stripped.startswith("input."):
            # 用户输入类型：{input.key}
            key = placeholder_key_stripped[6:]  # 去掉 "input."
            # 从 additional_params 中获取值，键名应该是 input.key
            value = additional_params.get(f"input.{key}", "")
            placeholder_values[placeholder_key] = value
            continue
        
        elif placeholder_key_stripped.startswith("table."):
            # 多维表格类型：{table.key.row_id}
            parts = placeholder_key_stripped[6:].split(".", 1)  # 去掉 "table."
            if len(parts) >= 2:
                key = parts[0]
                row_id_key = parts[1]  # row_id 参数名，如 "row_id"
                
                # 查找占位符配置
                placeholder_config = placeholder_map_by_key.get(key) or placeholder_map_by_label.get(key)
                
                if placeholder_config and placeholder_config.data_source_type == "multi_dimension_table":
                    # 从 additional_params 中获取行ID
                    row_id_param_key = f"table.{key}.{row_id_key}"
                    row_id_value = additional_params.get(row_id_param_key)
                    
                    if row_id_value is not None and placeholder_config.table_id and placeholder_config.table_column_key:
                        # 查询多维表格数据
                        try:
                            # 查询行（根据 table_id 和 row_id）
                            row_query = select(MultiDimensionTableRow).where(
                                and_(
                                    MultiDimensionTableRow.table_id == placeholder_config.table_id,
                                    MultiDimensionTableRow.row_id == int(row_id_value)
                                )
                            )
                            row_result = await db.execute(row_query)
                            row = row_result.scalar_one_or_none()
                            
                            if row:
                                # 查询单元格值
                                cell_query = select(MultiDimensionTableCell).where(
                                    and_(
                                        MultiDimensionTableCell.row_id == row.id,
                                        MultiDimensionTableCell.column_key == placeholder_config.table_column_key
                                    )
                                )
                                cell_result = await db.execute(cell_query)
                                cell = cell_result.scalar_one_or_none()
                                
                                if cell:
                                    placeholder_values[placeholder_key] = cell.value or ""
                                else:
                                    placeholder_values[placeholder_key] = ""
                            else:
                                placeholder_values[placeholder_key] = ""
                        except (ValueError, TypeError):
                            # row_id 不是有效数字
                            placeholder_values[placeholder_key] = ""
                    else:
                        placeholder_values[placeholder_key] = ""
                else:
                    # 配置不存在或类型不匹配，尝试从 additional_params 获取
                    placeholder_values[placeholder_key] = additional_params.get(row_id_param_key, "")
                continue
        
        # 新格式：{key} - 根据占位符配置来决定如何获取值
        key = placeholder_key_stripped
        placeholder_config = placeholder_map_by_key.get(key) or placeholder_map_by_label.get(key)
        
        if placeholder_config:
            if placeholder_config.data_source_type == "multi_dimension_table":
                # 多维表格类型：需要从表格中查询数据
                # 从 additional_params 中获取条件值
                # 只支持嵌套对象结构：{key: {condition_field: value}}
                # 例如：{"name": {"row_id": "1"}} 或 {"name": {"customer_id": "123"}}
                condition_value = None
                actual_condition_key = None
                key_params = additional_params.get(key)
                
                if isinstance(key_params, dict):
                    # 嵌套对象结构：从 {key: {condition_field: value}} 中获取条件字段和值
                    # 获取第一个有值的字段（优先），如果没有有值的，获取第一个字段
                    for param_key, param_value in key_params.items():
                        # 检查值是否有效：非 None 且非空字符串
                        if param_value is not None:
                            # 对于数字类型，0 也是有效值
                            if isinstance(param_value, (int, float)):
                                actual_condition_key = param_key
                                condition_value = param_value
                                break
                            # 对于字符串类型，检查是否为空
                            elif isinstance(param_value, str) and param_value.strip() != "":
                                actual_condition_key = param_key
                                condition_value = param_value
                                break
                    
                    # 如果没有找到有值的字段，使用第一个字段（即使值为空）
                    if not actual_condition_key and len(key_params) > 0:
                        actual_condition_key = list(key_params.keys())[0]
                        condition_value = key_params[actual_condition_key]
                else:
                    # 格式不正确，返回空值
                    condition_value = None
                    actual_condition_key = None
                
                if condition_value is not None and actual_condition_key and placeholder_config.table_id and placeholder_config.table_column_key:
                    # 查询多维表格数据
                    try:
                        row = None
                        
                        # 根据条件字段类型决定查询方式
                        if actual_condition_key == "row_id":
                            # 如果条件是 row_id，直接查询行
                            # 确保 condition_value 转换为整数
                            try:
                                row_id_int = int(condition_value) if not isinstance(condition_value, int) else condition_value
                            except (ValueError, TypeError):
                                row_id_int = None
                            
                            if row_id_int is not None:
                                row_query = select(MultiDimensionTableRow).where(
                                    and_(
                                        MultiDimensionTableRow.table_id == placeholder_config.table_id,
                                        MultiDimensionTableRow.row_id == row_id_int
                                    )
                                )
                                row_result = await db.execute(row_query)
                                row = row_result.scalar_one_or_none()
                            else:
                                row = None
                        else:
                            # 如果条件是其他列（如 customer_id），先通过单元格值找到行
                            # 1. 查询条件列对应的单元格
                            condition_cell_query = select(MultiDimensionTableCell).join(
                                MultiDimensionTableRow,
                                MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
                            ).where(
                                and_(
                                    MultiDimensionTableRow.table_id == placeholder_config.table_id,
                                    MultiDimensionTableCell.column_key == actual_condition_key,
                                    MultiDimensionTableCell.value == str(condition_value)
                                )
                            )
                            condition_cell_result = await db.execute(condition_cell_query)
                            condition_cell = condition_cell_result.scalar_one_or_none()
                            
                            if condition_cell:
                                # 2. 通过单元格的 row_id 获取完整的行
                                row_query = select(MultiDimensionTableRow).where(
                                    MultiDimensionTableRow.id == condition_cell.row_id
                                )
                                row_result = await db.execute(row_query)
                                row = row_result.scalar_one_or_none()
                        
                        if row:
                            # 查询目标单元格值
                            cell_query = select(MultiDimensionTableCell).where(
                                and_(
                                    MultiDimensionTableCell.row_id == row.id,
                                    MultiDimensionTableCell.column_key == placeholder_config.table_column_key
                                )
                            )
                            cell_result = await db.execute(cell_query)
                            cell = cell_result.scalar_one_or_none()
                            
                            if cell:
                                placeholder_values[placeholder_key] = cell.value or ""
                            else:
                                placeholder_values[placeholder_key] = ""
                        else:
                            placeholder_values[placeholder_key] = ""
                    except (ValueError, TypeError) as e:
                        # 条件值格式错误
                        placeholder_values[placeholder_key] = ""
                    except Exception as e:
                        # 其他错误
                        placeholder_values[placeholder_key] = ""
                else:
                    placeholder_values[placeholder_key] = ""
            else:
                # 用户输入类型：从嵌套对象结构中获取值
                # 只支持嵌套对象结构：{key: {value: "xxx"}}
                key_params = additional_params.get(key)
                if isinstance(key_params, dict):
                    # 从嵌套对象中获取 value 字段
                    value = key_params.get("value", "")
                else:
                    # 格式不正确，返回空值
                    value = ""
                placeholder_values[placeholder_key] = value
            continue
        
        # 旧格式处理（向后兼容）：{key} 或 {label} - 使用 method 配置
        if placeholder_config and placeholder_config.method:
            method_func = PlaceholderDataSourceService.get_method(placeholder_config.method)
            if method_func:
                # 检查是否需要租户ID
                if placeholder_config.tenant_param_key and not tenant_id:
                    # 如果需要租户ID但没有提供，从 additional_params 获取
                    value = additional_params.get(placeholder_config.key, "")
                    placeholder_values[placeholder_key] = value
                else:
                    # 准备方法参数
                    method_params = {}
                    if placeholder_config.method_params:
                        try:
                            method_params = json.loads(placeholder_config.method_params)
                        except json.JSONDecodeError:
                            method_params = {}
                    
                    if placeholder_config.tenant_param_key and tenant_id:
                        method_params[placeholder_config.tenant_param_key] = tenant_id
                    
                    method_params.update(additional_params)
                    
                    sig = inspect.signature(method_func)
                    if 'db' in sig.parameters:
                        method_params['db'] = db
                    
                    # 创建异步任务
                    if asyncio.iscoroutinefunction(method_func):
                        async_tasks[placeholder_key] = method_func(**method_params)
                    else:
                        # 同步方法使用线程池
                        loop = asyncio.get_event_loop()
                        async_tasks[placeholder_key] = loop.run_in_executor(
                            None,
                            lambda mf=method_func, mp=method_params: mf(**mp)
                        )
                    continue
        
        # 不需要异步处理的，从 additional_params 获取
        if placeholder_config:
            value = additional_params.get(placeholder_config.key, "")
        else:
            value = additional_params.get(placeholder_key_stripped, "")
        placeholder_values[placeholder_key] = value
    
    # 并行执行所有异步任务
    if async_tasks:
        task_keys = list(async_tasks.keys())
        task_coroutines = list(async_tasks.values())
        results = await asyncio.gather(*task_coroutines, return_exceptions=True)
        
        for key, result in zip(task_keys, results):
            if isinstance(result, Exception):
                if settings.DEBUG:
                    traceback.print_exc()
                # 如果方法执行失败，尝试从 additional_params 获取
                placeholder_key_stripped = key.strip()
                placeholder_config = placeholder_map_by_key.get(placeholder_key_stripped) or placeholder_map_by_label.get(placeholder_key_stripped)
                if placeholder_config:
                    value = additional_params.get(placeholder_config.key, "")
                else:
                    value = additional_params.get(placeholder_key_stripped, "")
                placeholder_values[key] = value
            else:
                placeholder_values[key] = str(result) if result is not None else ""
    
    # 替换所有占位符
    for placeholder_key in placeholder_keys:
        value = placeholder_values.get(placeholder_key)
        if value is None:
            # 如果还没有值，从 additional_params 获取
            placeholder_key_stripped = placeholder_key.strip()
            placeholder_config = placeholder_map_by_key.get(placeholder_key_stripped) or placeholder_map_by_label.get(placeholder_key_stripped)
            if placeholder_config:
                value = additional_params.get(placeholder_config.key, "")
            else:
                value = additional_params.get(placeholder_key_stripped, "")
        processed_content = processed_content.replace(f"{{{placeholder_key}}}", str(value))
        processed_content = processed_content.replace(f"{{ {placeholder_key} }}", str(value))
    
    return processed_content


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
    
    根据场景代码获取提示词，并将占位符替换为实际值。
    返回处理后的提示词内容，不调用LLM。
    当请求体未传 teamCode 时，可从请求头 X-Team-AuthCode 推导团队。
    
    **参数说明：**
    - `scene`: 场景代码（路径参数）
    - `tenantCode`: 租户编号（可选，当提示词包含需要租户信息的占位符时必填）
    - `teamCode`: 团队代码（可选，未传时可由 X-Team-AuthCode 或 Bearer Token 推导）
    - `additional_params`: 占位符参数（请求体，可选）
    
    **获取逻辑：**
    1. 获取提示词（如果提供了 tenantCode，优先获取租户自定义提示词）
    2. 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
    3. 检查提示词是否需要租户信息
    4. 如果需要租户信息但未提供 tenantCode，返回错误
    5. 处理提示词中的占位符并返回
    
    **占位符处理：**
    - 支持 `{占位符key}` 和 `{ 占位符key }` 格式
    - 占位符值优先从配置的方法获取，其次从 `additional_params` 获取
    """
    # 1. 获取提示词（优先租户自定义，否则默认）
    tenant_id = None
    
    # team_code 优先级：请求体 teamCode > 场景关联 > X-Team-AuthCode 推导
    team_code = request.teamCode
    if not team_code:
        from app.services.scene_service import SceneService
        scene_obj = await SceneService.get_by_code(db, scene, team_id=None)
        if scene_obj and scene_obj.team_code:
            team_code = scene_obj.team_code
    if not team_code and team_code_from_auth:
        team_code = team_code_from_auth
    
    if request.tenantCode:
        tenant = await TenantService.get_tenant_by_code_id(db, request.tenantCode)
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail=f"未找到租户编号为 {request.tenantCode} 的租户"
            )
        tenant_id = tenant.id
        
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        if prompts:
            prompt = prompts[0]
        else:
            # 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
            prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        # 获取默认提示词（优先团队的，其次全局的）
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    
    if not prompt:
        raise HTTPException(
            status_code=404,
            detail=f"场景 {scene} 的提示词不存在"
        )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 场景=%s 租户ID=%s 团队代码=%s 原始内容=%s", scene, tenant_id, team_code, (prompt.content or "")[:200])
    
    # 2. 获取团队信息（从场景或请求头获取）
    team_id = None
    if team_code:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id
    
    # 3. 获取占位符配置，检查是否需要租户信息（使用 Service 层，按团队过滤）
    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="该提示词包含需要租户信息的占位符，请提供 tenantCode"
        )
    
    # 4. 处理占位符
    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request.additional_params or {},
        team_id=team_id,
        team_code=team_code,
    )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 处理后内容=%s 占位符参数=%s", (processed_content or "")[:200], request.additional_params or {})

    # 4. 返回处理后的提示词内容（非流式）
    return ResponseModel.success_response(
        data=PromptConvertResponse(
            content=processed_content,
            scene=scene,
            tenant_id=tenant_id or "default",
        ).model_dump(),
        message="提示词转换成功"
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
    # 1. 获取提示词（优先租户自定义，否则默认）
    tenant_id = None
    
    # team_code 优先级：请求体 teamCode > 场景关联 > X-Team-AuthCode 推导
    team_code = request.teamCode
    if not team_code:
        from app.services.scene_service import SceneService
        scene_obj = await SceneService.get_by_code(db, scene, team_id=None)
        if scene_obj and scene_obj.team_code:
            team_code = scene_obj.team_code
    if not team_code and team_code_from_auth:
        team_code = team_code_from_auth
    
    if request.tenantCode:
        tenant = await TenantService.get_tenant_by_code_id(db, request.tenantCode)
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail=f"未找到租户编号为 {request.tenantCode} 的租户"
            )
        tenant_id = tenant.id
        
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        if prompts:
            prompt = prompts[0]
        else:
            # 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
            prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        # 获取默认提示词（优先团队的，其次全局的）
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    
    if not prompt:
        raise HTTPException(
            status_code=404,
            detail=f"场景 {scene} 的提示词不存在"
        )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 场景=%s 租户ID=%s 团队代码=%s 原始内容=%s", scene, tenant_id, team_code, (prompt.content or "")[:200])
    
    # 2. 获取团队信息（从场景或请求头获取）
    team_id = None
    if team_code:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id
    
    # 3. 获取占位符配置，检查是否需要租户信息（使用 Service 层，按团队过滤）
    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="该提示词包含需要租户信息的占位符，请提供 tenantCode"
        )
    
    # 4. 处理占位符
    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request.additional_params or {},
        team_id=team_id,
        team_code=team_code,
    )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 处理后内容=%s 用户消息=%s 占位符参数=%s", (processed_content or "")[:200], (request.user_message or "")[:100], request.additional_params or {})
    
    # 4. 获取模型配置（必须提供 model_id，不再支持默认模型）
    if not request.model_id:
        raise HTTPException(status_code=400, detail="必须指定模型ID（model_id）")
    
    llm_config = request.llm_config or LLMConfig()
    from app.services.llm_model_service import LLMModelService
    model = await LLMModelService.get_model_by_id(db, request.model_id)
    if not model:
        raise HTTPException(status_code=400, detail="指定的模型不存在")
    
    # 验证模型是否属于当前团队（如果提供了team_id）
    if team_id and model.team_id and model.team_id != team_id:
        raise HTTPException(status_code=403, detail="模型不属于当前团队")
    
    # 创建 LLM 服务（使用数据库配置）
    import json
    config_dict = {}
    if model.extra_config:
        try:
            config_dict = json.loads(model.extra_config) if isinstance(model.extra_config, str) else model.extra_config
        except:
            pass
    llm_service = LLMService(
        api_key=model.api_key or getattr(settings, "DEEPSEEK_API_KEY", ""),
        api_base=model.api_base or getattr(settings, "DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
        model=model.model or getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat")
    )
    # 使用模型的默认参数（如果请求中没有指定）
    if not llm_config.temperature and model.default_temperature:
        try:
            llm_config.temperature = float(model.default_temperature)
        except:
            pass
    if not llm_config.max_tokens and model.default_max_tokens:
        llm_config.max_tokens = model.default_max_tokens
    
    # 5. 获取会话历史（如果提供了 conversation_id）
    conversation_history = []
    conversation = None
    if request.conversation_id:
        from app.services.conversation_service import ConversationService
        conversation = await ConversationService.get_conversation_by_id(db, request.conversation_id, include_messages=False)
        if conversation:
            # 验证会话属于当前团队
            if team_id and conversation.team_id != team_id:
                raise HTTPException(status_code=403, detail="会话不属于当前团队")
            # 获取会话历史（最多10条消息）
            conversation_history = await ConversationService.get_conversation_history_for_context(
                db, request.conversation_id, max_messages=10
            )
    
    # 6. 构建消息列表（包含上下文）
    messages = []
    
    # 添加系统提示词
    messages.append({"role": "system", "content": processed_content})
    
    # 添加会话历史（排除 system 消息，因为我们已经添加了最新的系统提示词）
    for hist_msg in conversation_history:
        if hist_msg["role"] != "system":
            messages.append({
                "role": hist_msg["role"],
                "content": hist_msg["content"]
            })
    
    # 添加当前用户消息
    messages.append({"role": "user", "content": request.user_message})
    
    # 7. 返回SSE流式响应并保存会话消息
    async def generate_sse_stream():
        full_response = ""
        try:
            # 若指定了 MCP，使用工具调用循环（非流式内部，最后流式输出结果）
            if request.mcp_id:
                mcp = await MCPService.get_by_id(db, request.mcp_id)
                if not mcp:
                    yield f"data: {json.dumps({'error': 'MCP 配置不存在'}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                if team_id and mcp.team_id and mcp.team_id != team_id:
                    yield f"data: {json.dumps({'error': 'MCP 配置不属于当前团队'}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                tools_raw = mcp.tools_cache
                if isinstance(tools_raw, str):
                    try:
                        tools_raw = json.loads(tools_raw) if tools_raw else []
                    except Exception:
                        tools_raw = []
                mcp_tools = tools_raw or []
                if request.mcp_tool_names:
                    name_set = set(request.mcp_tool_names)
                    mcp_tools = [t for t in mcp_tools if t.get("name") in name_set]
                if not mcp_tools:
                    yield f"data: {json.dumps({'error': '未找到可用的 MCP 工具'}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                auth_info = None
                if mcp.auth_info:
                    try:
                        auth_info = json.loads(mcp.auth_info) if isinstance(mcp.auth_info, str) else mcp.auth_info
                    except Exception:
                        pass
                mcp_transport = getattr(mcp, "transport_type", None) or TRANSPORT_SSE
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
                # 将完整回复作为单个 chunk 流式输出
                if full_response:
                    yield f"data: {json.dumps({'content': full_response}, ensure_ascii=False)}\n\n"
            else:
                async for chunk in llm_service.chat_stream(
                    messages=messages,
                    temperature=llm_config.temperature or 0.3,
                    max_tokens=llm_config.max_tokens,
                ):
                    full_response += chunk
                    # SSE格式：data: {content}\n\n
                    yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            
            # 保存会话消息（如果提供了 conversation_id）
            if request.conversation_id and conversation:
                from app.services.conversation_service import ConversationService
                from app.schemas.conversation import ConversationMessageCreate
                # 保存用户消息
                await ConversationService.add_message(db, request.conversation_id, ConversationMessageCreate(
                    role="user",
                    content=request.user_message,
                    metadata={"model_id": request.model_id} if request.model_id else None
                ))
                # 保存助手回复
                await ConversationService.add_message(db, request.conversation_id, ConversationMessageCreate(
                    role="assistant",
                    content=full_response,
                    metadata={
                        "model_id": request.model_id or (model.id if model else None),
                        "model_name": model.model if model else None,
                        "temperature": llm_config.temperature or 0.3,
                        "max_tokens": llm_config.max_tokens
                    }
                ))
            elif not conversation and team_id:
                # 如果没有提供 conversation_id，创建新会话
                from app.services.conversation_service import ConversationService
                from app.schemas.conversation import ConversationCreate, ConversationMessageCreate
                new_conversation = await ConversationService.create_conversation(
                    db,
                    ConversationCreate(scene=scene, tenant_id=tenant_id),
                    team_id=team_id
                )
                # 保存用户消息和助手回复
                await ConversationService.add_message(db, new_conversation.id, ConversationMessageCreate(
                    role="user",
                    content=request.user_message,
                    metadata={"model_id": request.model_id} if request.model_id else None
                ))
                await ConversationService.add_message(db, new_conversation.id, ConversationMessageCreate(
                    role="assistant",
                    content=full_response,
                    metadata={
                        "model_id": request.model_id or (model.id if model else None),
                        "model_name": model.model if model else None,
                        "temperature": llm_config.temperature or 0.3,
                        "max_tokens": llm_config.max_tokens
                    }
                ))
            
            # 发送结束标记
            yield "data: [DONE]\n\n"
        except Exception as e:
            # 记录错误但不暴露详细信息
            import logging
            logger = logging.getLogger(__name__)
            logger.exception("LLM流式调用失败")
            # 发送通用错误信息
            error_data = json.dumps({"error": "LLM调用失败，请稍后重试"}, ensure_ascii=False)
            yield f"data: {error_data}\n\n"
            yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        generate_sse_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用nginx缓冲
        }
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
    # 1. 获取提示词（优先租户自定义，否则默认）
    tenant_id = None
    
    # team_code 优先级：请求体 teamCode > 场景关联 > X-Team-AuthCode 推导
    team_code = request.teamCode
    if not team_code:
        from app.services.scene_service import SceneService
        scene_obj = await SceneService.get_by_code(db, scene, team_id=None)
        if scene_obj and scene_obj.team_code:
            team_code = scene_obj.team_code
    if not team_code and team_code_from_auth:
        team_code = team_code_from_auth
    
    if request.tenantCode:
        tenant = await TenantService.get_tenant_by_code_id(db, request.tenantCode)
        if not tenant:
            raise HTTPException(
                status_code=404,
                detail=f"未找到租户编号为 {request.tenantCode} 的租户"
            )
        tenant_id = tenant.id
        
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        if prompts:
            prompt = prompts[0]
        else:
            # 如果租户没有自定义提示词，获取默认提示词（优先团队的，其次全局的）
            prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    else:
        # 获取默认提示词（优先团队的，其次全局的）
        prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    
    if not prompt:
        raise HTTPException(
            status_code=404,
            detail=f"场景 {scene} 的提示词不存在"
        )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 场景=%s 租户ID=%s 团队代码=%s 原始内容=%s", scene, tenant_id, team_code, (prompt.content or "")[:200])
    
    # 2. 获取团队信息（从场景或请求头获取）
    team_id = None
    if team_code:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_code(db, team_code)
        if team:
            team_id = team.id

    # 2.5 异步模式：有通知时创建任务、推队列、立即返回 task_id
    notif = request.notification
    if notif and notif.type and notif.type != "none":
        from app.services.llmchat_task_service import LLMChatTaskService
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
        if notif.type == "email" and notif.email_to:
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
    
    # 3. 获取占位符配置，检查是否需要租户信息（使用 Service 层，按团队过滤）
    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    
    tenant_required = check_if_tenant_required(prompt.content, placeholders)
    if tenant_required and not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="该提示词包含需要租户信息的占位符，请提供 tenantCode"
        )

    # 3.5 异步队列模式：无通知时也走队列（减轻 API 压力），除非 sync=true
    if not sync and getattr(settings, "LLM_API_ASYNC_DEFAULT", True):
        from app.services.llmchat_task_service import LLMChatTaskService
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
        if not request.model_id:
            raise HTTPException(status_code=400, detail="必须指定模型ID（model_id）")
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
    
    # 4. 处理占位符
    processed_content = await process_placeholders_in_content(
        db=db,
        prompt_content=prompt.content,
        scene=scene,
        tenant_id=tenant_id,
        additional_params=request.additional_params or {},
        team_id=team_id,
        team_code=team_code,
    )
    
    if settings.DEBUG:
        logger.debug("[提示词调试] 处理后内容=%s 用户消息=%s 占位符参数=%s", (processed_content or "")[:200], (request.user_message or "")[:100], request.additional_params or {})
    
    # 4. 获取模型配置（必须提供 model_id，不再支持默认模型）
    if not request.model_id:
        raise HTTPException(status_code=400, detail="必须指定模型ID（model_id）")
    
    llm_config = request.llm_config or LLMConfig()
    from app.services.llm_model_service import LLMModelService
    model = await LLMModelService.get_model_by_id(db, request.model_id)
    if not model:
        raise HTTPException(status_code=400, detail="指定的模型不存在")
    
    # 验证模型是否属于当前团队（如果提供了team_id）
    if team_id and model.team_id and model.team_id != team_id:
        raise HTTPException(status_code=403, detail="模型不属于当前团队")
    
    # 创建 LLM 服务（使用数据库配置）
    import json
    config_dict = {}
    if model.extra_config:
        try:
            config_dict = json.loads(model.extra_config) if isinstance(model.extra_config, str) else model.extra_config
        except:
            pass
    llm_service = LLMService(
        api_key=model.api_key or getattr(settings, "DEEPSEEK_API_KEY", ""),
        api_base=model.api_base or getattr(settings, "DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
        model=model.model or getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat")
    )
    # 使用模型的默认参数（如果请求中没有指定）
    if not llm_config.temperature and model.default_temperature:
        try:
            llm_config.temperature = float(model.default_temperature)
        except:
            pass
    if not llm_config.max_tokens and model.default_max_tokens:
        llm_config.max_tokens = model.default_max_tokens
    
    # 5. 获取会话历史（如果提供了 conversation_id）
    conversation_history = []
    conversation = None
    if request.conversation_id:
        from app.services.conversation_service import ConversationService
        conversation = await ConversationService.get_conversation_by_id(db, request.conversation_id, include_messages=False)
        if conversation:
            # 验证会话属于当前团队
            if team_id and conversation.team_id != team_id:
                raise HTTPException(status_code=403, detail="会话不属于当前团队")
            # 获取会话历史（最多10条消息）
            conversation_history = await ConversationService.get_conversation_history_for_context(
                db, request.conversation_id, max_messages=10
            )
    
    # 6. 构建消息列表（包含上下文）
    messages = []
    
    # 添加系统提示词
    messages.append({"role": "system", "content": processed_content})
    
    # 添加会话历史（排除 system 消息，因为我们已经添加了最新的系统提示词）
    for hist_msg in conversation_history:
        if hist_msg["role"] != "system":
            messages.append({
                "role": hist_msg["role"],
                "content": hist_msg["content"]
            })
    
    # 添加当前用户消息
    messages.append({"role": "user", "content": request.user_message})
    
    # 7. 调用LLM获取完整回复并保存会话消息
    try:
        if request.mcp_id:
            mcp = await MCPService.get_by_id(db, request.mcp_id)
            if not mcp:
                raise HTTPException(status_code=404, detail="MCP 配置不存在")
            if team_id and mcp.team_id and mcp.team_id != team_id:
                raise HTTPException(status_code=403, detail="MCP 配置不属于当前团队")
            tools_raw = mcp.tools_cache
            if isinstance(tools_raw, str):
                try:
                    tools_raw = json.loads(tools_raw) if tools_raw else []
                except Exception:
                    tools_raw = []
            mcp_tools = tools_raw or []
            if request.mcp_tool_names:
                name_set = set(request.mcp_tool_names)
                mcp_tools = [t for t in mcp_tools if t.get("name") in name_set]
            if not mcp_tools:
                raise HTTPException(status_code=400, detail="未找到可用的 MCP 工具")
            auth_info = None
            if mcp.auth_info:
                try:
                    auth_info = json.loads(mcp.auth_info) if isinstance(mcp.auth_info, str) else mcp.auth_info
                except Exception:
                    pass
            mcp_transport = getattr(mcp, "transport_type", None) or TRANSPORT_SSE
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
            response_text = await llm_service.chat_with_messages(
                messages=messages,
                temperature=llm_config.temperature or 0.3,
                max_tokens=llm_config.max_tokens,
            )
        
        # 保存会话消息（如果提供了 conversation_id）
        if request.conversation_id and conversation:
            from app.services.conversation_service import ConversationService
            from app.schemas.conversation import ConversationMessageCreate
            # 保存用户消息
            await ConversationService.add_message(db, request.conversation_id, ConversationMessageCreate(
                role="user",
                content=request.user_message,
                metadata={"model_id": request.model_id} if request.model_id else None
            ))
            # 保存助手回复
            await ConversationService.add_message(db, request.conversation_id, ConversationMessageCreate(
                role="assistant",
                content=response_text,
                metadata={
                    "model_id": request.model_id or (model.id if model else None),
                    "model_name": model.model if model else None,
                    "temperature": llm_config.temperature or 0.3,
                    "max_tokens": llm_config.max_tokens
                }
            ))
        elif not conversation and team_id:
            # 如果没有提供 conversation_id，创建新会话
            from app.services.conversation_service import ConversationService
            from app.schemas.conversation import ConversationCreate, ConversationMessageCreate
            new_conversation = await ConversationService.create_conversation(
                db,
                ConversationCreate(scene=scene, tenant_id=tenant_id),
                team_id=team_id
            )
            # 保存用户消息和助手回复
            await ConversationService.add_message(db, new_conversation.id, ConversationMessageCreate(
                role="user",
                content=request.user_message,
                metadata={"model_id": request.model_id} if request.model_id else None
            ))
            await ConversationService.add_message(db, new_conversation.id, ConversationMessageCreate(
                role="assistant",
                content=response_text,
                metadata={
                    "model_id": request.model_id or (model.id if model else None),
                    "model_name": model.model if model else None,
                    "temperature": llm_config.temperature or 0.3,
                    "max_tokens": llm_config.max_tokens
                }
            ))
        
        return ResponseModel.success_response(
            data=PromptApiResponse(
                content=response_text,
                scene=scene,
                tenant_id=tenant_id or "default",
            ).model_dump(),
            message="接口调用成功"
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("LLM调用失败")
        raise HTTPException(
            status_code=500,
            detail="LLM调用失败，请稍后重试"
        )
