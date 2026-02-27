"""
组合配置 Schema
"""
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class CompositionBase(BaseModel):
    """组合基础模型"""
    name: str = Field(..., min_length=1, max_length=255, description="组合名称")
    mode: str = Field("chat", description="模式：chat（LLM消息）| api（接口）")
    scene: str = Field(..., min_length=1, max_length=100, description="场景代码")
    tenant_id: str = Field("default", description="租户ID，default 表示默认提示词")
    prompt_id: Optional[str] = Field(None, description="关联提示词 ID")
    model_id: Optional[str] = Field(None, description="默认模型 ID")
    mcp_id: Optional[str] = Field(None, description="默认 MCP 配置 ID")
    mcp_tool_names: Optional[List[str]] = Field(default_factory=list, description="MCP 工具名列表")
    task_mode: str = Field("sync", description="接口模式：sync | async")
    notification_config: Optional[dict] = Field(None, description="异步任务通知配置")
    sort_order: int = Field(0, ge=0, description="排序顺序")


class CompositionCreate(CompositionBase):
    """创建组合请求"""
    pass


class CompositionUpdate(BaseModel):
    """更新组合请求（模式不可修改）"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    scene: Optional[str] = Field(None, min_length=1, max_length=100)
    tenant_id: Optional[str] = None
    prompt_id: Optional[str] = None
    model_id: Optional[str] = None
    mcp_id: Optional[str] = None
    mcp_tool_names: Optional[List[str]] = None
    task_mode: Optional[str] = None
    notification_config: Optional[dict] = None
    sort_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class CompositionResponse(CompositionBase):
    """组合响应"""
    id: str
    team_id: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True
