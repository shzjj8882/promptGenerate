# -*- coding: utf-8 -*-
"""
检查 scenes 表中是否有重复的场景代码（全局场景）
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def check():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 检查是否有多个全局场景（team_id IS NULL）使用相同的 code
        duplicates = await conn.fetch("""
            SELECT code, COUNT(*) as count
            FROM scenes
            WHERE team_id IS NULL
            GROUP BY code
            HAVING COUNT(*) > 1
        """)
        
        if duplicates:
            print("⚠️  发现重复的全局场景代码:")
            for row in duplicates:
                print(f"  - code='{row['code']}' 出现了 {row['count']} 次")
                
                # 显示详细信息
                scenes = await conn.fetch("""
                    SELECT id, code, name, team_id, team_code, created_at
                    FROM scenes
                    WHERE code = $1 AND team_id IS NULL
                    ORDER BY created_at
                """, row['code'])
                
                print(f"    详细信息:")
                for scene in scenes:
                    print(f"      - id={scene['id']}, name={scene['name']}, created_at={scene['created_at']}")
        else:
            print("✅ 没有发现重复的全局场景代码")
        
        # 检查所有场景的 code 和 team_id 组合
        print("\n所有场景的 code 和 team_id 组合:")
        all_scenes = await conn.fetch("""
            SELECT code, team_id, team_code, COUNT(*) as count
            FROM scenes
            GROUP BY code, team_id, team_code
            ORDER BY code, team_id NULLS FIRST
        """)
        
        for scene in all_scenes:
            print(f"  - code='{scene['code']}', team_id={scene['team_id']}, team_code={scene['team_code']}, count={scene['count']}")
            
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check())
