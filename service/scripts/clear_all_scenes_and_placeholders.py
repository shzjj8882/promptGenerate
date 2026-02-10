# -*- coding: utf-8 -*-
"""
删除所有占位符和场景数据（保留预置场景）
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings

# 预置场景代码（不能删除）
PREDEFINED_SCENE_CODES = {"research", "ppt_report", "sales_order"}


async def clear():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        print("🚀 开始清理占位符和场景数据...")
        
        # 1. 删除场景和占位符的关联关系
        print("\n1. 删除场景和占位符的关联关系...")
        deleted_associations = await conn.execute("DELETE FROM scene_placeholders")
        print(f"   ✅ 已删除所有关联关系")
        
        # 2. 删除所有占位符（保留预置场景相关的占位符需要单独处理）
        print("\n2. 删除所有占位符...")
        deleted_placeholders = await conn.execute("DELETE FROM placeholders")
        print(f"   ✅ 已删除所有占位符")
        
        # 3. 删除非预置场景
        print("\n3. 删除非预置场景...")
        # 构建预置场景代码的 SQL IN 子句
        predefined_codes = list(PREDEFINED_SCENE_CODES)
        placeholders_str = ','.join([f"'{code}'" for code in predefined_codes])
        
        deleted_scenes = await conn.execute(f"""
            DELETE FROM scenes
            WHERE code NOT IN ({placeholders_str})
        """)
        print(f"   ✅ 已删除所有非预置场景")
        
        # 4. 清理场景相关的缓存
        print("\n4. 清理缓存...")
        try:
            import redis.asyncio as redis
            import os
            
            redis_host = os.getenv("REDIS_HOST", settings.REDIS_HOST)
            redis_port = int(os.getenv("REDIS_PORT", settings.REDIS_PORT))
            redis_password = os.getenv("REDIS_PASSWORD", settings.REDIS_PASSWORD) or None
            redis_db = int(os.getenv("REDIS_DB", settings.REDIS_DB))
            
            redis_client = await redis.Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password,
                db=redis_db,
                decode_responses=True,
            )
            
            try:
                # 清除场景缓存
                scene_keys = []
                async for key in redis_client.scan_iter(match="cache:scene:*"):
                    scene_keys.append(key)
                if scene_keys:
                    await redis_client.delete(*scene_keys)
                    print(f"   ✅ 已清除 {len(scene_keys)} 个场景缓存")
                
                # 清除占位符缓存
                placeholder_keys = []
                async for key in redis_client.scan_iter(match="cache:placeholder:*"):
                    placeholder_keys.append(key)
                if placeholder_keys:
                    await redis_client.delete(*placeholder_keys)
                    print(f"   ✅ 已清除 {len(placeholder_keys)} 个占位符缓存")
            finally:
                await redis_client.aclose()
        except Exception as e:
            print(f"   ⚠️  清理缓存失败（可忽略）: {e}")
        
        # 5. 验证结果
        print("\n5. 验证清理结果...")
        remaining_scenes = await conn.fetch("SELECT code, name FROM scenes ORDER BY code")
        print(f"   剩余场景数量: {len(remaining_scenes)}")
        for scene in remaining_scenes:
            print(f"     - {scene['code']}: {scene['name']}")
        
        remaining_placeholders = await conn.fetch("SELECT COUNT(*) as count FROM placeholders")
        placeholder_count = remaining_placeholders[0]['count'] if remaining_placeholders else 0
        print(f"   剩余占位符数量: {placeholder_count}")
        
        remaining_associations = await conn.fetch("SELECT COUNT(*) as count FROM scene_placeholders")
        association_count = remaining_associations[0]['count'] if remaining_associations else 0
        print(f"   剩余关联关系数量: {association_count}")
        
        print("\n✨ 清理完成！")
        
    except Exception as e:
        print(f"❌ 清理失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    print("⚠️  警告：此操作将删除所有占位符和非预置场景数据！")
    print("预置场景（research, ppt_report, sales_order）将被保留。")
    print("按 Ctrl+C 取消，或等待 5 秒后继续...")
    
    try:
        import time
        time.sleep(5)
    except KeyboardInterrupt:
        print("\n❌ 操作已取消")
        sys.exit(0)
    
    asyncio.run(clear())
