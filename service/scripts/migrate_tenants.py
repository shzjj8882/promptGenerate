# -*- coding: utf-8 -*-
"""
数据库迁移脚本 - 更新 tenants 表结构
添加 code_id, created_by, updated_by, is_deleted 字段
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate_tenants_table():
    """迁移 tenants 表，添加新字段"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查 code_id 字段是否存在
        check_query = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'code_id';
        """
        result = await conn.fetch(check_query)
        
        if not result:
            print("开始迁移 tenants 表...")
            
            # 添加新字段
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS code_id VARCHAR UNIQUE;
            """)
            
            # 为现有数据设置默认 code_id（使用 id）
            await conn.execute("""
                UPDATE tenants 
                SET code_id = 'tenant-' || id 
                WHERE code_id IS NULL;
            """)
            
            # 设置 code_id 为 NOT NULL
            await conn.execute("""
                ALTER TABLE tenants 
                ALTER COLUMN code_id SET NOT NULL;
            """)
            
            # 创建索引
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tenants_code_id ON tenants(code_id);
            """)
            
            print("✓ 添加 code_id 字段成功")
        else:
            print("✓ code_id 字段已存在")
        
        # 检查 created_by 字段
        check_created_by = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'created_by';
        """
        if not await conn.fetch(check_created_by):
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS created_by VARCHAR;
            """)
            print("✓ 添加 created_by 字段成功")
        else:
            print("✓ created_by 字段已存在")
        
        # 检查 updated_by 字段
        check_updated_by = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'updated_by';
        """
        if not await conn.fetch(check_updated_by):
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS updated_by VARCHAR;
            """)
            print("✓ 添加 updated_by 字段成功")
        else:
            print("✓ updated_by 字段已存在")
        
        # 检查 is_deleted 字段
        check_is_deleted = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'is_deleted';
        """
        if not await conn.fetch(check_is_deleted):
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
            """)
            
            # 创建索引
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tenants_is_deleted ON tenants(is_deleted);
            """)
            print("✓ 添加 is_deleted 字段成功")
        else:
            print("✓ is_deleted 字段已存在")
        
        # 移除 name 的唯一约束（如果存在），因为现在 code_id 是唯一的
        try:
            await conn.execute("""
                ALTER TABLE tenants 
                DROP CONSTRAINT IF EXISTS tenants_name_key;
            """)
            print("✓ 移除 name 唯一约束成功")
        except Exception as e:
            print(f"移除 name 唯一约束时出错（可能不存在）: {e}")
        
        print("\n✅ 数据库迁移完成！")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate_tenants_table())

