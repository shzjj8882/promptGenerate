# -*- coding: utf-8 -*-
"""
数据库初始化脚本
用于创建数据库（如果不存在）
"""
import asyncio
import asyncpg
from app.core.config import settings


async def create_database():
    """创建数据库（如果不存在）"""
    # 连接到 PostgreSQL 服务器（不指定数据库）
    admin_conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database="postgres"  # 连接到默认的 postgres 数据库
    )
    
    try:
        # 检查数据库是否存在
        db_exists = await admin_conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            settings.POSTGRES_DB
        )
        
        if not db_exists:
            # 创建数据库
            await admin_conn.execute(
                f'CREATE DATABASE "{settings.POSTGRES_DB}"'
            )
            print(f"✅ 数据库 '{settings.POSTGRES_DB}' 创建成功")
        else:
            print(f"ℹ️  数据库 '{settings.POSTGRES_DB}' 已存在")
            
    except Exception as e:
        print(f"❌ 创建数据库失败: {e}")
        raise
    finally:
        await admin_conn.close()


async def test_connection():
    """测试数据库连接"""
    try:
        conn = await asyncpg.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB
        )
        await conn.close()
        print(f"✅ 数据库连接测试成功")
        return True
    except Exception as e:
        print(f"❌ 数据库连接测试失败: {e}")
        return False


async def main():
    """主函数"""
    import os
    
    # 检查 .env 文件是否存在
    if not os.path.exists(".env"):
        print("⚠️  警告: .env 文件不存在")
        print("正在使用默认配置或环境变量...")
        print("建议创建 .env 文件: cp .env.example .env")
        print()
    
    print("=" * 50)
    print("数据库初始化")
    print("=" * 50)
    print(f"PostgreSQL 主机: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")
    print(f"数据库名称: {settings.POSTGRES_DB}")
    print(f"用户名: {settings.POSTGRES_USER}")
    print("=" * 50)
    
    try:
        # 创建数据库
        await create_database()
        
        # 测试连接
        await test_connection()
        
        print("=" * 50)
        print("✅ 数据库初始化完成")
        print("=" * 50)
        
    except Exception as e:
        print("=" * 50)
        print(f"❌ 数据库初始化失败: {e}")
        print("=" * 50)
        print("\n请检查:")
        print("1. PostgreSQL 服务是否已启动")
        print("2. 数据库配置是否正确（检查 .env 文件）")
        print("3. 用户是否有创建数据库的权限")
        print("\n提示: 如果 .env 文件不存在，请先创建: cp .env.example .env")
        exit(1)


if __name__ == "__main__":
    asyncio.run(main())

