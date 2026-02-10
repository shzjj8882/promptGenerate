# -*- coding: utf-8 -*-
"""
数据库迁移脚本：为 tenants 表添加 app_id 和 app_secret 字段
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """执行迁移"""
    # 连接到默认的 postgres 数据库
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        print("开始迁移：添加 app_id 和 app_secret 字段到 tenants 表...")

        # 检查 app_id 字段是否存在
        check_app_id = await conn.fetchval("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'app_id'
        """)

        if not check_app_id:
            # 添加 app_id 字段
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN app_id VARCHAR NULL
            """)
            print("✓ 已添加 app_id 字段")
        else:
            print("✓ app_id 字段已存在，跳过")

        # 检查 app_secret 字段是否存在
        check_app_secret = await conn.fetchval("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'app_secret'
        """)

        if not check_app_secret:
            # 添加 app_secret 字段
            await conn.execute("""
                ALTER TABLE tenants 
                ADD COLUMN app_secret VARCHAR NULL
            """)
            print("✓ 已添加 app_secret 字段")
        else:
            print("✓ app_secret 字段已存在，跳过")

        print("迁移完成！")

    except Exception as e:
        print(f"迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())

