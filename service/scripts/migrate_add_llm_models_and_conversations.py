# -*- coding: utf-8 -*-
"""
添加 LLM 模型管理和会话记录功能
创建 llm_models、conversations、conversation_messages 表
"""
import asyncio
import sys
from pathlib import Path
import uuid
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def migrate():
    """
    创建 LLM 模型管理和会话记录相关的表
    """
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 1. 创建 llm_models 表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_models (
                id VARCHAR PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                provider VARCHAR(100) NOT NULL,
                model VARCHAR(255) NOT NULL,
                api_key TEXT,
                api_base VARCHAR(500),
                default_temperature VARCHAR(10) DEFAULT '0.3',
                default_max_tokens INTEGER,
                team_id VARCHAR REFERENCES teams(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                is_default BOOLEAN DEFAULT FALSE NOT NULL,
                description TEXT,
                config TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """)
        
        # 创建索引
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llm_models_team_id ON llm_models(team_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llm_models_is_active ON llm_models(is_active);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_llm_models_is_default ON llm_models(is_default);")
        
        print("✅ 创建 llm_models 表成功")
        
        # 2. 创建 conversations 表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id VARCHAR PRIMARY KEY,
                scene VARCHAR(100) NOT NULL,
                team_id VARCHAR REFERENCES teams(id) ON DELETE CASCADE,
                tenant_id VARCHAR REFERENCES tenants(id) ON DELETE SET NULL,
                title VARCHAR(500),
                metadata TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
        """)
        
        # 创建索引
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON conversations(team_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_scene ON conversations(scene);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);")
        
        print("✅ 创建 conversations 表成功")
        
        # 3. 创建 conversation_messages 表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id VARCHAR PRIMARY KEY,
                conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
        """)
        
        # 创建索引
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);")
        
        print("✅ 创建 conversation_messages 表成功")
        
        print("\n✨ 迁移完成！")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
