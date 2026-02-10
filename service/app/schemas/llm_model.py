"""
LLM 模型配置 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
import json


class LLMModelBase(BaseModel):
    """LLM 模型基础 Schema"""
    name: str = Field(..., description="模型显示名称")
    provider: str = Field(..., description="提供商（如：openai、anthropic、deepseek、ollama）")
    model: str = Field(..., description="模型标识")
    api_key: Optional[str] = Field(None, description="API 密钥")
    api_base: Optional[str] = Field(None, description="API 基础 URL")
    default_temperature: Optional[str] = Field("0.3", description="默认温度参数")
    default_max_tokens: Optional[int] = Field(None, description="默认最大 token 数")
    description: Optional[str] = Field(None, description="模型描述")
    extra_config: Optional[Dict[str, Any]] = Field(None, alias="config", description="额外配置（JSON格式）")
    is_active: bool = Field(True, description="是否激活")
    is_default: bool = Field(False, description="是否为团队的默认模型")
    
    class Config:
        populate_by_name = True


class LLMModelCreate(LLMModelBase):
    """创建 LLM 模型 Schema"""
    team_id: Optional[str] = Field(None, description="团队ID，NULL表示全局配置")


class LLMModelUpdate(BaseModel):
    """更新 LLM 模型 Schema"""
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    default_temperature: Optional[str] = None
    default_max_tokens: Optional[int] = None
    description: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = Field(None, alias="config")
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    
    class Config:
        populate_by_name = True


class LLMModelResponse(LLMModelBase):
    """LLM 模型响应 Schema"""
    id: str
    team_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    config: Optional[Dict[str, Any]] = Field(None, description="额外配置（兼容字段）")
    
    class Config:
        from_attributes = True
        populate_by_name = True
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        # 将数据库的 extra_config 字段映射到 config
        if hasattr(obj, 'extra_config'):
            obj_dict = {**obj.__dict__}
            if obj.extra_config:
                try:
                    obj_dict['config'] = json.loads(obj.extra_config) if isinstance(obj.extra_config, str) else obj.extra_config
                except:
                    obj_dict['config'] = None
            else:
                obj_dict['config'] = None
            return super().model_validate(obj_dict, **kwargs)
        return super().model_validate(obj, **kwargs)
