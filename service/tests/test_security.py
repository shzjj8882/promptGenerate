"""
核心安全模块单元测试：密码哈希、JWT 等
"""
import pytest
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    verify_token,
)


class TestPasswordHashing:
    """密码哈希与验证"""

    def test_hash_and_verify_roundtrip(self):
        """哈希后能正确验证"""
        password = "my-secret-password"
        hashed = get_password_hash(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self):
        """错误密码验证失败"""
        hashed = get_password_hash("correct")
        assert verify_password("wrong", hashed) is False

    def test_empty_password(self):
        """空密码可哈希（边界情况）"""
        hashed = get_password_hash("")
        assert verify_password("", hashed) is True

    def test_long_password_over_72_bytes(self):
        """超过 72 字节的密码能正确处理（SHA256 预处理）"""
        long_pwd = "a" * 100
        hashed = get_password_hash(long_pwd)
        assert verify_password(long_pwd, hashed) is True
        assert verify_password(long_pwd + "x", hashed) is False


class TestJWT:
    """JWT 创建与验证"""

    def test_create_and_verify_token(self):
        """创建 token 后能正确解析"""
        payload = {"sub": "user-123", "scope": "admin"}
        token = create_access_token(payload)
        assert isinstance(token, str)
        decoded = verify_token(token)
        assert decoded is not None
        assert decoded.get("sub") == "user-123"
        assert "exp" in decoded

    def test_invalid_token_returns_none(self):
        """无效 token 返回 None"""
        assert verify_token("invalid.jwt.token") is None
        assert verify_token("") is None
        assert verify_token("not-even-jwt") is None
