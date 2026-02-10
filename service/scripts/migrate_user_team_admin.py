# -*- coding: utf-8 -*-
"""
添加用户 is_team_admin 字段的数据库迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """添加 is_team_admin 字段"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查 users 表是否存在 is_team_admin 字段
        columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'is_team_admin'
        """)
        
        if not columns:
            # 添加 is_team_admin 字段
            await conn.execute("""
                ALTER TABLE users 
                ADD COLUMN is_team_admin BOOLEAN NOT NULL DEFAULT FALSE;
            """)
            print("✅ 已添加 users.is_team_admin 字段")
        else:
            print("ℹ️  users.is_team_admin 字段已存在")
        
        print("✅ 用户团队管理员字段迁移完成")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
