from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException as FastAPIHTTPException
from sqlalchemy import text, select, func
from sqlalchemy.exc import IntegrityError

from app.core.config import settings

# slowapi 为可选依赖：未安装时禁用限流，应用可正常启动
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.errors import RateLimitExceeded
    _SLOWAPI_AVAILABLE = True
except ImportError:
    _SLOWAPI_AVAILABLE = False

# 无操作限流器（slowapi 未安装时使用）
class _NoOpLimiter:
    def exempt(self, fn):
        return fn


# API 限流：RATE_LIMIT 为空或 slowapi 未安装则禁用
_default_limits = [settings.RATE_LIMIT] if (settings.RATE_LIMIT and settings.RATE_LIMIT.strip()) else []
if _SLOWAPI_AVAILABLE and _default_limits:
    limiter = Limiter(key_func=get_remote_address, default_limits=_default_limits)
else:
    limiter = _NoOpLimiter()

from app.core.database import init_db, engine, AsyncSessionLocal
from app.core.response import ResponseModel
from app.core.middleware import RequestIDAndAuditMiddleware, LimitRequestBodyMiddleware
from app.core.logging_config import configure_logging
from app.routers import admin, api
from app.models.user import User
from app.core.security import get_password_hash
from typing import Optional
import logging
import sys
import traceback

logger = logging.getLogger(__name__)

# 定义 OpenAPI 标签，用于 Swagger UI 中的分组展示
tags_metadata = [
    {
        "name": "管理接口 > 认证管理",
        "description": "用户注册、登录、获取当前用户信息（需要认证）",
    },
    {
        "name": "管理接口 > 提示词管理",
        "description": "提示词和占位符的增删改查（需要认证）",
    },
    {
        "name": "管理接口 > 场景管理",
        "description": "业务场景列表管理（需要认证）",
    },
    {
        "name": "管理接口 > 租户管理",
        "description": "租户信息的增删改查（需要认证）",
    },
    {
        "name": "应用接口 > 销售打单",
        "description": "销售打单相关的业务接口（无需认证）",
    },
    {
        "name": "应用接口 > 提示词",
        "description": "获取提示词的应用接口（无需认证）",
    },
    {
        "name": "应用接口 > 占位符",
        "description": "获取占位符列表的应用接口（无需认证）",
    },
    {
        "name": "应用接口 > LLM Chat",
        "description": "LLM Chat 相关的应用接口（无需认证）",
    },
]

# 生产环境关闭 Swagger/ReDoc，避免暴露 API 结构
_docs_url = "/docs" if settings.ENV.lower() != "production" else None
_redoc_url = "/redoc" if settings.ENV.lower() != "production" else None
_openapi_url = "/openapi.json" if settings.ENV.lower() != "production" else None

app = FastAPI(
    title="PromptHub API",
    description="PromptHub 提示词管理服务 - 支持销售打单、调研、PPT报告等业务场景",
    version="1.0.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
    openapi_tags=tags_metadata,
)
if _SLOWAPI_AVAILABLE and _default_limits:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

# 请求 ID + 管理端变更审计日志（先添加的后执行，故先于 CORS 接触请求）
app.add_middleware(RequestIDAndAuditMiddleware)
# 请求体大小限制（根据 Content-Length 提前拒绝超大请求）
app.add_middleware(LimitRequestBodyMiddleware)
# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 领域异常处理器：将业务异常映射为 HTTP 响应（业务与框架解耦）
from app.domain.exceptions import (
    NotFoundError,
    ValidationError,
    QuotaExceededError,
    PlanExpiredError,
    AccessDeniedError,
    ServiceUnavailableError,
    DomainException,
)
from app.core.exception_mapper import domain_to_http


@app.exception_handler(NotFoundError)
@app.exception_handler(ValidationError)
@app.exception_handler(QuotaExceededError)
@app.exception_handler(PlanExpiredError)
@app.exception_handler(AccessDeniedError)
@app.exception_handler(ServiceUnavailableError)
@app.exception_handler(DomainException)
async def domain_exception_handler(request: Request, exc: DomainException):
    """领域异常 → HTTP 响应"""
    http_exc = domain_to_http(exc)
    return await http_exception_handler(request, http_exc)


# HTTPException 异常处理器
@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    """HTTP 异常处理"""
    response = ResponseModel.error_response(
        message=exc.detail,
        code=exc.status_code
    )
    headers = dict(exc.headers) if exc.headers else {}
    # 确保包含 CORS 头
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        status_code=exc.status_code,
        headers=headers
    )


# 全局异常处理器
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求验证异常处理"""
    errors = exc.errors()
    error_messages = [f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}" for err in errors]
    message = "请求参数验证失败: " + "; ".join(error_messages)
    response = ResponseModel.error_response(
        message=message,
        code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        data={"errors": errors}
    )
    # 确保包含 CORS 头
    origin = request.headers.get("origin")
    headers = {}
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        headers=headers
    )


# 全局异常处理器使用 app logger，确保输出到已配置的 handler
_app_logger = logging.getLogger("app")


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """数据库唯一约束等冲突：转为 422 并给出可读提示"""
    _app_logger.warning("IntegrityError path=%s: %s", getattr(request.url, "path", "-"), exc)
    err_str = str(getattr(exc, "orig", exc))
    msg = "表格行序号冲突，请刷新后重试" if "uq_table_team_row" in err_str else "数据冲突"
    return JSONResponse(
        content=ResponseModel.error_response(message=msg, code=status.HTTP_422_UNPROCESSABLE_ENTITY).model_dump(exclude_none=True),
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        headers=_cors_headers(request),
    )


def _cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        return {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true"}
    return {}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理：仅打日志，不对前端暴露堆栈或异常内容"""
    path = getattr(request, "url", None) and request.url.path or "-"
    method = getattr(request, "method", None) or "-"
    try:
        _app_logger.exception(
            "未捕获异常 path=%s method=%s: %s",
            path,
            method,
            exc,
        )
    except Exception as log_err:
        print(f"[FALLBACK] 未捕获异常 path={path} method={method}: {exc}", file=sys.stderr)
        print(f"[FALLBACK] 日志记录失败: {log_err}", file=sys.stderr)
    # 始终写 stderr，避免仅配置 app logger 时 docker logs 看不到 500 根因
    print(f"[ERROR] 未捕获异常 path={path} method={method}: {exc!r}", file=sys.stderr, flush=True)
    traceback.print_exception(type(exc), exc, exc.__traceback__, file=sys.stderr)
    response = ResponseModel.error_response(
        message="服务器内部错误",
        code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
    # 确保包含 CORS 头
    origin = request.headers.get("origin")
    headers = {}
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return JSONResponse(
        content=response.model_dump(exclude_none=True),
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=headers
    )


# 注册路由
# 注意：不在主路由添加标签，避免在 Swagger 中重复展示
# 各个子模块的标签会作为主要分类
app.include_router(admin.router, prefix="/admin")
app.include_router(api.router, prefix="/api")

# Prometheus 指标端点（/metrics，免限流）
@app.get("/metrics")
@limiter.exempt
async def metrics():
    """Prometheus 格式指标，供监控系统采集"""
    try:
        from prometheus_client import REGISTRY, generate_latest, CONTENT_TYPE_LATEST
        from starlette.responses import Response
        return Response(
            content=generate_latest(REGISTRY),
            media_type=CONTENT_TYPE_LATEST,
        )
    except ImportError:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content={
                "status": "ok",
                "metrics": "disabled",
                "prompt": "pip install prometheus-client for Prometheus metrics",
            },
            status_code=status.HTTP_200_OK,
        )


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    # 统一日志格式（含 request_id），可通过 LOG_JSON_FORMAT=true 启用 JSON 格式
    json_format = getattr(settings, "LOG_JSON_FORMAT", False)
    configure_logging(json_format=bool(json_format), log_level=logging.INFO)

    # 注意：这里假设数据库已经存在
    # 如果数据库不存在，请先运行 python3 scripts/init_db.py 创建数据库
    await init_db()
    # 若场景表为空则插入预置场景（调研、PPT报告、销售打单）
    from app.core.seed_scenes import seed_scenes_if_empty
    await seed_scenes_if_empty()
    # 注册占位符数据获取方法
    from app.services import placeholder_methods_registry
    placeholder_methods_registry.register_placeholder_methods()

    # RBAC/菜单 迁移：版本一致则跳过，不一致则执行并记录版本
    from app.core.migration_config import MIGRATIONS
    from app.core.migration_version import needs_migration, write_applied_version

    migration_need, migration_cur, _ = needs_migration()
    if migration_need:
        try:
            for mod_name, fn_name in MIGRATIONS:
                mod = __import__(f"scripts.{mod_name}", fromlist=[fn_name])
                fn = getattr(mod, fn_name)
                await fn()
            write_applied_version(migration_cur)
            logger.info("RBAC / 菜单迁移已执行完成，版本: %s", migration_cur)
            # 迁移完成后清除菜单树和用户权限缓存
            try:
                from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_pattern
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['menu_tree']}*")
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['user_perm']}*")
                    logger.info("菜单树与用户权限缓存已清除")
            except Exception as cache_err:
                logger.warning("清除菜单树缓存失败（可忽略）: %s", cache_err)
        except Exception as e:
            logger.exception("启动时执行 RBAC / 菜单迁移脚本失败: %s", e)

    # admin 初始化已移至 entrypoint（init_admin_once.py），避免重复输出

    # 可选依赖与功能状态日志
    if _default_limits and not _SLOWAPI_AVAILABLE:
        logger.warning(
            "RATE_LIMIT=%s 已配置，但 slowapi 未安装，限流已禁用。安装: pip install slowapi",
            settings.RATE_LIMIT,
        )
    elif _SLOWAPI_AVAILABLE and _default_limits:
        logger.info("API 限流已启用: %s", settings.RATE_LIMIT)
    try:
        import prometheus_client  # noqa: F401
        logger.info("Prometheus 指标已启用: GET /metrics")
    except ImportError:
        logger.info("prometheus-client 未安装，/metrics 返回占位信息。安装: pip install prometheus-client")


def _generate_admin_password() -> str:
    """生成符合前端登录规则的随机密码：至少 6 位，仅字母+数字，便于输入和复制"""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(12))


async def initialize_default_admin():
    """
    初始化默认系统管理员账号（仅在无超级管理员时创建）:
    - 用户名: admin
    - 密码: 由 INITIAL_ADMIN_PASSWORD 指定（需至少 6 位），或自动生成 12 位字母数字随机密码
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(func.count(User.id)).where(User.is_superuser.is_(True))
        )
        superuser_count = result.scalar() or 0

        if superuser_count > 0:
            logger.info("检测到已有系统超级管理员用户，跳过默认 admin 账号初始化")
            return

        admin_username = "admin"
        admin_email = "admin@example.com"

        # 密码：优先使用环境变量，否则生成 12 位字母数字随机密码（符合前端 min 6 规则）
        if settings.INITIAL_ADMIN_PASSWORD:
            admin_password = settings.INITIAL_ADMIN_PASSWORD
        else:
            admin_password = _generate_admin_password()

        admin_user = User(
            username=admin_username,
            email=admin_email,
            full_name="System Administrator",
            hashed_password=get_password_hash(admin_password),
            is_active=True,
            is_superuser=True,
            is_team_admin=False,
            team_code=None,
            team_id=None,
        )

        session.add(admin_user)
        try:
            await session.commit()
            # print 输出到 stdout，docker compose logs 必定可见（仅输出一次）
            if not getattr(initialize_default_admin, "_printed", False):
                msg = (
                    "\n" + "=" * 50 + "\n"
                    "已创建默认系统管理员账号（请妥善保存）：\n"
                    "  用户名: admin\n"
                    f"  密码:   {admin_password}\n"
                    "=" * 50 + "\n"
                )
                print(msg, flush=True)
                initialize_default_admin._printed = True
            logger.info("默认 admin 账号已创建，密码见上方输出")
        except IntegrityError:
            await session.rollback()
            logger.warning("创建默认 admin 管理员账号时发生唯一约束冲突，可能已被其他进程创建")
        except Exception:
            await session.rollback()
            logger.exception("创建默认 admin 管理员账号失败")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理资源"""
    from app.core.database import close_db
    from app.services.llm_service import LLMService
    await LLMService.close_clients()  # 关闭 HTTP 客户端
    await close_db()


@app.get("/")
@limiter.exempt
async def root():
    """根路径"""
    return ResponseModel.success_response(
        data={"message": "PromptHub API Service", "version": "1.0.0"},
        message="服务运行正常"
    )


@app.get("/health")
@limiter.exempt
async def health_check():
    """
    健康检查：数据库与 Redis 连通性
    - 全部正常返回 200，degraded 时返回 503（便于负载均衡摘除）
    - 包含 version、checks、timestamp
    """
    from datetime import datetime, timezone

    db_ok = "ok"
    db_latency_ms: Optional[float] = None
    try:
        import time
        t0 = time.perf_counter()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        db_ok = "unavailable"

    redis_ok = "ok"
    redis_latency_ms: Optional[float] = None
    try:
        import time
        from app.core.database import redis_client
        if redis_client:
            t0 = time.perf_counter()
            await redis_client.ping()
            redis_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        else:
            redis_ok = "unavailable"
    except Exception:
        redis_ok = "unavailable"

    healthy = db_ok == "ok" and redis_ok == "ok"
    data = {
        "status": "healthy" if healthy else "degraded",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": {"status": db_ok, "latency_ms": db_latency_ms},
            "redis": {"status": redis_ok, "latency_ms": redis_latency_ms},
        },
    }
    status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        content=ResponseModel.success_response(
            data=data,
            message="服务健康" if healthy else "数据库或 Redis 不可用",
        ).model_dump(exclude_none=True),
        status_code=status_code,
    )

