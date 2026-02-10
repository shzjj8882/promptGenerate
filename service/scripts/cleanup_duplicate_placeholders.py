# -*- coding: utf-8 -*-
"""
清理重复和旧格式的占位符
保留标准格式的占位符（不关联场景或关联 sales_order）
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncpg
from app.core.config import settings


# 标准占位符 key（应该保留的）
STANDARD_KEYS = [
    "conversationId",
    "companyRag",
    "customRagInfos",
    "salePhaseRag",
    "userName",
    "companyRagAbbr",
]

# 旧格式的占位符 key（应该删除的）
OLD_FORMAT_KEYS = [
    "conversation.companyRagAbbr",
    "conversation.customRagInfos",
    "conversationCompanyRagAbbr",
    "conversationCustomRagInfos",
    "sys.conversation_id",
    "sysConversationId",
]

# 主要场景（保留该场景的占位符）
PRIMARY_SCENE = "sales_order"


async def cleanup_placeholders():
    """清理重复和旧格式的占位符"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        print("=" * 80)
        print("清理重复和旧格式占位符")
        print("=" * 80)
        
        # 1. 删除旧格式的占位符
        print("\n【步骤 1】删除旧格式占位符")
        print("-" * 80)
        deleted_old = 0
        for old_key in OLD_FORMAT_KEYS:
            result = await conn.execute("""
                DELETE FROM placeholders
                WHERE key = $1
            """, old_key)
            count = int(result.split()[-1])
            if count > 0:
                deleted_old += count
                print(f"  ✅ 删除 {old_key}: {count} 条")
        print(f"\n总计删除旧格式占位符: {deleted_old} 条")
        
        # 2. 处理标准格式的重复占位符
        print("\n【步骤 2】处理标准格式的重复占位符")
        print("-" * 80)
        
        for key in STANDARD_KEYS:
            # 查询该 key 的所有占位符
            items = await conn.fetch("""
                SELECT id, scene, created_at
                FROM placeholders
                WHERE key = $1
                ORDER BY 
                    CASE WHEN scene = $2 THEN 0 ELSE 1 END,
                    created_at DESC
            """, key, PRIMARY_SCENE)
            
            if len(items) <= 1:
                print(f"  ✅ {key}: 无重复（{len(items)} 条）")
                continue
            
            print(f"\n  📌 {key}: 发现 {len(items)} 条记录")
            
            # 优先保留 sales_order 场景的，如果没有则保留最新的
            keep_item = None
            delete_items = []
            
            # 先找 sales_order 场景的
            for item in items:
                if item['scene'] == PRIMARY_SCENE:
                    keep_item = item
                    break
            
            # 如果没有 sales_order，保留最新的
            if not keep_item:
                keep_item = items[0]
            
            # 其他都标记为删除
            for item in items:
                if item['id'] != keep_item['id']:
                    delete_items.append(item)
            
            print(f"    保留: ID={keep_item['id']}, Scene={keep_item['scene'] or '(无场景)'}")
            print(f"    删除: {len(delete_items)} 条")
            
            # 删除重复的
            for item in delete_items:
                await conn.execute("""
                    DELETE FROM placeholders
                    WHERE id = $1
                """, item['id'])
                print(f"      ✅ 已删除 ID={item['id']}, Scene={item['scene'] or '(无场景)'}")
        
        # 3. 显示清理后的结果
        print("\n【步骤 3】清理后的占位符统计")
        print("-" * 80)
        
        all_placeholders = await conn.fetch("""
            SELECT key, scene, COUNT(*) as count
            FROM placeholders
            WHERE key = ANY($1)
            GROUP BY key, scene
            ORDER BY key, scene
        """, STANDARD_KEYS)
        
        print("\n标准占位符统计:")
        for p in all_placeholders:
            scene = p['scene'] or '(无场景)'
            print(f"  {p['key']} - {scene}: {p['count']} 条")
        
        # 检查是否还有旧格式
        old_format_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM placeholders
            WHERE key = ANY($1)
        """, OLD_FORMAT_KEYS)
        
        if old_format_count > 0:
            print(f"\n⚠️  仍有 {old_format_count} 条旧格式占位符未删除")
        else:
            print("\n✅ 所有旧格式占位符已清理")
        
        print("\n" + "=" * 80)
        print("清理完成！")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ 清理失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    print("⚠️  此脚本将删除重复和旧格式的占位符")
    print("⚠️  请确认是否继续 (y/n): ", end="")
    response = input().strip().lower()
    if response == 'y':
        asyncio.run(cleanup_placeholders())
    else:
        print("已取消")
