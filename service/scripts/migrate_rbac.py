# -*- coding: utf-8 -*-
"""
创建RBAC相关表的数据库迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    """创建RBAC相关表"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 创建权限表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL UNIQUE,
                code VARCHAR NOT NULL UNIQUE,
                resource VARCHAR NOT NULL,
                action VARCHAR NOT NULL,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # 创建角色表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL UNIQUE,
                code VARCHAR NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # 创建用户角色关联表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role_id VARCHAR NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, role_id)
            );
        """)
        
        # 创建角色权限关联表
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id VARCHAR NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                permission_id VARCHAR NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            );
        """)
        
        # 创建索引
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
        """)
        
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
        """)
        
        print("✅ RBAC表创建成功")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())

