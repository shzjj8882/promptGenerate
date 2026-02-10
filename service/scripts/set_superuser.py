# -*- coding: utf-8 -*-
"""
设置用户为超级管理员脚本
用于将指定用户设置为超级管理员
"""
import asyncio
import asyncpg
from app.core.config import settings


async def set_user_as_superuser(username: str):
    """将指定用户设置为超级管理员"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查用户是否存在
        user = await conn.fetchrow(
            "SELECT id, username, email, is_superuser FROM users WHERE username = $1",
            username
        )
        
        if not user:
            print(f"❌ 用户 '{username}' 不存在")
            return False
        
        # 检查是否已经是超级管理员
        if user['is_superuser']:
            print(f"ℹ️  用户 '{username}' 已经是超级管理员")
            return True
        
        # 更新用户为超级管理员
        await conn.execute(
            "UPDATE users SET is_superuser = TRUE WHERE username = $1",
            username
        )
        
        print(f"✅ 成功将用户 '{username}' 设置为超级管理员")
        print(f"   用户ID: {user['id']}")
        print(f"   邮箱: {user['email']}")
        return True
        
    except Exception as e:
        print(f"❌ 设置超级管理员失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    import os
    
    # 检查 .env 文件是否存在
    if not os.path.exists(".env"):
        print("⚠️  警告: .env 文件不存在")
        print("正在使用默认配置或环境变量...")
        print()
    
    print("=" * 50)
    print("设置用户为超级管理员")
    print("=" * 50)
    print(f"PostgreSQL 主机: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")
    print(f"数据库名称: {settings.POSTGRES_DB}")
    print(f"用户名: {settings.POSTGRES_USER}")
    print("=" * 50)
    
    # 要设置为超级管理员的用户名
    username = "shzjj82"
    
    try:
        success = await set_user_as_superuser(username)
        
        if success:
            print("=" * 50)
            print("✅ 操作完成")
            print("=" * 50)
        else:
            print("=" * 50)
            print("❌ 操作失败")
            print("=" * 50)
            exit(1)
            
    except Exception as e:
        print("=" * 50)
        print(f"❌ 操作失败: {e}")
        print("=" * 50)
        print("\n请检查:")
        print("1. PostgreSQL 服务是否已启动")
        print("2. 数据库配置是否正确（检查 .env 文件）")
        print("3. 用户是否存在")
        exit(1)


if __name__ == "__main__":
    asyncio.run(main())
