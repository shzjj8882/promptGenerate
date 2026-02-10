from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator
from typing import List, Union
import os

# 生产环境禁止使用的默认 SECRET_KEY
_DEFAULT_SECRET_KEY = "your-secret-key-here-change-in-production"


class Settings(BaseSettings):
    # 应用配置
    APP_NAME: str = "AILY API"
    DEBUG: bool = False
    # 环境：仅当 ENV=production 时强制校验 SECRET_KEY 不可为默认值；未设置或 development 时允许默认值便于本地开发
    ENV: str = Field(default="development", description="development | production")
    
    # 数据库配置
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "aily_db"
    
    # Redis 配置
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0
    
    # CORS 配置（从环境变量读取，支持逗号分隔）
    # 先定义为字符串类型，然后在验证器中转换为列表
    CORS_ORIGINS: Union[str, List[str]] = Field(
        default="http://localhost:3000,http://localhost:3001",
        description="CORS允许的源，逗号分隔"
    )
    
    # JWT 配置（生产环境必须在 .env 中设置 SECRET_KEY，且不可为默认占位符）
    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # 应用接口 /api 可选鉴权：设置后请求头需带 X-API-Key: <API_KEY>，不设置则 /api 无需鉴权
    API_KEY: str = Field(default="", description="可选，设置后 /api 接口需在请求头携带 X-API-Key")
    
    # DeepSeek API 配置
    DEEPSEEK_API_KEY: str = Field(default="", description="DeepSeek API密钥")
    DEEPSEEK_API_BASE: str = Field(default="https://api.deepseek.com/v1", description="DeepSeek API基础URL")
    DEEPSEEK_MODEL: str = Field(default="deepseek-chat", description="DeepSeek模型名称")
    
    model_config = SettingsConfigDict(
        # Docker 环境中优先使用环境变量，只在本地开发且文件存在时读取 .env
        # 检查是否在容器中（通过检查 /proc/1/cgroup 或环境变量）
        env_file=".env" if os.path.exists(".env") and not os.path.exists("/.dockerenv") else None,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """将逗号分隔的字符串转换为列表"""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def check_secret_key_in_production(self):
        """仅当 ENV=production 时禁止使用默认 SECRET_KEY；本地开发可不设置 ENV 或 ENV=development"""
        if self.ENV.lower() == "production" and self.SECRET_KEY == _DEFAULT_SECRET_KEY:
            raise ValueError(
                "ENV=production 时必须在 .env 中设置 SECRET_KEY，且不可使用默认占位符 "
                "'your-secret-key-here-change-in-production'"
            )
        return self


settings = Settings()

