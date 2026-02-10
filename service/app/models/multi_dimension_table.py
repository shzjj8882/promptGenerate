# -*- coding: utf-8 -*-
"""
多维表格模型：支持自定义行和列的多维数据存储
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class MultiDimensionTable(Base):
    """多维表格定义模型"""
    __tablename__ = "multi_dimension_tables"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, nullable=False, index=True)  # 表格代码（唯一标识，通过部分唯一索引保证 is_active=True 时唯一）
    name = Column(String, nullable=False)  # 表格名称
    description = Column(Text, nullable=True)  # 表格描述
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键（区分不同团队）
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    columns = Column(Text, nullable=False)  # 列定义（JSON 字符串，格式：[{"key": "col1", "label": "列1"}, ...]）
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 创建人
    updated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 更新人
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<MultiDimensionTable(id={self.id}, name={self.name}, team_id={self.team_id})>"


class MultiDimensionTableRow(Base):
    """多维表格行模型"""
    __tablename__ = "multi_dimension_table_rows"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    table_id = Column(String, ForeignKey("multi_dimension_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    row_id = Column(Integer, nullable=False)  # 行 ID（从 0 开始，每个团队独立计数）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键（区分不同团队）
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    row_data = Column(Text, nullable=True)  # 行级数据（JSON 字符串，用于存储行级别的额外信息）
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 创建人
    updated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 更新人
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 组合唯一约束：同一表格、同一团队内 row_id 必须唯一
    __table_args__ = (
        UniqueConstraint('table_id', 'team_id', 'row_id', name='uq_table_team_row'),
        Index('idx_table_team_row', 'table_id', 'team_id', 'row_id'),
    )
    
    def __repr__(self):
        return f"<MultiDimensionTableRow(id={self.id}, table_id={self.table_id}, row_id={self.row_id}, team_id={self.team_id})>"


class MultiDimensionTableCell(Base):
    """多维表格单元格模型"""
    __tablename__ = "multi_dimension_table_cells"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    table_id = Column(String, ForeignKey("multi_dimension_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    row_id = Column(String, ForeignKey("multi_dimension_table_rows.id", ondelete="CASCADE"), nullable=False, index=True)
    column_key = Column(String, nullable=False)  # 列 key（对应表格定义中的列 key）
    value = Column(Text, nullable=True)  # 单元格值
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 创建人
    updated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 更新人
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 组合唯一约束：同一行、同一列只能有一个单元格
    __table_args__ = (
        UniqueConstraint('row_id', 'column_key', name='uq_row_column'),
        Index('idx_table_row_column', 'table_id', 'row_id', 'column_key'),
    )
    
    def __repr__(self):
        return f"<MultiDimensionTableCell(id={self.id}, row_id={self.row_id}, column_key={self.column_key})>"
