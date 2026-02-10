# -*- coding: utf-8 -*-
"""
为租户表和RAG表添加 team_code 字段的迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate_tenant_rag_team_code():
    """为租户表和RAG表添加 team_code 字段"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查 tenants 表的 team_code 字段是否已存在
        tenant_columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'team_code'
        """)
        
        if not tenant_columns:
            print("开始迁移：为 tenants 表添加 team_code 字段...")
            # 添加 team_code 字段
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN team_code VARCHAR(50) NULL;
            """)
            
            # 创建索引
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tenants_team_code ON tenants(team_code);
            """)
            print("✅ 迁移完成：已为 tenants 表添加 team_code 字段和相关索引")
        else:
            print("✅ tenants 表的 team_code 字段已存在，跳过迁移")
        
        # 检查 rags 表的 team_code 字段是否已存在
        rag_columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'rags' AND column_name = 'team_code'
        """)
        
        if not rag_columns:
            print("开始迁移：为 rags 表添加 team_code 字段...")
            # 添加 team_code 字段
            await conn.execute("""
                ALTER TABLE rags 
                ADD COLUMN team_code VARCHAR(50) NULL;
            """)
            
            # 创建索引
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_rags_team_code ON rags(team_code);
            """)
            print("✅ 迁移完成：已为 rags 表添加 team_code 字段和相关索引")
        else:
            print("✅ rags 表的 team_code 字段已存在，跳过迁移")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await migrate_tenant_rag_team_code()


if __name__ == "__main__":
    asyncio.run(main())
