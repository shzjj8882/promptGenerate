"""
通知配置服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List, Optional
import json

from app.models.notification_config import NotificationConfig


def _mask_config(config: Optional[dict], config_type: str) -> Optional[dict]:
    """脱敏配置中的敏感字段"""
    if not config:
        return None
    masked = config.copy()
    if config_type == "email":
        if "api_key" in masked and masked["api_key"]:
            masked["api_key"] = "****" + masked["api_key"][-4:] if len(masked["api_key"]) > 4 else "****"
    return masked


class NotificationConfigService:
    """通知配置服务"""

    @staticmethod
    async def get_by_type(db: AsyncSession, config_type: str, team_id: Optional[str] = None) -> Optional[NotificationConfig]:
        """根据类型获取配置（优先团队，其次全局）"""
        if team_id:
            result = await db.execute(
                select(NotificationConfig)
                .where(and_(NotificationConfig.type == config_type, NotificationConfig.team_id == team_id))
            )
            cfg = result.scalar_one_or_none()
            if cfg:
                return cfg
        result = await db.execute(
            select(NotificationConfig)
            .where(and_(NotificationConfig.type == config_type, NotificationConfig.team_id.is_(None)))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_for_team(db: AsyncSession, team_id: Optional[str] = None) -> List[NotificationConfig]:
        """获取团队可用的配置列表（团队 + 全局）"""
        conditions = [NotificationConfig.is_active == True]
        if team_id:
            conditions.append(or_(NotificationConfig.team_id == team_id, NotificationConfig.team_id.is_(None)))
        else:
            conditions.append(NotificationConfig.team_id.is_(None))
        result = await db.execute(
            select(NotificationConfig).where(and_(*conditions)).order_by(NotificationConfig.type)
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_all(db: AsyncSession) -> List[NotificationConfig]:
        """获取所有配置（系统管理员）"""
        result = await db.execute(
            select(NotificationConfig).order_by(NotificationConfig.type)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_or_create_by_type(db: AsyncSession, config_type: str, name: str, team_id: Optional[str] = None) -> NotificationConfig:
        """获取或创建指定类型的配置"""
        existing = await NotificationConfigService.get_by_type(db, config_type, team_id)
        if existing:
            return existing
        cfg = NotificationConfig(type=config_type, name=name, team_id=team_id)
        db.add(cfg)
        await db.flush()
        await db.refresh(cfg)
        return cfg

    @staticmethod
    async def update(db: AsyncSession, config_id: str, data: dict) -> Optional[NotificationConfig]:
        """更新配置"""
        result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == config_id))
        cfg = result.scalar_one_or_none()
        if not cfg:
            return None
        for k, v in data.items():
            if hasattr(cfg, k) and v is not None:
                if k == "config" and isinstance(v, dict):
                    # 合并已有 config，避免脱敏字段（如 api_key）被覆盖
                    existing = await NotificationConfigService.get_config_dict(cfg)
                    merged = dict(existing) if existing else {}
                    for fk, fv in v.items():
                        if fv is not None and fv != "":
                            # 不覆盖脱敏占位（**** 开头）
                            if fk == "api_key" and isinstance(fv, str) and fv.startswith("****"):
                                continue
                            merged[fk] = fv
                    setattr(cfg, k, json.dumps(merged, ensure_ascii=False) if merged else None)
                else:
                    setattr(cfg, k, v)
        await db.flush()
        await db.refresh(cfg)
        return cfg

    @staticmethod
    async def get_config_dict(cfg: NotificationConfig) -> Optional[dict]:
        """解析 config 字段为 dict"""
        if not cfg or not cfg.config:
            return None
        try:
            return json.loads(cfg.config) if isinstance(cfg.config, str) else cfg.config
        except Exception:
            return None
