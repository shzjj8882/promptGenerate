# -*- coding: utf-8 -*-
"""
为提示词表添加 team_code 字段的迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate_prompt_team_code():
    """为提示词表添加 team_code 字段"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查 team_code 字段是否已存在
        columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'prompts' AND column_name = 'team_code'
        """)
        
        if columns:
            print("✅ team_code 字段已存在，跳过迁移")
            return
        
        print("开始迁移：为 prompts 表添加 team_code 字段...")
        
        # 添加 team_code 字段
        await conn.execute("""
            ALTER TABLE prompts 
            ADD COLUMN team_code VARCHAR(50) NULL;
        """)
        
        # 创建索引
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_prompts_team_code ON prompts(team_code);
        """)
        
        print("✅ 迁移完成：已为 prompts 表添加 team_code 字段和相关索引")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await migrate_prompt_team_code()


if __name__ == "__main__":
    asyncio.run(main())
