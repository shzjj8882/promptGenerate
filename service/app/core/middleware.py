# -*- coding: utf-8 -*-
"""请求 ID、请求体大小限制、管理端操作审计日志中间件"""
import logging
import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.logging_config import request_id_ctx
from app.core.config import settings
from app.core.response import ResponseModel

logger = logging.getLogger(__name__)


class LimitRequestBodyMiddleware(BaseHTTPMiddleware):
    """
    请求体大小限制：根据 Content-Length 提前拒绝超大请求，防止 DoS。
    仅对有 Content-Length 的请求生效；分块传输时由 Pydantic 校验兜底。
    """

    async def dispatch(self, request: Request, call_next):
        max_bytes = getattr(settings, "REQUEST_BODY_MAX_BYTES", 0) or 0
        if max_bytes <= 0:
            return await call_next(request)

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content=ResponseModel.error_response(
                            message=f"请求体过大（{size} 字节），最大允许 {max_bytes} 字节",
                            code=413,
                        ).model_dump(exclude_none=True),
                    )
            except ValueError:
                pass
        return await call_next(request)


class RequestIDAndAuditMiddleware(BaseHTTPMiddleware):
    """为每个请求生成 request_id 并写入响应头；记录请求/响应日志；对 /admin 的变更请求打审计日志。"""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        token = request_id_ctx.set(request_id)
        try:
            start_time = time.perf_counter()
            response = await call_next(request)
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id

            logger.info(
                "request_id=%s method=%s path=%s status_code=%s duration_ms=%d",
                request_id,
                request.method,
                request.url.path,
                status_code,
                duration_ms,
            )
            if request.url.path.startswith("/admin") and request.method in (
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
            ):
                logger.info(
                    "admin_audit request_id=%s method=%s path=%s status_code=%s duration_ms=%d",
                    request_id,
                    request.method,
                    request.url.path,
                    status_code,
                    duration_ms,
                )
            return response
        finally:
            request_id_ctx.reset(token)
