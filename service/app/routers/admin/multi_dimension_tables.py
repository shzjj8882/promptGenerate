# -*- coding: utf-8 -*-
"""
多维表格管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete
from typing import List, Optional
import json
import uuid
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_permission
from app.schemas.user import UserResponse
from app.schemas.multi_dimension_table import (
    MultiDimensionTableCreate,
    MultiDimensionTableUpdate,
    MultiDimensionTableResponse,
    MultiDimensionTableRowCreate,
    MultiDimensionTableRowUpdate,
    MultiDimensionTableRowResponse,
    TableSearchRequest,
    TableSearchResponse,
    TableColumn,
    TableRowsBulkSave,
    TableRowBulkData,
    TableRowDeleteByCondition,
    TableRowUpdateByCondition,
)
from app.models.multi_dimension_table import (
    MultiDimensionTable,
    MultiDimensionTableRow,
    MultiDimensionTableCell,
)

router = APIRouter()


async def require_tables_list_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("multi_dimension_tables:list", current_user, db)


async def require_tables_create_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("multi_dimension_tables:create", current_user, db)


async def require_tables_update_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("multi_dimension_tables:update", current_user, db)


async def require_tables_delete_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("multi_dimension_tables:delete", current_user, db)


# ==================== 辅助函数 ====================

async def get_table_by_code_or_id(
    code_or_id: str,
    current_user: UserResponse,
    db: AsyncSession,
) -> MultiDimensionTable:
    """通过 code 或 id 获取表格"""
    # 先尝试通过 id 查找
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == code_or_id))
    table = result.scalar_one_or_none()
    
    if table:
        # 权限检查
        if not current_user.is_superuser and table.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该表格")
        return table
    
    # 如果通过 id 没找到，尝试通过 code 查找
    result = await db.execute(
        select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == code_or_id,
                MultiDimensionTable.is_active == True
            )
        )
    )
    table = result.scalar_one_or_none()
    
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该表格")
    
    return table


# ==================== 表格管理接口 ====================

@router.get("/multi-dimension-tables", summary="获取多维表格列表")
async def get_tables(
    team_id: Optional[str] = Query(None, description="团队 ID（可选）"),
    skip: int = Query(0, ge=0, description="跳过条数"),
    limit: int = Query(10, ge=1, le=100, description="每页条数"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取多维表格列表（按用户角色和团队过滤，支持分页）"""
    # 构建查询
    base_query = select(MultiDimensionTable).where(MultiDimensionTable.is_active == True)
    
    # 如果不是超级管理员，只显示自己团队的表格
    if not current_user.is_superuser:
        if current_user.team_id:
            base_query = base_query.where(MultiDimensionTable.team_id == current_user.team_id)
        else:
            # 没有团队的用户只能看到没有团队的表格
            base_query = base_query.where(MultiDimensionTable.team_id.is_(None))
    
    # 如果指定了 team_id，进一步过滤
    if team_id:
        base_query = base_query.where(MultiDimensionTable.team_id == team_id)
    
    # 优化：统计总数（复用 base_query 的过滤条件）
    count_query = select(func.count(MultiDimensionTable.id)).where(
        MultiDimensionTable.is_active == True
    )
    if not current_user.is_superuser:
        if current_user.team_id:
            count_query = count_query.where(MultiDimensionTable.team_id == current_user.team_id)
        else:
            count_query = count_query.where(MultiDimensionTable.team_id.is_(None))
    if team_id:
        count_query = count_query.where(MultiDimensionTable.team_id == team_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页查询
    query = base_query.order_by(
        MultiDimensionTable.updated_at.desc().nullslast(),
        MultiDimensionTable.created_at.desc()
    ).offset(skip).limit(limit)
    
    result = await db.execute(query)
    tables = result.scalars().all()
    
    # 优化：批量统计所有表格的行数，避免 N+1 查询
    table_ids = [table.id for table in tables]
    row_count_query = select(
        MultiDimensionTableRow.table_id,
        func.count(MultiDimensionTableRow.id).label('row_count')
    ).where(
        MultiDimensionTableRow.table_id.in_(table_ids)
    )
    if not current_user.is_superuser and current_user.team_id:
        row_count_query = row_count_query.where(MultiDimensionTableRow.team_id == current_user.team_id)
    row_count_query = row_count_query.group_by(MultiDimensionTableRow.table_id)
    row_count_result = await db.execute(row_count_query)
    row_counts = {row.table_id: row.row_count for row in row_count_result.all()}
    
    # 返回表格数据
    tables_data = []
    for table in tables:
        row_count = row_counts.get(table.id, 0)
        
        table_dict = {
            "id": table.id,
            "code": getattr(table, 'code', None) or f"table_{table.id[:8]}",  # 兼容旧数据
            "name": table.name,
            "description": table.description,
            "team_id": table.team_id,
            "team_code": table.team_code,
            "columns": json.loads(table.columns) if table.columns else [],
            "row_count": row_count,  # 添加行数统计
            "is_active": table.is_active,
            "created_by": table.created_by,
            "updated_by": table.updated_by,
            "created_at": table.created_at.isoformat() if table.created_at else None,
            "updated_at": table.updated_at.isoformat() if table.updated_at else None,
        }
        tables_data.append(table_dict)
    
    return ResponseModel.success_response(
        data={
            "items": tables_data,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取表格列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/multi-dimension-tables/{table_id}", summary="获取多维表格详情")
async def get_table(
    table_id: str,
    include_rows: bool = Query(False, description="是否包含行数据"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取多维表格详情"""
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查：非超级管理员只能查看自己团队的表格
    if not current_user.is_superuser:
        if table.team_id != current_user.team_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该表格")
    
    table_dict = {
        "id": table.id,
        "code": getattr(table, 'code', None) or f"table_{table.id[:8]}",  # 兼容旧数据
        "name": table.name,
        "description": table.description,
        "team_id": table.team_id,
        "team_code": table.team_code,
        "columns": json.loads(table.columns) if table.columns else [],
        "is_active": table.is_active,
        "created_by": table.created_by,
        "updated_by": table.updated_by,
        "created_at": table.created_at.isoformat() if table.created_at else None,
        "updated_at": table.updated_at.isoformat() if table.updated_at else None,
    }
    
    # 如果需要包含行数据
    if include_rows:
        # 确定团队 ID
        target_team_id = current_user.team_id if not current_user.is_superuser else None
        
        # 查询行
        if target_team_id:
            query = select(MultiDimensionTableRow).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == target_team_id,
                )
            ).order_by(MultiDimensionTableRow.row_id)
        else:
            # 超级管理员可以查看所有团队的行
            query = select(MultiDimensionTableRow).where(
                MultiDimensionTableRow.table_id == table_id
            ).order_by(MultiDimensionTableRow.row_id)
        
        result = await db.execute(query)
        rows = result.scalars().all()
        
        if rows:
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
            
            table_dict["rows"] = rows_data
        else:
            table_dict["rows"] = []
    
    return ResponseModel.success_response(
        data=table_dict,
        message="获取表格详情成功",
        code=status.HTTP_200_OK,
    )


@router.get("/multi-dimension-tables/by-code/{table_code}", summary="通过 code 获取多维表格详情")
async def get_table_by_code(
    table_code: str,
    include_rows: bool = Query(False, description="是否包含行数据"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 获取多维表格详情"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    
    table_dict = {
        "id": table.id,
        "code": getattr(table, 'code', None) or f"table_{table.id[:8]}",
        "name": table.name,
        "description": table.description,
        "team_id": table.team_id,
        "team_code": table.team_code,
        "columns": json.loads(table.columns) if table.columns else [],
        "is_active": table.is_active,
        "created_by": table.created_by,
        "updated_by": table.updated_by,
        "created_at": table.created_at.isoformat() if table.created_at else None,
        "updated_at": table.updated_at.isoformat() if table.updated_at else None,
    }
    
    # 如果需要包含行数据
    if include_rows:
        # 确定团队 ID
        target_team_id = current_user.team_id if not current_user.is_superuser else None
        
        # 查询行
        if target_team_id:
            query = select(MultiDimensionTableRow).where(
                and_(
                    MultiDimensionTableRow.table_id == table.id,
                    MultiDimensionTableRow.team_id == target_team_id,
                )
            ).order_by(MultiDimensionTableRow.row_id)
        else:
            # 超级管理员可以查看所有团队的行
            query = select(MultiDimensionTableRow).where(
                MultiDimensionTableRow.table_id == table.id
            ).order_by(MultiDimensionTableRow.row_id)
        
        result = await db.execute(query)
        rows = result.scalars().all()
        
        if rows:
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
                
                rows_data.append({
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
                })
            
            table_dict["rows"] = rows_data
        else:
            table_dict["rows"] = []
    
    return ResponseModel.success_response(
        data=table_dict,
        message="获取表格详情成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables", status_code=status.HTTP_201_CREATED, summary="创建多维表格")
async def create_table(
    table_data: MultiDimensionTableCreate,
    current_user: UserResponse = Depends(require_tables_create_permission),
    db: AsyncSession = Depends(get_db),
):
    """创建多维表格（允许每个团队有多个表格）"""
    # 确定团队 ID
    team_id = current_user.team_id if not current_user.is_superuser else None
    
    # 验证 code 是否已存在（只检查当前团队内未删除的记录，已删除的记录允许重复使用 code）
    # 不同团队可以使用相同的 code
    if hasattr(table_data, 'code') and table_data.code:
        existing_code_query = select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_data.code,
                MultiDimensionTable.is_active == True
            )
        )
        # 如果当前用户不是超级管理员，需要检查团队 ID
        if team_id is not None:
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id == team_id
            )
        else:
            # 超级管理员创建时，检查是否有 team_id 为 None 的记录
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id.is_(None)
            )
        
        existing_code = await db.execute(existing_code_query)
        if existing_code.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="表格代码已存在")
    
    # 创建新表格
    # 验证列定义（允许空列，因为第一列是自动的）
    columns_list = table_data.columns if table_data.columns else []
    column_keys = [col.key for col in columns_list]
    if len(column_keys) != len(set(column_keys)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="列 key 不能重复")
    
    # 创建表格
    new_table = MultiDimensionTable(
        code=getattr(table_data, 'code', None) or f"table_{str(uuid.uuid4())[:8]}",
        name=table_data.name,
        description=table_data.description,
        columns=json.dumps([col.model_dump() for col in columns_list], ensure_ascii=False),
        team_id=team_id,
        team_code=current_user.team_code if not current_user.is_superuser else None,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    
    db.add(new_table)
    await db.commit()
    await db.refresh(new_table)
    
    table_dict = {
        "id": new_table.id,
        "code": getattr(new_table, 'code', None) or f"table_{new_table.id[:8]}",
        "name": new_table.name,
        "description": new_table.description,
        "team_id": new_table.team_id,
        "team_code": new_table.team_code,
        "columns": json.loads(new_table.columns) if new_table.columns else [],
        "is_active": new_table.is_active,
        "created_by": new_table.created_by,
        "updated_by": new_table.updated_by,
        "created_at": new_table.created_at.isoformat() if new_table.created_at else None,
        "updated_at": new_table.updated_at.isoformat() if new_table.updated_at else None,
    }
    
    return ResponseModel.success_response(
        data=table_dict,
        message="创建表格成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/multi-dimension-tables/{table_id}", summary="更新多维表格")
async def update_table(
    table_id: str,
    table_data: MultiDimensionTableUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """更新多维表格"""
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改该表格")
    
    # 更新字段
    if hasattr(table_data, 'code') and table_data.code is not None:
        # 验证 code 是否已存在（排除当前表格，只检查当前团队内未删除的记录）
        # 不同团队可以使用相同的 code
        existing_code_query = select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_data.code,
                MultiDimensionTable.id != table_id,
                MultiDimensionTable.is_active == True
            )
        )
        # 如果当前表格有 team_id，只检查相同 team_id 的记录
        if table.team_id is not None:
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id == table.team_id
            )
        else:
            # 如果当前表格 team_id 为 None，只检查 team_id 为 None 的记录
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id.is_(None)
            )
        
        existing_code = await db.execute(existing_code_query)
        if existing_code.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="表格代码已存在")
        table.code = table_data.code
    if table_data.name is not None:
        table.name = table_data.name
    if table_data.description is not None:
        table.description = table_data.description
    if table_data.columns is not None:
        # 验证列定义
        column_keys = [col.key for col in table_data.columns]
        if len(column_keys) != len(set(column_keys)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="列 key 不能重复")
        table.columns = json.dumps([col.model_dump() for col in table_data.columns], ensure_ascii=False)
    
    table.updated_by = current_user.id
    
    # 如果提供了 rows 数据，同时更新行数据（全量替换）
    saved_rows = None
    if table_data.rows is not None:
        team_id = current_user.team_id if not current_user.is_superuser else None
        
        # 获取表格列定义（使用更新后的列定义，如果提供了的话）
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        
        # 获取所有现有行（用于后续判断哪些行需要删除）
        if team_id:
            all_rows_query = select(MultiDimensionTableRow).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            # 超级管理员：查询所有团队的行
            all_rows_query = select(MultiDimensionTableRow).where(
                MultiDimensionTableRow.table_id == table_id
            )
        all_rows_result = await db.execute(all_rows_query)
        all_existing_rows = all_rows_result.scalars().all()
        
        # 收集前端传来的行的 id（用于判断哪些行需要保留）
        provided_row_ids = {row_data.id for row_data in table_data.rows if row_data.id}
        
        # 删除不在前端数据中的行（这些是被删除的行）
        # 优化：批量删除单元格和行，避免循环查询和删除
        rows_to_delete = []
        for row in all_existing_rows:
            # 权限检查
            if not current_user.is_superuser and row.team_id != current_user.team_id:
                continue
            
            # 如果这个行的 id 不在前端传来的数据中，说明被删除了
            if row.id not in provided_row_ids:
                rows_to_delete.append(row.id)
        
        if rows_to_delete:
            # 批量删除单元格
            await db.execute(
                delete(MultiDimensionTableCell).where(
                    MultiDimensionTableCell.row_id.in_(rows_to_delete)
                )
            )
            # 批量删除行
            await db.execute(
                delete(MultiDimensionTableRow).where(
                    MultiDimensionTableRow.id.in_(rows_to_delete)
                )
            )
        
        # 处理行数据：保留已存在行的 row_id，为新行自动生成 row_id
        # 先处理已存在的行（有 id 的），更新它们并保留 row_id
        existing_row_ids_set = set()  # 记录已存在的 row_id，避免冲突
        for row_data in table_data.rows:
            if row_data.id:
                # 更新已存在的行
                row_result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_data.id))
                existing_row = row_result.scalar_one_or_none()
                if existing_row and existing_row.table_id == table_id:
                    # 权限检查
                    if not current_user.is_superuser and existing_row.team_id != current_user.team_id:
                        continue
                    
                    # 保留原有的 row_id（不改变）
                    existing_row_ids_set.add(existing_row.row_id)
                    
                    # 更新行数据
                    if row_data.row_data is not None:
                        existing_row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
                    existing_row.updated_by = current_user.id
                    
                    # 优化：批量删除旧单元格
                    await db.execute(
                        delete(MultiDimensionTableCell).where(
                            MultiDimensionTableCell.row_id == existing_row.id
                        )
                    )
                    
                    # 先 flush 删除操作，确保旧单元格被删除后再创建新单元格
                    await db.flush()
                    
                    # 创建新单元格
                    for column_key, value in row_data.cells.items():
                        if column_key not in column_keys:
                            continue
                        cell = MultiDimensionTableCell(
                            table_id=table_id,
                            row_id=existing_row.id,
                            column_key=column_key,
                            value=value,
                            created_by=existing_row.created_by,  # 保留原始创建者
                            updated_by=current_user.id,
                        )
                        db.add(cell)
        
        # 获取当前最大 row_id（用于新行）
        if team_id:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id.is_(None),
                )
            )
        max_row_result = await db.execute(max_row_query)
        max_row_id = max_row_result.scalar_one() or -1
        
        # 处理新行（没有 id 的）
        current_max_row_id = max_row_id
        for row_data in table_data.rows:
            if row_data.id:
                # 已存在的行已经在上面处理过了
                continue
            
            # 确定新行的 row_id
            if row_data.row_id is not None and row_data.row_id >= 0:
                # 如果提供了 row_id，先检查数据库中是否已存在相同 table_id、team_id、row_id 的行
                # 这样可以支持 row_id 不连续的情况（例如 row_id 1 被删除后，row_id 0 仍然存在）
                row_query_conditions = [
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.row_id == row_data.row_id,
                ]
                if team_id:
                    row_query_conditions.append(MultiDimensionTableRow.team_id == team_id)
                else:
                    row_query_conditions.append(MultiDimensionTableRow.team_id.is_(None))
                
                existing_row_query = select(MultiDimensionTableRow).where(and_(*row_query_conditions))
                existing_row_result = await db.execute(existing_row_query)
                existing_row = existing_row_result.scalar_one_or_none()
                
                if existing_row:
                    # 数据库中已存在相同 row_id 的行，更新它而不是创建新行
                    # 权限检查
                    if not current_user.is_superuser and existing_row.team_id != current_user.team_id:
                        continue
                    
                    # 更新行数据
                    if row_data.row_data is not None:
                        existing_row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
                    existing_row.updated_by = current_user.id
                    
                    # 优化：批量删除旧单元格
                    await db.execute(
                        delete(MultiDimensionTableCell).where(
                            MultiDimensionTableCell.row_id == existing_row.id
                        )
                    )
                    
                    # 先 flush 删除操作，确保旧单元格被删除后再创建新单元格
                    await db.flush()
                    
                    # 创建新单元格
                    for column_key, value in row_data.cells.items():
                        if column_key not in column_keys:
                            continue
                        cell = MultiDimensionTableCell(
                            table_id=table_id,
                            row_id=existing_row.id,
                            column_key=column_key,
                            value=value,
                            created_by=existing_row.created_by,  # 保留原始创建者
                            updated_by=current_user.id,
                        )
                        db.add(cell)
                    
                    # 记录这个 row_id 已被使用
                    existing_row_ids_set.add(row_data.row_id)
                    continue
                
                # 数据库中不存在相同 row_id 的行，检查是否在本次更新中已被使用
                if row_data.row_id in existing_row_ids_set:
                    # row_id 已被使用（在本次更新中），自动生成新的
                    current_max_row_id += 1
                    new_row_id = current_max_row_id
                else:
                    # 使用提供的 row_id
                    new_row_id = row_data.row_id
                    if new_row_id > current_max_row_id:
                        current_max_row_id = new_row_id
            else:
                # 自动生成 row_id（从当前最大 + 1 开始）
                current_max_row_id += 1
                new_row_id = current_max_row_id
            
            new_row = MultiDimensionTableRow(
                table_id=table_id,
                row_id=new_row_id,
                team_id=team_id,
                team_code=current_user.team_code if not current_user.is_superuser else None,
                row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            db.add(new_row)
            await db.flush()
            
            # 记录这个 row_id 已被使用
            existing_row_ids_set.add(new_row_id)
            
            # 创建单元格
            for column_key, value in row_data.cells.items():
                if column_key not in column_keys:
                    continue
                cell = MultiDimensionTableCell(
                    table_id=table_id,
                    row_id=new_row.id,
                    column_key=column_key,
                    value=value,
                    created_by=current_user.id,
                    updated_by=current_user.id,
                )
                db.add(cell)
    
    await db.commit()
    await db.refresh(table)
    
    # 如果更新了行数据，在 commit 之后查询保存后的所有行数据
    if table_data.rows is not None:
        team_id = current_user.team_id if not current_user.is_superuser else None
        
        # 查询保存后的所有行数据（必须在 commit 之后查询）
        if team_id:
            all_rows_query = select(MultiDimensionTableRow).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            ).order_by(MultiDimensionTableRow.row_id)
        else:
            # 超级管理员：查询所有团队的行
            all_rows_query = select(MultiDimensionTableRow).where(
                MultiDimensionTableRow.table_id == table_id
            ).order_by(MultiDimensionTableRow.row_id)
        
        all_rows_result = await db.execute(all_rows_query)
        all_rows = all_rows_result.scalars().all()
        
        if all_rows:
            # 优化：批量查询所有单元格，避免 N+1 查询问题
            row_ids = [row.id for row in all_rows]
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
            
            saved_rows = []
            for row in all_rows:
                cells_dict = cells_by_row.get(row.id, {})
                row_data = json.loads(row.row_data) if row.row_data else None
                
                saved_rows.append({
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
    
    table_dict = {
        "id": table.id,
        "code": getattr(table, 'code', None) or f"table_{table.id[:8]}",
        "name": table.name,
        "description": table.description,
        "team_id": table.team_id,
        "team_code": table.team_code,
        "columns": json.loads(table.columns) if table.columns else [],
        "is_active": table.is_active,
        "created_by": table.created_by,
        "updated_by": table.updated_by,
        "created_at": table.created_at.isoformat() if table.created_at else None,
        "updated_at": table.updated_at.isoformat() if table.updated_at else None,
    }
    
    # 如果更新了行数据，在响应中包含行数据
    if saved_rows is not None:
        table_dict["rows"] = saved_rows
    
    return ResponseModel.success_response(
        data=table_dict,
        message="更新表格成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_id}", summary="删除多维表格")
async def delete_table(
    table_id: str,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """删除多维表格（软删除）"""
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该表格")
    
    # 软删除
    table.is_active = False
    table.updated_by = current_user.id
    await db.commit()
    
    return ResponseModel.success_response(
        data={"id": table_id},
        message="删除表格成功",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/by-code/{table_code}", summary="通过 code 更新多维表格")
async def update_table_by_code(
    table_code: str,
    table_data: MultiDimensionTableUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 更新多维表格"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 更新字段
    if hasattr(table_data, 'code') and table_data.code is not None:
        # 验证 code 是否已存在（排除当前表格，只检查当前团队内未删除的记录）
        # 不同团队可以使用相同的 code
        existing_code_query = select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_data.code,
                MultiDimensionTable.id != table_id,
                MultiDimensionTable.is_active == True
            )
        )
        # 如果当前表格有 team_id，只检查相同 team_id 的记录
        if table.team_id is not None:
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id == table.team_id
            )
        else:
            # 如果当前表格 team_id 为 None，只检查 team_id 为 None 的记录
            existing_code_query = existing_code_query.where(
                MultiDimensionTable.team_id.is_(None)
            )
        
        existing_code = await db.execute(existing_code_query)
        if existing_code.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="表格代码已存在")
        table.code = table_data.code
    if table_data.name is not None:
        table.name = table_data.name
    if table_data.description is not None:
        table.description = table_data.description
    if table_data.columns is not None:
        # 验证列定义
        column_keys = [col.key for col in table_data.columns]
        if len(column_keys) != len(set(column_keys)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="列 key 不能重复")
        table.columns = json.dumps([col.model_dump() for col in table_data.columns], ensure_ascii=False)
    
    table.updated_by = current_user.id
    
    # 如果提供了 rows 数据，同时更新行数据（复用原有逻辑）
    # 这里简化处理，直接调用原有的更新逻辑
    if table_data.rows is not None:
        team_id = current_user.team_id if not current_user.is_superuser else None
        
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        
        # 获取所有现有行
        if team_id:
            all_rows_query = select(MultiDimensionTableRow).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            all_rows_query = select(MultiDimensionTableRow).where(
                MultiDimensionTableRow.table_id == table_id
            )
        all_rows_result = await db.execute(all_rows_query)
        all_existing_rows = all_rows_result.scalars().all()
        
        provided_row_ids = {row_data.id for row_data in table_data.rows if row_data.id}
        
        # 优化：批量删除单元格和行，避免循环查询和删除
        rows_to_delete = []
        for row in all_existing_rows:
            if not current_user.is_superuser and row.team_id != current_user.team_id:
                continue
            if row.id not in provided_row_ids:
                rows_to_delete.append(row.id)
        
        if rows_to_delete:
            # 批量删除单元格
            await db.execute(
                delete(MultiDimensionTableCell).where(
                    MultiDimensionTableCell.row_id.in_(rows_to_delete)
                )
            )
            # 批量删除行
            await db.execute(
                delete(MultiDimensionTableRow).where(
                    MultiDimensionTableRow.id.in_(rows_to_delete)
                )
            )
        
        existing_row_ids_set = set()
        for row_data in table_data.rows:
            if row_data.id:
                row_result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_data.id))
                existing_row = row_result.scalar_one_or_none()
                if existing_row and existing_row.table_id == table_id:
                    if not current_user.is_superuser and existing_row.team_id != current_user.team_id:
                        continue
                    existing_row_ids_set.add(existing_row.row_id)
                    if row_data.row_data is not None:
                        existing_row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
                    existing_row.updated_by = current_user.id
                    # 优化：批量删除旧单元格
                    await db.execute(
                        delete(MultiDimensionTableCell).where(
                            MultiDimensionTableCell.row_id == existing_row.id
                        )
                    )
                    await db.flush()
                    for column_key, value in row_data.cells.items():
                        if column_key not in column_keys:
                            continue
                        cell = MultiDimensionTableCell(
                            table_id=table_id,
                            row_id=existing_row.id,
                            column_key=column_key,
                            value=value,
                            created_by=existing_row.created_by,
                            updated_by=current_user.id,
                        )
                        db.add(cell)
        
        if team_id:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id.is_(None),
                )
            )
        max_row_result = await db.execute(max_row_query)
        max_row_id = max_row_result.scalar_one() or -1
        
        current_max_row_id = max_row_id
        for row_data in table_data.rows:
            if row_data.id:
                continue
            if row_data.row_id is not None and row_data.row_id >= 0:
                if row_data.row_id in existing_row_ids_set:
                    current_max_row_id += 1
                    new_row_id = current_max_row_id
                else:
                    new_row_id = row_data.row_id
                    if new_row_id > current_max_row_id:
                        current_max_row_id = new_row_id
            else:
                current_max_row_id += 1
                new_row_id = current_max_row_id
            
            new_row = MultiDimensionTableRow(
                table_id=table_id,
                row_id=new_row_id,
                team_id=team_id,
                team_code=current_user.team_code if not current_user.is_superuser else None,
                row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            db.add(new_row)
            await db.flush()
            for column_key, value in row_data.cells.items():
                if column_key not in column_keys:
                    continue
                cell = MultiDimensionTableCell(
                    table_id=table_id,
                    row_id=new_row.id,
                    column_key=column_key,
                    value=value,
                    created_by=current_user.id,
                    updated_by=current_user.id,
                )
                db.add(cell)
    
    await db.commit()
    await db.refresh(table)
    
    table_dict = {
        "id": table.id,
        "code": getattr(table, 'code', None) or f"table_{table.id[:8]}",
        "name": table.name,
        "description": table.description,
        "team_id": table.team_id,
        "team_code": table.team_code,
        "columns": json.loads(table.columns) if table.columns else [],
        "is_active": table.is_active,
        "created_by": table.created_by,
        "updated_by": table.updated_by,
        "created_at": table.created_at.isoformat() if table.created_at else None,
        "updated_at": table.updated_at.isoformat() if table.updated_at else None,
    }
    
    return ResponseModel.success_response(
        data=table_dict,
        message="更新表格成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/by-code/{table_code}", summary="通过 code 删除多维表格")
async def delete_table_by_code(
    table_code: str,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 删除多维表格（软删除）"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 软删除
    table.is_active = False
    table.updated_by = current_user.id
    await db.commit()
    
    return ResponseModel.success_response(
        data={"id": table_id, "code": table.code},
        message="删除表格成功",
        code=status.HTTP_200_OK,
    )


# ==================== 表格行管理接口 ====================

@router.get("/multi-dimension-tables/{table_id}/rows", summary="获取表格行列表")
async def get_table_rows(
    table_id: str,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，默认使用当前用户的团队）"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取表格行列表"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该表格")
    
    # 确定团队 ID
    target_team_id = team_id or current_user.team_id
    
    # 查询行（支持分页）
    row_query = select(MultiDimensionTableRow).where(
        and_(
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.team_id == target_team_id if target_team_id else None,
        )
    ).order_by(MultiDimensionTableRow.row_id)
    
    result = await db.execute(row_query)
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
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        })
    
    return ResponseModel.success_response(
        data=rows_data,
        message="获取行列表成功",
        code=status.HTTP_200_OK,
    )


@router.get("/multi-dimension-tables/by-code/{table_code}/rows", summary="通过 code 获取表格行列表")
async def get_table_rows_by_code(
    table_code: str,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，默认使用当前用户的团队）"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 获取表格行列表"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 确定团队 ID
    target_team_id = team_id or (current_user.team_id if not current_user.is_superuser else None)
    
    # 查询行
    if target_team_id:
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == target_team_id,
            )
        ).order_by(MultiDimensionTableRow.row_id)
    else:
        # 超级管理员可以查看所有团队的行
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
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        })
    
    return ResponseModel.success_response(
        data=rows_data,
        message="获取行列表成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables/{table_id}/rows", status_code=status.HTTP_201_CREATED, summary="创建表格行")
async def create_table_row(
    table_id: str,
    row_data: MultiDimensionTableRowCreate,
    current_user: UserResponse = Depends(require_tables_create_permission),
    db: AsyncSession = Depends(get_db),
):
    """创建表格行"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权在该表格中创建行")
    
    # 获取当前团队的最大 row_id（如果请求中没有提供 row_id）
    team_id = current_user.team_id if not current_user.is_superuser else None
    
    # 如果请求中提供了 row_id，使用提供的值；否则自动生成
    if row_data.row_id is not None and row_data.row_id >= 0:
        new_row_id = row_data.row_id
        # 检查 row_id 是否已存在
        existing_row_query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == new_row_id,
                MultiDimensionTableRow.team_id == team_id if team_id else None,
            )
        )
        existing_row_result = await db.execute(existing_row_query)
        if existing_row_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"行 ID {new_row_id} 已存在")
    else:
        # 自动生成 row_id
        if team_id:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id.is_(None),
                )
            )
        max_row_result = await db.execute(max_row_query)
        max_row_id = max_row_result.scalar_one() or -1
        new_row_id = max_row_id + 1
    
    # 验证数据格式
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    column_map = {col["key"]: col for col in columns}
    
    # 验证单元格数据格式
    validation_errors = []
    for column_key, value in row_data.cells.items():
        if column_key not in column_keys:
            validation_errors.append(f"列 '{column_key}' 不存在于表格中")
            continue
        
        column = column_map[column_key]
        column_type = column.get("type", "text")
        
        # 根据列类型验证数据格式
        if column_type == "number":
            try:
                float(value) if value else None
            except (ValueError, TypeError):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的数字")
        elif column_type == "boolean":
            if value.lower() not in ("true", "false", "1", "0", "yes", "no", ""):
                validation_errors.append(f"列 '{column_key}' 的值 '{value}' 不是有效的布尔值")
        elif column_type == "date":
            # 日期格式验证（可以根据需要扩展）
            if value and not value.strip():
                pass  # 空值允许
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
        team_id=team_id,
        team_code=current_user.team_code if not current_user.is_superuser else None,
        row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    
    db.add(new_row)
    await db.flush()  # 获取 new_row.id
    
    # 创建单元格
    for column_key, value in row_data.cells.items():
        if column_key not in column_keys:
            continue  # 忽略不存在的列
        
        cell = MultiDimensionTableCell(
            table_id=table_id,
            row_id=new_row.id,
            column_key=column_key,
            value=value,
            created_by=current_user.id,
            updated_by=current_user.id,
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
            "created_at": new_row.created_at,
            "updated_at": new_row.updated_at,
        },
        message="创建行成功",
        code=status.HTTP_201_CREATED,
    )


@router.post("/multi-dimension-tables/by-code/{table_code}/rows", status_code=status.HTTP_201_CREATED, summary="通过 code 创建表格行")
async def create_table_row_by_code(
    table_code: str,
    row_data: MultiDimensionTableRowCreate,
    current_user: UserResponse = Depends(require_tables_create_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 创建表格行"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 复用原有的创建逻辑（通过调用原有函数的方式）
    # 由于代码较长，这里直接复用逻辑
    team_id = current_user.team_id if not current_user.is_superuser else None
    
    if row_data.row_id is not None and row_data.row_id >= 0:
        new_row_id = row_data.row_id
        existing_row_query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == new_row_id,
                MultiDimensionTableRow.team_id == team_id if team_id else None,
            )
        )
        existing_row_result = await db.execute(existing_row_query)
        if existing_row_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"行 ID {new_row_id} 已存在")
    else:
        if team_id:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id == team_id,
                )
            )
        else:
            max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableRow.team_id.is_(None),
                )
            )
        max_row_result = await db.execute(max_row_query)
        max_row_id = max_row_result.scalar_one() or -1
        new_row_id = max_row_id + 1
    
    # 验证数据格式
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    column_map = {col["key"]: col for col in columns}
    
    validation_errors = []
    for column_key, value in row_data.cells.items():
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
    
    new_row = MultiDimensionTableRow(
        table_id=table_id,
        row_id=new_row_id,
        team_id=team_id,
        team_code=current_user.team_code if not current_user.is_superuser else None,
        row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    
    db.add(new_row)
    await db.flush()
    
    for column_key, value in row_data.cells.items():
        if column_key not in column_keys:
            continue
        
        cell = MultiDimensionTableCell(
            table_id=table_id,
            row_id=new_row.id,
            column_key=column_key,
            value=value,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(cell)
    
    await db.commit()
    await db.refresh(new_row)
    
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
            "created_at": new_row.created_at,
            "updated_at": new_row.updated_at,
        },
        message="创建行成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/multi-dimension-tables/{table_id}/rows/{row_id}", summary="更新表格行")
async def update_table_row(
    table_id: str,
    row_id: str,
    row_data: MultiDimensionTableRowUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """更新表格行"""
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 权限检查
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改该行")
    
    # 更新行数据
    if row_data.row_data is not None:
        row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
    row.updated_by = current_user.id
    
    # 更新单元格
    if row_data.cells is not None:
        # 获取表格列定义
        table_result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
        table = table_result.scalar_one()
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        
        # 更新或创建单元格
        for column_key, value in row_data.cells.items():
            if column_key not in column_keys:
                continue  # 忽略不存在的列
            
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
                cell.updated_by = current_user.id
            else:
                cell = MultiDimensionTableCell(
                    table_id=table_id,
                    row_id=row_id,
                    column_key=column_key,
                    value=value,
                    created_by=current_user.id,
                    updated_by=current_user.id,
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
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        },
        message="更新行成功",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/by-code/{table_code}/rows/{row_id}", summary="通过 code 更新表格行")
async def update_table_row_by_code(
    table_code: str,
    row_id: str,
    row_data: MultiDimensionTableRowUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 更新表格行"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 权限检查
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改该行")
    
    # 更新行数据
    if row_data.row_data is not None:
        row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
    row.updated_by = current_user.id
    
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
                cell.updated_by = current_user.id
            else:
                cell = MultiDimensionTableCell(
                    table_id=table_id,
                    row_id=row_id,
                    column_key=column_key,
                    value=value,
                    created_by=current_user.id,
                    updated_by=current_user.id,
                )
                db.add(cell)
    
    await db.commit()
    await db.refresh(row)
    
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
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        },
        message="更新行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_id}/rows/{row_id}", summary="删除表格行")
async def delete_table_row(
    table_id: str,
    row_id: str,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """删除表格行（级联删除单元格）"""
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 权限检查
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该行")
    
    # 删除行（级联删除单元格）
    await db.delete(row)
    await db.commit()
    
    return ResponseModel.success_response(
        data={"id": row_id},
        message="删除行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/by-code/{table_code}/rows/{row_id}", summary="通过 code 删除表格行")
async def delete_table_row_by_code(
    table_code: str,
    row_id: str,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 删除表格行（级联删除单元格）"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    # 检查行是否存在
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="行不存在")
    
    # 权限检查
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该行")
    
    # 删除行（级联删除单元格）
    await db.delete(row)
    await db.commit()
    
    return ResponseModel.success_response(
        data={"id": row_id},
        message="删除行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_id}/rows/by-condition", summary="根据条件删除表格行")
async def delete_table_row_by_condition(
    table_id: str,
    delete_request: TableRowDeleteByCondition,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """根据条件删除表格行"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该表格中的行")
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = delete_request.condition
    
    # 根据条件查找行
    if condition.column_key == "row_id":
        # 如果条件是 row_id，直接查询行
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == int(condition.value),
            )
        )
        if team_id:
            query = query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            query = query.where(MultiDimensionTableRow.team_id.is_(None))
    else:
        # 如果条件是其他列，先通过单元格值找到行
        # 验证列是否存在
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        # 查询条件列对应的单元格
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableCell.column_key == condition.column_key,
                MultiDimensionTableCell.value == str(condition.value)
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        
        if not condition_cells:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"未找到满足条件 {condition.column_key}={condition.value} 的行"
            )
        
        # 获取所有匹配的行ID
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
    
    # 删除行（级联删除单元格）
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


@router.delete("/multi-dimension-tables/by-code/{table_code}/rows/by-condition", summary="通过 code 根据条件删除表格行")
async def delete_table_row_by_condition_by_code(
    table_code: str,
    delete_request: TableRowDeleteByCondition,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 根据条件删除表格行"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = delete_request.condition
    
    # 根据条件查找行（复用原有逻辑）
    if condition.column_key == "row_id":
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == int(condition.value),
            )
        )
        if team_id:
            query = query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            query = query.where(MultiDimensionTableRow.team_id.is_(None))
    else:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableCell.column_key == condition.column_key,
                MultiDimensionTableCell.value == str(condition.value)
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        
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


@router.put("/multi-dimension-tables/{table_id}/rows/by-condition", summary="根据条件更新表格行")
async def update_table_row_by_condition(
    table_id: str,
    update_request: TableRowUpdateByCondition,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """根据条件更新表格行"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改该表格中的行")
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = update_request.condition
    
    # 根据条件查找行
    if condition.column_key == "row_id":
        # 如果条件是 row_id，直接查询行
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == int(condition.value),
            )
        )
        if team_id:
            query = query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            query = query.where(MultiDimensionTableRow.team_id.is_(None))
    else:
        # 如果条件是其他列，先通过单元格值找到行
        # 验证列是否存在
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        # 查询条件列对应的单元格
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableCell.column_key == condition.column_key,
                MultiDimensionTableCell.value == str(condition.value)
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        
        if not condition_cells:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"未找到满足条件 {condition.column_key}={condition.value} 的行"
            )
        
        # 获取所有匹配的行ID
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
    
    # 获取列定义（用于验证和更新）
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    column_map = {col["key"]: col for col in columns}
    
    # 验证更新的单元格数据格式
    if update_request.cells:
        validation_errors = []
        for column_key, value in update_request.cells.items():
            if column_key not in column_map:
                validation_errors.append(f"列 '{column_key}' 不存在于表格中")
                continue
            
            column = column_map[column_key]
            column_type = column.get("type", "text")
            
            # 根据列类型验证数据格式
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
        # 更新行数据
        if update_request.row_data is not None:
            row.row_data = json.dumps(update_request.row_data, ensure_ascii=False)
        row.updated_by = current_user.id
        
        # 更新单元格
        if update_request.cells:
            for column_key, value in update_request.cells.items():
                if column_key not in column_keys:
                    continue  # 忽略不存在的列
                
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
                    cell.updated_by = current_user.id
                else:
                    cell = MultiDimensionTableCell(
                        table_id=table_id,
                        row_id=row.id,
                        column_key=column_key,
                        value=value,
                        created_by=current_user.id,
                        updated_by=current_user.id,
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


@router.put("/multi-dimension-tables/by-code/{table_code}/rows/by-condition", summary="通过 code 根据条件更新表格行")
async def update_table_row_by_condition_by_code(
    table_code: str,
    update_request: TableRowUpdateByCondition,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 根据条件更新表格行"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = update_request.condition
    
    # 根据条件查找行（复用原有逻辑）
    if condition.column_key == "row_id":
        query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.row_id == int(condition.value),
            )
        )
        if team_id:
            query = query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            query = query.where(MultiDimensionTableRow.team_id.is_(None))
    else:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [col["key"] for col in columns]
        if condition.column_key not in column_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"列 '{condition.column_key}' 不存在于表格中"
            )
        
        condition_cell_query = select(MultiDimensionTableCell).join(
            MultiDimensionTableRow,
            MultiDimensionTableCell.row_id == MultiDimensionTableRow.id
        ).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableCell.column_key == condition.column_key,
                MultiDimensionTableCell.value == str(condition.value)
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        
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
    
    updated_count = 0
    updated_row_ids = []
    for row in rows:
        if update_request.row_data is not None:
            row.row_data = json.dumps(update_request.row_data, ensure_ascii=False)
        row.updated_by = current_user.id
        
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
                    cell.updated_by = current_user.id
                else:
                    cell = MultiDimensionTableCell(
                        table_id=table_id,
                        row_id=row.id,
                        column_key=column_key,
                        value=value,
                        created_by=current_user.id,
                        updated_by=current_user.id,
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


# ==================== 表格搜索接口 ====================

@router.put("/multi-dimension-tables/{table_id}/rows/bulk", summary="批量保存表格行")
async def bulk_save_table_rows(
    table_id: str,
    bulk_data: TableRowsBulkSave,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """批量保存表格行（全量保存，替换所有行）"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改该表格")
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    
    # 获取表格列定义
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    
    # 删除该表格的所有现有行（全量替换）
    all_rows_query = select(MultiDimensionTableRow).where(
        and_(
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.team_id == team_id if team_id else None,
        )
    )
    all_rows_result = await db.execute(all_rows_query)
    all_existing_rows = all_rows_result.scalars().all()
    
    # 优化：批量删除所有现有行的单元格和行本身
    rows_to_delete = []
    for row in all_existing_rows:
        # 权限检查
        if not current_user.is_superuser and row.team_id != current_user.team_id:
            continue
        rows_to_delete.append(row.id)
    
    if rows_to_delete:
        # 批量删除单元格
        await db.execute(
            delete(MultiDimensionTableCell).where(
                MultiDimensionTableCell.row_id.in_(rows_to_delete)
            )
        )
        # 批量删除行
        await db.execute(
            delete(MultiDimensionTableRow).where(
                MultiDimensionTableRow.id.in_(rows_to_delete)
            )
        )
    
    # 创建新行，row_id 从 0 开始自增
    saved_rows = []
    for index, row_data in enumerate(bulk_data.rows):
        # row_id 从 0 开始自增
        new_row_id = index
        
        new_row = MultiDimensionTableRow(
            table_id=table_id,
            row_id=new_row_id,
            team_id=team_id,
            team_code=current_user.team_code if not current_user.is_superuser else None,
            row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(new_row)
        await db.flush()
        
        # 创建单元格
        for column_key, value in row_data.cells.items():
            if column_key not in column_keys:
                continue
            cell = MultiDimensionTableCell(
                table_id=table_id,
                row_id=new_row.id,
                column_key=column_key,
                value=value,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            db.add(cell)
        
        saved_rows.append(new_row)
    
    await db.commit()
    
    # 返回保存后的所有行数据
    all_rows_query = select(MultiDimensionTableRow).where(
        and_(
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.team_id == team_id if team_id else None,
        )
    ).order_by(MultiDimensionTableRow.row_id)
    
    all_rows_result = await db.execute(all_rows_query)
    all_rows = all_rows_result.scalars().all()
    
    if all_rows:
        # 优化：批量查询所有单元格，避免 N+1 查询问题
        row_ids = [row.id for row in all_rows]
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
        
        rows_response = []
        for row in all_rows:
            cells_dict = cells_by_row.get(row.id, {})
            row_data = json.loads(row.row_data) if row.row_data else None
            
            rows_response.append({
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
    else:
        rows_response = []
    
    return ResponseModel.success_response(
        data=rows_response,
        message="批量保存成功",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/by-code/{table_code}/rows/bulk", summary="通过 code 批量保存表格行")
async def bulk_save_table_rows_by_code(
    table_code: str,
    bulk_data: TableRowsBulkSave,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """通过 code 批量保存表格行（全量保存，替换所有行）"""
    table = await get_table_by_code_or_id(table_code, current_user, db)
    table_id = table.id
    
    team_id = current_user.team_id if not current_user.is_superuser else None
    
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    
    # 删除该表格的所有现有行（全量替换）
    all_rows_query = select(MultiDimensionTableRow).where(
        and_(
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.team_id == team_id if team_id else None,
        )
    )
    all_rows_result = await db.execute(all_rows_query)
    all_existing_rows = all_rows_result.scalars().all()
    
    # 优化：批量删除单元格和行，避免循环查询和删除
    rows_to_delete = []
    for row in all_existing_rows:
        if not current_user.is_superuser and row.team_id != current_user.team_id:
            continue
        rows_to_delete.append(row.id)
    
    if rows_to_delete:
        # 批量删除单元格
        await db.execute(
            delete(MultiDimensionTableCell).where(
                MultiDimensionTableCell.row_id.in_(rows_to_delete)
            )
        )
        # 批量删除行
        await db.execute(
            delete(MultiDimensionTableRow).where(
                MultiDimensionTableRow.id.in_(rows_to_delete)
            )
        )
    
    # 获取当前最大 row_id
    if team_id:
        max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == team_id,
            )
        )
    else:
        max_row_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id.is_(None),
            )
        )
    max_row_result = await db.execute(max_row_query)
    max_row_id = max_row_result.scalar_one() or -1
    
    # 创建新行
    current_max_row_id = max_row_id
    for row_data in bulk_data.rows:
        if row_data.row_id is not None and row_data.row_id >= 0:
            new_row_id = row_data.row_id
            if new_row_id > current_max_row_id:
                current_max_row_id = new_row_id
        else:
            current_max_row_id += 1
            new_row_id = current_max_row_id
        
        new_row = MultiDimensionTableRow(
            table_id=table_id,
            row_id=new_row_id,
            team_id=team_id,
            team_code=current_user.team_code if not current_user.is_superuser else None,
            row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(new_row)
        await db.flush()
        
        for column_key, value in row_data.cells.items():
            if column_key not in column_keys:
                continue
            cell = MultiDimensionTableCell(
                table_id=table_id,
                row_id=new_row.id,
                column_key=column_key,
                value=value,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            db.add(cell)
    
    await db.commit()
    
    # 查询保存后的所有行数据
    if team_id:
        all_rows_query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == team_id,
            )
        ).order_by(MultiDimensionTableRow.row_id)
    else:
        all_rows_query = select(MultiDimensionTableRow).where(
            MultiDimensionTableRow.table_id == table_id
        ).order_by(MultiDimensionTableRow.row_id)
    
    all_rows_result = await db.execute(all_rows_query)
    all_rows = all_rows_result.scalars().all()
    
    if all_rows:
        # 优化：批量查询所有单元格，避免 N+1 查询问题
        row_ids = [row.id for row in all_rows]
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
        rows_response = []
        for row in all_rows:
            cells_dict = cells_by_row.get(row.id, {})
            row_data = json.loads(row.row_data) if row.row_data else None
            
            rows_response.append({
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
    else:
        rows_response = []
    
    return ResponseModel.success_response(
        data=rows_response,
        message="批量保存成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables/search", summary="搜索表格数据")
async def search_table(
    search_request: TableSearchRequest,
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """搜索表格数据（支持按行、列、值搜索）"""
    # 检查表格是否存在
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == search_request.table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="表格不存在")
    
    # 权限检查
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该表格")
    
    # 构建查询条件
    team_id = search_request.team_id or current_user.team_id
    
    query = select(MultiDimensionTableRow).where(
        and_(
            MultiDimensionTableRow.table_id == search_request.table_id,
            MultiDimensionTableRow.team_id == team_id if team_id else None,
        )
    )
    
    # 如果指定了 row_id，精确匹配
    if search_request.row_id is not None:
        query = query.where(MultiDimensionTableRow.row_id == search_request.row_id)
    
    result = await db.execute(query)
    rows = result.scalars().all()
    
    # 优化：批量查询所有单元格，避免 N+1 查询问题
    row_ids = [row.id for row in rows]
    cells_query = select(MultiDimensionTableCell).where(
        MultiDimensionTableCell.row_id.in_(row_ids)
    )
    if search_request.column_key:
        cells_query = cells_query.where(MultiDimensionTableCell.column_key == search_request.column_key)
    
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    
    # 在内存中组织单元格数据（按 row_id 分组）
    cells_by_row = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = []
        cells_by_row[cell.row_id].append(cell)
    
    # 如果指定了列或值，进一步过滤
    matched_rows = []
    for row in rows:
        row_cells = cells_by_row.get(row.id, [])
        
        # 如果指定了值，检查是否匹配
        if search_request.value:
            matched = False
            for cell in row_cells:
                if search_request.value.lower() in (cell.value or "").lower():
                    matched = True
                    break
            if not matched:
                continue
        
        # 如果指定了列但没有匹配的单元格，跳过
        if search_request.column_key and not row_cells:
            continue
        
        # 构建单元格字典
        cells_dict = {cell.column_key: cell.value for cell in row_cells}
        row_data = json.loads(row.row_data) if row.row_data else None
        
        matched_rows.append({
            "id": row.id,
            "table_id": row.table_id,
            "row_id": row.row_id,
            "team_id": row.team_id,
            "team_code": row.team_code,
            "row_data": row_data,
            "cells": cells_dict,
            "created_by": row.created_by,
            "updated_by": row.updated_by,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        })
    
    return ResponseModel.success_response(
        data={
            "rows": matched_rows,
            "total": len(matched_rows),
        },
        message="搜索成功",
        code=status.HTTP_200_OK,
    )
