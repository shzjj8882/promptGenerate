"""
通知配置 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class NotificationConfigEmail(BaseModel):
    """SendCloud 邮件配置"""
    api_user: str = Field(..., description="SendCloud API 用户")
    api_key: str = Field(..., description="SendCloud API 密钥")
    from_email: str = Field(..., description="发件人邮箱")
    from_name: str = Field(..., description="发件人名称")


class NotificationConfigUpdate(BaseModel):
    """更新通知配置"""
    name: Optional[str] = Field(None, description="显示名称")
    config: Optional[Dict[str, Any]] = Field(None, description="配置信息（JSON）")
    is_active: Optional[bool] = Field(None, description="是否启用")


class NotificationConfigResponse(BaseModel):
    """通知配置响应（api_key 脱敏）"""
    id: str
    type: str
    name: str
    config: Optional[Dict[str, Any]] = None  # 返回时 api_key 脱敏
    is_active: bool
    team_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationConfigListResponse(BaseModel):
    """通知配置列表项（用于前端卡片展示）"""
    id: str
    type: str
    name: str
    is_configured: bool = Field(..., description="是否已配置（config 非空）")
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
