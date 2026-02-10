# -*- coding: utf-8 -*-
"""
删除用户脚本
用于删除指定用户账号
"""
import asyncio
import asyncpg
from app.core.config import settings


async def delete_user(username: str):
    """删除指定用户"""
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
            "SELECT id, username, email, is_superuser, is_team_admin, team_code FROM users WHERE username = $1",
            username
        )
        
        if not user:
            print(f"❌ 用户 '{username}' 不存在")
            return False
        
        print(f"找到用户:")
        print(f"  用户ID: {user['id']}")
        print(f"  用户名: {user['username']}")
        print(f"  邮箱: {user['email']}")
        print(f"  是否超级管理员: {user['is_superuser']}")
        print(f"  是否团队管理员: {user['is_team_admin']}")
        print(f"  团队代码: {user['team_code']}")
        
        # 检查用户是否有角色关联
        role_count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_roles WHERE user_id = $1",
            user['id']
        )
        
        if role_count > 0:
            print(f"\n⚠️  警告: 该用户有 {role_count} 个角色关联")
            print("   将同时删除这些角色关联...")
            # 删除用户角色关联
            await conn.execute(
                "DELETE FROM user_roles WHERE user_id = $1",
                user['id']
            )
            print("   ✅ 已删除用户角色关联")
        
        # 删除用户
        await conn.execute(
            "DELETE FROM users WHERE id = $1",
            user['id']
        )
        
        print(f"\n✅ 成功删除用户 '{username}'")
        return True
        
    except Exception as e:
        print(f"❌ 删除用户失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python3 delete_user.py <username>")
        print("示例: python3 delete_user.py shzjj8882")
        sys.exit(1)
    
    username = sys.argv[1]
    await delete_user(username)


if __name__ == "__main__":
    asyncio.run(main())
