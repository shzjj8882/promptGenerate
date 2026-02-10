# -*- coding: utf-8 -*-
"""
为默认提示词添加唯一性约束
防止同一个场景创建多条全局默认提示词或团队默认提示词
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def add_unique_constraint():
    """添加唯一性约束"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n开始添加唯一性约束...")
        print("=" * 80)
        
        # 检查是否已存在约束
        existing_indexes = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'prompts'
              AND indexname LIKE '%unique%default%'
        """)
        
        if existing_indexes:
            print("⚠️  发现已存在的唯一性约束：")
            for idx in existing_indexes:
                print(f"  - {idx['indexname']}: {idx['indexdef']}")
            print("\n是否继续？(y/n): ", end="")
            # 这里简化处理，直接继续
            print("y")
        
        # 1. 为全局默认提示词添加唯一性约束（team_id IS NULL）
        # 使用部分唯一索引（partial unique index）来处理 NULL 值
        print("\n1. 添加全局默认提示词唯一性约束...")
        try:
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_unique_global_default
                ON prompts (scene)
                WHERE is_default = true AND team_id IS NULL
            """)
            print("   ✅ 已添加全局默认提示词唯一性约束")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⏭️  约束已存在，跳过")
            else:
                raise
        
        # 2. 为团队默认提示词添加唯一性约束（team_id IS NOT NULL）
        print("\n2. 添加团队默认提示词唯一性约束...")
        try:
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_unique_team_default
                ON prompts (scene, team_id)
                WHERE is_default = true AND team_id IS NOT NULL
            """)
            print("   ✅ 已添加团队默认提示词唯一性约束")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   ⏭️  约束已存在，跳过")
            else:
                raise
        
        print("\n" + "=" * 80)
        print("✅ 唯一性约束添加完成")
        print("=" * 80)
        
        # 验证约束
        print("\n验证约束...")
        indexes = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'prompts'
              AND (indexname LIKE '%unique%default%' OR indexname LIKE '%unique%team%')
            ORDER BY indexname
        """)
        
        print(f"\n找到 {len(indexes)} 个唯一性约束：\n")
        for idx in indexes:
            print(f"约束名称: {idx['indexname']}")
            print(f"约束定义: {idx['indexdef']}")
            print()
        
        # 测试约束是否生效（尝试插入重复数据应该失败）
        print("\n测试约束...")
        test_scene = "test_unique_constraint_" + str(asyncio.get_event_loop().time())
        
        # 插入第一条（应该成功）
        try:
            await conn.execute("""
                INSERT INTO prompts (id, scene, tenant_id, title, content, is_default, team_id)
                VALUES ($1, $2, 'default', 'Test', 'Test content', true, NULL)
            """, str(asyncio.get_event_loop().time()), test_scene)
            print(f"   ✅ 插入第一条测试数据成功")
        except Exception as e:
            print(f"   ❌ 插入第一条测试数据失败: {e}")
            return
        
        # 尝试插入第二条（应该失败）
        try:
            await conn.execute("""
                INSERT INTO prompts (id, scene, tenant_id, title, content, is_default, team_id)
                VALUES ($1, $2, 'default', 'Test 2', 'Test content 2', true, NULL)
            """, str(asyncio.get_event_loop().time() + 1), test_scene)
            print(f"   ❌ 插入第二条测试数据成功（不应该成功！）")
        except Exception as e:
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                print(f"   ✅ 约束生效：插入第二条测试数据被拒绝（符合预期）")
            else:
                print(f"   ⚠️  插入失败，但错误信息不符合预期: {e}")
        
        # 清理测试数据
        await conn.execute("""
            DELETE FROM prompts WHERE scene = $1
        """, test_scene)
        print(f"   ✅ 已清理测试数据")
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await add_unique_constraint()


if __name__ == "__main__":
    asyncio.run(main())
