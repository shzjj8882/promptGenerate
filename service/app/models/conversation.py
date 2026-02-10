"""
会话记录模型
用于存储提示词调试的会话历史，支持上下文功能
"""
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Conversation(Base):
    """会话表"""
    __tablename__ = "conversations"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # 会话基本信息
    scene = Column(String(100), nullable=False, comment="场景代码（如：sales_order、research）")
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, comment="团队ID")
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, comment="租户ID（可选）")
    
    # 元数据
    title = Column(String(500), nullable=True, comment="会话标题（自动生成或用户设置）")
    meta_data = Column("metadata", Text, nullable=True, comment="额外元数据（JSON格式）")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 关系
    team = relationship("Team", back_populates="conversations")
    tenant = relationship("Tenant", back_populates="conversations")
    messages = relationship("ConversationMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ConversationMessage.created_at")
    
    def __repr__(self):
        return f"<Conversation(id={self.id}, scene={self.scene}, team_id={self.team_id}, created_at={self.created_at})>"


class ConversationMessage(Base):
    """会话消息表"""
    __tablename__ = "conversation_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # 关联会话
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    
    # 消息内容
    role = Column(String(20), nullable=False, comment="角色：system、user、assistant")
    content = Column(Text, nullable=False, comment="消息内容")
    
    # 元数据
    meta_data = Column("metadata", Text, nullable=True, comment="额外元数据（JSON格式，如：token数、模型名称等）")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # 关系
    conversation = relationship("Conversation", back_populates="messages")
    
    def __repr__(self):
        return f"<ConversationMessage(id={self.id}, conversation_id={self.conversation_id}, role={self.role}, created_at={self.created_at})>"
