# -*- coding: utf-8 -*-
"""
删除指定的提示词数据
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db
from app.models.prompt import Prompt
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession


async def delete_prompt_by_id(prompt_id: str):
    """删除指定ID的提示词"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        try:
            # 查询提示词
            result = await db.execute(
                select(Prompt).where(Prompt.id == prompt_id)
            )
            prompt = result.scalar_one_or_none()
            
            if not prompt:
                print(f"❌ 提示词不存在: {prompt_id}")
                return False
            
            # 显示提示词信息
            print(f"📋 找到提示词:")
            print(f"   ID: {prompt.id}")
            print(f"   场景: {prompt.scene}")
            print(f"   租户ID: {prompt.tenant_id}")
            print(f"   标题: {prompt.title}")
            print(f"   是否默认: {prompt.is_default}")
            print(f"   创建时间: {prompt.created_at}")
            
            # 删除提示词
            await db.execute(
                delete(Prompt).where(Prompt.id == prompt_id)
            )
            await db.commit()
            
            print(f"✅ 成功删除提示词: {prompt_id}")
            return True
            
        except Exception as e:
            await db.rollback()
            print(f"❌ 删除失败: {e}")
            return False


async def main():
    """主函数"""
    prompt_id = "0a740ac6-6bd9-491a-9a7b-e3eba7119d9c"
    
    print(f"🗑️  准备删除提示词: {prompt_id}")
    print("-" * 50)
    
    success = await delete_prompt_by_id(prompt_id)
    
    print("-" * 50)
    if success:
        print("✅ 删除操作完成")
    else:
        print("❌ 删除操作失败")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
