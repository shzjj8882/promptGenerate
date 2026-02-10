#!/usr/bin/env python3
"""
清除菜单树缓存脚本
用于清除所有菜单树相关的 Redis 缓存
"""
import asyncio
import redis.asyncio as redis
import os


async def clear_menu_tree_cache():
    """清除所有菜单树缓存"""
    # 从环境变量读取 Redis 配置，如果没有则使用默认值
    redis_host = os.getenv('REDIS_HOST', 'localhost')
    redis_port = int(os.getenv('REDIS_PORT', '6379'))
    redis_password = os.getenv('REDIS_PASSWORD', '') or None
    redis_db = int(os.getenv('REDIS_DB', '0'))
    
    print(f"🔗 连接到 Redis: {redis_host}:{redis_port} (db={redis_db})")
    
    try:
        # 创建 Redis 连接
        redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            db=redis_db,
            decode_responses=True
        )
        
        # 测试连接
        await redis_client.ping()
        print("✅ Redis 连接成功\n")
        
        # 查找所有匹配的 key
        cache_prefix = "menu_tree:v1:"
        pattern = f"{cache_prefix}*"
        print(f"🔍 查找匹配的缓存 key: {pattern}")
        
        # 使用 SCAN 迭代查找所有匹配的 key（避免阻塞）
        keys_to_delete = []
        async for key in redis_client.scan_iter(match=pattern):
            keys_to_delete.append(key)
        
        if not keys_to_delete:
            print("✅ 没有找到需要清除的缓存")
            await redis_client.aclose()
            return
        
        print(f"📋 找到 {len(keys_to_delete)} 个缓存 key")
        
        # 批量删除
        if keys_to_delete:
            deleted_count = await redis_client.delete(*keys_to_delete)
            print(f"✅ 成功清除 {deleted_count} 个菜单树缓存")
            
            # 显示部分被清除的 key（最多显示 10 个）
            print("\n已清除的缓存 key（部分）:")
            for i, key in enumerate(keys_to_delete[:10]):
                print(f"  - {key}")
            if len(keys_to_delete) > 10:
                print(f"  ... 还有 {len(keys_to_delete) - 10} 个")
        
        await redis_client.close()
        
    except redis.ConnectionError as e:
        print(f"❌ Redis 连接失败: {e}")
        print("💡 请确保 Redis 服务正在运行")
    except Exception as e:
        print(f"❌ 清除缓存时出错: {e}")


if __name__ == "__main__":
    print("🚀 开始清除菜单树缓存...\n")
    asyncio.run(clear_menu_tree_cache())
    print("\n✨ 完成！")
