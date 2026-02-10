"""
销售打单相关模型
"""
from sqlalchemy import Column, String, Text, DateTime, BigInteger, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class DMUReport(Base):
    """DMU报告模型"""
    __tablename__ = "dmu_reports"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id = Column(String, nullable=False, index=True)  # 对话ID
    company_name = Column(String, nullable=False, index=True)  # 客户名称
    dmu_analysis = Column(JSON, nullable=False)  # DMU分析数据（JSON格式）
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=True, index=True)  # 租户ID（可选）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<DMUReport(id={self.id}, conversation_id={self.conversation_id}, company_name={self.company_name})>"


class CustomerHistory(Base):
    """客户历史数据模型（对应MySQL的ai_chat_chatflow_dmu_report表）"""
    __tablename__ = "customer_history"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    company_name = Column(String(200), nullable=True, index=True)  # 公司名称
    decision_units = Column(JSON, nullable=True)  # DMU 信息（JSON 格式）
    fabe_spi = Column(JSON, nullable=True)  # FABE 信息（JSON 格式）
    opportunity_score = Column(JSON, nullable=True)  # 机会评分（JSON 格式）
    member_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)  # 用户编号（与 users.id 一致）
    conversation_id = Column(String(64), nullable=True, index=True)  # 对话编号
    creator = Column(String(64), nullable=True)  # 创建人
    created_at = Column(DateTime(timezone=True), name="create_time", server_default=func.now())  # 创建时间（DB 列名保持 create_time）
    updater = Column(String(64), nullable=True)  # 更新人
    updated_at = Column(DateTime(timezone=True), name="update_time", server_default=func.now(), onupdate=func.now())  # 更新时间（DB 列名保持 update_time）
    deleted = Column(Boolean, nullable=False, default=False, index=True)  # 是否删除
    tenant_id = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)  # 租户编号（与 tenants.id 一致）
    
    def __repr__(self):
        return f"<CustomerHistory(id={self.id}, company_name={self.company_name}, member_user_id={self.member_user_id}, tenant_id={self.tenant_id})>"

