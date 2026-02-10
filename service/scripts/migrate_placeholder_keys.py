# -*- coding: utf-8 -*-
"""
数据库迁移脚本 - 更新占位符 key 名称
将旧的占位符 key 更新为新的命名规范：
- sys.conversation_id -> conversationId
- conversation.customRagInfos -> customRagInfos
- conversation.companyRagAbbr -> companyRagAbbr
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from app.models.prompt import Placeholder
from sqlalchemy import text, select, update
from sqlalchemy.ext.asyncio import AsyncSession


# 占位符 key 映射关系
PLACEHOLDER_KEY_MAPPING = {
    "sys.conversation_id": "conversationId",
    "conversation.customRagInfos": "customRagInfos",
    "conversation.companyRagAbbr": "companyRagAbbr",
    # 兼容旧的驼峰命名（如果存在）
    "sysConversationId": "conversationId",
    "conversationCustomRagInfos": "customRagInfos",
    "conversationCompanyRagAbbr": "companyRagAbbr",
}


async def migrate_placeholder_keys():
    """更新占位符的 key 名称"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        try:
            print("开始迁移占位符 key 名称...")
            
            # 统计需要更新的占位符
            updated_count = 0
            
            for old_key, new_key in PLACEHOLDER_KEY_MAPPING.items():
                # 查找所有使用旧 key 的占位符
                result = await db.execute(
                    select(Placeholder).where(Placeholder.key == old_key)
                )
                placeholders = result.scalars().all()
                
                if placeholders:
                    print(f"\n找到 {len(placeholders)} 个占位符需要更新: {old_key} -> {new_key}")
                    
                    for placeholder in placeholders:
                        # 检查新 key 是否已存在（同一场景下）
                        existing_result = await db.execute(
                            select(Placeholder).where(
                                Placeholder.key == new_key,
                                Placeholder.scene == placeholder.scene
                            )
                        )
                        existing = existing_result.scalar_one_or_none()
                        
                        if existing:
                            print(f"  ⚠️  场景 {placeholder.scene} 中已存在 key={new_key} 的占位符，跳过更新 id={placeholder.id}")
                            continue
                        
                        # 更新 key
                        placeholder.key = new_key
                        updated_count += 1
                        print(f"  ✓ 更新占位符 id={placeholder.id}, scene={placeholder.scene}, label={placeholder.label}: {old_key} -> {new_key}")
            
            if updated_count > 0:
                await db.commit()
                print(f"\n✓ 成功更新 {updated_count} 个占位符的 key")
            else:
                print("\n✓ 没有需要更新的占位符")
            
            # 同时更新 placeholder_data_sources 表中的 placeholder_key（如果存在）
            async with engine.begin() as conn:
                for old_key, new_key in PLACEHOLDER_KEY_MAPPING.items():
                    result = await conn.execute(
                        text("""
                            UPDATE placeholder_data_sources 
                            SET placeholder_key = :new_key 
                            WHERE placeholder_key = :old_key
                        """),
                        {"old_key": old_key, "new_key": new_key}
                    )
                    if result.rowcount > 0:
                        print(f"✓ 更新了 {result.rowcount} 条 placeholder_data_sources 记录: {old_key} -> {new_key}")
            
            print("\n迁移完成！")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ 迁移失败: {e}")
            import traceback
            traceback.print_exc()
            raise


async def main():
    """主函数"""
    await migrate_placeholder_keys()


if __name__ == "__main__":
    asyncio.run(main())
