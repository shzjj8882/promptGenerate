# -*- coding: utf-8 -*-
"""
多维表格管理相关路由
统一路径：/{table_ref} 支持 UUID 或 code
"""
from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated, List, Optional

# row_id 为 UUID，需校验格式
UUID_PATH = Annotated[
    str,
    Path(..., pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]

# table_ref 支持 UUID 或 code，不做格式限制
TABLE_REF_PATH = Annotated[str, Path(..., min_length=1, description="表格 ID 或 code")]

from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_permission
from app.schemas.user import UserResponse
from app.schemas.multi_dimension_table import (
    MultiDimensionTableCreate,
    MultiDimensionTableUpdate,
    MultiDimensionTableRowCreate,
    MultiDimensionTableRowUpdate,
    TableSearchRequest,
    TableRowDeleteByCondition,
    TableRowQueryByConditions,
    TableRowUpdateByCondition,
    TableRowsBulkSave,
)
from app.services import multi_dimension_table_service as svc

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
    data = await svc.list_tables(current_user, db, team_id=team_id, skip=skip, limit=limit)
    return ResponseModel.success_response(
        data=data,
        message="获取表格列表成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/multi-dimension-tables/{table_ref}/completed-history",
    summary="获取多维表格已完成历史记录（用于回滚）",
)
async def get_completed_history(
    table_ref: TABLE_REF_PATH,
    limit: int = Query(50, ge=1, le=200, description="返回的最大记录数，按时间倒序"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """按时间倒序获取某个多维表格的已完成历史记录"""
    data = await svc.get_completed_history(table_ref, current_user, db, limit=limit)
    return ResponseModel.success_response(
        data=data,
        message="获取已完成历史记录成功",
        code=status.HTTP_200_OK,
    )


@router.get("/multi-dimension-tables/{table_ref}", summary="获取多维表格详情")
async def get_table(
    table_ref: TABLE_REF_PATH,
    include_rows: bool = Query(False, description="是否包含行数据"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取多维表格详情（table_ref 支持 UUID 或 code）"""
    data = await svc.get_table_detail(table_ref, current_user, db, include_rows=include_rows)
    return ResponseModel.success_response(
        data=data,
        message="获取表格详情成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables", status_code=status.HTTP_201_CREATED, summary="创建多维表格")
async def create_table(
    table_data: MultiDimensionTableCreate,
    current_user: UserResponse = Depends(require_tables_create_permission),
    db: AsyncSession = Depends(get_db),
):
    """创建多维表格"""
    data = await svc.create_table(table_data, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="创建表格成功",
        code=status.HTTP_201_CREATED,
    )


@router.put("/multi-dimension-tables/{table_ref}", summary="更新多维表格")
async def update_table(
    table_ref: TABLE_REF_PATH,
    table_data: MultiDimensionTableUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """更新多维表格（table_ref 支持 UUID 或 code）"""
    data = await svc.update_table(table_ref, table_data, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="更新表格成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_ref}", summary="删除多维表格")
async def delete_table(
    table_ref: TABLE_REF_PATH,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """删除多维表格（软删除，table_ref 支持 UUID 或 code）"""
    data = await svc.delete_table(table_ref, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="删除表格成功",
        code=status.HTTP_200_OK,
    )


# ==================== 表格行管理接口 ====================


@router.get("/multi-dimension-tables/{table_ref}/rows", summary="获取表格行列表")
async def get_table_rows(
    table_ref: TABLE_REF_PATH,
    team_id: Optional[str] = Query(None, description="团队 ID（可选，默认使用当前用户的团队）"),
    skip: int = Query(0, ge=0, description="跳过行数，用于分页"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="每页行数，不传则返回全部"),
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """获取表格行列表（支持 skip/limit 分页）"""
    data = await svc.get_table_rows(table_ref, current_user, db, team_id=team_id, skip=skip, limit=limit)
    return ResponseModel.success_response(
        data=data,
        message="获取行列表成功",
        code=status.HTTP_200_OK,
    )


@router.post("/multi-dimension-tables/{table_ref}/rows", status_code=status.HTTP_201_CREATED, summary="创建表格行")
async def create_table_row(
    table_ref: TABLE_REF_PATH,
    row_data: MultiDimensionTableRowCreate,
    current_user: UserResponse = Depends(require_tables_create_permission),
    db: AsyncSession = Depends(get_db),
):
    """创建表格行"""
    data = await svc.create_table_row(table_ref, row_data, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="创建行成功",
        code=status.HTTP_201_CREATED,
    )


@router.post("/multi-dimension-tables/{table_ref}/rows/query-by-conditions", summary="多条件查询表格行")
async def query_table_rows_by_conditions(
    table_ref: TABLE_REF_PATH,
    query_request: TableRowQueryByConditions,
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """多条件查询表格行，支持 AND/OR 逻辑"""
    data = await svc.query_rows_by_conditions(table_ref, query_request, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="查询成功",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/{table_ref}/rows/by-condition", summary="根据条件更新表格行")
async def update_table_row_by_condition(
    table_ref: TABLE_REF_PATH,
    update_request: TableRowUpdateByCondition,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """根据条件更新表格行"""
    data = await svc.update_row_by_condition(table_ref, update_request, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message=f"成功更新 {data['updated_count']} 行",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/{table_ref}/rows/{row_id}", summary="更新表格行")
async def update_table_row(
    table_ref: TABLE_REF_PATH,
    row_id: UUID_PATH,
    row_data: MultiDimensionTableRowUpdate,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """更新表格行"""
    data = await svc.update_table_row(table_ref, row_id, row_data, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="更新行成功",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_ref}/rows/by-condition", summary="根据条件删除表格行")
async def delete_table_row_by_condition(
    table_ref: TABLE_REF_PATH,
    delete_request: TableRowDeleteByCondition,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """根据条件删除表格行"""
    data = await svc.delete_row_by_condition(table_ref, delete_request, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message=f"成功删除 {data['deleted_count']} 行",
        code=status.HTTP_200_OK,
    )


@router.delete("/multi-dimension-tables/{table_ref}/rows/{row_id}", summary="删除表格行")
async def delete_table_row(
    table_ref: TABLE_REF_PATH,
    row_id: UUID_PATH,
    current_user: UserResponse = Depends(require_tables_delete_permission),
    db: AsyncSession = Depends(get_db),
):
    """删除表格行（级联删除单元格）"""
    data = await svc.delete_table_row(table_ref, row_id, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="删除行成功",
        code=status.HTTP_200_OK,
    )


@router.put("/multi-dimension-tables/{table_ref}/rows/bulk", summary="批量保存表格行")
async def bulk_save_table_rows(
    table_ref: TABLE_REF_PATH,
    bulk_data: TableRowsBulkSave,
    current_user: UserResponse = Depends(require_tables_update_permission),
    db: AsyncSession = Depends(get_db),
):
    """批量保存表格行（全量保存，替换所有行）"""
    data = await svc.bulk_save_table_rows(table_ref, bulk_data, current_user, db)
    return ResponseModel.success_response(
        data=data,
        message="批量保存成功",
        code=status.HTTP_200_OK,
    )


# ==================== 表格搜索接口 ====================


@router.post("/multi-dimension-tables/search", summary="搜索表格数据")
async def search_table(
    search_request: TableSearchRequest,
    current_user: UserResponse = Depends(require_tables_list_permission),
    db: AsyncSession = Depends(get_db),
):
    """搜索表格数据（支持按行、列、值搜索，table_id 支持 UUID 或 code）"""
    data = await svc.search_table(
        table_ref=search_request.table_id,
        current_user=current_user,
        db=db,
        row_id=search_request.row_id,
        column_key=search_request.column_key,
        value=search_request.value,
        team_id=search_request.team_id,
    )
    return ResponseModel.success_response(
        data=data,
        message="搜索成功",
        code=status.HTTP_200_OK,
    )
