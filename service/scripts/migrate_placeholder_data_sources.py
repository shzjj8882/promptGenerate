# -*- coding: utf-8 -*-
"""
创建占位符数据源配置表
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from sqlalchemy import text


async def create_placeholder_data_sources_table():
    """创建占位符数据源配置表"""
    async with engine.begin() as conn:
        # 检查表是否已存在
        check_table_sql = """
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'placeholder_data_sources'
        );
        """
        result = await conn.execute(text(check_table_sql))
        table_exists = result.scalar()
        
        if table_exists:
            print("表 placeholder_data_sources 已存在，跳过创建")
            return
        
        # 创建表
        create_table_sql = """
        CREATE TABLE placeholder_data_sources (
            id VARCHAR NOT NULL PRIMARY KEY,
            placeholder_key VARCHAR NOT NULL,
            method VARCHAR NOT NULL,
            method_params TEXT,
            tenant_param_key VARCHAR,
            priority BIGINT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT fk_placeholder_data_sources_placeholder_key 
                FOREIGN KEY (placeholder_key) REFERENCES placeholders(key)
        );
        
        CREATE INDEX idx_placeholder_data_sources_placeholder_key ON placeholder_data_sources(placeholder_key);
        CREATE INDEX idx_placeholder_data_sources_priority ON placeholder_data_sources(priority);
        """
        
        await conn.execute(text(create_table_sql))
        print("成功创建表 placeholder_data_sources")


async def main():
    """主函数"""
    try:
        await init_db()
        await create_placeholder_data_sources_table()
        print("\n迁移完成！")
    except Exception as e:
        print(f"\n迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

