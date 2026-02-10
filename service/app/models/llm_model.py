"""
LLM 模型配置模型
支持团队级别的模型配置，参考 Dify 的模型配置逻辑
"""
from sqlalchemy import Column, String, Boolean, Text, ForeignKey, Integer, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class LLMModel(Base):
    """LLM 模型配置表"""
    __tablename__ = "llm_models"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # 模型基本信息
    name = Column(String(255), nullable=False, comment="模型显示名称（如：GPT-4、Claude 3 Opus）")
    provider = Column(String(100), nullable=False, comment="提供商（如：openai、anthropic、deepseek、ollama）")
    model = Column(String(255), nullable=False, comment="模型标识（如：gpt-4、claude-3-opus-20240229、deepseek-chat）")
    
    # API 配置
    api_key = Column(Text, nullable=True, comment="API 密钥（加密存储）")
    api_base = Column(String(500), nullable=True, comment="API 基础 URL（可选，用于代理或自定义端点）")
    
    # 默认参数
    default_temperature = Column(String(10), default="0.3", comment="默认温度参数")
    default_max_tokens = Column(Integer, nullable=True, comment="默认最大 token 数")
    
    # 团队关联（支持团队级别的模型配置）
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, comment="团队ID，NULL表示全局配置")
    
    # 状态
    is_active = Column(Boolean, default=True, nullable=False, comment="是否激活")
    is_default = Column(Boolean, default=False, nullable=False, comment="是否为团队的默认模型")
    
    # 元数据
    description = Column(Text, nullable=True, comment="模型描述")
    extra_config = Column("config", Text, nullable=True, comment="额外配置（JSON格式，用于存储提供商特定的配置）")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # 关系
    team = relationship("Team", back_populates="llm_models")
    
    def __repr__(self):
        return f"<LLMModel(id={self.id}, name={self.name}, provider={self.provider}, model={self.model}, team_id={self.team_id})>"
