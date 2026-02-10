# -*- coding: utf-8 -*-
"""场景模型：业务场景持久化"""
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class Scene(Base):
    """场景模型"""
    __tablename__ = "scenes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, nullable=False, index=True)  # 场景代码，与 team_id 联合唯一
    name = Column(String, nullable=False)
    is_predefined = Column(Boolean, nullable=False, default=False)  # 是否预置场景（不可删除）
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 联合唯一约束：code 和 team_id 的组合必须唯一（通过数据库索引实现）
    __table_args__ = (
        Index('idx_scenes_code_team_id_unique', 'code', 'team_id', unique=True),
    )
    
    # 关联关系：通过关联表与占位符建立多对多关系
    placeholders = relationship("Placeholder", secondary="scene_placeholders", back_populates="scenes")

    def __repr__(self):
        return f"<Scene(id={self.id}, code={self.code}, name={self.name})>"

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "is_predefined": self.is_predefined,
            "team_code": self.team_code,
        }
