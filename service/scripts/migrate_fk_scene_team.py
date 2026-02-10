# -*- coding: utf-8 -*-
"""
为 prompts/placeholders 增加 scene_id 外键，为 users/tenants/roles/scenes/prompts/rags 增加 team_id 外键，
并为 tenants/rags 的 created_by/updated_by 增加 users.id 外键约束。
保留 scene、team_code 等字段以兼容现有逻辑；新字段可逐步用于 JOIN 与一致性校验。
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
        # 1. prompts: scene_id
        await conn.execute("""
            ALTER TABLE prompts ADD COLUMN IF NOT EXISTS scene_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE prompts p SET scene_id = s.id FROM scenes s WHERE s.code = p.scene;
        """)
        await conn.execute("""
            ALTER TABLE prompts DROP CONSTRAINT IF EXISTS fk_prompts_scene;
            ALTER TABLE prompts ADD CONSTRAINT fk_prompts_scene
                FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_prompts_scene_id ON prompts(scene_id);")

        # 2. placeholders: scene_id
        await conn.execute("""
            ALTER TABLE placeholders ADD COLUMN IF NOT EXISTS scene_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE placeholders p SET scene_id = s.id FROM scenes s WHERE s.code = p.scene;
        """)
        await conn.execute("""
            ALTER TABLE placeholders DROP CONSTRAINT IF EXISTS fk_placeholders_scene;
            ALTER TABLE placeholders ADD CONSTRAINT fk_placeholders_scene
                FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_placeholders_scene_id ON placeholders(scene_id);")

        # 3. users: team_id
        await conn.execute("""
            ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE users u SET team_id = t.id FROM teams t WHERE t.code = u.team_code;
        """)
        await conn.execute("""
            ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_team;
            ALTER TABLE users ADD CONSTRAINT fk_users_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);")

        # 4. tenants: team_id + created_by/updated_by FK
        await conn.execute("""
            ALTER TABLE tenants ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE tenants tn SET team_id = t.id FROM teams t WHERE t.code = tn.team_code;
        """)
        await conn.execute("""
            ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_team;
            ALTER TABLE tenants ADD CONSTRAINT fk_tenants_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_tenants_team_id ON tenants(team_id);")
        # 将不存在于 users 的 created_by/updated_by 置空后再加外键
        await conn.execute("""
            UPDATE tenants SET created_by = NULL WHERE created_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = tenants.created_by);
        """)
        await conn.execute("""
            UPDATE tenants SET updated_by = NULL WHERE updated_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = tenants.updated_by);
        """)
        await conn.execute("""
            ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_created_by;
            ALTER TABLE tenants ADD CONSTRAINT fk_tenants_created_by
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
        """)
        await conn.execute("""
            ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_updated_by;
            ALTER TABLE tenants ADD CONSTRAINT fk_tenants_updated_by
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
        """)

        # 5. roles: team_id
        await conn.execute("""
            ALTER TABLE roles ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE roles r SET team_id = t.id FROM teams t WHERE t.code = r.team_code;
        """)
        await conn.execute("""
            ALTER TABLE roles DROP CONSTRAINT IF EXISTS fk_roles_team;
            ALTER TABLE roles ADD CONSTRAINT fk_roles_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_roles_team_id ON roles(team_id);")

        # 6. scenes: team_id
        await conn.execute("""
            ALTER TABLE scenes ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE scenes s SET team_id = t.id FROM teams t WHERE t.code = s.team_code;
        """)
        await conn.execute("""
            ALTER TABLE scenes DROP CONSTRAINT IF EXISTS fk_scenes_team;
            ALTER TABLE scenes ADD CONSTRAINT fk_scenes_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_team_id ON scenes(team_id);")

        # 7. prompts: team_id (already have scene_id)
        await conn.execute("""
            ALTER TABLE prompts ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE prompts p SET team_id = t.id FROM teams t WHERE t.code = p.team_code;
        """)
        await conn.execute("""
            ALTER TABLE prompts DROP CONSTRAINT IF EXISTS fk_prompts_team;
            ALTER TABLE prompts ADD CONSTRAINT fk_prompts_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_prompts_team_id ON prompts(team_id);")

        # 8. rags: team_id + created_by/updated_by FK
        await conn.execute("""
            ALTER TABLE rags ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
        """)
        await conn.execute("""
            UPDATE rags r SET team_id = t.id FROM teams t WHERE t.code = r.team_code;
        """)
        await conn.execute("""
            ALTER TABLE rags DROP CONSTRAINT IF EXISTS fk_rags_team;
            ALTER TABLE rags ADD CONSTRAINT fk_rags_team
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_rags_team_id ON rags(team_id);")
        await conn.execute("""
            UPDATE rags SET created_by = NULL WHERE created_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = rags.created_by);
        """)
        await conn.execute("""
            UPDATE rags SET updated_by = NULL WHERE updated_by IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = rags.updated_by);
        """)
        await conn.execute("""
            ALTER TABLE rags DROP CONSTRAINT IF EXISTS fk_rags_created_by;
            ALTER TABLE rags ADD CONSTRAINT fk_rags_created_by
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
        """)
        await conn.execute("""
            ALTER TABLE rags DROP CONSTRAINT IF EXISTS fk_rags_updated_by;
            ALTER TABLE rags ADD CONSTRAINT fk_rags_updated_by
                FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
        """)

        print("✅ scene_id / team_id / created_by·updated_by 外键迁移成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
