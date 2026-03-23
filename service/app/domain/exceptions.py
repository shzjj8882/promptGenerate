"""
领域异常：与 HTTP 无关的业务错误
Service/Application 层抛出领域异常，由 Router（HTTP 适配器）映射为 HTTP 状态码
"""
from __future__ import annotations


class DomainException(Exception):
    """领域异常基类"""

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.code = code


class NotFoundError(DomainException):
    """实体不存在"""

    def __init__(self, entity: str, identifier: str | None = None, message: str | None = None):
        msg = message or (f"{entity} 不存在" + (f"：{identifier}" if identifier else ""))
        super().__init__(msg)
        self.entity = entity
        self.identifier = identifier


class ValidationError(DomainException):
    """校验失败（格式、业务规则）"""


class QuotaExceededError(DomainException):
    """配额超限"""


class PlanExpiredError(DomainException):
    """套餐已过期"""


class AccessDeniedError(DomainException):
    """无权限访问"""


class ServiceUnavailableError(DomainException):
    """依赖服务不可用（如 Redis）"""
