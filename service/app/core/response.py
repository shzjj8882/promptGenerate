"""
统一响应模型
"""
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar('T')


class ResponseModel(BaseModel, Generic[T]):
    """统一响应模型"""
    success: bool
    code: int
    message: str
    data: Optional[T] = None

    @classmethod
    def success_response(cls, data: T = None, message: str = "操作成功", code: int = 200):
        """成功响应"""
        return cls(success=True, code=code, message=message, data=data)

    @classmethod
    def error_response(cls, message: str = "操作失败", code: int = 400, data: T = None):
        """错误响应"""
        return cls(success=False, code=code, message=message, data=data)

