# -*- coding: utf-8 -*-
"""
获取或创建 admin 账号的团队认证码
如果 admin 没有团队，会创建一个默认团队并分配给他
"""
import asyncio
import asyncpg
import sys
import os
import secrets
import string

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


def generate_authcode() -> str:
    """生成 API 认证码（32位随机字符串）"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))


async def get_or_create_admin_team_authcode():
    """获取或创建 admin 账号的团队认证码"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 查询 admin 用户
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
        
        team = None
        team_authcode = None
        
        # 如果 admin 有团队，查询团队信息
        if admin_user['team_code'] or admin_user['team_id']:
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
        
        # 如果没有团队，创建一个默认团队
        if not team:
            print("\n⚠️  admin 用户没有关联团队，正在创建默认团队...")
            
            # 检查是否已存在 "admin" 团队
            existing_team = await conn.fetchrow("""
                SELECT id, code, name, authcode, is_active
                FROM teams
                WHERE code = 'admin'
                LIMIT 1
            """)
            
            if existing_team:
                team = existing_team
                print(f"✅ 找到已存在的 'admin' 团队")
            else:
                # 创建新团队
                import uuid
                team_id = str(uuid.uuid4())
                team_code = "admin"
                team_name = "Admin Team"
                authcode = generate_authcode()
                
                # 确保 authcode 唯一
                while await conn.fetchval("SELECT id FROM teams WHERE authcode = $1", authcode):
                    authcode = generate_authcode()
                
                await conn.execute("""
                    INSERT INTO teams (id, code, name, authcode, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, team_id, team_code, team_name, authcode)
                
                print(f"✅ 已创建默认团队:")
                print(f"  - ID: {team_id}")
                print(f"  - 代码: {team_code}")
                print(f"  - 名称: {team_name}")
                print(f"  - 认证码: {authcode}")
                
                team = await conn.fetchrow("""
                    SELECT id, code, name, authcode, is_active
                    FROM teams
                    WHERE id = $1
                """, team_id)
            
            # 为 admin 用户分配团队
            await conn.execute("""
                UPDATE users
                SET team_code = $1, team_id = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            """, team['code'], team['id'], admin_user['id'])
            
            print(f"\n✅ 已为 admin 用户分配团队")
        
        # 如果团队没有认证码，生成一个
        if team and not team['authcode']:
            print("\n⚠️  团队还没有认证码，正在生成...")
            authcode = generate_authcode()
            
            # 确保 authcode 唯一
            while await conn.fetchval("SELECT id FROM teams WHERE authcode = $1", authcode):
                authcode = generate_authcode()
            
            await conn.execute("""
                UPDATE teams
                SET authcode = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            """, authcode, team['id'])
            
            team_authcode = authcode
            print(f"✅ 已生成团队认证码: {authcode}")
        else:
            team_authcode = team['authcode']
        
        # 输出结果
        print(f"\n{'='*60}")
        print(f"✅ admin 账号的团队认证码 (X-Team-AuthCode):")
        print(f"{'='*60}")
        print(f"\n{team_authcode}\n")
        print(f"{'='*60}")
        print(f"\n使用示例:")
        print(f"curl -X POST 'http://localhost:8000/api/llmchat/prompts/development_work/chat' \\")
        print(f"  -H 'Content-Type: application/json' \\")
        print(f"  -H 'X-Team-AuthCode: {team_authcode}' \\")
        print(f"  -d '{{")
        print(f"    \"user_message\": \"你好\"")
        print(f"  }}'")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"❌ 操作失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await get_or_create_admin_team_authcode()


if __name__ == "__main__":
    asyncio.run(main())
