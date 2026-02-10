# -*- coding: utf-8 -*-
"""
创建DMU报告表的数据库迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """创建DMU报告表"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 创建dmu_reports表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS dmu_reports (
                id BIGSERIAL PRIMARY KEY,
                conversation_id VARCHAR NOT NULL,
                company_name VARCHAR NOT NULL,
                dmu_analysis JSONB NOT NULL,
                tenant_id VARCHAR,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            );
        """)
        
        # 创建索引
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_dmu_reports_conversation_id 
            ON dmu_reports(conversation_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_dmu_reports_company_name 
            ON dmu_reports(company_name);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_dmu_reports_tenant_id 
            ON dmu_reports(tenant_id);
        """)
        
        print("✅ DMU报告表创建成功")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())

