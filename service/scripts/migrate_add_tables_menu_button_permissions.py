# -*- coding: utf-8 -*-
"""
添加多维表格的菜单按钮权限（type=menu）
对应前端 app/lib/permissions.ts 中的 MENU_BUTTON_PERMISSIONS.tables
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 多维表格菜单按钮权限种子：(code, name, resource, action, description)
# code 与前端 MENU_BUTTON_PERMISSIONS.tables 对应
MENU_BUTTON_PERMISSIONS = [
    ("menu:tables:create", "多维表格-新建", "tables", "menu_create", "多维表格管理页「新建表格」按钮，由菜单权限控制"),
    ("menu:tables:update", "多维表格-编辑", "tables", "menu_update", "多维表格管理页「编辑」按钮，由菜单权限控制"),
    ("menu:tables:delete", "多维表格-删除", "tables", "menu_delete", "多维表格管理页「删除」按钮，由菜单权限控制"),
]


async def migrate():
    """插入多维表格菜单按钮权限（type=menu，code 已存在则跳过）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        inserted = 0
        for code, name, resource, action, description in MENU_BUTTON_PERMISSIONS:
            pid = str(uuid.uuid4())
            result = await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'menu', $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "")
            if result == "INSERT 0 1":
                inserted += 1
                print(f"✅ 创建权限: {name} ({code})")
            else:
                print(f"⏭️  权限已存在，跳过: {name} ({code})")
        
        # 设置这些按钮权限的父权限为 menu:tables:list
        menu_list_permission_id = await conn.fetchval("""
            SELECT id FROM permissions WHERE code = 'menu:tables:list'
        """)
        
        if menu_list_permission_id:
            for code, name, resource, action, description in MENU_BUTTON_PERMISSIONS:
                await conn.execute("""
                    UPDATE permissions 
                    SET parent_id = $1 
                    WHERE code = $2 AND parent_id IS NULL
                """, menu_list_permission_id, code)
            print(f"✅ 已将多维表格按钮权限关联到父菜单 menu:tables:list")
        else:
            print(f"⚠️  未找到父菜单 menu:tables:list，跳过设置 parent_id")
        
        print(f"✅ 多维表格菜单按钮权限迁移完成（共 {len(MENU_BUTTON_PERMISSIONS)} 条，新增 {inserted} 条）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
