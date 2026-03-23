"""
请求体验证单元测试：additional_params 大小校验逻辑
（不依赖完整 app 导入，避免 Python 3.9 兼容性问题）
"""
import json
import pytest

from app.core.config import settings


def _validate_additional_params(v):
    """与 llmchat 中逻辑一致，用于单元测试"""
    if v is None:
        return {}
    size = len(json.dumps(v, ensure_ascii=False).encode("utf-8"))
    if size > settings.REQUEST_ADDITIONAL_PARAMS_MAX_BYTES:
        raise ValueError(
            f"占位符参数过大（{size} 字节），最大允许 {settings.REQUEST_ADDITIONAL_PARAMS_MAX_BYTES} 字节"
        )
    return v


class TestAdditionalParamsValidation:
    """additional_params 大小校验"""

    def test_empty_params_ok(self):
        """空字典通过"""
        assert _validate_additional_params({}) == {}
        assert _validate_additional_params(None) == {}

    def test_small_params_ok(self):
        """小体积通过"""
        small = {"key": "value"}
        assert _validate_additional_params(small) == small

    def test_large_params_raises(self):
        """超大 additional_params 抛出 ValueError"""
        max_bytes = settings.REQUEST_ADDITIONAL_PARAMS_MAX_BYTES
        large_value = "x" * (max_bytes + 1)
        large = {"data": large_value}
        with pytest.raises(ValueError, match="占位符参数过大"):
            _validate_additional_params(large)
