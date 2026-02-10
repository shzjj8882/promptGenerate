"""
统一响应工具函数
"""
from fastapi.responses import JSONResponse
from typing import Optional, Any
from app.core.response import ResponseModel


def success_response(
    data: Any = None,
    message: str = "操作成功",
    code: int = 200,
    status_code: int = 200
) -> JSONResponse:
    """成功响应"""
    response = ResponseModel.success_response(data=data, message=message, code=code)
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        status_code=status_code
    )


def error_response(
    message: str = "操作失败",
    code: int = 400,
    data: Any = None,
    status_code: int = 400
) -> JSONResponse:
    """错误响应"""
    response = ResponseModel.error_response(data=data, message=message, code=code)
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        status_code=status_code
    )

