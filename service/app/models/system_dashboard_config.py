"""
系统工作台布局配置模型（超级管理员专用）
"""
from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class SystemDashboardConfig(Base):
    """系统工作台布局配置（超级管理员）"""

    __tablename__ = "system_dashboard_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    layout = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
