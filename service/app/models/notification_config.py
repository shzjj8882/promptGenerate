"""
通知配置模型
支持邮件（SendCloud）等不同通知方式
"""
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class NotificationConfig(Base):
    """通知配置表"""
    __tablename__ = "notification_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # 通知类型：email（SendCloud）、webhook 等
    type = Column(String(64), nullable=False, unique=True, index=True, comment="通知类型：email | webhook")
    name = Column(String(255), nullable=False, comment="显示名称")
    # 配置信息（JSON）：SendCloud 为 api_user, api_key, from_email, from_name
    config = Column(Text, nullable=True, comment="配置信息（JSON 格式）")

    # 团队关联（NULL 表示全局配置）
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, comment="团队ID")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<NotificationConfig(id={self.id}, type={self.type}, name={self.name})>"
