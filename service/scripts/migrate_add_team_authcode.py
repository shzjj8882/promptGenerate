#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库迁移脚本：为团队表添加 authcode 字段，并为现有团队生成 authcode
"""
import asyncio
import sys
import os
import secrets
import string

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine


def generate_authcode() -> str:
    """生成 API 认证码（32位随机字符串）"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))


async def migrate():
    """执行迁移"""
    async with engine.begin() as conn:
        print("开始迁移：为团队表添加 authcode 字段...")
        
        # 1. 检查 authcode 列是否已存在
        check_column_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'teams' AND column_name = 'authcode'
        """)
        result = await conn.execute(check_column_query)
        column_exists = result.scalar_one_or_none() is not None
        
        if not column_exists:
            print("添加 authcode 列...")
            # 添加 authcode 列（允许为空，稍后填充）
            await conn.execute(text("""
                ALTER TABLE teams 
                ADD COLUMN authcode VARCHAR NULL
            """))
            print("✓ authcode 列已添加")
        else:
            print("✓ authcode 列已存在，跳过添加")
        
        # 2. 为现有团队生成 authcode
        print("为现有团队生成 authcode...")
        
        # 获取所有没有 authcode 的团队
        get_teams_query = text("SELECT id FROM teams WHERE authcode IS NULL")
        result = await conn.execute(get_teams_query)
        teams_without_authcode = result.fetchall()
        
        if teams_without_authcode:
            print(f"找到 {len(teams_without_authcode)} 个需要生成 authcode 的团队")
            
            for (team_id,) in teams_without_authcode:
                # 生成唯一的 authcode
                authcode = generate_authcode()
                
                # 检查是否已存在（极小概率）
                check_unique_query = text("SELECT id FROM teams WHERE authcode = :authcode")
                existing = await conn.execute(check_unique_query, {"authcode": authcode})
                while existing.scalar_one_or_none():
                    authcode = generate_authcode()
                    existing = await conn.execute(check_unique_query, {"authcode": authcode})
                
                # 更新团队的 authcode
                update_query = text("UPDATE teams SET authcode = :authcode WHERE id = :team_id")
                await conn.execute(update_query, {"authcode": authcode, "team_id": team_id})
                print(f"  ✓ 团队 {team_id} 的 authcode 已生成")
            
            print(f"✓ 已为 {len(teams_without_authcode)} 个团队生成 authcode")
        else:
            print("✓ 所有团队都已拥有 authcode")
        
        # 3. 添加唯一索引
        print("添加 authcode 唯一索引...")
        try:
            await conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_authcode 
                ON teams(authcode) 
                WHERE authcode IS NOT NULL
            """))
            print("✓ authcode 唯一索引已添加")
        except Exception as e:
            print(f"  ⚠ 索引可能已存在: {e}")
        
        # 4. 添加普通索引（用于查询）
        print("添加 authcode 查询索引...")
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_teams_authcode_query 
                ON teams(authcode)
            """))
            print("✓ authcode 查询索引已添加")
        except Exception as e:
            print(f"  ⚠ 索引可能已存在: {e}")
        
        print("\n迁移完成！")


if __name__ == "__main__":
    asyncio.run(migrate())
