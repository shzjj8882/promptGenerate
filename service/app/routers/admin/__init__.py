"""
Admin 路由统一入口
组合所有 admin 子路由
"""
from fastapi import APIRouter
from app.routers.admin import auth, prompts, tenants, scenes, rbac, teams, multi_dimension_tables, llm_models, conversations, mcp, notification_config

router = APIRouter()

# 注册认证相关路由
router.include_router(auth.router, prefix="/auth", tags=["管理接口 > 认证管理"])

# 注册提示词管理相关路由
router.include_router(prompts.router, tags=["管理接口 > 提示词管理"])

# 注册场景相关路由
router.include_router(scenes.router, tags=["管理接口 > 场景管理"])

# 注册租户管理相关路由
router.include_router(tenants.router, prefix="/tenants", tags=["管理接口 > 租户管理"])

# 注册RBAC管理相关路由
router.include_router(rbac.router, prefix="/rbac", tags=["管理接口 > RBAC管理"])

# 注册团队管理相关路由
router.include_router(teams.router, tags=["管理接口 > 团队管理"])

# 注册多维表格管理相关路由
router.include_router(multi_dimension_tables.router, tags=["管理接口 > 多维表格管理"])

# 注册模型管理相关路由
router.include_router(llm_models.router, tags=["管理接口 > 模型管理"])

# 注册会话管理相关路由
router.include_router(conversations.router, tags=["管理接口 > 会话管理"])

# 注册 MCP 配置相关路由
router.include_router(mcp.router, tags=["管理接口 > MCP 配置"])

# 注册通知配置相关路由
router.include_router(notification_config.router, tags=["管理接口 > 通知中心"])

