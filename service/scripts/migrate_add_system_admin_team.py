"""
迁移脚本：添加系统管理员团队标识字段
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text
from app.core.database import AsyncSessionLocal


async def migrate():
    """添加 is_system_admin_team 字段到 teams 表"""
    async with AsyncSessionLocal() as session:
        try:
            # 检查字段是否已存在
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'teams' AND column_name = 'is_system_admin_team'
            """)
            result = await session.execute(check_column_query)
            if result.fetchone():
                print("字段 is_system_admin_team 已存在，跳过迁移")
                return
            
            # 添加字段
            add_column_query = text("""
                ALTER TABLE teams 
                ADD COLUMN is_system_admin_team BOOLEAN DEFAULT FALSE NOT NULL
            """)
            await session.execute(add_column_query)
            
            # 创建索引
            create_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_teams_is_system_admin_team 
                ON teams(is_system_admin_team)
            """)
            await session.execute(create_index_query)
            
            await session.commit()
            print("✅ 成功添加 is_system_admin_team 字段到 teams 表")
            
            # 查找现有的系统管理员用户，将他们的团队标记为系统管理员团队
            update_system_admin_teams_query = text("""
                UPDATE teams 
                SET is_system_admin_team = TRUE 
                WHERE id IN (
                    SELECT DISTINCT team_id 
                    FROM users 
                    WHERE is_superuser = TRUE AND team_id IS NOT NULL
                )
            """)
            result = await session.execute(update_system_admin_teams_query)
            await session.commit()
            print(f"✅ 已更新 {result.rowcount} 个系统管理员团队")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ 迁移失败: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(migrate())
