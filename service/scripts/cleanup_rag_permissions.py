# -*- coding: utf-8 -*-
"""
清理 RAG 相关的权限记录
包括菜单权限和接口权限
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def cleanup_rag_permissions():
    """清理 RAG 相关的权限记录"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 确认操作
        print("\n⚠️  警告：此操作将删除以下 RAG 相关权限：")
        print("  - 菜单权限：menu:rag:list, menu:rag:create, menu:rag:update, menu:rag:delete")
        print("  - 接口权限：rag:create, rag:update, rag:delete, rag:list, rag:detail")
        print("  - 同时会删除这些权限与角色的关联关系")
        
        # 检查是否需要强制模式
        force = "--force" in sys.argv
        if not force:
            confirm = input("\n确认执行清理操作？(输入 'yes' 确认): ")
            if confirm.lower() != 'yes':
                print("❌ 操作已取消")
                return
        
        print("\n开始清理 RAG 权限...")
        
        # 1. 查询 RAG 相关权限
        rag_permissions = await conn.fetch("""
            SELECT id, code, name, type 
            FROM permissions 
            WHERE resource = 'rag' OR code LIKE 'rag:%' OR code LIKE 'menu:rag:%'
        """)
        
        if not rag_permissions:
            print("✅ 未找到 RAG 相关权限，无需清理")
            return
        
        print(f"\n找到 {len(rag_permissions)} 条 RAG 相关权限：")
        for perm in rag_permissions:
            print(f"  - {perm['code']} ({perm['name']}, {perm['type']})")
        
        # 2. 删除角色权限关联
        permission_ids = [str(perm['id']) for perm in rag_permissions]
        if permission_ids:
            deleted_relations = await conn.execute("""
                DELETE FROM role_permissions 
                WHERE permission_id = ANY($1::text[])
            """, permission_ids)
            print(f"\n✅ 已删除角色权限关联关系")
        
        # 3. 删除权限记录
        deleted_permissions = await conn.execute("""
            DELETE FROM permissions 
            WHERE resource = 'rag' OR code LIKE 'rag:%' OR code LIKE 'menu:rag:%'
        """)
        print(f"✅ 已删除 RAG 相关权限记录")
        
        # 4. 验证清理结果
        remaining_rag_permissions = await conn.fetchval("""
            SELECT COUNT(*) 
            FROM permissions 
            WHERE resource = 'rag' OR code LIKE 'rag:%' OR code LIKE 'menu:rag:%'
        """)
        
        print("\n" + "="*60)
        print("✅ 清理完成！")
        print("="*60)
        print(f"\n剩余 RAG 权限数量: {remaining_rag_permissions}")
        print("="*60)
        
    except Exception as e:
        print(f"❌ 清理失败: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await cleanup_rag_permissions()


if __name__ == "__main__":
    asyncio.run(main())
