"""
用户工作台布局配置 Schema
"""
from typing import Any, List
from pydantic import BaseModel, Field


class LayoutItem(BaseModel):
    """react-grid-layout 单个布局项"""

    i: str
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 3
    minW: int | None = None
    minH: int | None = None
    static: bool | None = None


class DashboardConfigResponse(BaseModel):
    """工作台配置响应"""

    layout: List[dict[str, Any]] = Field(default_factory=list, description="布局配置数组")


class DashboardConfigUpdate(BaseModel):
    """工作台配置更新请求"""

    layout: List[dict[str, Any]] = Field(default_factory=list, description="布局配置数组")
