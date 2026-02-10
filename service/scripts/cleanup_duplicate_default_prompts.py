# -*- coding: utf-8 -*-
"""
清理重复的默认提示词记录
对于同一个场景有多条全局默认提示词的情况，保留最新的，删除旧的
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def cleanup_duplicate_default_prompts():
    """清理重复的默认提示词记录"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n开始清理重复的默认提示词记录...")
        print("=" * 80)
        
        # 查找所有有重复的场景
        duplicates = await conn.fetch("""
            SELECT 
                scene,
                COUNT(*) as count,
                ARRAY_AGG(id ORDER BY created_at DESC) as ids,
                ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
            FROM prompts
            WHERE is_default = true 
              AND team_id IS NULL
            GROUP BY scene
            HAVING COUNT(*) > 1
            ORDER BY scene
        """)
        
        if not duplicates:
            print("✅ 没有发现重复的默认提示词记录")
            return
        
        print(f"\n发现 {len(duplicates)} 个场景有重复的默认提示词：\n")
        
        total_deleted = 0
        
        for dup in duplicates:
            scene = dup['scene']
            count = dup['count']
            ids = dup['ids']
            created_dates = dup['created_dates']
            
            print(f"场景: {scene}")
            print(f"  重复数量: {count} 条")
            print(f"  记录ID列表:")
            for i, (prompt_id, created_at) in enumerate(zip(ids, created_dates), 1):
                print(f"    [{i}] {prompt_id} (创建时间: {created_at})")
            
            # 保留最新的（第一条），删除其他的
            ids_to_delete = ids[1:]  # 跳过第一条（最新的）
            
            print(f"\n  将保留: {ids[0]} (最新)")
            print(f"  将删除: {len(ids_to_delete)} 条记录")
            
            # 确认删除
            for prompt_id in ids_to_delete:
                # 先查看要删除的记录内容
                prompt_info = await conn.fetchrow("""
                    SELECT id, content, created_at, updated_at
                    FROM prompts
                    WHERE id = $1
                """, prompt_id)
                
                if prompt_info:
                    print(f"    删除 ID: {prompt_id}")
                    print(f"      内容: {prompt_info['content'][:100]}..." if len(prompt_info['content']) > 100 else f"      内容: {prompt_info['content']}")
                    
                    # 删除记录
                    await conn.execute("""
                        DELETE FROM prompts
                        WHERE id = $1
                    """, prompt_id)
                    
                    total_deleted += 1
                    print(f"      ✅ 已删除")
            
            print()
        
        print("=" * 80)
        print(f"✅ 清理完成")
        print(f"   - 已删除: {total_deleted} 条重复记录")
        print(f"   - 已保留: {len(duplicates)} 条最新记录")
        print("=" * 80)
        
        # 验证清理结果
        print("\n验证清理结果...")
        remaining_duplicates = await conn.fetch("""
            SELECT scene, COUNT(*) as count
            FROM prompts
            WHERE is_default = true 
              AND team_id IS NULL
            GROUP BY scene
            HAVING COUNT(*) > 1
        """)
        
        if remaining_duplicates:
            print(f"⚠️  仍有 {len(remaining_duplicates)} 个场景有重复记录")
            for dup in remaining_duplicates:
                print(f"  - {dup['scene']}: {dup['count']} 条")
        else:
            print("✅ 所有重复记录已清理完成")
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await cleanup_duplicate_default_prompts()


if __name__ == "__main__":
    asyncio.run(main())
