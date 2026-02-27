"""
组合调试配置服务
"""
from typing import List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.composition import Composition
from app.schemas.composition import CompositionCreate, CompositionUpdate


class CompositionService:
    """组合配置服务"""

    @staticmethod
    async def list_compositions(
        db: AsyncSession,
        team_id: Optional[str] = None,
        is_active: Optional[bool] = True,
        keyword: Optional[str] = None,
        skip: int = 0,
        limit: int = 10,
    ) -> Tuple[List[Composition], int]:
        """获取组合列表，按团队过滤，支持分页和关键词搜索

        Returns:
            (items, total)
        """
        # 构建基础查询条件
        base_query = select(Composition)
        count_query = select(func.count(Composition.id))

        if team_id is not None:
            cond = (Composition.team_id == team_id) | (Composition.team_id.is_(None))
            base_query = base_query.where(cond)
            count_query = count_query.where(cond)
        if is_active is not None:
            base_query = base_query.where(Composition.is_active.is_(is_active))
            count_query = count_query.where(Composition.is_active.is_(is_active))
        if keyword and keyword.strip():
            kw = f"%{keyword.strip()}%"
            base_query = base_query.where(Composition.name.ilike(kw))
            count_query = count_query.where(Composition.name.ilike(kw))

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        q = base_query.order_by(Composition.sort_order, Composition.name).offset(skip).limit(limit)
        result = await db.execute(q)
        items = list(result.scalars().all())
        return items, total

    @staticmethod
    async def get_by_id(db: AsyncSession, composition_id: str) -> Optional[Composition]:
        """根据 ID 获取组合"""
        result = await db.execute(
            select(Composition).where(Composition.id == composition_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        db: AsyncSession,
        data: CompositionCreate,
        team_id: Optional[str] = None,
    ) -> Composition:
        """创建组合"""
        comp = Composition(
            name=data.name,
            mode=getattr(data, "mode", "chat"),
            scene=data.scene,
            tenant_id=getattr(data, "tenant_id", "default"),
            prompt_id=getattr(data, "prompt_id", None),
            model_id=data.model_id,
            mcp_id=data.mcp_id,
            mcp_tool_names=getattr(data, "mcp_tool_names", None) or [],
            task_mode=getattr(data, "task_mode", "sync"),
            notification_config=getattr(data, "notification_config", None),
            sort_order=data.sort_order,
            team_id=team_id,
        )
        db.add(comp)
        await db.commit()
        await db.refresh(comp)
        return comp

    @staticmethod
    async def update(
        db: AsyncSession,
        composition_id: str,
        data: CompositionUpdate,
    ) -> Optional[Composition]:
        """更新组合"""
        comp = await CompositionService.get_by_id(db, composition_id)
        if not comp:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for k, v in update_data.items():
            setattr(comp, k, v)
        await db.commit()
        await db.refresh(comp)
        return comp

    @staticmethod
    async def delete(db: AsyncSession, composition_id: str) -> bool:
        """删除组合"""
        comp = await CompositionService.get_by_id(db, composition_id)
        if not comp:
            return False
        await db.delete(comp)
        await db.commit()
        return True
