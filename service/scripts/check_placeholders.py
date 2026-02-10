# -*- coding: utf-8 -*-
"""
检查占位符数据，分析重复情况
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncpg
from app.core.config import settings


# 需要检查的占位符 key
TARGET_KEYS = [
    "conversationId",
    "companyRag",
    "customRagInfos",
    "salePhaseRag",
    "userName",
    "companyRagAbbr",
]


async def check_placeholders():
    """检查占位符数据"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 查询所有占位符
        all_placeholders = await conn.fetch("""
            SELECT id, key, label, scene, description, is_active, created_at
            FROM placeholders
            ORDER BY key, scene, created_at
        """)
        
        print("=" * 80)
        print("所有占位符列表")
        print("=" * 80)
        
        # 按 key 分组统计
        key_groups = {}
        for p in all_placeholders:
            key = p['key']
            if key not in key_groups:
                key_groups[key] = []
            key_groups[key].append(p)
        
        # 显示目标占位符的详细信息
        print("\n【目标占位符详情】")
        print("-" * 80)
        for key in TARGET_KEYS:
            if key in key_groups:
                items = key_groups[key]
                print(f"\n📌 {key} (共 {len(items)} 条):")
                for i, item in enumerate(items, 1):
                    scene = item['scene'] or '(无场景)'
                    print(f"  {i}. ID: {item['id']}")
                    print(f"     Label: {item['label']}")
                    print(f"     Scene: {scene}")
                    print(f"     Description: {item['description'] or '(无描述)'}")
                    print(f"     Is Active: {item['is_active']}")
                    print(f"     Created At: {item['created_at']}")
                    print()
            else:
                print(f"\n⚠️  {key}: 未找到")
        
        # 统计重复情况
        print("\n【重复情况分析】")
        print("-" * 80)
        duplicates = []
        for key in TARGET_KEYS:
            if key in key_groups:
                items = key_groups[key]
                if len(items) > 1:
                    duplicates.append((key, items))
                    print(f"\n❌ {key} 有 {len(items)} 条重复记录:")
                    scenes = [item['scene'] or '(无场景)' for item in items]
                    print(f"   场景分布: {', '.join(set(scenes))}")
                    for item in items:
                        print(f"   - ID: {item['id']}, Scene: {item['scene'] or '(无场景)'}, Active: {item['is_active']}")
        
        if not duplicates:
            print("\n✅ 目标占位符没有重复记录")
        
        # 显示所有占位符的统计
        print("\n【所有占位符统计】")
        print("-" * 80)
        print(f"总占位符数: {len(all_placeholders)}")
        print(f"唯一 key 数: {len(key_groups)}")
        print(f"\n按 key 分组统计:")
        for key, items in sorted(key_groups.items()):
            scenes = set(item['scene'] or '(无场景)' for item in items)
            active_count = sum(1 for item in items if item['is_active'])
            print(f"  {key}: {len(items)} 条 (活跃: {active_count}, 场景: {len(scenes)})")
            if len(items) > 1:
                print(f"    ⚠️  重复! 场景: {', '.join(scenes)}")
        
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check_placeholders())
