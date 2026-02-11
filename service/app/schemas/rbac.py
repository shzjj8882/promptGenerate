"""
RBAC（基于角色的访问控制）相关Schema
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from app.schemas.rbac import PermissionResponse


class PermissionBase(BaseModel):
    """权限基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="权限名称")
    code: str = Field(..., min_length=1, max_length=100, description="权限代码（唯一标识）")
    resource: str = Field(..., min_length=1, max_length=50, description="资源（如：tenant, prompts, rbac）")
    action: str = Field(..., min_length=1, max_length=50, description="操作（如：create, list, menu_list）")
    type: Literal["menu", "api", "button"] = Field("api", description="权限类型：menu=菜单, api=接口, button=按钮")
    type_name: Optional[str] = Field(None, max_length=50, description="类型名称，用于展示")
    group_name: Optional[str] = Field(None, max_length=50, description="分组名称，用于前端 groupBy")
    is_system_admin_only: bool = Field(False, description="是否仅系统管理员可见")
    description: Optional[str] = Field(None, max_length=500, description="权限描述")
    parent_id: Optional[str] = Field(None, description="父权限ID（用于菜单层级）")
    sort_order: int = Field(0, description="排序顺序（用于菜单排序）")


class PermissionCreate(PermissionBase):
    """创建权限请求模型"""
    is_active: bool = Field(True, description="是否激活")
    parent_id: Optional[str] = Field(None, description="父权限ID（用于菜单层级）")
    sort_order: int = Field(0, description="排序顺序（用于菜单排序）")


class PermissionUpdate(BaseModel):
    """更新权限请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="权限名称")
    type: Optional[Literal["menu", "api", "button"]] = Field(None, description="权限类型")
    type_name: Optional[str] = Field(None, max_length=50, description="类型名称")
    group_name: Optional[str] = Field(None, max_length=50, description="分组名称")
    is_system_admin_only: Optional[bool] = Field(None, description="是否仅系统管理员可见")
    description: Optional[str] = Field(None, max_length=500, description="权限描述")
    parent_id: Optional[str] = Field(None, description="父权限ID（用于菜单层级）")
    sort_order: Optional[int] = Field(None, description="排序顺序（用于菜单排序）")
    is_active: Optional[bool] = Field(None, description="是否激活")


class PermissionResponse(PermissionBase):
    """权限响应模型"""
    id: str
    type: str = "api"
    type_name: Optional[str] = None
    group_name: Optional[str] = None
    is_system_admin_only: bool = False
    parent_id: Optional[str] = None
    sort_order: int = 0
    is_active: bool
    created_at: datetime
    updated_at: datetime
    children: Optional[List["PermissionResponse"]] = Field(default_factory=list, description="子权限列表（用于菜单树）")

    class Config:
        from_attributes = True


class MenuTreeNode(BaseModel):
    """菜单树节点模型（专门用于菜单树 API）"""
    id: str
    name: str
    code: str
    resource: str
    action: str
    type: str
    description: Optional[str] = None
    parent_id: Optional[str] = Field(None, description="父权限ID（None 表示根节点）")
    sort_order: int = Field(0, description="排序顺序")
    is_active: bool
    children: List["MenuTreeNode"] = Field(default_factory=list, description="子菜单列表")
    
    class Config:
        from_attributes = True
        populate_by_name = True  # 允许使用别名
        json_encoders = {
            # 确保正确序列化
        }


class RoleBase(BaseModel):
    """角色基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="角色名称")
    code: str = Field(..., min_length=1, max_length=100, description="角色代码（唯一标识）")
    description: Optional[str] = Field(None, max_length=500, description="角色描述")


class RoleCreate(RoleBase):
    """创建角色请求模型"""
    is_active: bool = Field(True, description="是否激活")
    permission_ids: Optional[List[str]] = Field(default_factory=list, description="权限ID列表")


class RoleUpdate(BaseModel):
    """更新角色请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="角色名称")
    description: Optional[str] = Field(None, max_length=500, description="角色描述")
    is_active: Optional[bool] = Field(None, description="是否激活")
    permission_ids: Optional[List[str]] = Field(None, description="权限ID列表")


class RoleResponse(RoleBase):
    """角色响应模型"""
    id: str
    team_code: Optional[str] = Field(None, description="团队代码（None表示全局角色）")
    is_active: bool
    permissions: List[PermissionResponse] = Field(default_factory=list, description="权限列表")
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserRoleAssign(BaseModel):
    """用户角色分配请求模型"""
    user_id: str = Field(..., description="用户ID")
    role_ids: List[str] = Field(..., min_items=0, description="角色ID列表")


class RolePermissionAssign(BaseModel):
    """角色权限分配请求模型"""
    role_id: str = Field(..., description="角色ID")
    permission_ids: List[str] = Field(..., min_items=0, description="权限ID列表")

