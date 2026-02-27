"""
组合配置模型
支持 LLM 消息模式与接口模式
"""
import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class Composition(Base):
    """组合配置"""

    __tablename__ = "compositions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    mode = Column(String(20), nullable=False, default="chat", index=True)  # chat | api
    scene = Column(String(100), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, default="default")  # default | tenant_id
    prompt_id = Column(String(36), nullable=True)  # 关联提示词 ID，用于生成调用 URL
    model_id = Column(String(36), nullable=True)
    mcp_id = Column(String(36), nullable=True)
    mcp_tool_names = Column(JSONB, nullable=True, default=list)  # MCP 工具名列表
    task_mode = Column(String(20), nullable=False, default="sync")  # sync | async，仅接口模式
    notification_config = Column(JSONB, nullable=True)  # 异步任务通知配置
    team_id = Column(String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, default=0, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
