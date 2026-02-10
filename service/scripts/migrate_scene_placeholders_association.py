# -*- coding: utf-8 -*-
"""
迁移场景和占位符的关系：从直接关联改为多对多关联表

1. 创建关联表 scene_placeholders
2. 将现有占位符迁移为全局占位符（scene=""），并建立关联关系
3. 移除旧的唯一约束 uq_placeholder_key_scene，添加新的唯一约束 key 全局唯一
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncpg
from app.core.config import settings


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        print("开始迁移场景和占位符的关系...")
        
        # 1. 创建关联表 scene_placeholders
        print("1. 创建关联表 scene_placeholders...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scene_placeholders (
                scene_id VARCHAR(36) NOT NULL,
                placeholder_id VARCHAR(36) NOT NULL,
                PRIMARY KEY (scene_id, placeholder_id),
                CONSTRAINT fk_scene_placeholders_scene
                    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
                CONSTRAINT fk_scene_placeholders_placeholder
                    FOREIGN KEY (placeholder_id) REFERENCES placeholders(id) ON DELETE CASCADE
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scene_placeholders_scene_id ON scene_placeholders(scene_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scene_placeholders_placeholder_id ON scene_placeholders(placeholder_id);")
        print("  ✓ 关联表创建完成")
        
        # 2. 迁移现有数据：将占位符的 scene 字段值保存到关联表中，然后将占位符的 scene 设置为 ""
        print("2. 迁移现有占位符数据...")
        
        # 查询所有有 scene 的占位符（scene != ""）
        placeholders_with_scene = await conn.fetch("""
            SELECT p.id, p.scene, p.key, p.label
            FROM placeholders p
            WHERE p.scene != '' AND p.scene IS NOT NULL
        """)
        
        print(f"  找到 {len(placeholders_with_scene)} 个需要迁移的占位符")
        
        # 为每个占位符建立关联关系
        migrated_count = 0
        for placeholder in placeholders_with_scene:
            placeholder_id = placeholder['id']
            scene_code = placeholder['scene']
            placeholder_key = placeholder['key']
            placeholder_label = placeholder['label']
            
            # 查找场景 ID
            scene_row = await conn.fetchrow(
                "SELECT id FROM scenes WHERE code = $1",
                scene_code
            )
            
            if not scene_row:
                print(f"  ⚠️  场景 '{scene_code}' 不存在，跳过占位符 {placeholder_key} ({placeholder_id})")
                continue
            
            scene_id = scene_row['id']
            
            # 检查是否已存在关联关系
            existing = await conn.fetchrow(
                "SELECT 1 FROM scene_placeholders WHERE scene_id = $1 AND placeholder_id = $2",
                scene_id, placeholder_id
            )
            
            if existing:
                print(f"  ⚠️  关联关系已存在：场景 {scene_code} <-> 占位符 {placeholder_key}")
            else:
                # 建立关联关系
                await conn.execute(
                    "INSERT INTO scene_placeholders (scene_id, placeholder_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    scene_id, placeholder_id
                )
                print(f"  ✓ 建立关联：场景 {scene_code} <-> 占位符 {placeholder_key}")
                migrated_count += 1
        
        print(f"  ✓ 迁移了 {migrated_count} 个占位符的关联关系")
        
        # 3. 先移除旧的唯一约束，以便后续更新 scene 字段
        print("3. 移除旧的唯一约束...")
        constraint_exists = await conn.fetchval("""
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'uq_placeholder_key_scene'
            AND conrelid = 'placeholders'::regclass
        """)
        
        if constraint_exists:
            await conn.execute("ALTER TABLE placeholders DROP CONSTRAINT IF EXISTS uq_placeholder_key_scene;")
            print("  ✓ 移除了旧的唯一约束 uq_placeholder_key_scene")
        else:
            print("  ✓ 旧的唯一约束不存在，跳过")
        
        # 4. 处理重复的 key：如果有多个占位符使用相同的 key，保留第一个活跃的，其他的标记为不活跃
        print("4. 处理重复的 key...")
        # 先检查所有占位符（包括不活跃的）的重复 key
        all_duplicate_keys = await conn.fetch("""
            SELECT key, COUNT(*) as count, array_agg(id ORDER BY is_active DESC, created_at) as ids,
                   array_agg(is_active ORDER BY is_active DESC, created_at) as active_flags
            FROM placeholders
            GROUP BY key
            HAVING COUNT(*) > 1
        """)
        
        deduplicated_count = 0
        for dup in all_duplicate_keys:
            key = dup['key']
            ids = dup['ids']
            active_flags = dup['active_flags']
            
            # 优先保留活跃的占位符，如果都是活跃的或不活跃的，保留最早创建的
            keep_id = None
            remove_ids = []
            
            # 找到第一个活跃的占位符，如果没有活跃的，保留第一个
            for i, (ph_id, is_active) in enumerate(zip(ids, active_flags)):
                if is_active and keep_id is None:
                    keep_id = ph_id
                elif keep_id is None and i == 0:
                    keep_id = ph_id
                else:
                    remove_ids.append(ph_id)
            
            for remove_id in remove_ids:
                # 先删除关联表中的记录
                await conn.execute(
                    "DELETE FROM scene_placeholders WHERE placeholder_id = $1",
                    remove_id
                )
                # 然后删除占位符（因为唯一约束要求 key 全局唯一）
                await conn.execute(
                    "DELETE FROM placeholders WHERE id = $1",
                    remove_id
                )
                print(f"  ⚠️  删除占位符 key={key} (id={remove_id})（保留 id={keep_id}）")
                deduplicated_count += 1
        
        if deduplicated_count > 0:
            print(f"  ✓ 处理了 {len(all_duplicate_keys)} 个重复的 key，删除了 {deduplicated_count} 个重复的占位符")
        else:
            print("  ✓ 没有发现重复的 key")
        
        # 5. 将所有占位符的 scene 设置为 ""（全局占位符）
        print("5. 将所有占位符的 scene 设置为空字符串（全局占位符）...")
        result = await conn.execute("""
            UPDATE placeholders SET scene = '', scene_id = NULL
        """)
        print(f"  ✓ 更新了所有占位符的 scene 字段")
        
        # 6. 添加新的唯一约束（key 全局唯一）
        print("6. 添加新的唯一约束...")
        
        key_unique_exists = await conn.fetchval("""
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'uq_placeholder_key'
            AND conrelid = 'placeholders'::regclass
        """)
        
        if not key_unique_exists:
            # 再次检查是否还有重复的 key（应该已经在上一步删除了）
            duplicate_all = await conn.fetchval("""
                SELECT COUNT(*) FROM (
                    SELECT key FROM placeholders GROUP BY key HAVING COUNT(*) > 1
                ) t
            """)
            
            if duplicate_all and duplicate_all > 0:
                print(f"  ⚠️  警告：仍有 {duplicate_all} 个重复的 key，无法添加唯一约束")
                print("  请手动处理重复的 key 后重新运行迁移脚本")
            else:
                try:
                    await conn.execute("ALTER TABLE placeholders ADD CONSTRAINT uq_placeholder_key UNIQUE (key);")
                    print("  ✓ 添加了新的唯一约束 uq_placeholder_key（key 全局唯一）")
                except Exception as e:
                    print(f"  ⚠️  添加唯一约束失败: {e}")
                    print("  可能仍有重复的 key，请检查数据库")
        else:
            print("  ✓ 唯一约束 uq_placeholder_key 已存在")
        
        print("\n迁移完成！")
        print(f"  - 创建了关联表 scene_placeholders")
        print(f"  - 迁移了 {migrated_count} 个占位符的关联关系")
        print(f"  - 移除了旧的唯一约束 uq_placeholder_key_scene")
        print(f"  - 将所有占位符设置为全局占位符（scene=''）")
        print(f"  - 添加了新的唯一约束 uq_placeholder_key（key 全局唯一）")
        
    except Exception as e:
        print(f"\n迁移失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
