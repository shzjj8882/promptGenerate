# -*- coding: utf-8 -*-
"""
多维表格业务逻辑服务层
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, delete, func, select

from app.domain.exceptions import AccessDeniedError, NotFoundError, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.multi_dimension_table import (
    MultiDimensionTable,
    MultiDimensionTableCell,
    MultiDimensionTableHistory,
    MultiDimensionTableRow,
)
from app.schemas.multi_dimension_table import (
    HistoryStateSnapshot,
    MultiDimensionTableCreate,
    MultiDimensionTableRowCreate,
    MultiDimensionTableRowResponse,
    MultiDimensionTableUpdate,
    MultiDimensionTableRowUpdate,
    TableColumn,
    TableRowDeleteByCondition,
    TableRowsBulkSave,
    TableRowQueryByConditions,
    TableRowUpdateByCondition,
)
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)


def _table_to_dict(table: MultiDimensionTable) -> Dict[str, Any]:
    """将表格模型转为字典"""
    return {
        "id": table.id,
        "code": getattr(table, "code", None) or f"table_{table.id[:8]}",
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


def _row_to_dict(row: MultiDimensionTableRow, cells_dict: Dict[str, str]) -> Dict[str, Any]:
    """将行模型转为字典"""
    return {
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
    }


async def get_table_by_ref(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
) -> MultiDimensionTable:
    """通过 code 或 id 获取表格，含权限检查"""
    # 先尝试通过 id 查找
    result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_ref))
    table = result.scalar_one_or_none()

    if table:
        _check_table_access(table, current_user)
        return table

    # 通过 id 没找到，尝试通过 code 查找
    result = await db.execute(
        select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_ref,
                MultiDimensionTable.is_active == True,
            )
        )
    )
    table = result.scalar_one_or_none()

    if not table:
        raise NotFoundError("表格", table_ref)

    _check_table_access(table, current_user)
    return table


def _check_table_access(table: MultiDimensionTable, current_user: UserResponse) -> None:
    """检查表格访问权限"""
    if current_user.is_superuser and table.team_id is not None:
        raise AccessDeniedError("无权访问该表格")
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise AccessDeniedError("无权访问该表格")


def _check_table_modify(table: MultiDimensionTable, current_user: UserResponse) -> None:
    """检查表格修改权限"""
    if current_user.is_superuser and table.team_id is not None:
        raise AccessDeniedError("无权修改该表格")
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise AccessDeniedError("无权修改该表格")


def _check_table_delete(table: MultiDimensionTable, current_user: UserResponse) -> None:
    """检查表格删除权限"""
    if current_user.is_superuser and table.team_id is not None:
        raise AccessDeniedError("无权删除该表格")
    if not current_user.is_superuser and table.team_id != current_user.team_id:
        raise AccessDeniedError("无权删除该表格")


# ==================== 表格 CRUD ====================


async def list_tables(
    current_user: UserResponse,
    db: AsyncSession,
    team_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 10,
) -> Dict[str, Any]:
    """获取多维表格列表"""
    base_query = select(MultiDimensionTable).where(MultiDimensionTable.is_active == True)

    if current_user.is_superuser:
        base_query = base_query.where(MultiDimensionTable.team_id.is_(None))
    else:
        if current_user.team_id:
            base_query = base_query.where(MultiDimensionTable.team_id == current_user.team_id)
        else:
            base_query = base_query.where(MultiDimensionTable.team_id.is_(None))

    if team_id:
        base_query = base_query.where(MultiDimensionTable.team_id == team_id)

    count_query = select(func.count(MultiDimensionTable.id)).where(MultiDimensionTable.is_active == True)
    if current_user.is_superuser:
        count_query = count_query.where(MultiDimensionTable.team_id.is_(None))
    else:
        if current_user.team_id:
            count_query = count_query.where(MultiDimensionTable.team_id == current_user.team_id)
        else:
            count_query = count_query.where(MultiDimensionTable.team_id.is_(None))
    if team_id:
        count_query = count_query.where(MultiDimensionTable.team_id == team_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = base_query.order_by(
        MultiDimensionTable.updated_at.desc().nullslast(),
        MultiDimensionTable.created_at.desc(),
    ).offset(skip).limit(limit)
    result = await db.execute(query)
    tables = result.scalars().all()

    table_ids = [t.id for t in tables]
    row_count_query = (
        select(MultiDimensionTableRow.table_id, func.count(MultiDimensionTableRow.id).label("row_count"))
        .where(MultiDimensionTableRow.table_id.in_(table_ids))
    )
    if not current_user.is_superuser and current_user.team_id:
        row_count_query = row_count_query.where(MultiDimensionTableRow.team_id == current_user.team_id)
    row_count_query = row_count_query.group_by(MultiDimensionTableRow.table_id)
    row_count_result = await db.execute(row_count_query)
    row_counts = {r.table_id: r.row_count for r in row_count_result.all()}

    tables_data = []
    for table in tables:
        d = _table_to_dict(table)
        d["row_count"] = row_counts.get(table.id, 0)
        tables_data.append(d)

    return {"items": tables_data, "total": total, "skip": skip, "limit": limit}


async def get_completed_history(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """获取表格已完成历史记录"""
    table = await get_table_by_ref(table_ref, current_user, db)

    query = (
        select(MultiDimensionTableHistory)
        .where(MultiDimensionTableHistory.table_id == table.id)
        .order_by(MultiDimensionTableHistory.created_at.desc())
        .limit(limit)
    )
    if not current_user.is_superuser and current_user.team_id:
        query = query.where(MultiDimensionTableHistory.team_id == current_user.team_id)

    history_result = await db.execute(query)
    items = history_result.scalars().all()

    data = []
    for item in items:
        try:
            snapshot_dict = json.loads(item.snapshot)
        except Exception as e:
            logger.warning("历史快照 JSON 解析失败，id=%s: %s", item.id, e)
            snapshot_dict = {}
        snapshot = HistoryStateSnapshot(**snapshot_dict) if snapshot_dict else HistoryStateSnapshot(rows=[], columns=[])

        data.append({
            "id": item.id,
            "table_id": item.table_id,
            "team_id": item.team_id,
            "label": item.label,
            "snapshot": snapshot.model_dump(),
            "created_by": item.created_by,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })

    return data


async def get_table_detail(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
    include_rows: bool = False,
) -> Dict[str, Any]:
    """获取表格详情"""
    table = await get_table_by_ref(table_ref, current_user, db)
    table_dict = _table_to_dict(table)

    if not include_rows:
        return table_dict

    target_team_id = current_user.team_id if not current_user.is_superuser else None

    conditions = [MultiDimensionTableRow.table_id == table.id]
    if target_team_id:
        conditions.append(MultiDimensionTableRow.team_id == target_team_id)
    row_query = select(MultiDimensionTableRow).where(and_(*conditions)).order_by(MultiDimensionTableRow.row_id)

    result = await db.execute(row_query)
    rows = result.scalars().all()

    if not rows:
        table_dict["rows"] = []
        return table_dict

    row_ids = [r.id for r in rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()

    cells_by_row: Dict[str, Dict[str, str]] = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value

    rows_data = [_row_to_dict(row, cells_by_row.get(row.id, {})) for row in rows]
    table_dict["rows"] = rows_data
    return table_dict


async def create_table(
    table_data: MultiDimensionTableCreate,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """创建多维表格"""
    team_id = current_user.team_id if not current_user.is_superuser else None

    if hasattr(table_data, "code") and table_data.code:
        existing_code_query = select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_data.code,
                MultiDimensionTable.is_active == True,
            )
        )
        if team_id is not None:
            existing_code_query = existing_code_query.where(MultiDimensionTable.team_id == team_id)
        else:
            existing_code_query = existing_code_query.where(MultiDimensionTable.team_id.is_(None))
        existing_code = await db.execute(existing_code_query)
        if existing_code.scalar_one_or_none():
            raise ValidationError("表格代码已存在")

    columns_list = table_data.columns if table_data.columns else []
    column_keys = [col.key for col in columns_list]
    if len(column_keys) != len(set(column_keys)):
        raise ValidationError("列 key 不能重复")

    new_table = MultiDimensionTable(
        code=getattr(table_data, "code", None) or f"table_{str(uuid.uuid4())[:8]}",
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
    return _table_to_dict(new_table)


async def update_table(
    table_ref: str,
    table_data: MultiDimensionTableUpdate,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """更新多维表格"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_modify(table, current_user)
    table_id = table.id

    if hasattr(table_data, "code") and table_data.code is not None:
        existing_code_query = select(MultiDimensionTable).where(
            and_(
                MultiDimensionTable.code == table_data.code,
                MultiDimensionTable.id != table_id,
                MultiDimensionTable.is_active == True,
            )
        )
        if table.team_id is not None:
            existing_code_query = existing_code_query.where(MultiDimensionTable.team_id == table.team_id)
        else:
            existing_code_query = existing_code_query.where(MultiDimensionTable.team_id.is_(None))
        existing_code = await db.execute(existing_code_query)
        if existing_code.scalar_one_or_none():
            raise ValidationError("表格代码已存在")
        table.code = table_data.code
    if table_data.name is not None:
        table.name = table_data.name
    if table_data.description is not None:
        table.description = table_data.description
    if table_data.columns is not None:
        column_keys = [col.key for col in table_data.columns]
        if len(column_keys) != len(set(column_keys)):
            raise ValidationError("列 key 不能重复")
        table.columns = json.dumps([col.model_dump() for col in table_data.columns], ensure_ascii=False)

    table.updated_by = current_user.id

    saved_rows = None
    if table_data.rows is not None:
        saved_rows = await _update_table_rows(
            table_id=table_id,
            table=table,
            table_data=table_data,
            current_user=current_user,
            db=db,
        )
        if saved_rows:
            try:
                snapshot = HistoryStateSnapshot(
                    rows=[
                        MultiDimensionTableRowResponse(
                            id=r["id"],
                            table_id=r["table_id"],
                            row_id=r["row_id"],
                            team_id=r["team_id"],
                            team_code=r["team_code"],
                            row_data=r["row_data"],
                            cells=r["cells"],
                            created_by=r["created_by"],
                            updated_by=r["updated_by"],
                            created_at=datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) if r.get("created_at") else datetime.now(),
                            updated_at=datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00")) if r.get("updated_at") else datetime.now(),
                        )
                        for r in saved_rows
                    ],
                    columns=[TableColumn(**col) for col in (json.loads(table.columns) if table.columns else [])],
                    stepLabel="保存数据",
                    stepType="update",
                    stepTitle="保存数据",
                    stepDescription="控制台保存表格数据",
                )
                snapshot_json = json.dumps(snapshot.model_dump(mode="json"), ensure_ascii=False)
                history = MultiDimensionTableHistory(
                    table_id=table_id,
                    team_id=table.team_id,
                    label="保存数据",
                    snapshot=snapshot_json,
                    created_by=current_user.id,
                )
                db.add(history)
            except Exception as e:
                logger.warning("保存历史记录失败，table_id=%s: %s", table_id, e)

    await db.commit()
    await db.refresh(table)

    result = _table_to_dict(table)
    if saved_rows is not None:
        result["rows"] = saved_rows
    return result


async def _update_table_rows(
    table_id: str,
    table: MultiDimensionTable,
    table_data: MultiDimensionTableUpdate,
    current_user: UserResponse,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """更新表格行数据（全量替换）"""
    team_id = current_user.team_id if not current_user.is_superuser else None
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]

    if team_id:
        all_rows_query = select(MultiDimensionTableRow).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == team_id,
            )
        )
    else:
        all_rows_query = select(MultiDimensionTableRow).where(MultiDimensionTableRow.table_id == table_id)
    all_rows_result = await db.execute(all_rows_query)
    all_existing_rows = all_rows_result.scalars().all()

    provided_row_ids = {row_data.id for row_data in table_data.rows if row_data.id}

    rows_to_delete = []
    for row in all_existing_rows:
        if not current_user.is_superuser and row.team_id != current_user.team_id:
            continue
        if row.id not in provided_row_ids:
            rows_to_delete.append(row.id)

    if rows_to_delete:
        await db.execute(delete(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(rows_to_delete)))
        await db.execute(delete(MultiDimensionTableRow).where(MultiDimensionTableRow.id.in_(rows_to_delete)))
        await db.flush()

    existing_row_ids_set: set = set()
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
                await db.execute(
                    delete(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id == existing_row.id)
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
                await db.flush()

    for row_data in table_data.rows:
        if row_data.id:
            continue

        any_max = await db.execute(
            select(func.max(MultiDimensionTableRow.row_id)).where(
                MultiDimensionTableRow.table_id == table_id
            )
        )
        current_max_row_id = any_max.scalar_one() or -1
        new_row_id = current_max_row_id + 1

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
        existing_row_ids_set.add(new_row_id)

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

    if not all_rows:
        return []

    row_ids = [r.id for r in all_rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    cells_by_row: Dict[str, Dict[str, str]] = {}
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

    return saved_rows


async def delete_table(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """删除多维表格（软删除）"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_delete(table, current_user)
    table.is_active = False
    table.updated_by = current_user.id
    await db.commit()
    return {"id": table.id, "code": getattr(table, "code", None) or f"table_{table.id[:8]}"}


# ==================== 行 CRUD ====================


async def get_table_rows(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
    team_id: Optional[str] = None,
    skip: int = 0,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """获取表格行列表"""
    table = await get_table_by_ref(table_ref, current_user, db)
    target_team_id = team_id or (current_user.team_id if not current_user.is_superuser else None)

    conditions = [MultiDimensionTableRow.table_id == table.id]
    if target_team_id:
        conditions.append(MultiDimensionTableRow.team_id == target_team_id)
    row_query = select(MultiDimensionTableRow).where(and_(*conditions)).order_by(MultiDimensionTableRow.row_id)

    if limit is not None:
        row_query = row_query.offset(skip).limit(limit)

    result = await db.execute(row_query)
    rows = result.scalars().all()

    if not rows:
        return []

    row_ids = [r.id for r in rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    cells_by_row: Dict[str, Dict[str, str]] = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value

    return [_row_to_dict(row, cells_by_row.get(row.id, {})) for row in rows]


async def create_table_row(
    table_ref: str,
    row_data: MultiDimensionTableRowCreate,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """创建表格行"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_modify(table, current_user)
    table_id = table.id
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
            raise ValidationError(f"行 ID {new_row_id} 已存在")
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
        max_val = max_row_result.scalar_one()
        max_row_id = -1 if max_val is None else max_val
        new_row_id = max_row_id + 1

    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    from app.utils.table_row_validator import validate_row_data_for_columns

    validate_row_data_for_columns(columns, row_data.cells)

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
    cells_dict = {c.column_key: c.value for c in cells}
    return _row_to_dict(new_row, cells_dict)


async def query_rows_by_conditions(
    table_ref: str,
    query_request: TableRowQueryByConditions,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """多条件查询表格行"""
    table = await get_table_by_ref(table_ref, current_user, db)
    if not query_request.conditions:
        raise ValidationError("至少需要一个查询条件")

    team_id = current_user.team_id if not current_user.is_superuser else None
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]

    for cond in query_request.conditions:
        if cond.column_key != "row_id" and cond.column_key not in column_keys:
            raise ValidationError(f"列 '{cond.column_key}' 不存在于表格中")

    conditions = [MultiDimensionTableRow.table_id == table.id]
    if team_id:
        conditions.append(MultiDimensionTableRow.team_id == team_id)
    base_query = select(MultiDimensionTableRow).where(and_(*conditions)).order_by(MultiDimensionTableRow.row_id)
    rows_result = await db.execute(base_query)
    all_rows = rows_result.scalars().all()

    if not all_rows:
        return {"rows": [], "total": 0, "row": None}

    row_ids = [r.id for r in all_rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    cells_by_row: Dict[str, Dict[str, str]] = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value

    def check_condition(row: MultiDimensionTableRow, cond) -> bool:
        if cond.column_key == "row_id":
            try:
                target_val = str(int(cond.value))
                cell_val = str(row.row_id)
            except (ValueError, TypeError):
                return False
        else:
            cell_val = (cells_by_row.get(row.id, {}).get(cond.column_key) or "").lower()
            target_val = (cond.value or "").lower()
        op = (cond.operator or "equals").lower()
        if op == "equals":
            return cell_val == target_val
        if op == "contains":
            return target_val in cell_val
        if op == "not_equals":
            return cell_val != target_val
        if op == "not_contains":
            return target_val not in cell_val
        if op == "starts_with":
            return cell_val.startswith(target_val)
        if op == "ends_with":
            return cell_val.endswith(target_val)
        return cell_val == target_val

    def check_row(row: MultiDimensionTableRow) -> bool:
        valid_conditions = [c for c in query_request.conditions if (c.value or "").strip()]
        if not valid_conditions:
            return True
        if query_request.logic == "or":
            return any(check_condition(row, c) for c in valid_conditions)
        return all(check_condition(row, c) for c in valid_conditions)

    matched_rows = [r for r in all_rows if check_row(r)]
    if query_request.limit and query_request.limit >= 1:
        matched_rows = matched_rows[: query_request.limit]

    rows_data = [_row_to_dict(row, cells_by_row.get(row.id, {})) for row in matched_rows]
    return {
        "rows": rows_data,
        "total": len(matched_rows),
        "row": rows_data[0] if query_request.limit == 1 and rows_data else None,
    }


async def update_row_by_condition(
    table_ref: str,
    update_request: TableRowUpdateByCondition,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """根据条件更新表格行"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_modify(table, current_user)
    table_id = table.id
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = update_request.condition

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
            raise ValidationError(f"列 '{condition.column_key}' 不存在于表格中")
        condition_cell_query = (
            select(MultiDimensionTableCell)
            .join(MultiDimensionTableRow, MultiDimensionTableCell.row_id == MultiDimensionTableRow.id)
            .where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableCell.column_key == condition.column_key,
                    MultiDimensionTableCell.value == str(condition.value),
                )
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        if not condition_cells:
            raise NotFoundError("行", None, f"未找到满足条件 {condition.column_key}={condition.value} 的行")
        row_ids = [cell.row_id for cell in condition_cells]
        query = select(MultiDimensionTableRow).where(MultiDimensionTableRow.id.in_(row_ids))

    result = await db.execute(query)
    rows = result.scalars().all()
    if not rows:
        raise NotFoundError("行", None, "未找到满足条件的行")

    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]
    if update_request.cells:
        from app.utils.table_row_validator import validate_row_data_for_columns

        validate_row_data_for_columns(columns, update_request.cells)

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
    return {"updated_count": updated_count, "updated_row_ids": updated_row_ids}


async def update_table_row(
    table_ref: str,
    row_id: str,
    row_data: MultiDimensionTableRowUpdate,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """更新表格行（按行 ID）"""
    table = await get_table_by_ref(table_ref, current_user, db)
    table_id = table.id

    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise NotFoundError("行", None, "行不存在")
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise AccessDeniedError("无权修改该行")

    if row_data.row_data is not None:
        row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
    row.updated_by = current_user.id

    if row_data.cells is not None:
        table_result = await db.execute(select(MultiDimensionTable).where(MultiDimensionTable.id == table_id))
        table_obj = table_result.scalar_one()
        columns = json.loads(table_obj.columns) if table_obj.columns else []
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
    cells_dict = {c.column_key: c.value for c in cells}
    return _row_to_dict(row, cells_dict)


async def delete_row_by_condition(
    table_ref: str,
    delete_request: TableRowDeleteByCondition,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """根据条件删除表格行"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_delete(table, current_user)
    table_id = table.id
    team_id = current_user.team_id if not current_user.is_superuser else None
    condition = delete_request.condition

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
            raise ValidationError(f"列 '{condition.column_key}' 不存在于表格中")
        condition_cell_query = (
            select(MultiDimensionTableCell)
            .join(MultiDimensionTableRow, MultiDimensionTableCell.row_id == MultiDimensionTableRow.id)
            .where(
                and_(
                    MultiDimensionTableRow.table_id == table_id,
                    MultiDimensionTableCell.column_key == condition.column_key,
                    MultiDimensionTableCell.value == str(condition.value),
                )
            )
        )
        if team_id:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id == team_id)
        elif not current_user.is_superuser:
            condition_cell_query = condition_cell_query.where(MultiDimensionTableRow.team_id.is_(None))
        condition_cell_result = await db.execute(condition_cell_query)
        condition_cells = condition_cell_result.scalars().all()
        if not condition_cells:
            raise NotFoundError("行", None, f"未找到满足条件 {condition.column_key}={condition.value} 的行")
        row_ids = [cell.row_id for cell in condition_cells]
        query = select(MultiDimensionTableRow).where(MultiDimensionTableRow.id.in_(row_ids))

    result = await db.execute(query)
    rows = result.scalars().all()
    if not rows:
        raise NotFoundError("行", None, "未找到满足条件的行")

    deleted_count = 0
    deleted_row_ids = []
    for row in rows:
        deleted_row_ids.append(row.id)
        await db.delete(row)
        deleted_count += 1

    await db.commit()
    return {"deleted_count": deleted_count, "deleted_row_ids": deleted_row_ids}


async def delete_table_row(
    table_ref: str,
    row_id: str,
    current_user: UserResponse,
    db: AsyncSession,
) -> Dict[str, Any]:
    """删除表格行"""
    table = await get_table_by_ref(table_ref, current_user, db)
    table_id = table.id

    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table_id:
        raise NotFoundError("行", None, "行不存在")
    if not current_user.is_superuser and row.team_id != current_user.team_id:
        raise AccessDeniedError("无权删除该行")

    await db.delete(row)
    await db.commit()
    return {"id": row_id}


async def bulk_save_table_rows(
    table_ref: str,
    bulk_data: TableRowsBulkSave,
    current_user: UserResponse,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """批量保存表格行（全量替换）"""
    table = await get_table_by_ref(table_ref, current_user, db)
    _check_table_modify(table, current_user)
    table_id = table.id
    team_id = current_user.team_id if not current_user.is_superuser else None
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]

    conditions = [MultiDimensionTableRow.table_id == table_id]
    if team_id:
        conditions.append(MultiDimensionTableRow.team_id == team_id)
    all_rows_query = select(MultiDimensionTableRow).where(and_(*conditions))
    all_rows_result = await db.execute(all_rows_query)
    all_existing_rows = all_rows_result.scalars().all()

    rows_to_delete = []
    for row in all_existing_rows:
        if not current_user.is_superuser and row.team_id != current_user.team_id:
            continue
        rows_to_delete.append(row.id)

    if rows_to_delete:
        await db.execute(delete(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(rows_to_delete)))
        await db.execute(delete(MultiDimensionTableRow).where(MultiDimensionTableRow.id.in_(rows_to_delete)))

    saved_rows = []
    for index, row_data in enumerate(bulk_data.rows):
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

    conditions = [MultiDimensionTableRow.table_id == table_id]
    if team_id:
        conditions.append(MultiDimensionTableRow.team_id == team_id)
    all_rows_query = select(MultiDimensionTableRow).where(and_(*conditions)).order_by(MultiDimensionTableRow.row_id)
    all_rows_result = await db.execute(all_rows_query)
    all_rows = all_rows_result.scalars().all()

    if not all_rows:
        return []

    row_ids = [r.id for r in all_rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()
    cells_by_row: Dict[str, Dict[str, str]] = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value

    return [_row_to_dict(row, cells_by_row.get(row.id, {})) for row in all_rows]


async def search_table(
    table_ref: str,
    current_user: UserResponse,
    db: AsyncSession,
    row_id: Optional[int] = None,
    column_key: Optional[str] = None,
    value: Optional[str] = None,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """搜索表格数据（table_ref 支持 UUID 或 code）"""
    table = await get_table_by_ref(table_ref, current_user, db)
    table_id = table.id

    target_team_id = team_id or (current_user.team_id if not current_user.is_superuser else None)

    conditions = [MultiDimensionTableRow.table_id == table_id]
    if target_team_id:
        conditions.append(MultiDimensionTableRow.team_id == target_team_id)
    query = select(MultiDimensionTableRow).where(and_(*conditions))
    if row_id is not None:
        query = query.where(MultiDimensionTableRow.row_id == row_id)

    result = await db.execute(query)
    rows = result.scalars().all()

    row_ids = [r.id for r in rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    if column_key:
        cells_query = cells_query.where(MultiDimensionTableCell.column_key == column_key)
    cells_result = await db.execute(cells_query)
    all_cells = cells_result.scalars().all()

    cells_by_row: Dict[str, List] = {}
    for cell in all_cells:
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = []
        cells_by_row[cell.row_id].append(cell)

    matched_rows = []
    for row in rows:
        row_cells = cells_by_row.get(row.id, [])
        if value:
            matched = False
            for cell in row_cells:
                if value.lower() in (cell.value or "").lower():
                    matched = True
                    break
            if not matched:
                continue
        if column_key and not row_cells:
            continue
        cells_dict = {c.column_key: c.value for c in row_cells}
        row_data = json.loads(row.row_data) if row.row_data else None
        matched_rows.append(_row_to_dict(row, cells_dict))

    return {"rows": matched_rows, "total": len(matched_rows)}


# ==================== API 接口专用（无 UserResponse，使用 team_id） ====================


async def get_table_by_code_api(
    table_code: str,
    db: AsyncSession,
    team_id: Optional[str] = None,
) -> MultiDimensionTable:
    """通过 code 获取表格（API 用，无权限校验，支持按团队过滤）"""
    query = select(MultiDimensionTable).where(
        and_(
            MultiDimensionTable.code == table_code,
            MultiDimensionTable.is_active == True,
        )
    )
    if team_id is not None:
        query = query.where(MultiDimensionTable.team_id == team_id)

    result = await db.execute(query)
    if team_id is not None:
        table = result.scalar_one_or_none()
        if not table:
            raise NotFoundError("表格", table_code, f"表格不存在（code: {table_code}, team_id: {team_id}）")
        return table

    tables = result.scalars().all()
    if len(tables) > 1:
        raise ValidationError(f"找到多个表格（code: {table_code}），请提供 team_id 参数来指定团队")
    if len(tables) == 0:
        raise NotFoundError("表格", table_code)
    return tables[0]


async def api_get_table_rows(
    table_code: str,
    team_id: Optional[str],
    db: AsyncSession,
    skip: int = 0,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """API：获取表格行列表"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    return await _api_rows_internal(table, team_id, db, skip=skip, limit=limit)


async def _api_rows_internal(
    table: MultiDimensionTable,
    team_id: Optional[str],
    db: AsyncSession,
    skip: int = 0,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """内部：按 team_id 查询行"""
    conditions = [MultiDimensionTableRow.table_id == table.id]
    if team_id:
        conditions.append(MultiDimensionTableRow.team_id == team_id)
    query = select(MultiDimensionTableRow).where(and_(*conditions)).order_by(MultiDimensionTableRow.row_id)
    if limit is not None:
        query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()
    if not rows:
        return []
    row_ids = [r.id for r in rows]
    cells_query = select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id.in_(row_ids))
    cells_result = await db.execute(cells_query)
    cells_by_row: Dict[str, Dict[str, str]] = {}
    for cell in cells_result.scalars().all():
        if cell.row_id not in cells_by_row:
            cells_by_row[cell.row_id] = {}
        cells_by_row[cell.row_id][cell.column_key] = cell.value
    return [_row_to_dict(row, cells_by_row.get(row.id, {})) for row in rows]


async def api_get_row_ids(
    table_code: str,
    team_id: Optional[str],
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：获取 max_row_id、existing_row_ids、next_row_id"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    conditions = [MultiDimensionTableRow.table_id == table.id]
    if team_id:
        conditions.append(MultiDimensionTableRow.team_id == team_id)
    row_ids_query = select(MultiDimensionTableRow.row_id).where(and_(*conditions))
    max_query = select(func.max(MultiDimensionTableRow.row_id)).where(and_(*conditions))
    row_ids_result = await db.execute(row_ids_query)
    existing = sorted(set(r[0] for r in row_ids_result.all()))
    max_result = await db.execute(max_query)
    max_val = max_result.scalar_one()
    max_row_id = -1 if max_val is None else max_val
    return {
        "max_row_id": max_row_id,
        "existing_row_ids": existing,
        "next_row_id": max_row_id + 1 if max_row_id >= 0 else 0,
    }


async def api_create_table_row(
    table_code: str,
    team_id: Optional[str],
    row_data: MultiDimensionTableRowCreate,
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：创建表格行"""
    table = await get_table_by_code_api(table_code, db, team_id=team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    table_id = table.id
    columns = json.loads(table.columns) if table.columns else []
    column_keys = [col["key"] for col in columns]

    if team_id:
        max_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id == team_id,
            )
        )
    else:
        max_query = select(func.max(MultiDimensionTableRow.row_id)).where(
            and_(
                MultiDimensionTableRow.table_id == table_id,
                MultiDimensionTableRow.team_id.is_(None),
            )
        )
    max_result = await db.execute(max_query)
    max_val = max_result.scalar_one()
    max_row_id = -1 if max_val is None else max_val

    if row_data.row_id is not None and row_data.row_id >= 0:
        new_row_id = row_data.row_id
        existing_conds = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.row_id == new_row_id,
        ]
        if team_id:
            existing_conds.append(MultiDimensionTableRow.team_id == team_id)
        else:
            existing_conds.append(MultiDimensionTableRow.team_id.is_(None))
        existing_query = select(MultiDimensionTableRow).where(and_(*existing_conds))
        existing_result = await db.execute(existing_query)
        if existing_result.scalar_one_or_none():
            raise ValidationError(f"行 ID {new_row_id} 已存在")
        if max_row_id >= 0 and new_row_id <= max_row_id:
            raise ValidationError(
                f"行 ID {new_row_id} 不允许使用（可能已被删除）。请使用大于 {max_row_id} 的 row_id，或不提供 row_id 让系统自动生成（将使用 {max_row_id + 1}）"
            )
    else:
        new_row_id = max_row_id + 1 if max_row_id >= 0 else 0

    final_cells = dict(row_data.cells)
    for col in columns:
        key = col.get("key")
        if key and key not in final_cells:
            opts = col.get("options", {})
            if isinstance(opts, dict) and opts.get("defaultValue") is not None:
                v = str(opts["defaultValue"]).strip()
                if v:
                    final_cells[key] = v
    from app.utils.table_row_validator import validate_row_data_for_columns

    validate_row_data_for_columns(columns, final_cells)

    new_row = MultiDimensionTableRow(
        table_id=table_id,
        row_id=new_row_id,
        team_id=team_id,
        team_code=None,
        row_data=json.dumps(row_data.row_data, ensure_ascii=False) if row_data.row_data else None,
        created_by=None,
        updated_by=None,
    )
    db.add(new_row)
    await db.flush()
    for column_key, value in final_cells.items():
        if column_key not in column_keys:
            continue
        db.add(
            MultiDimensionTableCell(
                table_id=table_id,
                row_id=new_row.id,
                column_key=column_key,
                value=value,
                created_by=None,
                updated_by=None,
            )
        )
    await db.commit()
    await db.refresh(new_row)
    cells_dict = {k: v for k, v in final_cells.items() if k in column_keys}
    return _row_to_dict(new_row, cells_dict)


async def api_update_row_by_condition(
    table_code: str,
    team_id: Optional[str],
    update_request: TableRowUpdateByCondition,
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：根据条件更新行"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    return await _api_update_delete_by_condition(
        table, team_id, db, update_request.condition, update_request.cells, update_request.row_data, is_update=True
    )


async def api_delete_row_by_condition(
    table_code: str,
    team_id: Optional[str],
    delete_request: TableRowDeleteByCondition,
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：根据条件删除行"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    return await _api_update_delete_by_condition(
        table, team_id, db, delete_request.condition, None, None, is_update=False
    )


async def _api_update_delete_by_condition(
    table: MultiDimensionTable,
    team_id: Optional[str],
    db: AsyncSession,
    condition,
    cells: Optional[Dict[str, str]],
    row_data: Optional[Dict],
    is_update: bool,
) -> Dict[str, Any]:
    """内部：按条件更新或删除行"""
    table_id = table.id
    if condition.column_key == "row_id":
        conditions = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableRow.row_id == int(condition.value),
        ]
        if team_id:
            conditions.append(MultiDimensionTableRow.team_id == team_id)
        query = select(MultiDimensionTableRow).where(and_(*conditions))
    else:
        columns = json.loads(table.columns) if table.columns else []
        if condition.column_key not in [c["key"] for c in columns]:
            raise ValidationError(f"列 '{condition.column_key}' 不存在于表格中")
        conds = [
            MultiDimensionTableRow.table_id == table_id,
            MultiDimensionTableCell.column_key == condition.column_key,
            MultiDimensionTableCell.value == str(condition.value),
        ]
        if team_id:
            conds.append(MultiDimensionTableRow.team_id == team_id)
        cell_query = (
            select(MultiDimensionTableCell)
            .join(MultiDimensionTableRow, MultiDimensionTableCell.row_id == MultiDimensionTableRow.id)
            .where(and_(*conds))
        )
        cell_result = await db.execute(cell_query)
        condition_cells = cell_result.scalars().all()
        if not condition_cells:
            raise NotFoundError("行", None, f"未找到满足条件 {condition.column_key}={condition.value} 的行")
        query = select(MultiDimensionTableRow).where(MultiDimensionTableRow.id.in_([c.row_id for c in condition_cells]))

    result = await db.execute(query)
    rows = result.scalars().all()
    if not rows:
        raise NotFoundError("行", None, "未找到满足条件的行")

    if is_update:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [c["key"] for c in columns]
        if cells:
            from app.utils.table_row_validator import validate_row_data_for_columns

            validate_row_data_for_columns(columns, cells)
        row_ids = [r.id for r in rows]
        cells_map = {}
        if cells:
            cells_query = select(MultiDimensionTableCell).where(
                and_(
                    MultiDimensionTableCell.row_id.in_(row_ids),
                    MultiDimensionTableCell.column_key.in_(list(cells.keys())),
                )
            )
            cr = await db.execute(cells_query)
            for c in cr.scalars().all():
                cells_map[(c.row_id, c.column_key)] = c
        updated_count = 0
        updated_row_ids = []
        for row in rows:
            if row_data is not None:
                row.row_data = json.dumps(row_data, ensure_ascii=False)
            if cells:
                for ck, v in cells.items():
                    if ck not in column_keys:
                        continue
                    cell = cells_map.get((row.id, ck))
                    if cell:
                        cell.value = v
                    else:
                        db.add(
                            MultiDimensionTableCell(
                                table_id=table_id, row_id=row.id, column_key=ck, value=v,
                                created_by=None, updated_by=None,
                            )
                        )
            updated_row_ids.append(row.id)
            updated_count += 1
        await db.commit()
        return {"updated_count": updated_count, "updated_row_ids": updated_row_ids}
    else:
        deleted_count = 0
        deleted_row_ids = []
        for row in rows:
            deleted_row_ids.append(row.id)
            await db.delete(row)
            deleted_count += 1
        await db.commit()
        return {"deleted_count": deleted_count, "deleted_row_ids": deleted_row_ids}


async def api_update_table_row(
    table_code: str,
    team_id: Optional[str],
    row_id: str,
    row_data: MultiDimensionTableRowUpdate,
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：更新表格行（按行主键 ID）"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    if not team_id and table.team_id:
        team_id = table.team_id
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table.id:
        raise NotFoundError("行", None, "行不存在")
    if row_data.row_data is not None:
        row.row_data = json.dumps(row_data.row_data, ensure_ascii=False)
    if row_data.cells is not None:
        columns = json.loads(table.columns) if table.columns else []
        column_keys = [c["key"] for c in columns]
        for ck, v in {k: v for k, v in row_data.cells.items() if k in column_keys}.items():
            cell_r = await db.execute(
                select(MultiDimensionTableCell).where(
                    and_(
                        MultiDimensionTableCell.row_id == row_id,
                        MultiDimensionTableCell.column_key == ck,
                    )
                )
            )
            cell = cell_r.scalar_one_or_none()
            if cell:
                cell.value = v
            else:
                db.add(
                    MultiDimensionTableCell(
                        table_id=table.id, row_id=row_id, column_key=ck, value=v,
                        created_by=None, updated_by=None,
                    )
                )
    await db.commit()
    await db.refresh(row)
    cells_r = await db.execute(select(MultiDimensionTableCell).where(MultiDimensionTableCell.row_id == row_id))
    cells_dict = {c.column_key: c.value for c in cells_r.scalars().all()}
    return _row_to_dict(row, cells_dict)


async def api_delete_table_row(
    table_code: str,
    team_id: Optional[str],
    row_id: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    """API：删除表格行"""
    table = await get_table_by_code_api(table_code, db, team_id=None if not team_id else team_id)
    result = await db.execute(select(MultiDimensionTableRow).where(MultiDimensionTableRow.id == row_id))
    row = result.scalar_one_or_none()
    if not row or row.table_id != table.id:
        raise NotFoundError("行", None, "行不存在")
    await db.delete(row)
    await db.commit()
    return {"id": row_id}
