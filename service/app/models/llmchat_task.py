"""
LLM Chat 异步任务模型
"""
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class LLMChatTask(Base):
    """LLM Chat 异步任务表"""
    __tablename__ = "llmchat_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    scene = Column(String(64), nullable=False, comment="场景代码")
    status = Column(String(32), nullable=False, default="pending", comment="pending|running|completed|failed")
    request_payload = Column(JSONB, nullable=True, comment="请求体 JSON")
    result_content = Column(Text, nullable=True, comment="LLM 返回内容")
    error_message = Column(Text, nullable=True, comment="错误信息")
    team_id = Column(String(36), nullable=True, comment="团队ID")  # 不设 FK 避免迁移冲突

    notification_type = Column(String(64), nullable=True, comment="通知类型：email 等")
    notification_config = Column(JSONB, nullable=True, comment="通知配置（如收件人 email_to）")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True, comment="完成时间")

    def __repr__(self):
        return f"<LLMChatTask(id={self.id}, scene={self.scene}, status={self.status})>"
