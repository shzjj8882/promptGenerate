from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")


class UserCreate(UserBase):
    """创建用户请求模型"""
    password: str = Field(..., min_length=6, description="密码")
    team_code: str = Field(..., min_length=2, max_length=50, description="团队代码")


class UserLogin(BaseModel):
    """用户登录请求模型"""
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class UserResponse(UserBase):
    """用户响应模型"""
    id: str
    team_code: Optional[str] = None
    team_id: Optional[str] = None  # 团队外键（用于优化查询）
    is_active: bool
    is_superuser: bool
    is_team_admin: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token 响应模型"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Token 数据模型"""
    username: Optional[str] = None


class UserUpdate(BaseModel):
    """更新用户信息请求模型"""
    email: Optional[EmailStr] = Field(None, description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")


class UserPasswordUpdate(BaseModel):
    """更新密码请求模型"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, description="新密码")


class UserAdminUpdate(BaseModel):
    """管理员更新用户信息请求模型"""
    email: Optional[EmailStr] = Field(None, description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")
    is_active: Optional[bool] = Field(None, description="是否激活")
    is_team_admin: Optional[bool] = Field(None, description="是否为团队管理员")
    team_code: Optional[str] = Field(None, min_length=2, max_length=50, description="团队代码")


class UserInviteRequest(BaseModel):
    """团队成员邀请请求模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")
    password: str = Field(..., min_length=6, description="初始密码")


class UserCreateByAdminRequest(BaseModel):
    """系统管理员创建用户请求模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")
    password: str = Field(..., min_length=6, description="初始密码")
    team_code: str = Field(..., min_length=2, max_length=50, description="团队代码")
    is_team_admin: Optional[bool] = Field(False, description="是否为团队管理员")

