"""
初始化销售打单场景的占位符
从 Dify 提示词中提取的占位符
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db
from app.services.prompt_service import PlaceholderService
from app.schemas.prompt import PlaceholderCreate
from app.models.prompt import Placeholder
from sqlalchemy import select


# 销售打单场景的占位符定义
SALES_ORDER_PLACEHOLDERS = [
    {
        "key": "conversationId",
        "label": "系统对话ID",
        "description": "当前对话的唯一标识符，由系统自动生成",
    },
    {
        "key": "companyRag",
        "label": "公司产品资料",
        "description": "销售所在公司的产品介绍资料（RAG内容），用于了解销售谈话的上下文",
    },
    {
        "key": "customRagInfos",
        "label": "客户历史数据",
        "description": "客户商机分析表的历史最新内容，记录现有客户的最新历史信息",
    },
    {
        "key": "salePhaseRag",
        "label": "销售阶段数据",
        "description": "用于判断当前销售阶段的数据，当有定义内容时，会尝试判断销售阶段并给出相应提示",
    },
    {
        "key": "userName",
        "label": "销售姓名",
        "description": "销售自己的姓名，禁止出现在商机分析表中",
    },
    {
        "key": "companyRagAbbr",
        "label": "公司简称",
        "description": "销售所在公司的简称",
    },
]

SCENE = "sales_order"


async def init_placeholders():
    """初始化占位符数据"""
    # 初始化数据库连接
    await init_db()
    
    async with AsyncSessionLocal() as db:
        print(f"开始初始化场景 '{SCENE}' 的占位符...")
        
        # 检查是否已存在占位符
        existing_result = await db.execute(
            select(Placeholder).where(Placeholder.scene == SCENE)
        )
        existing_placeholders = existing_result.scalars().all()
        
        if existing_placeholders:
            print(f"场景 '{SCENE}' 已存在 {len(existing_placeholders)} 个占位符")
            print("是否要覆盖现有占位符？(y/n): ", end="")
            # 在脚本中默认跳过，避免交互
            print("跳过，保留现有占位符")
            return
        
        created_count = 0
        skipped_count = 0
        
        for placeholder_data in SALES_ORDER_PLACEHOLDERS:
            try:
                # 检查 key 是否已存在（跨场景唯一）
                existing_result = await db.execute(
                    select(Placeholder).where(Placeholder.key == placeholder_data["key"])
                )
                existing = existing_result.scalar_one_or_none()
                
                if existing:
                    print(f"  跳过: {placeholder_data['key']} (已存在)")
                    skipped_count += 1
                    continue
                
                # 创建占位符
                placeholder_create = PlaceholderCreate(
                    key=placeholder_data["key"],
                    label=placeholder_data["label"],
                    scene=SCENE,
                    description=placeholder_data.get("description"),
                )
                
                placeholder = await PlaceholderService.create_placeholder(
                    db, placeholder_create
                )
                print(f"  ✓ 创建: {placeholder.key} - {placeholder.label}")
                created_count += 1
                
            except Exception as e:
                print(f"  ✗ 创建失败: {placeholder_data['key']} - {str(e)}")
        
        print(f"\n完成！创建 {created_count} 个占位符，跳过 {skipped_count} 个")


async def main():
    """主函数"""
    try:
        await init_placeholders()
        print("\n占位符初始化完成！")
    except Exception as e:
        print(f"\n初始化失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

