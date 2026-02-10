# -*- coding: utf-8 -*-
"""
检查重复的默认提示词记录
分析为什么会出现多条默认提示词
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def check_duplicate_default_prompts():
    """检查重复的默认提示词记录"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n检查重复的默认提示词记录...")
        print("=" * 80)
        
        # 查询所有默认提示词（team_id 为 None）
        prompts = await conn.fetch("""
            SELECT 
                id,
                scene,
                tenant_id,
                is_default,
                team_id,
                team_code,
                content,
                created_at,
                updated_at
            FROM prompts
            WHERE is_default = true 
              AND team_id IS NULL
            ORDER BY scene, created_at
        """)
        
        print(f"\n找到 {len(prompts)} 条全局默认提示词记录\n")
        
        # 按场景分组统计
        scene_groups = {}
        for prompt in prompts:
            scene = prompt['scene']
            if scene not in scene_groups:
                scene_groups[scene] = []
            scene_groups[scene].append(prompt)
        
        # 找出有重复的场景
        duplicates = {scene: prompts for scene, prompts in scene_groups.items() if len(prompts) > 1}
        
        if duplicates:
            print("⚠️  发现重复的默认提示词记录：\n")
            for scene, scene_prompts in duplicates.items():
                print(f"场景: {scene} - 有 {len(scene_prompts)} 条记录")
                for i, prompt in enumerate(scene_prompts, 1):
                    print(f"  [{i}] ID: {prompt['id']}")
                    print(f"      创建时间: {prompt['created_at']}")
                    print(f"      更新时间: {prompt['updated_at']}")
                    print(f"      内容预览: {prompt['content'][:100]}..." if len(prompt['content']) > 100 else f"      内容: {prompt['content']}")
                    print()
        else:
            print("✅ 没有发现重复的默认提示词记录")
        
        # 特别检查 development_work 场景
        print("\n" + "=" * 80)
        print("检查 development_work 场景的默认提示词：")
        print("=" * 80)
        
        dev_prompts = await conn.fetch("""
            SELECT 
                id,
                scene,
                tenant_id,
                is_default,
                team_id,
                team_code,
                content,
                created_at,
                updated_at
            FROM prompts
            WHERE scene = 'development_work'
              AND is_default = true 
              AND team_id IS NULL
            ORDER BY created_at
        """)
        
        print(f"\n找到 {len(dev_prompts)} 条 development_work 场景的全局默认提示词：\n")
        
        for i, prompt in enumerate(dev_prompts, 1):
            print(f"[{i}] ID: {prompt['id']}")
            print(f"    创建时间: {prompt['created_at']}")
            print(f"    更新时间: {prompt['updated_at']}")
            print(f"    内容长度: {len(prompt['content'])} 字符")
            print(f"    内容预览: {prompt['content'][:150]}...")
            print()
        
        # 检查是否有唯一性约束
        print("\n" + "=" * 80)
        print("检查数据库约束：")
        print("=" * 80)
        
        constraints = await conn.fetch("""
            SELECT 
                conname AS constraint_name,
                contype AS constraint_type,
                pg_get_constraintdef(oid) AS constraint_definition
            FROM pg_constraint
            WHERE conrelid = 'prompts'::regclass
            ORDER BY conname
        """)
        
        print(f"\n找到 {len(constraints)} 个约束：\n")
        for constraint in constraints:
            print(f"约束名称: {constraint['constraint_name']}")
            print(f"约束类型: {constraint['constraint_type']}")
            print(f"约束定义: {constraint['constraint_definition']}")
            print()
        
        # 检查索引
        indexes = await conn.fetch("""
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = 'prompts'
            ORDER BY indexname
        """)
        
        print(f"\n找到 {len(indexes)} 个索引：\n")
        for index in indexes:
            print(f"索引名称: {index['indexname']}")
            print(f"索引定义: {index['indexdef']}")
            print()
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await check_duplicate_default_prompts()


if __name__ == "__main__":
    asyncio.run(main())
