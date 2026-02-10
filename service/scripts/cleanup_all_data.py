# -*- coding: utf-8 -*-
"""
清理所有数据，创建 admin 系统管理员账号（密码：abcd1234）
包括：租户、提示词、占位符、角色、用户角色分配等
"""
import asyncio
import asyncpg
import sys
import os
import uuid

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.security import get_password_hash


async def cleanup_all_data():
    """清理所有数据，创建 admin 系统管理员账号"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 确认操作
        print("\n⚠️  警告：此操作将删除以下所有数据：")
        print("  - 所有用户")
        print("  - 所有租户数据")
        print("  - 所有场景数据")
        print("  - 所有提示词数据")
        print("  - 所有占位符数据")
        print("  - 所有占位符数据源数据")
        print("  - 所有角色数据")
        print("  - 所有用户角色分配数据")
        print("  - 所有角色权限分配数据")
        print("  - 所有团队数据")
        print("  - 所有 DMU 报告数据")
        print("  - 所有客户历史数据")
        print("  - 所有多维表格数据")
        print("\n将创建的数据：")
        print("  - admin 系统管理员账号（密码：abcd1234）")
        print("  - 权限定义表（permissions）保持不变")
        
        # 检查是否需要强制模式
        force = "--force" in sys.argv
        if not force:
            confirm = input("\n确认执行清理操作？(输入 'yes' 确认): ")
            if confirm.lower() != 'yes':
                print("❌ 操作已取消")
                return
        
        print("\n开始清理数据...")
        
        # 1. 删除用户角色关联（先删除关联，避免外键约束）
        print("1. 删除用户角色关联...")
        await conn.execute("DELETE FROM user_roles")
        print(f"   ✅ 已删除用户角色关联")
        
        # 2. 删除角色权限关联
        print("2. 删除角色权限关联...")
        await conn.execute("DELETE FROM role_permissions")
        print(f"   ✅ 已删除角色权限关联")
        
        # 3. 删除角色
        print("3. 删除角色...")
        await conn.execute("DELETE FROM roles")
        print(f"   ✅ 已删除所有角色")
        
        # 4. 删除占位符数据源
        print("4. 删除占位符数据源...")
        await conn.execute("DELETE FROM placeholder_data_sources")
        print(f"   ✅ 已删除占位符数据源")
        
        # 5. 删除占位符
        print("5. 删除占位符...")
        await conn.execute("DELETE FROM placeholders")
        print(f"   ✅ 已删除占位符")
        
        # 6. 删除场景（scenes）
        print("6. 删除场景...")
        await conn.execute("DELETE FROM scenes")
        print(f"   ✅ 已删除场景")
        
        # 7. 删除提示词
        print("7. 删除提示词...")
        await conn.execute("DELETE FROM prompts")
        print(f"   ✅ 已删除提示词")
        
        # 8. 删除 DMU 报告（先删除，避免外键约束）
        print("8. 删除 DMU 报告...")
        await conn.execute("DELETE FROM dmu_reports")
        print(f"   ✅ 已删除 DMU 报告")
        
        # 9. 删除客户历史（先删除，避免外键约束）
        print("9. 删除客户历史...")
        await conn.execute("DELETE FROM customer_history")
        print(f"   ✅ 已删除客户历史")
        
        # 10. 删除多维表格相关数据
        print("10. 删除多维表格数据...")
        await conn.execute("DELETE FROM multi_dimension_table_cells")
        await conn.execute("DELETE FROM multi_dimension_table_rows")
        await conn.execute("DELETE FROM multi_dimension_tables")
        print(f"   ✅ 已删除多维表格数据")
        
        # 11. 删除租户（最后删除，因为其他表可能引用它）
        print("11. 删除租户...")
        await conn.execute("DELETE FROM tenants")
        print(f"   ✅ 已删除租户")
        
        # 12. 删除团队
        print("12. 删除团队...")
        await conn.execute("DELETE FROM teams")
        print(f"   ✅ 已删除团队")
        
        # 13. 删除所有用户
        print("13. 删除所有用户...")
        await conn.execute("DELETE FROM users")
        print(f"   ✅ 已删除所有用户")
        
        # 14. 创建 admin 系统管理员账号
        print("14. 创建 admin 系统管理员账号...")
        admin_id = str(uuid.uuid4())
        admin_password = "abcd1234"
        hashed_password = get_password_hash(admin_password)
        
        await conn.execute("""
            INSERT INTO users (
                id, username, email, hashed_password, 
                is_superuser, is_team_admin, is_active,
                team_code, team_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        """, 
            admin_id,
            "admin",
            "admin@example.com",
            hashed_password,
            True,  # is_superuser
            False,  # is_team_admin
            True,  # is_active
            None,  # team_code
            None,  # team_id
        )
        print(f"   ✅ 已创建 admin 系统管理员账号")
        
        # 验证 admin 用户状态
        final_user = await conn.fetchrow("""
            SELECT id, username, email, is_superuser, is_team_admin, team_code, is_active
            FROM users 
            WHERE username = 'admin'
        """)
        
        print("\n" + "="*60)
        print("✅ 清理完成！")
        print("="*60)
        print(f"\n创建的用户信息：")
        print(f"  - ID: {final_user['id']}")
        print(f"  - 用户名: {final_user['username']}")
        print(f"  - 邮箱: {final_user['email']}")
        print(f"  - 密码: abcd1234")
        print(f"  - 系统管理员: {final_user['is_superuser']}")
        print(f"  - 团队管理员: {final_user['is_team_admin']}")
        print(f"  - 团队代码: {final_user['team_code']}")
        print(f"  - 是否激活: {final_user['is_active']}")
        
        # 统计剩余数据
        remaining_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        remaining_roles = await conn.fetchval("SELECT COUNT(*) FROM roles")
        remaining_tenants = await conn.fetchval("SELECT COUNT(*) FROM tenants")
        remaining_prompts = await conn.fetchval("SELECT COUNT(*) FROM prompts")
        remaining_permissions = await conn.fetchval("SELECT COUNT(*) FROM permissions")
        remaining_teams = await conn.fetchval("SELECT COUNT(*) FROM teams")
        
        print(f"\n剩余数据统计：")
        print(f"  - 用户: {remaining_users}")
        print(f"  - 角色: {remaining_roles}")
        print(f"  - 租户: {remaining_tenants}")
        print(f"  - 提示词: {remaining_prompts}")
        print(f"  - 权限定义: {remaining_permissions}")
        print(f"  - 团队: {remaining_teams}")
        print("="*60)
        
    except Exception as e:
        print(f"❌ 清理失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await cleanup_all_data()


if __name__ == "__main__":
    asyncio.run(main())
