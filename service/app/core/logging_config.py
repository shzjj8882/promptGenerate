# -*- coding: utf-8 -*-
"""
统一日志配置：格式含 request_id、level、message。
通过 contextvars 传递 request_id，中间件设置后业务 logger 可自动带上。
"""
import contextvars
import logging
import sys
from typing import Optional

# 请求上下文中存储 request_id，供日志格式使用
request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)


class RequestIDFilter(logging.Filter):
    """为 LogRecord 注入 request_id（从 contextvars 读取）"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"
        return True


def configure_logging(
    json_format: bool = False,
    log_level: int = logging.INFO,
) -> None:
    """
    配置应用日志格式。
    - json_format: 生产环境可设为 True 输出 JSON 便于采集
    - log_level: 日志级别
    """
    app_logger = logging.getLogger("app")
    app_logger.setLevel(log_level)
    app_logger.propagate = False
    # 避免重复添加 handler
    if app_logger.handlers:
        for h in app_logger.handlers[:]:
            app_logger.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.addFilter(RequestIDFilter())

    if json_format:
        # 简单 JSON 格式（生产环境可接入 ELK 等）；message 中引号需转义
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                msg = record.getMessage().replace('"', '\\"').replace("\n", " ")
                return (
                    f'{{"request_id":"{getattr(record, "request_id", "-")}",'
                    f'"level":"{record.levelname}",'
                    f'"message":"{msg}",'
                    f'"logger":"{record.name}"}}'
                )

        handler.setFormatter(JsonFormatter())
    else:
        # 统一格式：含 request_id
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(request_id)s] %(levelname)s %(name)s: %(message)s"
            )
        )
    app_logger.addHandler(handler)
