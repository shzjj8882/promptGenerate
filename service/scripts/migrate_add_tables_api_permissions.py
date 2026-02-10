# -*- coding: utf-8 -*-
"""
添加多维表格的 API 权限（type=api）
对应 app/routers/admin/multi_dimension_tables.py 中的权限检查
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 多维表格接口权限种子：(code, name, resource, action, description)
# code 与 require_permission("multi_dimension_tables:list" 等) 对应
API_PERMISSIONS = [
    ("multi_dimension_tables:list", "多维表格-列表(接口)", "multi_dimension_tables", "list", "多维表格列表接口权限"),
    ("multi_dimension_tables:create", "多维表格-创建(接口)", "multi_dimension_tables", "create", "多维表格创建接口权限"),
    ("multi_dimension_tables:update", "多维表格-更新(接口)", "multi_dimension_tables", "update", "多维表格更新接口权限"),
    ("multi_dimension_tables:delete", "多维表格-删除(接口)", "multi_dimension_tables", "delete", "多维表格删除接口权限"),
]


async def migrate():
    """插入多维表格接口权限（type=api，code 已存在则跳过）"""
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
            result = await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'api', $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "")
            if result == "INSERT 0 1":
                inserted += 1
                print(f"✅ 创建权限: {name} ({code})")
            else:
                print(f"⏭️  权限已存在，跳过: {name} ({code})")
        print(f"✅ 多维表格接口权限迁移完成（共 {len(API_PERMISSIONS)} 条，新增 {inserted} 条）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
