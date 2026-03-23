"""
LLM Chat 共享逻辑：占位符校验与处理、LLM 配置
供 llmchat_api_executor、api/llmchat router 共用，避免循环依赖
"""
import asyncio
import inspect
import json
import re
import traceback
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.prompt_service import PlaceholderService, PlaceholderDataSourceService
from app.core.config import settings


class LLMConfig:
    """LLM 配置（纯数据，无 Pydantic 依赖）"""

    def __init__(
        self,
        temperature: Optional[float] = 0.3,
        max_tokens: Optional[int] = None,
    ):
        self.temperature = temperature
        self.max_tokens = max_tokens


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
    tenant_required_keys = {"conversationId"}
    tenant_required_chinese_keys = {"系统对话ID"}

    placeholder_pattern = r"\{([^{}]+)\}"
    placeholder_keys = set(re.findall(placeholder_pattern, prompt_content))

    for key in placeholder_keys:
        key_stripped = key.strip()
        if key_stripped in tenant_required_keys:
            return True
        if key_stripped in tenant_required_chinese_keys:
            return True
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
    处理提示词内容中的占位符。支持 {input.key}、{table.key.row_id}、{key} 等格式。
    """
    from app.models.multi_dimension_table import (
        MultiDimensionTableRow,
        MultiDimensionTableCell,
    )
    from sqlalchemy import select, and_

    placeholder_pattern = r"\{([^{}]+)\}"
    placeholder_keys = list(set(re.findall(placeholder_pattern, prompt_content)))

    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    placeholder_map_by_key = {p.key: p for p in placeholders}
    placeholder_map_by_label = {p.label: p for p in placeholders}

    processed_content = prompt_content
    async_tasks = {}
    placeholder_values = {}

    for placeholder_key in placeholder_keys:
        placeholder_key_stripped = placeholder_key.strip()

        if placeholder_key_stripped.startswith("input."):
            key = placeholder_key_stripped[6:]
            value = additional_params.get(f"input.{key}", "")
            placeholder_values[placeholder_key] = value
            continue

        if placeholder_key_stripped.startswith("table."):
            parts = placeholder_key_stripped[6:].split(".", 1)
            if len(parts) >= 2:
                key = parts[0]
                row_id_key = parts[1]
                placeholder_config = (
                    placeholder_map_by_key.get(key)
                    or placeholder_map_by_label.get(key)
                )

                if (
                    placeholder_config
                    and placeholder_config.data_source_type
                    == "multi_dimension_table"
                ):
                    row_id_param_key = f"table.{key}.{row_id_key}"
                    row_id_value = additional_params.get(row_id_param_key)

                    if (
                        row_id_value is not None
                        and placeholder_config.table_id
                        and placeholder_config.table_column_key
                    ):
                        try:
                            row_query = select(MultiDimensionTableRow).where(
                                and_(
                                    MultiDimensionTableRow.table_id
                                    == placeholder_config.table_id,
                                    MultiDimensionTableRow.row_id
                                    == int(row_id_value),
                                )
                            )
                            row_result = await db.execute(row_query)
                            row = row_result.scalar_one_or_none()

                            if row:
                                cell_query = select(MultiDimensionTableCell).where(
                                    and_(
                                        MultiDimensionTableCell.row_id == row.id,
                                        MultiDimensionTableCell.column_key
                                        == placeholder_config.table_column_key,
                                    )
                                )
                                cell_result = await db.execute(cell_query)
                                cell = cell_result.scalar_one_or_none()
                                placeholder_values[placeholder_key] = (
                                    cell.value if cell else ""
                                )
                            else:
                                placeholder_values[placeholder_key] = ""
                        except (ValueError, TypeError):
                            placeholder_values[placeholder_key] = ""
                    else:
                        placeholder_values[placeholder_key] = ""
                else:
                    placeholder_values[placeholder_key] = additional_params.get(
                        row_id_param_key, ""
                    )
            continue

        key = placeholder_key_stripped
        placeholder_config = (
            placeholder_map_by_key.get(key) or placeholder_map_by_label.get(key)
        )

        if placeholder_config:
            if (
                placeholder_config.data_source_type
                == "multi_dimension_table"
            ):
                condition_value = None
                actual_condition_key = None
                key_params = additional_params.get(key)

                if isinstance(key_params, dict):
                    for param_key, param_value in key_params.items():
                        if param_value is not None:
                            if isinstance(param_value, (int, float)):
                                actual_condition_key = param_key
                                condition_value = param_value
                                break
                            elif (
                                isinstance(param_value, str)
                                and param_value.strip() != ""
                            ):
                                actual_condition_key = param_key
                                condition_value = param_value
                                break
                    if not actual_condition_key and len(key_params) > 0:
                        actual_condition_key = list(key_params.keys())[0]
                        condition_value = key_params[actual_condition_key]
                else:
                    condition_value = None
                    actual_condition_key = None

                if (
                    condition_value is not None
                    and actual_condition_key
                    and placeholder_config.table_id
                    and placeholder_config.table_column_key
                ):
                    try:
                        row = None
                        if actual_condition_key == "row_id":
                            try:
                                row_id_int = (
                                    int(condition_value)
                                    if not isinstance(condition_value, int)
                                    else condition_value
                                )
                            except (ValueError, TypeError):
                                row_id_int = None

                            if row_id_int is not None:
                                row_query = select(
                                    MultiDimensionTableRow
                                ).where(
                                    and_(
                                        MultiDimensionTableRow.table_id
                                        == placeholder_config.table_id,
                                        MultiDimensionTableRow.row_id
                                        == row_id_int,
                                    )
                                )
                                row_result = await db.execute(row_query)
                                row = row_result.scalar_one_or_none()
                        else:
                            condition_cell_query = (
                                select(MultiDimensionTableCell)
                                .join(
                                    MultiDimensionTableRow,
                                    MultiDimensionTableCell.row_id
                                    == MultiDimensionTableRow.id,
                                )
                                .where(
                                    and_(
                                        MultiDimensionTableRow.table_id
                                        == placeholder_config.table_id,
                                        MultiDimensionTableCell.column_key
                                        == actual_condition_key,
                                        MultiDimensionTableCell.value
                                        == str(condition_value),
                                    )
                                )
                            )
                            condition_cell_result = await db.execute(
                                condition_cell_query
                            )
                            condition_cell = (
                                condition_cell_result.scalar_one_or_none()
                            )
                            if condition_cell:
                                row_query = select(
                                    MultiDimensionTableRow
                                ).where(
                                    MultiDimensionTableRow.id
                                    == condition_cell.row_id
                                )
                                row_result = await db.execute(row_query)
                                row = row_result.scalar_one_or_none()

                        if row:
                            cell_query = select(
                                MultiDimensionTableCell
                            ).where(
                                and_(
                                    MultiDimensionTableCell.row_id == row.id,
                                    MultiDimensionTableCell.column_key
                                    == placeholder_config.table_column_key,
                                )
                            )
                            cell_result = await db.execute(cell_query)
                            cell = cell_result.scalar_one_or_none()
                            placeholder_values[placeholder_key] = (
                                cell.value if cell else ""
                            )
                        else:
                            placeholder_values[placeholder_key] = ""
                    except (ValueError, TypeError):
                        placeholder_values[placeholder_key] = ""
                    except Exception:
                        placeholder_values[placeholder_key] = ""
                else:
                    placeholder_values[placeholder_key] = ""
            else:
                key_params = additional_params.get(key)
                if isinstance(key_params, dict):
                    value = key_params.get("value", "")
                else:
                    value = ""
                placeholder_values[placeholder_key] = value
            continue

        if placeholder_config and placeholder_config.method:
            method_func = PlaceholderDataSourceService.get_method(
                placeholder_config.method
            )
            if method_func:
                if (
                    placeholder_config.tenant_param_key
                    and not tenant_id
                ):
                    value = additional_params.get(
                        placeholder_config.key, ""
                    )
                    placeholder_values[placeholder_key] = value
                else:
                    method_params = {}
                    if placeholder_config.method_params:
                        try:
                            method_params = json.loads(
                                placeholder_config.method_params
                            )
                        except json.JSONDecodeError:
                            method_params = {}

                    if (
                        placeholder_config.tenant_param_key
                        and tenant_id
                    ):
                        method_params[
                            placeholder_config.tenant_param_key
                        ] = tenant_id

                    method_params.update(additional_params)
                    sig = inspect.signature(method_func)
                    if "db" in sig.parameters:
                        method_params["db"] = db

                    if asyncio.iscoroutinefunction(method_func):
                        async_tasks[placeholder_key] = method_func(
                            **method_params
                        )
                    else:
                        loop = asyncio.get_event_loop()
                        async_tasks[placeholder_key] = loop.run_in_executor(
                            None,
                            lambda mf=method_func, mp=method_params: mf(
                                **mp
                            ),
                        )
                continue

        if placeholder_config:
            value = additional_params.get(placeholder_config.key, "")
        else:
            value = additional_params.get(placeholder_key_stripped, "")
        placeholder_values[placeholder_key] = value

    if async_tasks:
        task_keys = list(async_tasks.keys())
        task_coroutines = list(async_tasks.values())
        results = await asyncio.gather(
            *task_coroutines, return_exceptions=True
        )

        for key, result in zip(task_keys, results):
            if isinstance(result, Exception):
                if settings.DEBUG:
                    traceback.print_exc()
                pk_stripped = key.strip()
                pc = (
                    placeholder_map_by_key.get(pk_stripped)
                    or placeholder_map_by_label.get(pk_stripped)
                )
                if pc:
                    value = additional_params.get(pc.key, "")
                else:
                    value = additional_params.get(pk_stripped, "")
                placeholder_values[key] = value
            else:
                placeholder_values[key] = (
                    str(result) if result is not None else ""
                )

    for placeholder_key in placeholder_keys:
        value = placeholder_values.get(placeholder_key)
        if value is None:
            pk_stripped = placeholder_key.strip()
            pc = (
                placeholder_map_by_key.get(pk_stripped)
                or placeholder_map_by_label.get(pk_stripped)
            )
            if pc:
                value = additional_params.get(pc.key, "")
            else:
                value = additional_params.get(pk_stripped, "")
        processed_content = processed_content.replace(
            f"{{{placeholder_key}}}", str(value)
        )
        processed_content = processed_content.replace(
            f"{{ {placeholder_key} }}", str(value)
        )

    return processed_content
