# -*- coding: utf-8 -*-
"""
查询提示词数据
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


async def check_prompt(prompt_id: str):
    """查询指定ID的提示词"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        try:
            # 查询提示词
            result = await db.execute(
                select(Prompt).where(Prompt.id == prompt_id)
            )
            prompt = result.scalar_one_or_none()
            
            if prompt:
                print(f"✅ 找到提示词:")
                print(f"   ID: {prompt.id}")
                print(f"   场景: {prompt.scene}")
                print(f"   租户ID: {prompt.tenant_id}")
                print(f"   标题: {prompt.title}")
                print(f"   是否默认: {prompt.is_default}")
                print(f"   创建时间: {prompt.created_at}")
                return True
            else:
                print(f"❌ 提示词不存在: {prompt_id}")
                return False
                
        except Exception as e:
            print(f"❌ 查询失败: {e}")
            return False


async def list_all_prompts():
    """列出所有提示词"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Prompt))
            prompts = result.scalars().all()
            
            print(f"📋 数据库中共有 {len(prompts)} 条提示词:")
            print("-" * 80)
            for prompt in prompts:
                print(f"ID: {prompt.id}")
                print(f"  场景: {prompt.scene}, 租户ID: {prompt.tenant_id}, 标题: {prompt.title}")
                print()
                
        except Exception as e:
            print(f"❌ 查询失败: {e}")


async def main():
    """主函数"""
    prompt_id = "0a740ac6-6bd9-491a-9a7b-e3eba7119d9c"
    
    print(f"🔍 查询提示词: {prompt_id}")
    print("-" * 50)
    
    found = await check_prompt(prompt_id)
    
    if not found:
        print("\n📋 列出所有提示词:")
        print("-" * 50)
        await list_all_prompts()


if __name__ == "__main__":
    asyncio.run(main())
