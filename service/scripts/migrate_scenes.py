# -*- coding: utf-8 -*-
"""
创建 scenes 表并插入预置场景（调研、PPT报告、销售打单）。
执行前需已存在 users、tenants 等表；执行后场景数据持久化到 DB，多实例共享。
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scenes (
                id VARCHAR(36) PRIMARY KEY,
                code VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
                team_code VARCHAR(64),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_code ON scenes(code);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_team_code ON scenes(team_code);")

        # 预置场景：若不存在则插入
        for sid, code, name in [
            ("research", "research", "调研提示词"),
            ("ppt_report", "ppt_report", "PPT报告提示词"),
            ("sales_order", "sales_order", "销售打单提示词"),
        ]:
            await conn.execute("""
                INSERT INTO scenes (id, code, name, is_predefined, team_code)
                VALUES ($1, $2, $3, TRUE, NULL)
                ON CONFLICT (code) DO NOTHING;
            """, sid, code, name)

        print("✅ scenes 表创建/更新成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
