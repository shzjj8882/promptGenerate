"""
MCP (Model Context Protocol) 配置模型
"""
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class MCPConfig(Base):
    """MCP 配置表"""
    __tablename__ = "mcp_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # MCP 基本信息
    name = Column(String(255), nullable=False, comment="MCP 显示名称")
    url = Column(String(500), nullable=False, comment="MCP 服务地址（HTTP SSE 或 Streamable HTTP 端点）")
    transport_type = Column(String(32), default="sse", nullable=False, comment="传输协议：sse | streamable_http")
    auth_info = Column(Text, nullable=True, comment="MCP 授权信息（JSON 格式，如 headers）")

    # 缓存的工具列表（从 MCP 服务获取的功能及子功能）
    tools_cache = Column(Text, nullable=True, comment="MCP 工具列表（JSON 格式）")

    # 团队关联（支持团队级别的 MCP 配置）
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, comment="团队ID，NULL表示全局配置")

    # 状态
    is_active = Column(Boolean, default=True, nullable=False, comment="是否激活")

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # 关系
    team = relationship("Team", back_populates="mcp_configs")

    def __repr__(self):
        return f"<MCPConfig(id={self.id}, name={self.name}, url={self.url})>"
