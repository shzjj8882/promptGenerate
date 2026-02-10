# -*- coding: utf-8 -*-
"""
移除 tenants 表中 code_id 的唯一约束
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """执行迁移"""
    # 连接到 PostgreSQL 服务器（使用默认的 postgres 数据库）
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("开始迁移：移除 tenants.code_id 的唯一约束...")
        
        # 检查唯一约束是否存在
        check_constraint_sql = """
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'tenants' 
        AND constraint_type = 'UNIQUE' 
        AND constraint_name = 'tenants_code_id_key';
        """
        constraint_exists = await conn.fetchval(check_constraint_sql)
        
        if constraint_exists:
            # 删除唯一约束
            drop_constraint_sql = """
            ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_code_id_key;
            """
            await conn.execute(drop_constraint_sql)
            print("✓ 已移除 tenants_code_id_key 唯一约束")
        else:
            print("✓ 唯一约束不存在，无需移除")
        
        # 验证约束已移除
        verify_sql = """
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'tenants' 
        AND constraint_type = 'UNIQUE' 
        AND constraint_name = 'tenants_code_id_key';
        """
        still_exists = await conn.fetchval(verify_sql)
        
        if not still_exists:
            print("✓ 迁移完成：code_id 字段不再有唯一约束")
        else:
            print("✗ 警告：约束仍然存在")
        
    except Exception as e:
        print(f"✗ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())

