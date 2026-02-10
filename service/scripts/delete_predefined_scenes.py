# -*- coding: utf-8 -*-
"""
删除预置场景
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def delete_predefined():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        print("🚀 开始删除预置场景...")
        
        # 1. 删除预置场景的关联关系
        print("\n1. 删除预置场景的关联关系...")
        predefined_codes = ['research', 'ppt_report', 'sales_order']
        placeholders_str = ','.join([f"'{code}'" for code in predefined_codes])
        
        deleted_associations = await conn.execute(f"""
            DELETE FROM scene_placeholders
            WHERE scene_id IN (
                SELECT id FROM scenes WHERE code IN ({placeholders_str})
            )
        """)
        print(f"   ✅ 已删除预置场景的关联关系")
        
        # 2. 删除预置场景
        print("\n2. 删除预置场景...")
        deleted_scenes = await conn.execute(f"""
            DELETE FROM scenes
            WHERE code IN ({placeholders_str})
        """)
        print(f"   ✅ 已删除预置场景")
        
        # 3. 验证结果
        print("\n3. 验证删除结果...")
        remaining_scenes = await conn.fetch("SELECT code, name FROM scenes ORDER BY code")
        print(f"   剩余场景数量: {len(remaining_scenes)}")
        if remaining_scenes:
            for scene in remaining_scenes:
                print(f"     - {scene['code']}: {scene['name']}")
        else:
            print("     （无）")
        
        print("\n✨ 删除完成！")
        
    except Exception as e:
        print(f"❌ 删除失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    print("⚠️  警告：此操作将删除所有预置场景（research, ppt_report, sales_order）！")
    print("按 Ctrl+C 取消，或等待 3 秒后继续...")
    
    try:
        import time
        time.sleep(3)
    except KeyboardInterrupt:
        print("\n❌ 操作已取消")
        sys.exit(0)
    
    asyncio.run(delete_predefined())
