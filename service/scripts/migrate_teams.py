# -*- coding: utf-8 -*-
"""
创建团队表和添加用户 team_code 字段的数据库迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """创建团队表和添加用户 team_code 字段"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 创建团队表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS teams (
                id VARCHAR PRIMARY KEY,
                code VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_teams_code ON teams(code);
        """)
        
        # 检查 users 表是否存在 team_code 字段
        columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'team_code'
        """)
        
        if not columns:
            # 添加 team_code 字段
            await conn.execute("""
                ALTER TABLE users 
                ADD COLUMN team_code VARCHAR;
                
                CREATE INDEX IF NOT EXISTS idx_users_team_code ON users(team_code);
            """)
            print("✅ 已添加 users.team_code 字段")
        else:
            print("ℹ️  users.team_code 字段已存在")
        
        print("✅ 团队表和用户 team_code 字段迁移完成")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
