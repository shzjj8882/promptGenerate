"""
团队模型
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Team(Base):
    """团队模型"""
    __tablename__ = "teams"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, nullable=False, unique=True, index=True)  # 团队代码（唯一标识）
    name = Column(String, nullable=False)  # 团队名称
    description = Column(Text, nullable=True)  # 团队描述
    authcode = Column(String, nullable=True, unique=True, index=True)  # API 认证码（用于调用 /api 接口）
    is_active = Column(Boolean, default=True)  # 是否激活
    # 订阅相关（按月）
    # 有效期结束时间（精确到月即可，前端按“年-月”选择，可以存为当月最后一天 23:59:59）
    plan_expire_at = Column(DateTime(timezone=True), nullable=True)  # 团队套餐有效期
    # 每月 token 消耗上限（为空或 <=0 表示不限制，由系统管理员控制）
    monthly_token_limit = Column(Integer, nullable=True)
    is_system_admin_team = Column(Boolean, default=False, index=True)  # 是否为系统管理员团队（该团队的成员都是系统管理员）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    llm_models = relationship("LLMModel", back_populates="team", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="team", cascade="all, delete-orphan")
    mcp_configs = relationship("MCPConfig", back_populates="team", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Team(id={self.id}, code={self.code}, name={self.name}, is_system_admin_team={self.is_system_admin_team})>"
