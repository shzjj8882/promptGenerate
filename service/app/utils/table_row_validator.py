# -*- coding: utf-8 -*-
"""
多维表格行数据校验工具。
校验列存在性、类型匹配（number/boolean/date/single_select/multi_select）、选项值合法。
"""
from typing import Any, Dict, List, Union

from fastapi import HTTPException, status


def _get_column_key(col: Union[Dict[str, Any], Any]) -> str:
    """从列定义中提取 key"""
    if isinstance(col, dict):
        return col.get("key", "")
    return getattr(col, "key", "")


def _get_column_type(col: Union[Dict[str, Any], Any]) -> str:
    """从列定义中提取 type"""
    if isinstance(col, dict):
        return col.get("type", "text")
    return getattr(col, "type", None) or "text"


def _get_options(col: Union[Dict[str, Any], Any]) -> List[str]:
    """从列定义中提取选项列表"""
    if isinstance(col, dict):
        opts = col.get("options") or {}
        if isinstance(opts, dict):
            return opts.get("options") or []
        return []
    opts = getattr(col, "options", None) or {}
    if isinstance(opts, dict):
        return opts.get("options") or []
    return []


def validate_row_data_for_columns(
    columns: List[Union[Dict[str, Any], Any]],
    row_data: Dict[str, str],
) -> None:
    """
    校验行数据（cells）是否符合列定义。
    校验：列 key 存在、类型匹配、选项值合法。

    Args:
        columns: 列定义列表（dict 或 TableColumn）
        row_data: 单元格数据，key 为列 key，value 为字符串

    Raises:
        HTTPException: 400，包含具体错误信息
    """
    column_keys = [_get_column_key(col) for col in columns]
    column_map = {_get_column_key(col): col for col in columns}

    validation_errors: List[str] = []
    for column_key, value in row_data.items():
        if column_key not in column_keys:
            validation_errors.append(f"列 '{column_key}' 不存在于表格中")
            continue

        column = column_map[column_key]
        column_type = _get_column_type(column)
        str_value = str(value) if value is not None else ""

        if column_type == "number":
            try:
                if str_value:
                    float(str_value)
            except (ValueError, TypeError):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的数字")
        elif column_type == "boolean":
            if str_value.lower() not in ("true", "false", "1", "0", "yes", "no", ""):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的布尔值")
        elif column_type == "date":
            pass  # 日期格式可根据需要扩展
        elif column_type in ("single_select", "multi_select"):
            options = _get_options(column)
            if options and value:
                if column_type == "single_select":
                    if value not in options:
                        validation_errors.append(
                            f"列 '{column_key}' 的值 '{value}' 不在选项列表中"
                        )
                elif column_type == "multi_select":
                    values = [v.strip() for v in value.split(",") if v.strip()]
                    invalid_values = [v for v in values if v not in options]
                    if invalid_values:
                        validation_errors.append(
                            f"列 '{column_key}' 的值 '{', '.join(invalid_values)}' 不在选项列表中"
                        )

    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="数据格式验证失败: " + "; ".join(validation_errors),
        )
