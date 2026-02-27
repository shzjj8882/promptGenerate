# -*- coding: utf-8 -*-
"""
多维表格相关的 Pydantic schemas
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class TableColumn(BaseModel):
    """表格列定义"""
    key: str = Field(..., description="列 key（唯一标识）")
    label: str = Field(..., description="列显示名称")
    type: Optional[str] = Field("text", description="字段类型：text（文本）、number（数字）、date（日期）、boolean（布尔值）、select（选择）等")
    options: Optional[Dict[str, Any]] = Field(None, description="字段选项（如选择类型的选项列表、数字类型的范围等）")


class MultiDimensionTableBase(BaseModel):
    """多维表格基础模型"""
    code: str = Field(..., description="表格代码（唯一标识）")
    name: str = Field(..., description="表格名称")
    description: Optional[str] = Field(None, description="表格描述")
    columns: List[TableColumn] = Field(default_factory=list, description="列定义列表")


class MultiDimensionTableCreate(MultiDimensionTableBase):
    """创建多维表格请求模型"""
    pass


class TableRowBulkData(BaseModel):
    """批量保存行数据模型"""
    id: Optional[str] = Field(None, description="行 ID（如果提供则更新，否则创建）")
    row_id: Optional[int] = Field(None, description="行 ID（可选，如果不提供则自动生成）")
    row_data: Optional[Dict[str, Any]] = Field(None, description="行级数据（额外信息）")
    cells: Dict[str, str] = Field(default_factory=dict, description="单元格数据")


class MultiDimensionTableUpdate(BaseModel):
    """更新多维表格请求模型"""
    code: Optional[str] = Field(None, description="表格代码（唯一标识）")
    name: Optional[str] = Field(None, description="表格名称")
    description: Optional[str] = Field(None, description="表格描述")
    columns: Optional[List[TableColumn]] = Field(None, description="列定义列表")
    rows: Optional[List[TableRowBulkData]] = Field(None, description="行数据列表（可选，如果提供则全量替换所有行）")
    deleted_row_ids: Optional[List[str]] = Field(None, description="要删除的行 ID 列表（可选，通常与 rows 一起使用）")


class MultiDimensionTableResponse(MultiDimensionTableBase):
    """多维表格响应模型"""
    id: str
    team_id: Optional[str] = None
    team_code: Optional[str] = None
    is_active: bool
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TableRowData(BaseModel):
    """表格行数据模型"""
    row_id: int = Field(..., description="行 ID（从 0 开始）")
    row_data: Optional[Dict[str, Any]] = Field(None, description="行级数据（额外信息）")
    cells: Dict[str, str] = Field(default_factory=dict, description="单元格数据，key 为列 key，value 为单元格值")


class MultiDimensionTableRowCreate(BaseModel):
    """创建表格行请求模型"""
    # table_id 已在路径参数中，不需要在请求体中
    row_id: Optional[int] = Field(None, description="行 ID（可选，如果不提供则自动生成）")
    row_data: Optional[Dict[str, Any]] = Field(None, description="行级数据（额外信息）")
    cells: Dict[str, str] = Field(default_factory=dict, description="单元格数据")


class TableRowsBulkSave(BaseModel):
    """批量保存表格行请求模型"""
    rows: List[TableRowBulkData] = Field(default_factory=list, description="行数据列表")
    deleted_row_ids: List[str] = Field(default_factory=list, description="要删除的行 ID 列表")


class MultiDimensionTableRowUpdate(BaseModel):
    """更新表格行请求模型"""
    row_data: Optional[Dict[str, Any]] = Field(None, description="行级数据（额外信息）")
    cells: Optional[Dict[str, str]] = Field(None, description="单元格数据")


class MultiDimensionTableRowResponse(BaseModel):
    """表格行响应模型"""
    id: str
    table_id: str
    row_id: int
    team_id: Optional[str] = None
    team_code: Optional[str] = None
    row_data: Optional[Dict[str, Any]] = None
    cells: Dict[str, str] = Field(default_factory=dict, description="单元格数据")
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TableSearchRequest(BaseModel):
    """表格搜索请求模型"""
    table_id: str = Field(..., description="表格 ID")
    row_id: Optional[int] = Field(None, description="行 ID（可选，指定行）")
    column_key: Optional[str] = Field(None, description="列 key（可选，指定列）")
    value: Optional[str] = Field(None, description="搜索值（可选，模糊匹配单元格值）")
    team_id: Optional[str] = Field(None, description="团队 ID（可选，过滤团队）")


class TableSearchResponse(BaseModel):
    """表格搜索响应模型"""
    rows: List[MultiDimensionTableRowResponse] = Field(default_factory=list, description="匹配的行列表")
    total: int = Field(0, description="匹配的总数")


class TableRowCondition(BaseModel):
    """表格行条件查询模型"""
    column_key: str = Field(..., description="列 key（条件字段）")
    value: str = Field(..., description="条件值")


class TableRowDeleteByCondition(BaseModel):
    """根据条件删除行请求模型"""
    condition: TableRowCondition = Field(..., description="删除条件")


class TableRowUpdateByCondition(BaseModel):
    """根据条件更新行请求模型"""
    condition: TableRowCondition = Field(..., description="更新条件")
    row_data: Optional[Dict[str, Any]] = Field(None, description="行级数据（额外信息）")
    cells: Optional[Dict[str, str]] = Field(None, description="单元格数据")


class TableRowQueryCondition(BaseModel):
    """多条件查询中的单个条件"""
    column_key: str = Field(..., description="列 key（条件字段）")
    operator: str = Field("equals", description="操作符：equals/contains/not_equals/not_contains/starts_with/ends_with")
    value: str = Field(..., description="条件值")


class TableRowQueryByConditions(BaseModel):
    """多条件查询请求模型"""
    conditions: List[TableRowQueryCondition] = Field(..., description="条件列表，至少一个")
    logic: str = Field("and", description="条件间逻辑：and/or")
    limit: Optional[int] = Field(None, description="返回条数限制，1 表示只返回单条")
