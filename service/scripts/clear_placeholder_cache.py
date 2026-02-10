# -*- coding: utf-8 -*-
"""
清除占位符缓存
"""
import asyncio
import sys
from pathlib import Path
import redis.asyncio as redis

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings
import os


async def clear_cache():
    """清除占位符相关的缓存"""
    redis_host = os.getenv("REDIS_HOST", settings.REDIS_HOST)
    redis_port = int(os.getenv("REDIS_PORT", settings.REDIS_PORT))
    redis_password = os.getenv("REDIS_PASSWORD", settings.REDIS_PASSWORD) or None
    redis_db = int(os.getenv("REDIS_DB", settings.REDIS_DB))
    
    print("🚀 开始清除占位符缓存...")
    print(f"🔗 连接到 Redis: {redis_host}:{redis_port} (db={redis_db})")
    
    redis_client = await redis.Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password,
        db=redis_db,
        decode_responses=True,
    )
    
    try:
        # 查找所有占位符相关的缓存 key
        pattern = "cache:placeholder:*"
        keys = []
        async for key in redis_client.scan_iter(match=pattern):
            keys.append(key)
        
        if keys:
            print(f"📋 找到 {len(keys)} 个占位符缓存 key")
            await redis_client.delete(*keys)
            print(f"✅ 成功清除 {len(keys)} 个占位符缓存")
            
            # 显示部分 key（最多10个）
            print("\n已清除的缓存 key（部分）:")
            for key in keys[:10]:
                print(f"  - {key}")
            if len(keys) > 10:
                print(f"  ... 还有 {len(keys) - 10} 个")
        else:
            print("ℹ️  未找到占位符缓存")
        
        print("\n✨ 完成！")
    except Exception as e:
        print(f"❌ 清除缓存失败: {e}")
        raise
    finally:
        await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(clear_cache())
