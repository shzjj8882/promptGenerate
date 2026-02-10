# -*- coding: utf-8 -*-
"""
删除所有默认提示词脚本
"""
import asyncio
import asyncpg
import sys
from app.core.config import settings


async def delete_all_default_prompts(force: bool = False):
    """删除所有默认提示词"""
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
            ORDER BY created_at DESC
        """)
        
        if not prompts:
            print("✅ 没有找到默认提示词")
            return
        
        print(f"📋 找到 {len(prompts)} 条默认提示词：")
        print("-" * 80)
        for prompt in prompts:
            print(f"  ID: {prompt['id']}")
            print(f"  场景: {prompt['scene']}")
            print(f"  租户ID: {prompt['tenant_id']}")
            print(f"  团队代码: {prompt['team_code'] or '(全局)'}")
            print(f"  标题: {prompt['title']}")
            print(f"  创建时间: {prompt['created_at']}")
            print("-" * 80)
        
        # 确认删除
        if not force:
            print(f"\n⚠️  警告：即将删除以上 {len(prompts)} 条默认提示词！")
            try:
                confirm = input("确认删除？(输入 'yes' 确认): ")
                if confirm.lower() != 'yes':
                    print("❌ 已取消删除操作")
                    return
            except (EOFError, KeyboardInterrupt):
                print("\n❌ 已取消删除操作")
                return
        
        # 删除所有默认提示词
        deleted_count = await conn.execute("""
            DELETE FROM prompts
            WHERE is_default = true
        """)
        
        print(f"\n✅ 成功删除 {len(prompts)} 条默认提示词")
        
    except Exception as e:
        print(f"❌ 删除失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    force = '--force' in sys.argv or '-f' in sys.argv
    await delete_all_default_prompts(force=force)


if __name__ == "__main__":
    asyncio.run(main())
