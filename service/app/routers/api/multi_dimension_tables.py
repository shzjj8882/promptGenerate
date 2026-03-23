"""
多维表格行数据 API 接口
通过表格 code 进行行的增删改查操作
"""
from fastapi import APIRouter, Depends, Query, Path, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

import json
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.api_auth import verify_optional_api_key, get_team_id_from_auth
from app.schemas.multi_dimension_table import (
    MultiDimensionTableRowCreate,
    MultiDimensionTableRowUpdate,
    TableRowDeleteByCondition,
    TableRowUpdateByCondition,
)
from app.services.team_usage_log_service import log_team_usage
from app.services.team_quota_service import TeamQuotaService
from app.services.multi_dimension_table_service import (
    get_table_by_code_api,
    api_get_table_rows,
    api_get_row_ids,
    api_create_table_row,
    api_update_row_by_condition,
    api_delete_row_by_condition,
    api_update_table_row,
    api_delete_table_row,
)

router = APIRouter(dependencies=[Depends(verify_optional_api_key)])

# 多维表格 API 每次调用扣除的 token 数量
TABLE_API_TOKENS_PER_CALL = 1


async def _resolve_team_id(
    table_code: str,
    auth_team_id: Optional[str],
    query_team_id: Optional[str],
    db: AsyncSession,
) -> tuple[Optional[str], str]:
    """解析 final_team_id，并返回 (final_team_id, table_code)"""
    final_team_id = auth_team_id or query_team_id
    table = await get_table_by_code_api(
        table_code, db, team_id=None if not final_team_id else final_team_id
    )
    if not final_team_id and table.team_id:
        final_team_id = table.team_id
    return final_team_id, table_code


@router.get("/multi-dimension-tables/{table_code}/rows", summary="获取表格行列表", tags=["应用接口 > 多维表格"])
async def get_table_rows(
    table_code: str = Path(..., description="表格代码"),
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    skip: int = Query(0, ge=0, description="跳过行数，用于分页"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="每页行数，不传则返回全部"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 获取行列表
    
    **CURL 示例：**
    ```bash
    # 使用 X-Team-AuthCode 认证
    curl -X GET "http://localhost:8000/api/multi-dimension-tables/dev/rows" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4"
    
    # 使用查询参数指定团队 ID
    curl -X GET "http://localhost:8000/api/multi-dimension-tables/dev/rows?team_id=3da83bd7-2544-455c-918a-d8b4dfe122ee"
    ```
    """
    final_team_id, tc = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    rows_data = await api_get_table_rows(table_code, final_team_id, db, skip=skip, limit=limit)

    if final_team_id:
        await log_team_usage(db, final_team_id, usage_type=4, tokens_used=TABLE_API_TOKENS_PER_CALL, extra_info=json.dumps({"table_code": tc}), business_name="多维表格-按条件查询")
        await db.commit()

    return ResponseModel.success_response(
        data=rows_data,
        message="获取行列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/multi-dimension-tables/{table_code}/rows/row-ids", summary="获取表格的 row_id 信息", tags=["应用接口 > 多维表格"])
async def get_table_row_ids(
    table_code: str = Path(..., description="表格代码"),
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """获取表格的 row_id 信息（最大 row_id 和已存在的 row_id 列表）
    
    前端在添加数据时可以使用此接口获取当前的 row_id 状态：
    1. 第一次请求时获取 max_row_id 和 existing_row_ids
    2. 前端在本地维护 row_id 的分配（递增）
    3. 保存数据后，重新从服务端获取最新的 row_id 信息
    
    **CURL 示例：**
    ```bash
    curl -X GET "http://localhost:8000/api/multi-dimension-tables/dev/rows/row-ids" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4"
    ```
    
    **返回示例：**
    ```json
    {
      "success": true,
      "data": {
        "max_row_id": 2,
        "existing_row_ids": [0, 1, 2],
        "next_row_id": 3
      },
      "message": "获取 row_id 信息成功"
    }
    ```
    """
    final_team_id, _ = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_get_row_ids(table_code, final_team_id, db)
    return ResponseModel.success_response(
        data=data,
        message="获取 row_id 信息成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables/{table_code}/rows", status_code=status.HTTP_201_CREATED, summary="创建表格行", tags=["应用接口 > 多维表格"])
async def create_table_row(
    table_code: str = Path(..., description="表格代码"),
    row_data: MultiDimensionTableRowCreate = ...,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 创建行
    
    **CURL 示例：**
    ```bash
    # 创建新行（不指定 row_id，系统自动生成）
    curl -X POST "http://localhost:8000/api/multi-dimension-tables/dev/rows" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "cells": {
          "name": "张三",
          "age": "25",
          "email": "zhangsan@example.com"
        }
      }'
    
    # 创建新行（指定 row_id，必须大于当前最大 row_id）
    curl -X POST "http://localhost:8000/api/multi-dimension-tables/dev/rows" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "row_id": 5,
        "cells": {
          "name": "李四",
          "age": "30"
        }
      }'
    ```
    
    **注意：**
    - 如果不提供 `row_id`，系统会自动生成（使用 max_row_id + 1）
    - 如果提供 `row_id`，必须大于当前最大 row_id，被删除的 row_id 不允许再使用
    """
    final_team_id, tc = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_create_table_row(table_code, final_team_id, row_data, db)
    if final_team_id:
        await log_team_usage(db, final_team_id, usage_type=1, tokens_used=TABLE_API_TOKENS_PER_CALL, extra_info=json.dumps({"table_code": tc}), business_name="多维表格-单条新增")
        await db.commit()

    return ResponseModel.success_response(
        data=data,
        message="创建行成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/multi-dimension-tables/{table_code}/rows/by-condition", summary="根据条件更新表格行", tags=["应用接口 > 多维表格"])
async def update_table_row_by_condition(
    table_code: str = Path(..., description="表格代码"),
    update_request: TableRowUpdateByCondition = ...,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 根据条件更新行
    
    **CURL 示例：**
    ```bash
    # 通过 row_id 条件更新
    curl -X PUT "http://localhost:8000/api/multi-dimension-tables/dev/rows/by-condition" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "condition": {
          "column_key": "row_id",
          "value": "0"
        },
        "cells": {
          "name": "更新后的名称",
          "age": "30"
        }
      }'
    
    # 通过其他列条件更新（例如通过 name 列）
    curl -X PUT "http://localhost:8000/api/multi-dimension-tables/dev/rows/by-condition" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "condition": {
          "column_key": "name",
          "value": "张三"
        },
        "cells": {
          "age": "25",
          "email": "newemail@example.com"
        }
      }'
    ```
    """
    final_team_id, tc = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_update_row_by_condition(table_code, final_team_id, update_request, db)
    if final_team_id:
        await log_team_usage(db, final_team_id, usage_type=2, tokens_used=TABLE_API_TOKENS_PER_CALL, extra_info=json.dumps({"table_code": tc, "updated_count": data["updated_count"]}), business_name="多维表格-按条件编辑")
        await db.commit()

    return ResponseModel.success_response(
        data=data,
        message=f"成功更新 {data['updated_count']} 行",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_code}/rows/by-condition", summary="根据条件删除表格行", tags=["应用接口 > 多维表格"])
async def delete_table_row_by_condition(
    table_code: str = Path(..., description="表格代码"),
    delete_request: TableRowDeleteByCondition = ...,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 根据条件删除行
    
    **CURL 示例：**
    ```bash
    # 通过 row_id 条件删除
    curl -X DELETE "http://localhost:8000/api/multi-dimension-tables/dev/rows/by-condition" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "condition": {
          "column_key": "row_id",
          "value": "0"
        }
      }'
    
    # 通过其他列条件删除（例如通过 name 列）
    curl -X DELETE "http://localhost:8000/api/multi-dimension-tables/dev/rows/by-condition" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "condition": {
          "column_key": "name",
          "value": "张三"
        }
      }'
    ```
    """
    final_team_id, tc = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_delete_row_by_condition(table_code, final_team_id, delete_request, db)
    if final_team_id:
        await log_team_usage(db, final_team_id, usage_type=3, tokens_used=TABLE_API_TOKENS_PER_CALL, extra_info=json.dumps({"table_code": tc, "deleted_count": data["deleted_count"]}), business_name="多维表格-按条件删除")
        await db.commit()

    return ResponseModel.success_response(
        data=data,
        message=f"成功删除 {data['deleted_count']} 行",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/{table_code}/rows/{row_id}", summary="更新表格行", tags=["应用接口 > 多维表格"])
async def update_table_row(
    table_code: str = Path(..., description="表格代码"),
    row_id: str = Path(..., description="行 ID（数据库主键）", pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
    row_data: MultiDimensionTableRowUpdate = ...,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 更新行（使用数据库主键 ID）
    
    **CURL 示例：**
    ```bash
    # 更新指定行（需要先查询到行的数据库主键 id）
    curl -X PUT "http://localhost:8000/api/multi-dimension-tables/dev/rows/b1c154b2-a04d-478a-81c4-92b32e80f6ed" \
      -H "Content-Type: application/json" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4" \
      --data-raw '{
        "cells": {
          "name": "更新后的名称",
          "age": "30"
        }
      }'
    ```
    
    **注意：** `row_id` 参数是行的数据库主键（UUID），不是逻辑 row_id。如果需要通过逻辑 row_id 更新，请使用 `/rows/by-condition` 接口。
    """
    final_team_id, _ = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_update_table_row(table_code, final_team_id, row_id, row_data, db)
    return ResponseModel.success_response(
        data=data,
        message="更新行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_code}/rows/{row_id}", summary="删除表格行", tags=["应用接口 > 多维表格"])
async def delete_table_row(
    table_code: str = Path(..., description="表格代码"),
    row_id: str = Path(..., description="行 ID（数据库主键）", pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
    auth_team_id: Optional[str] = Depends(get_team_id_from_auth),
    db: AsyncSession = Depends(get_db),
):
    """通过表格 code 删除行（使用数据库主键 ID，级联删除单元格）
    
    **CURL 示例：**
    ```bash
    # 删除指定行（需要先查询到行的数据库主键 id）
    curl -X DELETE "http://localhost:8000/api/multi-dimension-tables/dev/rows/b1c154b2-a04d-478a-81c4-92b32e80f6ed" \
      -H "X-Team-AuthCode: lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4"
    ```
    
    **注意：** `row_id` 参数是行的数据库主键（UUID），不是逻辑 row_id。如果需要通过逻辑 row_id 删除，请使用 `/rows/by-condition` 接口。
    """
    final_team_id, _ = await _resolve_team_id(table_code, auth_team_id, team_id, db)
    if final_team_id:
        await TeamQuotaService.check_and_consume_tokens(db, final_team_id, TABLE_API_TOKENS_PER_CALL)

    data = await api_delete_table_row(table_code, final_team_id, row_id, db)
    return ResponseModel.success_response(
        data=data,
        message="删除行成功",
        code=status.HTTP_200_OK,
    )
