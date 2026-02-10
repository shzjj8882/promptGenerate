from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class PromptBase(BaseModel):
    """提示词基础模型"""
    scene: str = Field(..., description="场景类型")
    tenant_id: str = Field(..., description="租户ID，'default' 表示默认提示词")
    content: str = Field(..., description="内容")
    placeholders: List[str] = Field(default=[], description="占位符列表")


class PromptCreate(PromptBase):
    """创建提示词请求模型"""
    pass


class PromptUpdate(BaseModel):
    """更新提示词请求模型"""
    content: Optional[str] = None
    placeholders: Optional[List[str]] = None


class PromptResponse(PromptBase):
    """提示词响应模型"""
    id: str
    team_code: Optional[str] = Field(None, description="团队代码（默认提示词属于团队）")
    is_default: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PlaceholderBase(BaseModel):
    """占位符基础模型"""
    key: str = Field(..., description="唯一标识")
    label: str = Field(..., description="显示名称")
    scene: Optional[str] = Field(None, description="所属场景（可选，占位符与场景值独立，在场景值配置时选择占位符）")
    description: Optional[str] = Field(None, description="说明")
    method: Optional[str] = Field(None, description="数据获取方法名称")
    method_params: Optional[str] = Field(None, description="方法参数配置（JSON 字符串）")
    tenant_param_key: Optional[str] = Field(None, description="租户参数在方法参数中的 key")


class PlaceholderCreate(PlaceholderBase):
    """创建占位符请求模型"""
    # 新增字段：支持多维表格数据源
    data_source_type: Optional[str] = Field("user_input", description="数据源类型：user_input（用户输入）、multi_dimension_table（多维表格）")
    data_type: Optional[str] = Field(None, description="数据类型：string、number、boolean、date 等")
    table_id: Optional[str] = Field(None, description="多维表格 ID")
    table_column_key: Optional[str] = Field(None, description="多维表格列 key")
    table_row_id_param_key: Optional[str] = Field(None, description="多维表格行 ID 参数 key（接口字段名）")


class PlaceholderUpdate(BaseModel):
    """更新占位符请求模型"""
    label: Optional[str] = Field(None, description="显示名称")
    description: Optional[str] = Field(None, description="说明")
    method: Optional[str] = Field(None, description="数据获取方法名称")
    method_params: Optional[str] = Field(None, description="方法参数配置（JSON 字符串）")
    tenant_param_key: Optional[str] = Field(None, description="租户参数在方法参数中的 key")
    # 新增字段：支持多维表格数据源
    data_source_type: Optional[str] = Field(None, description="数据源类型：user_input（用户输入）、multi_dimension_table（多维表格）")
    data_type: Optional[str] = Field(None, description="数据类型：string、number、boolean、date 等")
    table_id: Optional[str] = Field(None, description="多维表格 ID")
    table_column_key: Optional[str] = Field(None, description="多维表格列 key")
    table_row_id_param_key: Optional[str] = Field(None, description="多维表格行 ID 参数 key（接口字段名）")


class PlaceholderResponse(PlaceholderBase):
    """占位符响应模型"""
    id: str
    is_active: bool
    created_at: Optional[datetime] = None  # 允许为 None，兼容旧数据
    updated_at: Optional[datetime] = None  # 允许为 None，兼容旧数据
    # 新增字段：支持多维表格数据源
    data_source_type: Optional[str] = Field(None, description="数据源类型：user_input（用户输入）、multi_dimension_table（多维表格）")
    data_type: Optional[str] = Field(None, description="数据类型：string、number、boolean、date 等")
    table_id: Optional[str] = Field(None, description="多维表格 ID")
    table_column_key: Optional[str] = Field(None, description="多维表格列 key")
    table_row_id_param_key: Optional[str] = Field(None, description="多维表格行 ID 参数 key（接口字段名）")
    
    class Config:
        from_attributes = True


class PlaceholderDataSourceBase(BaseModel):
    """占位符数据源基础模型"""
    placeholder_key: str = Field(..., description="占位符 key")
    method: str = Field(..., description="数据获取方法名称")
    method_params: Optional[str] = Field(None, description="方法参数配置（JSON 字符串）")
    tenant_param_key: Optional[str] = Field(None, description="租户参数在方法参数中的 key")
    priority: int = Field(0, description="优先级，数字越大优先级越高")


class PlaceholderDataSourceCreate(PlaceholderDataSourceBase):
    """创建占位符数据源请求模型"""
    pass


class PlaceholderDataSourceUpdate(BaseModel):
    """更新占位符数据源请求模型"""
    method: Optional[str] = Field(None, description="数据获取方法名称")
    method_params: Optional[str] = Field(None, description="方法参数配置（JSON 字符串）")
    tenant_param_key: Optional[str] = Field(None, description="租户参数在方法参数中的 key")
    priority: Optional[int] = Field(None, description="优先级")
    is_active: Optional[bool] = Field(None, description="是否激活")


class PlaceholderDataSourceResponse(PlaceholderDataSourceBase):
    """占位符数据源响应模型"""
    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class GetPlaceholderValueRequest(BaseModel):
    """获取占位符值请求模型"""
    placeholder_key: str = Field(..., description="占位符 key")
    tenant_id: Optional[str] = Field(None, description="租户ID")
    additional_params: Optional[dict] = Field(default_factory=dict, description="额外的参数")


class GetPlaceholderValueResponse(BaseModel):
    """获取占位符值响应模型"""
    value: Optional[str] = Field(None, description="占位符的值")
    source: Optional[str] = Field(None, description="数据来源方法")
    success: bool = Field(True, description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")


class TenantBase(BaseModel):
    """租户基础模型"""
    code_id: str = Field(..., description="租户编号ID（用户输入）")
    name: str = Field(..., description="租户名称")
    description: Optional[str] = Field(None, description="描述")
    app_id: Optional[str] = Field(None, description="应用ID")
    app_secret: Optional[str] = Field(None, description="应用密钥")


class TenantCreate(TenantBase):
    """创建租户请求模型"""
    pass


class TenantUpdate(BaseModel):
    """更新租户请求模型"""
    code_id: Optional[str] = Field(None, description="租户编号ID")
    name: Optional[str] = Field(None, description="租户名称")
    description: Optional[str] = Field(None, description="描述")
    app_id: Optional[str] = Field(None, description="应用ID")
    app_secret: Optional[str] = Field(None, description="应用密钥")
    is_active: Optional[bool] = Field(None, description="是否激活")


class TenantResponse(TenantBase):
    """租户响应模型（完整信息）"""
    id: str
    team_code: Optional[str] = Field(None, description="团队代码（系统创建的数据team_code为None）")
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TenantListItem(BaseModel):
    """租户列表项模型（不包含敏感信息）"""
    id: str
    code_id: str
    name: str
    description: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

