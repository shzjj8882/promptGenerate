# -*- coding: utf-8 -*-
"""
迁移脚本：为占位符表添加团队字段并修改唯一约束
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """执行迁移"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 1. 添加 team_code 和 team_id 字段（如果不存在）
        print("添加 team_code 和 team_id 字段...")
        await conn.execute("""
            ALTER TABLE placeholders 
            ADD COLUMN IF NOT EXISTS team_code VARCHAR,
            ADD COLUMN IF NOT EXISTS team_id VARCHAR;
        """)
        
        # 2. 添加 team_id 外键约束（如果不存在）
        print("添加 team_id 外键约束...")
        # 检查外键是否已存在
        check_fk = await conn.fetchval("""
            SELECT COUNT(*) 
            FROM information_schema.table_constraints 
            WHERE constraint_name = 'placeholders_team_id_fkey' 
            AND table_name = 'placeholders';
        """)
        if check_fk == 0:
            await conn.execute("""
                ALTER TABLE placeholders 
                ADD CONSTRAINT placeholders_team_id_fkey 
                FOREIGN KEY (team_id) REFERENCES teams(id);
            """)
        
        # 3. 创建索引（如果不存在）
        print("创建 team_code 和 team_id 索引...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_placeholders_team_code ON placeholders(team_code);
            CREATE INDEX IF NOT EXISTS ix_placeholders_team_id ON placeholders(team_id);
        """)
        
        # 4. 删除旧的 key 唯一约束（如果存在）
        print("删除旧的 key 唯一约束...")
        await conn.execute("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'placeholders_key_key'
                ) THEN
                    ALTER TABLE placeholders DROP CONSTRAINT placeholders_key_key;
                END IF;
            END $$;
        """)
        
        # 5. 添加新的 (team_id, key) 唯一约束
        print("添加 (team_id, key) 唯一约束...")
        await conn.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'uq_placeholder_team_key'
                ) THEN
                    ALTER TABLE placeholders 
                    ADD CONSTRAINT uq_placeholder_team_key 
                    UNIQUE (team_id, key);
                END IF;
            END $$;
        """)
        
        print("迁移完成！")
    except Exception as e:
        print(f"迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
