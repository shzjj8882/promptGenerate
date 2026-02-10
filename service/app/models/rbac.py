"""
RBAC（基于角色的访问控制）相关模型
"""
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Table, Text, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid

# 用户角色关联表（多对多）
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', String, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', String, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
)

# 角色权限关联表（多对多）
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', String, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', String, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True),
)


class Role(Base):
    """角色模型"""
    __tablename__ = "roles"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, index=True)  # 角色名称（不再全局唯一，改为团队内唯一）
    code = Column(String, nullable=False, index=True)  # 角色代码（不再全局唯一，改为团队内唯一）
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    description = Column(Text, nullable=True)  # 角色描述
    is_active = Column(Boolean, default=True)  # 是否激活
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关联关系
    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    
    def __repr__(self):
        return f"<Role(id={self.id}, name={self.name}, code={self.code})>"


class Permission(Base):
    """权限模型"""
    __tablename__ = "permissions"

    TYPE_MENU = "menu"
    TYPE_API = "api"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True, index=True)  # 权限名称
    code = Column(String, nullable=False, unique=True, index=True)  # 权限代码（唯一标识，如：tenant:create）
    resource = Column(String, nullable=False, index=True)  # 资源（如：tenant, prompt, rag）
    action = Column(String, nullable=False, index=True)  # 操作（如：create, read, update, delete）
    type = Column(String(20), default=TYPE_API, nullable=False)  # 权限类型：menu=菜单权限，api=接口权限
    description = Column(Text, nullable=True)  # 权限描述
    parent_id = Column(String, ForeignKey("permissions.id", ondelete="SET NULL"), nullable=True, index=True)  # 父权限ID（用于菜单层级）
    sort_order = Column(Integer, default=0, nullable=False, index=True)  # 排序顺序（用于菜单排序）
    is_active = Column(Boolean, default=True)  # 是否激活
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关联关系
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
    parent = relationship("Permission", remote_side=[id], backref="children")  # 自关联：父权限和子权限
    
    def __repr__(self):
        return f"<Permission(id={self.id}, name={self.name}, code={self.code})>"


class MenuConfig(Base):
    """菜单配置模型（支持团队级别的菜单顺序和层级覆盖）"""
    __tablename__ = "menu_configs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    permission_id = Column(String, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)  # 权限ID
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)  # 团队ID（NULL表示全局配置）
    parent_id = Column(String, ForeignKey("permissions.id", ondelete="SET NULL"), nullable=True, index=True)  # 父权限ID（用于菜单层级）
    sort_order = Column(Integer, default=0, nullable=False, index=True)  # 排序顺序（用于菜单排序）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关联关系
    permission = relationship("Permission", foreign_keys=[permission_id], backref="menu_configs")
    team = relationship("Team", foreign_keys=[team_id])
    parent = relationship("Permission", foreign_keys=[parent_id])
    
    def __repr__(self):
        return f"<MenuConfig(id={self.id}, permission_id={self.permission_id}, team_id={self.team_id})>"

