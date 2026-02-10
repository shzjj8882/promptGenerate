import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserCreate
import hashlib


def _prepare_password(password: str) -> bytes:
    """
    预处理密码以解决 bcrypt 72 字节限制
    如果密码超过 72 字节，使用 SHA256 先哈希（32 字节），确保不超过限制
    """
    password_bytes = password.encode('utf-8')
    
    # bcrypt 限制是 72 字节
    # 如果密码超过 72 字节，先用 SHA256 哈希（32 字节）
    if len(password_bytes) > 72:
        password_hash = hashlib.sha256(password_bytes).digest()  # 使用 digest() 而不是 hexdigest()
        return password_hash
    
    return password_bytes


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # 预处理密码以匹配哈希时的处理方式
    prepared_password = _prepare_password(plain_password)
    # bcrypt 的哈希字符串是 bytes，需要编码
    hashed_bytes = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
    return bcrypt.checkpw(prepared_password, hashed_bytes)


def get_password_hash(password: str) -> str:
    """加密密码"""
    # 预处理密码以解决 bcrypt 72 字节限制
    prepared_password = _prepare_password(password)
    # 生成 salt 并哈希密码
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prepared_password, salt)
    # 返回字符串格式
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌（使用 UTC 时间）"""
    to_encode = data.copy()
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        expire = now_utc + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """验证令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

