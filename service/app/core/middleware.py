# -*- coding: utf-8 -*-
"""请求 ID 与管理端操作审计日志中间件"""
import logging
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)


class RequestIDAndAuditMiddleware(BaseHTTPMiddleware):
    """为每个请求生成 request_id 并写入响应头；对 /admin 的变更请求打审计日志。"""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if request.url.path.startswith("/admin") and request.method in (
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        ):
            logger.info(
                "admin_audit request_id=%s method=%s path=%s",
                request_id,
                request.method,
                request.url.path,
            )
        return response
