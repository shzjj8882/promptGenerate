"""
将领域异常映射为 HTTP 异常
Router 层调用此模块，实现业务与 HTTP 的解耦
"""
from fastapi import HTTPException, status

from app.domain.exceptions import (
    DomainException,
    NotFoundError,
    ValidationError,
    QuotaExceededError,
    PlanExpiredError,
    AccessDeniedError,
    ServiceUnavailableError,
)


def domain_to_http(exc: BaseException) -> HTTPException:
    """将领域异常转换为 HTTPException"""
    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ValidationError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, QuotaExceededError):
        return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
    if isinstance(exc, PlanExpiredError):
        return HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc))
    if isinstance(exc, AccessDeniedError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, ServiceUnavailableError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    if isinstance(exc, DomainException):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    raise exc


def handle_domain_exceptions(func):
    """装饰器：捕获领域异常并转换为 HTTPException"""
    import functools

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except BaseException as e:
            if isinstance(e, (NotFoundError, ValidationError, QuotaExceededError, AccessDeniedError, DomainException)):
                raise domain_to_http(e)
            raise

    return wrapper
