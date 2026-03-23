from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator
from typing import List, Union
import os

# 生产环境禁止使用的默认 SECRET_KEY
_DEFAULT_SECRET_KEY = "your-secret-key-here-change-in-production"


class Settings(BaseSettings):
    # 应用配置
    APP_NAME: str = "PromptHub API"
    DEBUG: bool = False
    # 环境：仅当 ENV=production 时强制校验 SECRET_KEY 不可为默认值；未设置或 development 时允许默认值便于本地开发
    ENV: str = Field(default="development", description="development | production")
    
    # 数据库配置
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "prompthub_db"
    
    # Redis 配置
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0

    # LLM Chat 异步任务队列（Redis Stream）
    LLMCHAT_STREAM_NAME: str = Field(default="llmchat:tasks", description="异步任务队列 Stream 名称")
    # 接口模式默认走异步队列（减轻 API 压力），设为 False 则保持同步阻塞
    LLM_API_ASYNC_DEFAULT: bool = Field(default=True, description="接口模式默认异步队列，sync=true 可覆盖")
    
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

    # 首次初始化 admin 账号：若设置则使用此密码，否则自动生成随机密码并打印到日志
    INITIAL_ADMIN_PASSWORD: str = Field(default="", description="可选，首次创建 admin 时的密码；不设置则自动生成并打印")
    
    # 日志：LOG_JSON_FORMAT=true 时输出 JSON 格式（便于生产环境采集）
    LOG_JSON_FORMAT: bool = Field(default=False, description="日志 JSON 格式")

    # 请求体限制（防止超大请求耗尽资源）
    REQUEST_USER_MESSAGE_MAX_LENGTH: int = Field(default=50000, description="user_message 最大字符数")
    REQUEST_ADDITIONAL_PARAMS_MAX_BYTES: int = Field(default=102400, description="additional_params JSON 最大字节数（约 100KB）")
    REQUEST_BODY_MAX_BYTES: int = Field(default=1048576, description="请求体全局最大字节数（默认 1MB），0 表示不限制")

    # API 限流：格式如 "100/minute" 或 "10/second"，空字符串表示不启用
    RATE_LIMIT: str = Field(default="60/minute", description="API 限流，如 60/minute，空则禁用")

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

    @field_validator("INITIAL_ADMIN_PASSWORD")
    @classmethod
    def validate_initial_admin_password(cls, v: str) -> str:
        """若设置了 INITIAL_ADMIN_PASSWORD，须至少 6 位（与前端登录规则一致）"""
        if v and len(v) < 6:
            raise ValueError("INITIAL_ADMIN_PASSWORD 至少需要 6 个字符（与前端登录规则一致）")
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

