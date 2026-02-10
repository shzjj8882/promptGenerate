# -*- coding: utf-8 -*-
"""应用启动时若场景表为空则插入预置场景，并插入预置场景对应的占位符。"""
import logging
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.scene import Scene
from app.models.prompt import Placeholder

logger = logging.getLogger(__name__)

PREDEFINED_SCENES = [
    ("research", "调研提示词"),
    ("ppt_report", "PPT报告提示词"),
    ("sales_order", "销售打单提示词"),
]

# 预置场景对应的占位符（与 init_sales_order_placeholders 保持一致）
PREDEFINED_SCENE_PLACEHOLDERS = {
    "sales_order": [
        {"key": "conversationId", "label": "系统对话ID", "description": "当前对话的唯一标识符，由系统自动生成"},
        {"key": "customRagInfos", "label": "客户历史数据", "description": "客户商机分析表的历史最新内容，记录现有客户的最新历史信息"},
        {"key": "userName", "label": "销售姓名", "description": "销售自己的姓名，禁止出现在商机分析表中"},
    ],
    "research": [],
    "ppt_report": [],
}


async def seed_scenes_if_empty():
    """若 scenes 表为空或缺少预置场景则插入；并确保预置场景的占位符存在。"""
    from app.services.scene_service import SceneService
    async with AsyncSessionLocal() as db:
        try:
            for code, name in PREDEFINED_SCENES:
                existing = await SceneService.get_by_code(db, code)
                if not existing:
                    scene = Scene(
                        code=code,
                        name=name,
                        is_predefined=True,
                        team_code=None,
                    )
                    db.add(scene)
                    logger.info("插入预置场景: %s (%s)", code, name)
            await db.flush()

            # 创建全局占位符并建立关联关系
            for scene_code, items in PREDEFINED_SCENE_PLACEHOLDERS.items():
                # 获取场景对象
                scene = await SceneService.get_by_code(db, scene_code)
                if not scene:
                    logger.warning("场景 %s 不存在，跳过占位符关联", scene_code)
                    continue
                
                for item in items:
                    key, label = item["key"], item["label"]
                    description = item.get("description")
                    
                    # 查找全局占位符（scene=""）
                    r = await db.execute(
                        select(Placeholder).where(
                            Placeholder.scene == "",
                            Placeholder.key == key,
                        )
                    )
                    placeholder = r.scalar_one_or_none()
                    
                    if placeholder is None:
                        # 创建全局占位符
                        placeholder = Placeholder(
                            key=key,
                            label=label,
                            scene="",  # 全局占位符
                            description=description,
                        )
                        db.add(placeholder)
                        await db.flush()  # 刷新以获取 placeholder.id
                        logger.info("插入全局占位符: %s (%s)", key, label)
                    
                    # 建立关联关系（如果尚未关联）
                    if placeholder not in scene.placeholders:
                        scene.placeholders.append(placeholder)
                        logger.info("关联占位符: %s -> %s (%s)", scene_code, key, label)
            
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning("预置场景/占位符种子执行异常（可忽略）: %s", e)
