"""RBAC 管理路由：权限、角色、用户角色分配"""
from fastapi import APIRouter

from . import permissions, roles, user_roles

router = APIRouter()
router.include_router(permissions.router, tags=["管理接口 > RBAC管理"])
router.include_router(roles.router, tags=["管理接口 > RBAC管理"])
router.include_router(user_roles.router, tags=["管理接口 > RBAC管理"])
