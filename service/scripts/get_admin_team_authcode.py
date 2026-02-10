# -*- coding: utf-8 -*-
"""
获取 admin 账号的团队认证码
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def get_admin_team_authcode():
    """获取 admin 账号的团队认证码"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 查询 admin 用户及其团队信息
        admin_user = await conn.fetchrow("""
            SELECT id, username, team_code, team_id
            FROM users
            WHERE username = 'admin'
            LIMIT 1
        """)
        
        if not admin_user:
            print("❌ 未找到 admin 用户")
            return
        
        print(f"\n✅ 找到 admin 用户:")
        print(f"  - ID: {admin_user['id']}")
        print(f"  - 用户名: {admin_user['username']}")
        print(f"  - 团队代码: {admin_user['team_code']}")
        print(f"  - 团队ID: {admin_user['team_id']}")
        
        if not admin_user['team_code'] and not admin_user['team_id']:
            print("\n⚠️  admin 用户没有关联团队")
            return
        
        # 查询团队信息
        team_query = """
            SELECT id, code, name, authcode, is_active
            FROM teams
            WHERE (code = $1 OR id = $2)
            LIMIT 1
        """
        team = await conn.fetchrow(
            team_query,
            admin_user['team_code'],
            admin_user['team_id']
        )
        
        if not team:
            print("\n⚠️  未找到对应的团队")
            return
        
        print(f"\n✅ 找到团队信息:")
        print(f"  - ID: {team['id']}")
        print(f"  - 代码: {team['code']}")
        print(f"  - 名称: {team['name']}")
        print(f"  - 是否激活: {team['is_active']}")
        
        if team['authcode']:
            print(f"\n{'='*60}")
            print(f"✅ 团队认证码 (X-Team-AuthCode):")
            print(f"{'='*60}")
            print(f"\n{team['authcode']}\n")
            print(f"{'='*60}")
        else:
            print("\n⚠️  该团队还没有生成认证码")
            print("   请使用以下命令重置认证码:")
            print(f"   curl -X POST 'http://localhost:8000/admin/teams/{team['id']}/reset-authcode' \\")
            print(f"     -H 'Authorization: Bearer YOUR_TOKEN'")
        
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await get_admin_team_authcode()


if __name__ == "__main__":
    asyncio.run(main())
