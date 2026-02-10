"""
团队相关 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class TeamBase(BaseModel):
    """团队基础模型"""
    code: str = Field(..., min_length=2, max_length=50, description="团队代码（唯一标识）")
    name: str = Field(..., min_length=1, max_length=100, description="团队名称")
    description: Optional[str] = Field(None, max_length=500, description="团队描述")


class TeamCreate(BaseModel):
    """创建团队请求模型"""
    code: str = Field(..., min_length=2, max_length=50, description="团队代码（唯一标识）")
    name: str = Field(..., min_length=1, max_length=100, description="团队名称")
    description: Optional[str] = Field(None, max_length=500, description="团队描述")


class TeamUpdate(BaseModel):
    """更新团队请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="团队名称")
    is_active: Optional[bool] = Field(None, description="是否激活")


class TeamResponse(TeamBase):
    """团队响应模型"""
    id: str
    authcode: Optional[str] = None  # API 认证码（用于调用 /api 接口）
    is_active: bool
    is_system_admin_team: bool = False  # 是否为系统管理员团队
    member_count: Optional[int] = None  # 团队成员数量（可选，由接口填充）
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
