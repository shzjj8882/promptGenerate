"""
MCP 配置 Schema
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import json


class MCPToolSchema(BaseModel):
    """MCP 工具 Schema"""
    name: str = Field(..., description="工具名称")
    title: Optional[str] = Field(None, description="工具显示标题")
    description: Optional[str] = Field(None, description="工具描述")


class MCPConfigBase(BaseModel):
    """MCP 配置基础 Schema"""
    name: str = Field(..., description="MCP 显示名称")
    url: str = Field(..., description="MCP 服务地址（HTTP SSE 或 Streamable HTTP 端点）")
    transport_type: str = Field("sse", description="传输协议：sse | streamable_http")
    auth_info: Optional[Dict[str, Any]] = Field(None, description="MCP 授权信息（JSON 格式，如 headers）")
    is_active: bool = Field(True, description="是否激活")

    class Config:
        populate_by_name = True


class MCPConfigCreate(MCPConfigBase):
    """创建 MCP 配置 Schema"""
    team_id: Optional[str] = Field(None, description="团队ID，NULL表示全局配置")


class MCPConfigUpdate(BaseModel):
    """更新 MCP 配置 Schema"""
    name: Optional[str] = None
    url: Optional[str] = None
    transport_type: Optional[str] = None
    auth_info: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class MCPConfigResponse(MCPConfigBase):
    """MCP 配置响应 Schema"""
    id: str
    team_id: Optional[str] = None
    tools_cache: Optional[List[Dict[str, Any]]] = Field(None, description="缓存的工具列表")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True

    @classmethod
    def model_validate(cls, obj, **kwargs):
        if hasattr(obj, "tools_cache") and obj.tools_cache:
            try:
                tools = json.loads(obj.tools_cache) if isinstance(obj.tools_cache, str) else obj.tools_cache
            except Exception:
                tools = None
        else:
            tools = None
        obj_dict = {**obj.__dict__, "tools_cache": tools}
        return super().model_validate(obj_dict, **kwargs)


class MCPVerifyRequest(BaseModel):
    """MCP 验证请求 Schema"""
    url: str = Field(..., description="MCP 服务地址")
    transport_type: str = Field("sse", description="传输协议：sse | streamable_http")
    auth_info: Optional[Dict[str, Any]] = Field(None, description="MCP 授权信息")


class MCPVerifyResponse(BaseModel):
    """MCP 验证响应 Schema"""
    success: bool = Field(..., description="是否联通成功")
    message: Optional[str] = Field(None, description="提示信息")
    tools: Optional[List[Dict[str, Any]]] = Field(None, description="获取到的工具列表")
