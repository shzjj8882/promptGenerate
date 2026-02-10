"""
会话记录 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import json


class ConversationMessageBase(BaseModel):
    """会话消息基础 Schema"""
    role: str = Field(..., description="角色：system、user、assistant")
    content: str = Field(..., description="消息内容")
    meta_data: Optional[Dict[str, Any]] = Field(None, alias="metadata", description="额外元数据")
    
    class Config:
        populate_by_name = True


class ConversationMessageCreate(ConversationMessageBase):
    """创建会话消息 Schema"""
    pass


class ConversationMessageResponse(ConversationMessageBase):
    """会话消息响应 Schema"""
    id: str
    conversation_id: str
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = Field(None, description="额外元数据（兼容字段）")
    
    class Config:
        from_attributes = True
        populate_by_name = True
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        # 将数据库的 meta_data 字段映射到 metadata
        if hasattr(obj, 'meta_data'):
            obj_dict = {**obj.__dict__}
            if obj.meta_data:
                try:
                    obj_dict['metadata'] = json.loads(obj.meta_data) if isinstance(obj.meta_data, str) else obj.meta_data
                except:
                    obj_dict['metadata'] = None
            else:
                obj_dict['metadata'] = None
            return super().model_validate(obj_dict, **kwargs)
        return super().model_validate(obj, **kwargs)


class ConversationBase(BaseModel):
    """会话基础 Schema"""
    scene: str = Field(..., description="场景代码")
    title: Optional[str] = Field(None, description="会话标题")
    meta_data: Optional[Dict[str, Any]] = Field(None, alias="metadata", description="额外元数据")
    
    class Config:
        populate_by_name = True


class ConversationCreate(ConversationBase):
    """创建会话 Schema"""
    tenant_id: Optional[str] = Field(None, description="租户ID（可选）")


class ConversationUpdate(BaseModel):
    """更新会话 Schema"""
    title: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = Field(None, alias="metadata")
    
    class Config:
        populate_by_name = True


class ConversationResponse(ConversationBase):
    """会话响应 Schema"""
    id: str
    team_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[ConversationMessageResponse] = []
    metadata: Optional[Dict[str, Any]] = Field(None, description="额外元数据（兼容字段）")
    
    class Config:
        from_attributes = True
        populate_by_name = True
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        # 将数据库的 meta_data 字段映射到 metadata
        if hasattr(obj, 'meta_data'):
            obj_dict = {**obj.__dict__}
            if obj.meta_data:
                try:
                    obj_dict['metadata'] = json.loads(obj.meta_data) if isinstance(obj.meta_data, str) else obj.meta_data
                except:
                    obj_dict['metadata'] = None
            else:
                obj_dict['metadata'] = None
            return super().model_validate(obj_dict, **kwargs)
        return super().model_validate(obj, **kwargs)


class ConversationWithMessagesResponse(ConversationResponse):
    """包含消息的会话响应 Schema"""
    messages: List[ConversationMessageResponse] = []
