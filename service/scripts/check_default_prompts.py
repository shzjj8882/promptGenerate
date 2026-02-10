# -*- coding: utf-8 -*-
"""
检查默认提示词数据
"""
import asyncio
import asyncpg
from app.core.config import settings


async def check_default_prompts():
    """检查所有默认提示词"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 查询所有默认提示词
        prompts = await conn.fetch("""
            SELECT id, scene, tenant_id, team_code, title, is_default, created_at
            FROM prompts
            WHERE is_default = true
            ORDER BY team_code NULLS LAST, scene
        """)
        
        if not prompts:
            print("✅ 没有找到默认提示词")
            return
        
        print(f"📋 找到 {len(prompts)} 条默认提示词：")
        print("=" * 100)
        
        # 按团队分组显示
        by_team = {}
        global_prompts = []
        
        for prompt in prompts:
            team_code = prompt['team_code'] or '(全局)'
            if team_code == '(全局)':
                global_prompts.append(prompt)
            else:
                if team_code not in by_team:
                    by_team[team_code] = []
                by_team[team_code].append(prompt)
        
        # 显示各团队的默认提示词
        for team_code, team_prompts in sorted(by_team.items()):
            print(f"\n🏢 团队: {team_code} ({len(team_prompts)} 条)")
            print("-" * 100)
            for prompt in team_prompts:
                print(f"  ID: {prompt['id']}")
                print(f"  场景: {prompt['scene']}")
                print(f"  租户ID: {prompt['tenant_id']}")
                print(f"  创建时间: {prompt['created_at']}")
                print()
        
        # 显示全局默认提示词
        if global_prompts:
            print(f"\n🌐 全局默认提示词 ({len(global_prompts)} 条)")
            print("-" * 100)
            for prompt in global_prompts:
                print(f"  ID: {prompt['id']}")
                print(f"  场景: {prompt['scene']}")
                print(f"  租户ID: {prompt['tenant_id']}")
                print(f"  创建时间: {prompt['created_at']}")
                print()
        
        print("=" * 100)
        
        # 检查用户和团队
        print("\n👥 用户和团队信息：")
        print("-" * 100)
        users = await conn.fetch("""
            SELECT id, username, email, team_code, is_superuser, is_team_admin
            FROM users
            WHERE is_active = true
            ORDER BY team_code NULLS LAST, username
        """)
        
        by_team_users = {}
        superusers = []
        
        for user in users:
            if user['is_superuser']:
                superusers.append(user)
            else:
                team_code = user['team_code'] or '(无团队)'
                if team_code not in by_team_users:
                    by_team_users[team_code] = []
                by_team_users[team_code].append(user)
        
        if superusers:
            print("\n🔑 超级管理员：")
            for user in superusers:
                print(f"  {user['username']} ({user['email']}) - 团队: {user['team_code'] or '(无)'}")
        
        for team_code, team_users in sorted(by_team_users.items()):
            print(f"\n🏢 团队: {team_code}")
            for user in team_users:
                admin_tag = " [团队管理员]" if user['is_team_admin'] else ""
                print(f"  {user['username']} ({user['email']}){admin_tag}")
        
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await check_default_prompts()


if __name__ == "__main__":
    asyncio.run(main())
