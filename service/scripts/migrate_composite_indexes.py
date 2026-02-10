# -*- coding: utf-8 -*-
"""
为常用查询添加复合索引的数据库迁移脚本

- customer_history: (tenant_id, deleted)、(member_user_id, deleted) 便于按租户/用户筛未删除列表
- prompts: (tenant_id, scene) 便于按租户+场景查提示词；(scene, is_default, team_code) 便于查默认提示词
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """创建复合索引"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # customer_history：按租户/用户筛未删除列表
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_tenant_deleted
            ON customer_history(tenant_id, deleted);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_customer_history_member_deleted
            ON customer_history(member_user_id, deleted);
        """)

        # prompts：按租户+场景查提示词（/api/prompts/{scene}?tenant_id=xxx）
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_prompts_tenant_scene
            ON prompts(tenant_id, scene);
        """)
        # prompts：按场景+是否默认+团队查默认提示词
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_prompts_scene_default_team
            ON prompts(scene, is_default, team_code);
        """)

        # 多维表格行：优化按表格和团队查询行的性能
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_multi_dimension_table_rows_table_team
            ON multi_dimension_table_rows(table_id, team_id);
        """)
        
        # 多维表格单元格：优化批量查询单元格的性能（按表格和行ID）
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_multi_dimension_table_cells_table_row
            ON multi_dimension_table_cells(table_id, row_id);
        """)
        
        # 多维表格单元格：优化按行ID批量查询（用于行列表查询）
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_multi_dimension_table_cells_row_id
            ON multi_dimension_table_cells(row_id);
        """)

        print("✅ 复合索引创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
