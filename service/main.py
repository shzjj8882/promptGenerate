from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException as FastAPIHTTPException
from sqlalchemy import text, select, func
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.database import init_db, engine, AsyncSessionLocal
from app.core.response import ResponseModel
from app.core.middleware import RequestIDAndAuditMiddleware
from app.routers import admin, api
from app.models.user import User
from app.core.security import get_password_hash
import logging

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

app = FastAPI(
    title="AILY API",
    description="AILY 提示词管理服务 - 支持销售打单、调研、PPT报告等业务场景",
    version="1.0.0",
    docs_url="/docs",  # Swagger UI 路径
    redoc_url="/redoc",  # ReDoc 路径
    openapi_url="/openapi.json",  # OpenAPI JSON 路径
    openapi_tags=tags_metadata,  # 标签元数据
)

# 请求 ID + 管理端变更审计日志（先添加的后执行，故先于 CORS 接触请求）
app.add_middleware(RequestIDAndAuditMiddleware)
# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理：仅打日志，不对前端暴露堆栈或异常内容"""
    logger.exception("未捕获异常")
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


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化数据库"""
    # 注意：这里假设数据库已经存在
    # 如果数据库不存在，请先运行 python3 scripts/init_db.py 创建数据库
    await init_db()
    # 若场景表为空则插入预置场景（调研、PPT报告、销售打单）
    from app.core.seed_scenes import seed_scenes_if_empty
    await seed_scenes_if_empty()
    # 注册占位符数据获取方法
    from app.services import placeholder_methods_registry
    placeholder_methods_registry.register_placeholder_methods()

    # 在服务启动时自动执行与 RBAC / 菜单 相关的迁移脚本（幂等，可重复执行）
    # 这样就不需要手动到 scripts/ 目录逐个运行，确保团队管理员创建后能立即获得完整菜单
    try:
        from scripts import (
            migrate_rbac,
            migrate_permission_menu_type,
            migrate_permission_config_fields,
            migrate_add_config_menu,
            migrate_add_models_menu,
            migrate_add_tables_menu,
            migrate_add_tables_menu_button_permissions,
            migrate_add_team_menu,
            migrate_add_rbac_submenus,
            migrate_api_permissions,
            migrate_add_tables_api_permissions,
            migrate_add_reset_authcode_permission,
            migrate_remove_team_auth_menu,
            migrate_add_mcp_menu,
            migrate_add_mcp_api_permissions,
            migrate_add_mcp_transport_type,
        )

        # 这些脚本内部都使用 asyncpg 并带有「IF NOT EXISTS / 已存在则跳过」等幂等逻辑
        await migrate_rbac.migrate()
        await migrate_permission_menu_type.migrate()
        await migrate_permission_config_fields.migrate()
        await migrate_add_config_menu.migrate()
        await migrate_add_models_menu.migrate()
        await migrate_add_tables_menu.migrate()
        await migrate_add_tables_menu_button_permissions.migrate()
        await migrate_add_team_menu.migrate()
        await migrate_add_rbac_submenus.migrate()
        await migrate_api_permissions.migrate()
        await migrate_add_tables_api_permissions.migrate()
        await migrate_add_reset_authcode_permission.migrate()
        await migrate_remove_team_auth_menu.migrate()
        await migrate_add_mcp_menu.migrate()
        await migrate_add_mcp_api_permissions.migrate()
        await migrate_add_mcp_transport_type.migrate()
        logger.info("RBAC / 菜单相关迁移脚本已在启动时自动执行完成")
        # 迁移完成后清除菜单树和用户权限缓存，避免用户仍拿到迁移前的旧缓存（空菜单、缺接口权限）
        try:
            from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_pattern
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['menu_tree']}*")
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['user_perm']}*")
                logger.info("菜单树与用户权限缓存已清除")
        except Exception as cache_err:
            logger.warning(f"清除菜单树缓存失败（可忽略）: {cache_err}")
    except Exception as e:
        # 启动时不因为迁移失败直接让服务挂掉，方便在日志中排查
        logger.exception(f"启动时执行 RBAC / 菜单迁移脚本失败: {e}")

    # 初始化默认系统管理员账号（如不存在）
    await initialize_default_admin()


async def initialize_default_admin():
    """
    初始化默认系统管理员账号:
    - 用户名: admin
    - 密码:   admin
    - 仅在当前没有任何超级管理员用户时创建
    """
    async with AsyncSessionLocal() as session:
        # 统计超级管理员数量（team_code 为空，is_superuser 为 True）
        result = await session.execute(
            select(func.count(User.id)).where(User.is_superuser.is_(True))
        )
        superuser_count = result.scalar() or 0

        if superuser_count > 0:
            logger.info("检测到已有系统超级管理员用户，跳过默认 admin 账号初始化")
            return

        admin_username = "admin"
        admin_password = "admin"
        admin_email = "admin@example.com"

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
            logger.info("已创建默认系统管理员账号：用户名 'admin'，密码 'admin'")
        except IntegrityError:
            # 并发或重复启动导致的唯一约束冲突时忽略
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
async def root():
    """根路径"""
    return ResponseModel.success_response(
        data={"message": "AILY API Service", "version": "1.0.0"},
        message="服务运行正常"
    )


@app.get("/health")
async def health_check():
    """健康检查：数据库与 Redis 连通性"""
    db_ok = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = "unavailable"

    redis_ok = "ok"
    try:
        from app.core.database import redis_client
        if redis_client:
            await redis_client.ping()
        else:
            redis_ok = "unavailable"
    except Exception:
        redis_ok = "unavailable"

    healthy = db_ok == "ok" and redis_ok == "ok"
    return ResponseModel.success_response(
        data={
            "status": "healthy" if healthy else "degraded",
            "database": db_ok,
            "redis": redis_ok,
        },
        message="服务健康" if healthy else "数据库或 Redis 不可用"
    )

