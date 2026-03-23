"""
领域层：纯业务逻辑，不依赖 Web 框架、ORM
"""
from app.domain.exceptions import (
    DomainException,
    NotFoundError,
    ValidationError,
    QuotaExceededError,
    PlanExpiredError,
    AccessDeniedError,
    ServiceUnavailableError,
)

__all__ = [
    "DomainException",
    "NotFoundError",
    "ValidationError",
    "QuotaExceededError",
    "PlanExpiredError",
    "AccessDeniedError",
    "ServiceUnavailableError",
]
