from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid


class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)  # 加密后的密码
    full_name = Column(String, nullable=True)
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)  # 是否为系统超级管理员
    is_team_admin = Column(Boolean, default=False)  # 是否为团队管理员
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关联关系（延迟导入避免循环依赖）
    roles = relationship("Role", secondary="user_roles", back_populates="users")
    
    def __repr__(self):
        return f"<User(id={self.id}, username={self.username}, email={self.email})>"

