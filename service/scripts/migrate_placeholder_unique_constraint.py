# -*- coding: utf-8 -*-
"""
数据库迁移脚本 - 修复 placeholders 表的唯一约束
将 key 字段的全局唯一约束改为 (key, scene) 的组合唯一约束
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate_placeholder_constraint():
    """迁移 placeholders 表的唯一约束"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("开始迁移 placeholders 表的唯一约束...")
        
        # 检查旧的唯一约束是否存在
        check_old_constraint = """
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'placeholders' 
        AND constraint_name = 'placeholders_key_key';
        """
        old_constraint = await conn.fetch(check_old_constraint)
        
        # 检查是否有外键依赖
        check_fk = """
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'placeholder_data_sources' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%placeholder_key%';
        """
        fk_constraints = await conn.fetch(check_fk)
        
        # 先删除外键约束（如果有）
        if fk_constraints:
            for fk in fk_constraints:
                fk_name = fk['constraint_name']
                print(f"删除外键约束 {fk_name}...")
                await conn.execute(f"""
                    ALTER TABLE placeholder_data_sources 
                    DROP CONSTRAINT IF EXISTS {fk_name};
                """)
            print("✓ 删除外键约束成功")
        
        if old_constraint:
            print("删除旧的唯一约束 placeholders_key_key...")
            await conn.execute("""
                ALTER TABLE placeholders 
                DROP CONSTRAINT IF EXISTS placeholders_key_key CASCADE;
            """)
            print("✓ 删除旧约束成功")
        else:
            print("✓ 旧约束不存在，跳过删除")
        
        # 检查新的组合唯一约束是否已存在
        check_new_constraint = """
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'placeholders' 
        AND constraint_name = 'uq_placeholder_key_scene';
        """
        new_constraint = await conn.fetch(check_new_constraint)
        
        if not new_constraint:
            print("添加新的组合唯一约束 (key, scene)...")
            await conn.execute("""
                ALTER TABLE placeholders 
                ADD CONSTRAINT uq_placeholder_key_scene UNIQUE (key, scene);
            """)
            print("✓ 添加新约束成功")
        else:
            print("✓ 新约束已存在，跳过添加")
        
        # 重新添加外键约束（如果需要）
        # 注意：由于现在 key 不是全局唯一的，外键需要引用 (key, scene) 组合
        # 但 PostgreSQL 不支持多列外键引用唯一约束，所以这里先不添加外键
        # 如果需要外键，可以考虑使用 placeholder_id 而不是 placeholder_key
        if fk_constraints:
            print("⚠️  注意：由于唯一约束改为组合约束，外键约束需要重新设计")
            print("   建议：将 placeholder_data_sources.placeholder_key 改为 placeholder_id")
        
        print("迁移完成！")
        
    except Exception as e:
        print(f"迁移失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await migrate_placeholder_constraint()


if __name__ == "__main__":
    asyncio.run(main())
