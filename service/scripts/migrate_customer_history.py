# -*- coding: utf-8 -*-
"""
创建客户历史数据表的数据库迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """创建客户历史数据表"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 项目未上线、数据为测试数据，允许先删表再重建
        await conn.execute("DROP TABLE IF EXISTS customer_history CASCADE;")

        # 创建 customer_history 表（tenant_id / member_user_id 与 tenants.id / users.id 类型一致：VARCHAR/UUID）
        await conn.execute("""
            CREATE TABLE customer_history (
                id BIGSERIAL PRIMARY KEY,
                company_name VARCHAR(200),
                decision_units JSONB,
                fabe_spi JSONB,
                opportunity_score JSONB,
                member_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
                conversation_id VARCHAR(64),
                creator VARCHAR(64),
                create_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updater VARCHAR(64),
                update_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted BOOLEAN NOT NULL DEFAULT FALSE,
                tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id)
            );
        """)
        
        # 创建索引
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_member_user_id 
            ON customer_history(member_user_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_conversation_id 
            ON customer_history(conversation_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_tenant_id 
            ON customer_history(tenant_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_company_name 
            ON customer_history(company_name);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_deleted 
            ON customer_history(deleted);
        """)
        
        # 添加表注释（PostgreSQL使用COMMENT ON语法）
        await conn.execute("""
            COMMENT ON TABLE customer_history IS 'DMU+FABE+SPI合并表';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.decision_units IS 'DMU 信息（JSON 格式）';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.fabe_spi IS 'FABE 信息（JSON 格式）';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.opportunity_score IS '机会评分（JSON 格式，包括 calculation、score、tendency）';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.member_user_id IS '用户编号';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.conversation_id IS '对话编号';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.creator IS '创建人';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.create_time IS '创建时间';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.updater IS '更新人';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.update_time IS '更新时间';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.deleted IS '是否删除 0：未删除，1：已删除';
        """)
        
        await conn.execute("""
            COMMENT ON COLUMN customer_history.tenant_id IS '租户编号';
        """)
        
        print("✅ 客户历史数据表创建成功")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())

