# -*- coding: utf-8 -*-
"""
测试场景查询逻辑
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def test():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 测试场景代码 'dev'
        scene_code = 'dev'
        
        # 1. 查询全局场景（team_id IS NULL）
        print("1. 查询全局场景（team_id IS NULL）:")
        result1 = await conn.fetch("""
            SELECT id, code, team_id, team_code
            FROM scenes
            WHERE code = $1 AND team_id IS NULL
        """, scene_code)
        print(f"   返回 {len(result1)} 行")
        for row in result1:
            print(f"     - id={row['id']}, code={row['code']}, team_id={row['team_id']}, team_code={row['team_code']}")
        
        # 2. 查询所有 'dev' 场景（不限制 team_id）
        print("\n2. 查询所有 'dev' 场景（不限制 team_id）:")
        result2 = await conn.fetch("""
            SELECT id, code, team_id, team_code
            FROM scenes
            WHERE code = $1
        """, scene_code)
        print(f"   返回 {len(result2)} 行")
        for row in result2:
            print(f"     - id={row['id']}, code={row['code']}, team_id={row['team_id']}, team_code={row['team_code']}")
        
        # 3. 测试团队场景查询（team_id=3da83bd7-2544-455c-918a-d8b4dfe122ee）
        team_id = '3da83bd7-2544-455c-918a-d8b4dfe122ee'
        print(f"\n3. 查询团队场景（team_id={team_id}）:")
        result3 = await conn.fetch("""
            SELECT id, code, team_id, team_code
            FROM scenes
            WHERE code = $1 AND team_id = $2
        """, scene_code, team_id)
        print(f"   返回 {len(result3)} 行")
        for row in result3:
            print(f"     - id={row['id']}, code={row['code']}, team_id={row['team_id']}, team_code={row['team_code']}")
            
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(test())
