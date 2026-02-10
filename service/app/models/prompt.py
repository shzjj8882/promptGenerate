from sqlalchemy import Column, String, Boolean, DateTime, Text, ARRAY, BigInteger, ForeignKey, UniqueConstraint, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid

# 场景和占位符的关联表（多对多关系）
scene_placeholders = Table(
    'scene_placeholders',
    Base.metadata,
    Column('scene_id', String, ForeignKey('scenes.id', ondelete='CASCADE'), primary_key=True),
    Column('placeholder_id', String, ForeignKey('placeholders.id', ondelete='CASCADE'), primary_key=True),
)


class Prompt(Base):
    """提示词模型"""
    __tablename__ = "prompts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scene = Column(String, nullable=False, index=True)  # 场景 code，保留便于查询/兼容
    scene_id = Column(String, ForeignKey("scenes.id"), nullable=True, index=True)  # 场景外键
    tenant_id = Column(String, nullable=False, index=True)  # 租户ID，"default" 表示默认提示词
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    placeholders = Column(ARRAY(String), default=[])  # 占位符列表
    is_default = Column(Boolean, default=False, index=True)  # 是否为默认提示词
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<Prompt(id={self.id}, scene={self.scene}, tenant_id={self.tenant_id}, title={self.title})>"


class Tenant(Base):
    """租户模型"""
    __tablename__ = "tenants"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))  # 自增ID（UUID）
    code_id = Column(String, nullable=False, index=True)  # 用户输入的编号ID（不唯一）
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    app_id = Column(String, nullable=True)  # 应用ID
    app_secret = Column(String, nullable=True)  # 应用密钥
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 创建人
    updated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 更新人
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, index=True)  # 逻辑删除标记
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    conversations = relationship("Conversation", back_populates="tenant", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Tenant(id={self.id}, code_id={self.code_id}, name={self.name})>"


class Placeholder(Base):
    """占位符配置模型（团队独立配置）"""
    __tablename__ = "placeholders"
    __table_args__ = (
        UniqueConstraint('team_id', 'key', name='uq_placeholder_team_key'),  # 团队内 key 唯一
    )
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key = Column(String, nullable=False)  # 占位符代码，团队内唯一
    label = Column(String, nullable=False)
    scene = Column(String, nullable=False, default="", index=True)  # 保留字段，始终为空字符串（用于兼容）
    scene_id = Column(String, ForeignKey("scenes.id"), nullable=True, index=True)  # 保留字段，用于兼容
    team_code = Column(String, nullable=True, index=True)  # 团队代码（保留兼容）
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)  # 团队外键
    description = Column(Text, nullable=True)
    method = Column(String, nullable=True)  # 数据获取方法名称
    method_params = Column(Text, nullable=True)  # 方法参数配置（JSON 字符串）
    tenant_param_key = Column(String, nullable=True)  # 租户参数在方法参数中的 key
    # 新增字段：支持多维表格数据源
    data_source_type = Column(String, nullable=True, default="user_input")  # 数据源类型：user_input（用户输入）、multi_dimension_table（多维表格）
    data_type = Column(String, nullable=True)  # 数据类型：string、number、boolean、date 等
    table_id = Column(String, ForeignKey("multi_dimension_tables.id", ondelete="SET NULL"), nullable=True, index=True)  # 多维表格 ID
    table_column_key = Column(String, nullable=True)  # 多维表格列 key
    table_row_id_param_key = Column(String, nullable=True)  # 多维表格行 ID 参数 key（接口字段名）
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关联关系：通过关联表与场景建立多对多关系
    scenes = relationship("Scene", secondary=scene_placeholders, back_populates="placeholders")
    
    def __repr__(self):
        return f"<Placeholder(id={self.id}, key={self.key}, label={self.label}, team_id={self.team_id})>"


class PlaceholderDataSource(Base):
    """占位符数据源配置模型"""
    __tablename__ = "placeholder_data_sources"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    placeholder_key = Column(String, nullable=False, index=True)  # 占位符 key（不再使用外键，因为 key 不是全局唯一）
    method = Column(String, nullable=False)  # 数据获取方法名称
    method_params = Column(Text, nullable=True)  # 方法参数配置（JSON 字符串）
    tenant_param_key = Column(String, nullable=True)  # 租户参数在方法参数中的 key
    priority = Column(BigInteger, default=0, index=True)  # 优先级，数字越大优先级越高
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<PlaceholderDataSource(id={self.id}, placeholder_key={self.placeholder_key}, method={self.method})>"



