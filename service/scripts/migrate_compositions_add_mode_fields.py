# -*- coding: utf-8 -*-
"""
组合表新增字段：mode、tenant_id、task_mode、mcp_tool_names、notification_config
支持 LLM 消息模式与接口模式，接口模式支持同步/异步及通知配置
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
        # 检查并添加 mode 列
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'chat';
        """)
        await conn.execute("""
            UPDATE compositions SET mode = 'chat' WHERE mode IS NULL;
        """)

        # tenant_id：租户，default 表示默认提示词
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'default';
        """)
        await conn.execute("""
            UPDATE compositions SET tenant_id = 'default' WHERE tenant_id IS NULL;
        """)

        # task_mode：接口模式下的同步/异步，sync | async
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS task_mode VARCHAR(20) DEFAULT 'sync';
        """)
        await conn.execute("""
            UPDATE compositions SET task_mode = 'sync' WHERE task_mode IS NULL;
        """)

        # mcp_tool_names：MCP 子服务（工具名列表），JSON 数组
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS mcp_tool_names JSONB DEFAULT '[]';
        """)

        # notification_config：异步任务的通知配置，JSON
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS notification_config JSONB DEFAULT NULL;
        """)

        # prompt_id：关联的提示词 ID，用于生成调用 URL
        await conn.execute("""
            ALTER TABLE compositions
            ADD COLUMN IF NOT EXISTS prompt_id VARCHAR(36) DEFAULT NULL;
        """)

        print("✅ compositions 表新字段添加成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
