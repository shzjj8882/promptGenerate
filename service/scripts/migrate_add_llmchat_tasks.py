# -*- coding: utf-8 -*-
"""
创建 llmchat_tasks 表（异步任务结果存储）
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

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
            CREATE TABLE IF NOT EXISTS llmchat_tasks (
                id VARCHAR(36) PRIMARY KEY,
                scene VARCHAR(64) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                request_payload JSONB,
                result_content TEXT,
                error_message TEXT,
                team_id VARCHAR(36),
                notification_type VARCHAR(64),
                notification_config JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP WITH TIME ZONE
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llmchat_tasks_status ON llmchat_tasks(status);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llmchat_tasks_team_id ON llmchat_tasks(team_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llmchat_tasks_created_at ON llmchat_tasks(created_at);")
        print("✅ llmchat_tasks 表创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
