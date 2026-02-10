"""
LLM 模型配置服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.models.llm_model import LLMModel
from app.schemas.llm_model import LLMModelCreate, LLMModelUpdate
import json


class LLMModelService:
    """LLM 模型配置服务类"""
    
    @staticmethod
    async def create_model(db: AsyncSession, model_data: LLMModelCreate, team_id: Optional[str] = None) -> LLMModel:
        """创建模型配置"""
        model_dict = model_data.model_dump(exclude={"team_id"})
        
        # 如果设置了 is_default=True，需要先取消其他模型的默认状态
        if model_dict.get("is_default") and team_id:
            await LLMModelService._unset_default_for_team(db, team_id)
        
        # 处理 extra_config 字段（数据库字段名为 config）
        if "extra_config" in model_dict and isinstance(model_dict["extra_config"], dict):
            model_dict["extra_config"] = json.dumps(model_dict["extra_config"])
        elif "config" in model_dict and isinstance(model_dict["config"], dict):
            # 兼容旧字段名
            model_dict["extra_config"] = json.dumps(model_dict["config"])
            del model_dict["config"]
        
        model = LLMModel(**model_dict, team_id=team_id)
        db.add(model)
        await db.commit()
        await db.refresh(model)
        return model
    
    @staticmethod
    async def get_model_by_id(db: AsyncSession, model_id: str) -> Optional[LLMModel]:
        """根据 ID 获取模型"""
        result = await db.execute(select(LLMModel).where(LLMModel.id == model_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_models(
        db: AsyncSession,
        team_id: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[LLMModel]:
        """获取模型列表"""
        q = select(LLMModel)
        
        if team_id is not None:
            q = q.where(LLMModel.team_id == team_id)
        else:
            # 如果 team_id 为 None，只返回全局配置（team_id 为 NULL）
            q = q.where(LLMModel.team_id.is_(None))
        
        if is_active is not None:
            q = q.where(LLMModel.is_active == is_active)
        
        q = q.order_by(LLMModel.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(q)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_default_model(db: AsyncSession, team_id: Optional[str] = None) -> Optional[LLMModel]:
        """获取团队的默认模型（优先团队配置，其次全局配置）"""
        # 先查找团队的默认模型
        if team_id:
            result = await db.execute(
                select(LLMModel)
                .where(
                    and_(
                        LLMModel.team_id == team_id,
                        LLMModel.is_default == True,
                        LLMModel.is_active == True
                    )
                )
            )
            team_model = result.scalar_one_or_none()
            if team_model:
                return team_model
        
        # 如果没有团队的默认模型，查找全局默认模型
        result = await db.execute(
            select(LLMModel)
            .where(
                and_(
                    LLMModel.team_id.is_(None),
                    LLMModel.is_default == True,
                    LLMModel.is_active == True
                )
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def update_model(db: AsyncSession, model_id: str, model_data: LLMModelUpdate) -> Optional[LLMModel]:
        """更新模型配置"""
        model = await LLMModelService.get_model_by_id(db, model_id)
        if not model:
            return None
        
        update_dict = model_data.model_dump(exclude_unset=True)
        
        # 如果设置了 is_default=True，需要先取消其他模型的默认状态
        if update_dict.get("is_default") and model.team_id:
            await LLMModelService._unset_default_for_team(db, model.team_id, exclude_id=model_id)
        
        # 处理 extra_config 字段（数据库字段名为 config）
        if "extra_config" in update_dict and isinstance(update_dict["extra_config"], dict):
            update_dict["extra_config"] = json.dumps(update_dict["extra_config"])
        elif "config" in update_dict and isinstance(update_dict["config"], dict):
            # 兼容旧字段名
            update_dict["extra_config"] = json.dumps(update_dict["config"])
            del update_dict["config"]
        
        for key, value in update_dict.items():
            setattr(model, key, value)
        
        await db.commit()
        await db.refresh(model)
        return model
    
    @staticmethod
    async def delete_model(db: AsyncSession, model_id: str) -> bool:
        """删除模型配置"""
        model = await LLMModelService.get_model_by_id(db, model_id)
        if not model:
            return False
        
        await db.delete(model)
        await db.commit()
        return True
    
    @staticmethod
    async def _unset_default_for_team(db: AsyncSession, team_id: str, exclude_id: Optional[str] = None):
        """取消团队的其他模型的默认状态"""
        q = select(LLMModel).where(
            and_(
                LLMModel.team_id == team_id,
                LLMModel.is_default == True
            )
        )
        if exclude_id:
            q = q.where(LLMModel.id != exclude_id)
        
        result = await db.execute(q)
        models = result.scalars().all()
        for model in models:
            model.is_default = False
        await db.commit()
