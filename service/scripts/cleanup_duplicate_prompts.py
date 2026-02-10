"""
清理重复的提示词数据
删除相同 scene + tenant_id 的重复数据，只保留最新的一个
"""
import asyncio
import sys
from pathlib import Path
from collections import defaultdict

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db
from app.models.prompt import Prompt
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession


async def find_duplicate_prompts():
    """查找重复的提示词"""
    await init_db()
    
    async with AsyncSessionLocal() as db:
        # 获取所有提示词
        result = await db.execute(select(Prompt))
        all_prompts = result.scalars().all()
        
        # 按 scene + tenant_id 分组
        groups = defaultdict(list)
        for prompt in all_prompts:
            key = (prompt.scene, prompt.tenant_id)
            groups[key].append(prompt)
        
        # 找出重复的组
        duplicates = {}
        for key, prompts in groups.items():
            if len(prompts) > 1:
                # 按创建时间排序，最新的在前
                prompts.sort(key=lambda p: p.created_at, reverse=True)
                duplicates[key] = prompts
        
        return duplicates


async def delete_duplicates(dry_run: bool = True):
    """删除重复的提示词，只保留最新的一个"""
    duplicates = await find_duplicate_prompts()
    
    if not duplicates:
        print("没有找到重复的提示词数据")
        return
    
    print(f"\n找到 {len(duplicates)} 组重复数据：\n")
    
    total_to_delete = 0
    to_delete = []
    
    for (scene, tenant_id), prompts in duplicates.items():
        print(f"场景: {scene}, 租户: {tenant_id}")
        print(f"  共有 {len(prompts)} 条数据")
        
        # 保留最新的（第一个），删除其他的
        keep = prompts[0]
        delete_list = prompts[1:]
        
        print(f"  保留: ID={keep.id}, 创建时间={keep.created_at}")
        for p in delete_list:
            print(f"  删除: ID={p.id}, 创建时间={p.created_at}")
            to_delete.append(p)
            total_to_delete += 1
        print()
    
    if dry_run:
        print(f"\n[DRY RUN] 将删除 {total_to_delete} 条重复数据")
        print("运行脚本时添加 --execute 参数来实际执行删除操作")
        return
    
    # 实际删除
    async with AsyncSessionLocal() as db:
        deleted_count = 0
        for prompt in to_delete:
            try:
                # 如果组内有多条默认提示词，允许删除旧的（保留最新的）
                # 但如果只有一条默认提示词，则不允许删除
                scene, tenant_id = prompt.scene, prompt.tenant_id
                group_prompts = duplicates.get((scene, tenant_id), [])
                is_default_group = any(p.is_default for p in group_prompts)
                
                if prompt.is_default and len(group_prompts) == 1:
                    print(f"跳过：这是唯一的默认提示词: ID={prompt.id}")
                    continue
                
                await db.delete(prompt)
                deleted_count += 1
                print(f"已删除: ID={prompt.id}, scene={prompt.scene}, tenant_id={prompt.tenant_id}, is_default={prompt.is_default}")
            except Exception as e:
                print(f"删除失败: ID={prompt.id}, 错误: {e}")
        
        await db.commit()
        print(f"\n成功删除 {deleted_count} 条重复数据")


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="清理重复的提示词数据")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际执行删除操作（默认是 dry-run 模式）"
    )
    args = parser.parse_args()
    
    try:
        await delete_duplicates(dry_run=not args.execute)
        print("\n清理完成！")
    except Exception as e:
        print(f"\n清理失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

