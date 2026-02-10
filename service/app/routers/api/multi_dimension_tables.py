"""
多维表格行数据 API 接口
通过表格 code 进行行的增删改查操作
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
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
from app.models.multi_dimension_table import (
    MultiDimensionTable,
    MultiDimensionTableRow,
    MultiDimensionTableCell,
)

router = APIRouter(dependencies=[Depends(verify_optional_api_key)])


async def get_table_by_code(
    table_code: str,
    db: AsyncSession,
    team_id: Optional[str] = None,
) -> MultiDimensionTable:
    """通过 code 获取表格（支持按团队过滤）"""
    query = select(MultiDimensionTable).where(
        and_(
            MultiDimensionTable.code == table_code,
            MultiDimensionTable.is_active == True
        )
    )
    
    # 如果提供了 team_id，按团队过滤
    if team_id is not None:
        query = query.where(MultiDimensionTable.team_id == team_id)
    
    result = await db.execute(query)
    
    # 如果没有提供 team_id，检查是否有多个结果
    if team_id is None:
        tables = result.scalars().all()
        if len(tables) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"找到多个表格（code: {table_code}），请提供 team_id 参数来指定团队"
            )
        elif len(tables) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"表格不存在（code: {table_code}）"
            )
        table = tables[0]
    else:
        table = result.scalar_one_or_none()
        if not table:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"表格不存在（code: {table_code}, team_id: {team_id}）"
            )
    
    return table


@router.get("/multi-dimension-tables/{table_code}/rows", summary="获取表格行列表", tags=["应用接口 > 多维表格"])
async def get_table_rows(
    table_code: str = Path(..., description="表格代码"),
    team_id: Optional[str] = Query(None, description="团队 ID（可选，优先使用认证信息中的 team_id）"),
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    
    # 先获取表格（不强制 team_id 过滤，因为可能表格没有 team_id，或者需要先找到表格再确定 team_id）
    # 如果 final_team_id 为 None，先不传 team_id，找到表格后再根据表格的 team_id 来设置
    table = await get_table_by_code(table_code, db, team_id=None if not final_team_id else final_team_id)
    table_id = table.id
    
    # 如果 final_team_id 为 None，但表格有 team_id，使用表格的 team_id
    # 这样可以确保查询时能正确过滤团队（特别是使用 X-Team-AuthCode 时）
    if not final_team_id and table.team_id:
        final_team_id = table.team_id
    
    # 查询行（使用 final_team_id）
    if final_team_id:
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == final_team_id,
            )
        ).order_by(MultiDimensionTableRow.row_id)
    else:
        query = select(MultiDimensionTableRow).where(
            MultiDimensionTableRow.table_id == table_id
        ).order_by(MultiDimensionTableRow.row_id)
    
    result = await db.execute(query)
    rows = result.scalars().all()
    
    if not rows:
        return ResponseModel.success_response(
            data=[],
            message="获取行列表成功",
            code=status.HTTP_200_OK,
        )
    
    # 优化：批量查询所有单元格，避免 N+1 查询问题
    row_ids = [row.id for row in rows]
    cells_query = select(MultiDimensionTableCell).where(
        MultiDimensionTableCell.row_id.in_(row_ids)
    )
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    
    # 在内存中组织单元格数据（按 row_id 分组）
    cells_by_row = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value
    
    # 构建返回数据
    rows_data = []
    for row in rows:
        cells_dict = cells_by_row.get(row.id, {})
        row_data = json.loads(row.row_data) if row.row_data else None
        
        rows_data.append({
            "id": row.id,
            "table_id": row.table_id,
            "row_id": row.row_id,
            "team_id": row.team_id,
            "team_code": row.team_code,
            "row_data": row_data,
            "cells": cells_dict,
            "created_by": row.created_by,
            "updated_by": row.updated_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        })
    
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    
    # 获取表格
    table = await get_table_by_code(table_code, db, team_id=None if not final_team_id else final_team_id)
    table_id = table.id
    
    # 如果 final_team_id 为 None，但表格有 team_id，使用表格的 team_id
    if not final_team_id and table.team_id:
        final_team_id = table.team_id
    
    # 查询已存在的 row_id
    if final_team_id:
        row_ids_query = select(MultiDimensionTableRow.row_id).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == final_team_id,
            )
        )
        max_row_id_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == final_team_id,
            )
        )
    else:
        row_ids_query = select(MultiDimensionTableRow.row_id).where(
            MultiDimensionTableRow.table_id == table_id
        )
        max_row_id_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            MultiDimensionTableRow.table_id == table_id
        )
    
    # 获取所有已存在的 row_id
    row_ids_result = await db.execute(row_ids_query)
    existing_row_ids = sorted(set(row_ids_result.scalars().all()))
    
    # 获取最大 row_id
    max_row_id_result = await db.execute(max_row_id_query)
    max_row_id = max_row_id_result.scalar_one() or -1
    
    return ResponseModel.success_response(
        data={
            "max_row_id": max_row_id,  # 当前最大的 row_id（如果没有行则为 -1）
            "existing_row_ids": existing_row_ids,  # 所有已存在的 row_id 列表（已排序）
            "next_row_id": max_row_id + 1 if max_row_id >= 0 else 0,  # 建议的下一个 row_id
        },
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    table = await get_table_by_code(table_code, db, team_id=final_team_id)
    table_id = table.id
    
    # 使用从认证信息中获取的 team_id（如果可用）
    row_team_id = final_team_id
    
    # 获取当前团队的最大 row_id（用于验证用户提供的 row_id 是否合法）
    if row_team_id:
        max_row_id_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == row_team_id,
            )
        )
    else:
        max_row_id_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id.is_(None),
            )
        )
    max_row_id_result = await db.execute(max_row_id_query)
    max_row_id = max_row_id_result.scalar_one() or -1
    
    # 处理用户提供的 row_id
    if row_data.row_id is not None and row_data.row_id >= 0:
        new_row_id = row_data.row_id
        
        # 检查 row_id 是否已存在
        existing_row_query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == new_row_id,
                MultiDimensionTableRow.team_id == row_team_id if row_team_id else None,
            )
        )
        existing_row_result = await db.execute(existing_row_query)
        if existing_row_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"行 ID {new_row_id} 已存在")
        
        # 检查用户提供的 row_id 是否小于等于 max_row_id
        # 如果是，说明这个 row_id 可能是被删除的，不允许使用
        # 例如：当前 max_row_id = 1（row_id 2 被删除了），用户尝试使用 row_id 2，应该拒绝
        if max_row_id >= 0 and new_row_id <= max_row_id:
            # 再次检查：如果 row_id 确实不存在于数据库中，说明是被删除的，不允许使用
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"行 ID {new_row_id} 不允许使用（可能已被删除）。请使用大于 {max_row_id} 的 row_id，或不提供 row_id 让系统自动生成（将使用 {max_row_id + 1}）"
            )
    else:
        # 自动生成 row_id：使用 max_row_id + 1，确保被删除的 row_id 不会被复用
        # 这样可以保证 row_id 是递增的，即使中间有被删除的行
        # 使用 max_row_id + 1，如果没有行则从 0 开始
        new_row_id = max_row_id + 1 if max_row_id >= 0 else 0
    
    # 验证数据格式
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    column_map = {col["key"]: col for col in columns}
    
    # 填充默认值：对于没有在请求中提供的列，如果列有默认值，则使用默认值
    final_cells = dict(row_data.cells)  # 复制请求中的 cells
    for column in columns:
        column_key = column.get("key")
        if column_key and column_key not in final_cells:
            # 检查列是否有默认值
            column_options = column.get("options", {})
            if isinstance(column_options, dict):
                default_value = column_options.get("defaultValue")
                if default_value is not None and str(default_value).strip():
                    final_cells[column_key] = str(default_value).strip()
    
    validation_errors = []
    for column_key, value in final_cells.items():
        if column_key not in column_keys:
            validation_errors.append(f"列 '{column_key}' 不存在于表格中")
            continue
        
        column = column_map[column_key]
        column_type = column.get("type", "text")
        
        if column_type == "number":
            try:
                float(value) if value else None
            except (ValueError, TypeError):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的数字")
        elif column_type == "boolean":
            if value.lower() not in ("true", "false", "1", "0", "yes", "no", ""):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的布尔值")
        elif column_type == "date":
            pass
        elif column_type in ("single_select", "multi_select"):
            options = column.get("options", {}).get("options", [])
            if options and value:
                if column_type == "single_select":
                    if value not in options:
                        validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不在选项列表中")
                elif column_type == "multi_select":
                    values = [v.strip() for v in value.split(",") if v.strip()]
                    invalid_values = [v for v in values if v not in options]
                    if invalid_values:
                        validation_errors.append(f"列 '{column_key}' 的值 '{', '.join(invalid_values)}' 不在选项列表中")
    
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="数据格式验证失败: " + "; ".join(validation_errors)
        )
    
    # 创建行
    new_row = MultiDimensionTableRow(
        table_id=table_id,
        row_id=new_row_id,
        team_id=row_team_id,
        team_code=None,
        row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
        created_by=None,
        updated_by=None,
    )
    
    db.add(new_row)
    await db.flush()
    
    # 创建单元格（使用填充了默认值后的 cells）
    for column_key, value in final_cells.items():
        if column_key not in column_keys:
            continue
        
        cell = MultiDimensionTableCell(
            table_id=table_id,
            row_id=new_row.id,
            column_key=column_key,
            value=value,
            created_by=None,
            updated_by=None,
        )
        db.add(cell)
    
    await db.commit()
    await db.refresh(new_row)
    
    # 返回创建的行数据
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id == new_row.id)
    cells_result = await db.execute(cells_query)
    cells = cells_result.scalars().all()
    cells_dict = {cell.column_key: cell.value for cell in cells}
    
    return ResponseModel.success_response(
        data={
            "id": new_row.id,
            "table_id": new_row.table_id,
            "row_id": new_row.row_id,
            "team_id": new_row.team_id,
            "team_code": new_row.team_code,
            "row_data": json.loads(new_row.row_data) if new_row.row_data else None,
            "cells": cells_dict,
            "created_by": new_row.created_by,
            "updated_by": new_row.updated_by,
            "created_at": new_row.created_at.isoformat() if new_row.created_at else None,
            "updated_at": new_row.updated_at.isoformat() if new_row.updated_at else None,
        },
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    
    # 获取表格（与查询行列表的逻辑完全一致）
    # 如果 final_team_id 为 None，先不传 team_id，找到表格后再根据表格的 team_id 来设置
    table = await get_table_by_code(table_code, db, team_id=None if not final_team_id else final_team_id)
    table_id = table.id
    
    # 如果 final_team_id 为 None，但表格有 team_id，使用表格的 team_id
    # 这样可以确保查询时能正确过滤团队（特别是使用 X-Team-AuthCode 时）
    if not final_team_id and table.team_id:
        final_team_id = table.team_id
    
    condition = update_request.condition
    
    # 根据条件查找行
    if condition.column_key == "row_id":
        query_conditions = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.row_id == int(condition.value),
        ]
        # 如果指定了团队ID，添加团队过滤条件
        # 注意：如果 final_team_id 为 None，不添加团队过滤，查询所有团队的行
        if final_team_id:
            query_conditions.append(MultiDimensionTableRow.team_id == final_team_id)
        # 如果 final_team_id 为 None，不添加团队过滤条件，查询所有团队的行
        # （包括 team_id 为 None 的行）
        query = select(MultiDimensionTableRow).where(and_(*query_conditions))
    else:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        condition_cell_query_conditions = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableCell.column_key == condition.column_key,
            MultiDimensionTableCell.value == str(condition.value)
        ]
        # 如果指定了团队ID，添加团队过滤条件
        if final_team_id:
            condition_cell_query_conditions.append(MultiDimensionTableRow.team_id == final_team_id)
        
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(and_(*condition_cell_query_conditions))
        
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        
        if not condition_cells:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"未找到满足条件 {condition.column_key}={condition.value} 的行"
            )
        
        row_ids = [cell.row_id for cell in condition_cells]
        query = select(MultiDimensionTableRow).where(
            MultiDimensionTableRow.id.in_(row_ids)
        )
    
    result = await db.execute(query)
    rows = result.scalars().all()
    
    if not rows:
        # 提供更详细的错误信息，帮助调试
        # 先查询一下实际存在的行，看看是什么情况
        debug_query = select(MultiDimensionTableRow).where(
            MultiDimensionTableRow.table_id == table_id
        )
        if final_team_id:
            debug_query = debug_query.where(MultiDimensionTableRow.team_id == final_team_id)
        debug_result = await db.execute(debug_query)
        debug_rows = debug_result.scalars().all()
        
        if condition.column_key == "row_id":
            error_detail = f"未找到满足条件的行（table_code={table_code}, row_id={condition.value}"
            error_detail += f", auth_team_id={auth_team_id}, query_team_id={team_id}, final_team_id={final_team_id}"
            error_detail += f", table_id={table_id}, table_team_id={table.team_id}"
            if debug_rows:
                existing_row_ids = [r.row_id for r in debug_rows[:5]]
                existing_team_ids = list(set([r.team_id for r in debug_rows[:5]]))
                error_detail += f", 该表格下存在 {len(debug_rows)} 行，row_ids={existing_row_ids}, team_ids={existing_team_ids}"
            else:
                error_detail += f", 该表格下不存在任何行（table_id={table_id}, team_id={final_team_id}）"
            error_detail += "）。请确认：1) 表格是否存在 2) 行是否存在 3) 团队ID是否匹配"
        else:
            error_detail = f"未找到满足条件 {condition.column_key}={condition.value} 的行"
            error_detail += f"（auth_team_id={auth_team_id}, final_team_id={final_team_id}）"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail
        )
    
    # 验证更新的单元格数据格式
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    column_map = {col["key"]: col for col in columns}
    
    if update_request.cells:
        validation_errors = []
        for column_key, value in update_request.cells.items():
            if column_key not in column_map:
                validation_errors.append(f"列 '{column_key}' 不存在于表格中")
                continue
            
            column = column_map[column_key]
            column_type = column.get("type", "text")
            
            if column_type == "number":
                try:
                    float(value) if value else None
                except (ValueError, TypeError):
                    validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的数字")
            elif column_type == "boolean":
                if value.lower() not in ("true", "false", "1", "0", "yes", "no", ""):
                    validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的布尔值")
            elif column_type in ("single_select", "multi_select"):
                options = column.get("options", {}).get("options", [])
                if options and value:
                    if column_type == "single_select":
                        if value not in options:
                            validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不在选项列表中")
                    elif column_type == "multi_select":
                        values = [v.strip() for v in value.split(",") if v.strip()]
                        invalid_values = [v for v in values if v not in options]
                        if invalid_values:
                            validation_errors.append(f"列 '{column_key}' 的值 '{', '.join(invalid_values)}' 不在选项列表中")
        
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="数据格式验证失败: " + "; ".join(validation_errors)
            )
    
    # 更新所有匹配的行
    updated_count = 0
    updated_row_ids = []
    for row in rows:
        if update_request.row_data is not None:
            row.row_data = json.dumps(update_request.row_data, ensure_ascii=False)
        
        if update_request.cells:
            for column_key, value in update_request.cells.items():
                if column_key not in column_keys:
                    continue
                
                cell_result = await db.execute(
                    select(MultiDimensionTableCell).where(
                        and_(
                            MultiDimensionTableCell.row_id == row.id,
                            MultiDimensionTableCell.column_key == column_key,
                        )
                    )
                )
                cell = cell_result.scalar_one_or_none()
                
                if cell:
                    cell.value = value
                else:
                    cell = MultiDimensionTableCell(
                        table_id=table_id,
                        row_id=row.id,
                        column_key=column_key,
                        value=value,
                    )
                    db.add(cell)
        
        updated_row_ids.append(row.id)
        updated_count += 1
    
    await db.commit()
    
    return ResponseModel.success_response(
        data={
            "updated_count": updated_count,
            "updated_row_ids": updated_row_ids,
        },
        message=f"成功更新 {updated_count} 行",
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    table = await get_table_by_code(table_code, db, team_id=final_team_id)
    table_id = table.id
    condition = delete_request.condition
    
    # 根据条件查找行
    if condition.column_key == "row_id":
        query_conditions = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.row_id == int(condition.value),
        ]
        # 如果指定了团队ID，添加团队过滤条件
        if final_team_id:
            query_conditions.append(MultiDimensionTableRow.team_id == final_team_id)
        query = select(MultiDimensionTableRow).where(and_(*query_conditions))
    else:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        condition_cell_query_conditions = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableCell.column_key == condition.column_key,
            MultiDimensionTableCell.value == str(condition.value)
        ]
        # 如果指定了团队ID，添加团队过滤条件
        if final_team_id:
            condition_cell_query_conditions.append(MultiDimensionTableRow.team_id == final_team_id)
        
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(and_(*condition_cell_query_conditions))
        
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        
        if not condition_cells:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"未找到满足条件 {condition.column_key}={condition.value} 的行"
            )
        
        row_ids = [cell.row_id for cell in condition_cells]
        query = select(MultiDimensionTableRow).where(
            MultiDimensionTableRow.id.in_(row_ids)
        )
    
    result = await db.execute(query)
    rows = result.scalars().all()
    
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到满足条件的行"
        )
    
    deleted_count = 0
    deleted_row_ids = []
    for row in rows:
        deleted_row_ids.append(row.id)
        await db.delete(row)
        deleted_count += 1
    
    await db.commit()
    
    return ResponseModel.success_response(
        data={
            "deleted_count": deleted_count,
            "deleted_row_ids": deleted_row_ids,
        },
        message=f"成功删除 {deleted_count} 行",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/{table_code}/rows/{row_id}", summary="更新表格行", tags=["应用接口 > 多维表格"])
async def update_table_row(
    table_code: str = Path(..., description="表格代码"),
    row_id: str = Path(..., description="行 ID（数据库主键）"),
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    table = await get_table_by_code(table_code, db, team_id=final_team_id)
    table_id = table.id
    
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 更新行数据
    if row_data.row_data is not None:
        row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
    
    # 更新单元格
    if row_data.cells is not None:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        
        for column_key, value in row_data.cells.items():
            if column_key not in column_keys:
                continue
            
            cell_result = await db.execute(
                select(MultiDimensionTableCell).where(
                    and_(
                        MultiDimensionTableCell.row_id == row_id,
                        MultiDimensionTableCell.column_key == column_key,
                    )
                )
            )
            cell = cell_result.scalar_one_or_none()
            
            if cell:
                cell.value = value
            else:
                cell = MultiDimensionTableCell(
                    table_id=table_id,
                    row_id=row_id,
                    column_key=column_key,
                    value=value,
                )
                db.add(cell)
    
    await db.commit()
    await db.refresh(row)
    
    # 返回更新后的行数据
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id == row_id)
    cells_result = await db.execute(cells_query)
    cells = cells_result.scalars().all()
    cells_dict = {cell.column_key: cell.value for cell in cells}
    
    return ResponseModel.success_response(
        data={
            "id": row.id,
            "table_id": row.table_id,
            "row_id": row.row_id,
            "team_id": row.team_id,
            "team_code": row.team_code,
            "row_data": json.loads(row.row_data) if row.row_data else None,
            "cells": cells_dict,
            "created_by": row.created_by,
            "updated_by": row.updated_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        },
        message="更新行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_code}/rows/{row_id}", summary="删除表格行", tags=["应用接口 > 多维表格"])
async def delete_table_row(
    table_code: str = Path(..., description="表格代码"),
    row_id: str = Path(..., description="行 ID（数据库主键）"),
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
    # 优先使用认证信息中的 team_id，如果没有则使用查询参数中的 team_id
    final_team_id = auth_team_id or team_id
    table = await get_table_by_code(table_code, db, team_id=final_team_id)
    table_id = table.id
    
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 删除行（级联删除单元格）
    await db.delete(row)
    await db.commit()
    
    return ResponseModel.success_response(
        data={"id": row_id},
        message="删除行成功",
        code=status.HTTP_200_OK,
    )
