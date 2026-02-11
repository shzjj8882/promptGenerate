# -*- coding: utf-8 -*-
"""
添加 MCP 配置的 API 权限（type=api）
对应 app/routers/admin/mcp.py 中的权限检查
使用 require_team_admin_or_superuser，无需单独 API 权限，但为角色分配时可选择
"""
import asyncio
import sys
import uuid
from pathlib import Path

import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings

# MCP 接口权限（用于角色分配时可选）
# 注：当前 MCP 路由使用 require_team_admin_or_superuser，团队管理员及以上即可访问
# 这些权限用于未来可能的细粒度控制
API_PERMISSIONS = [
    ("mcp:list", "MCP-列表(接口)", "mcp", "list", "MCP 列表接口权限"),
    ("mcp:create", "MCP-创建(接口)", "mcp", "create", "MCP 创建接口权限"),
    ("mcp:update", "MCP-更新(接口)", "mcp", "update", "MCP 更新接口权限"),
    ("mcp:delete", "MCP-删除(接口)", "mcp", "delete", "MCP 删除接口权限"),
    ("mcp:verify", "MCP-验证(接口)", "mcp", "verify", "MCP 连接验证接口权限"),
]


async def migrate():
    """插入 MCP 接口权限"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        inserted = 0
        for code, name, resource, action, description in API_PERMISSIONS:
            pid = str(uuid.uuid4())
            result = await conn.execute(
                """
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'api', $6, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
                """,
                pid,
                name,
                code,
                resource,
                action,
                description or "",
            )
            if result == "INSERT 0 1":
                inserted += 1
                print(f"✅ 创建权限: {name} ({code})")
            else:
                print(f"⏭️  权限已存在，跳过: {name} ({code})")
        print(f"✅ MCP 接口权限迁移完成（共 {len(API_PERMISSIONS)} 条，新增 {inserted} 条）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
