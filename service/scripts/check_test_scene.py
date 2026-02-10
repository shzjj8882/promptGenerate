# -*- coding: utf-8 -*-
"""
查询 test 场景的提示词
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db
from app.models.prompt import Prompt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def check_test_scene():
    """查询 test 场景的提示词"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        try:
            # 查询 test 场景的提示词
            result = await db.execute(
                select(Prompt).where(Prompt.scene == "test")
            )
            prompts = result.scalars().all()
            
            if prompts:
                print(f"✅ 找到 {len(prompts)} 条 test 场景的提示词:")
                print("-" * 80)
                for prompt in prompts:
                    print(f"ID: {prompt.id}")
                    print(f"  场景: {prompt.scene}")
                    print(f"  租户ID: {prompt.tenant_id}")
                    print(f"  标题: {prompt.title}")
                    print(f"  是否默认: {prompt.is_default}")
                    print(f"  创建时间: {prompt.created_at}")
                    print()
            else:
                print(f"❌ 没有找到 test 场景的提示词")
                
            # 查询所有场景
            print("\n📋 所有场景的提示词统计:")
            print("-" * 80)
            all_result = await db.execute(select(Prompt))
            all_prompts = all_result.scalars().all()
            
            scene_count = {}
            for prompt in all_prompts:
                scene = prompt.scene
                scene_count[scene] = scene_count.get(scene, 0) + 1
            
            for scene, count in scene_count.items():
                print(f"场景 '{scene}': {count} 条提示词")
                
        except Exception as e:
            print(f"❌ 查询失败: {e}")
            import traceback
            traceback.print_exc()


async def main():
    """主函数"""
    print(f"🔍 查询 test 场景的提示词")
    print("-" * 50)
    await check_test_scene()


if __name__ == "__main__":
    asyncio.run(main())
