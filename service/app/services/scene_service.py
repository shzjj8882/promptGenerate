# -*- coding: utf-8 -*-
"""场景服务：事务在 Service 内提交，Router 不直接 commit/rollback。"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_, and_
from typing import List, Optional
from app.models.scene import Scene
from app.models.prompt import Prompt, Placeholder, scene_placeholders
from app.models.team import Team
from app.schemas.prompt import PlaceholderCreate
from app.schemas.user import UserResponse


class SceneService:
    """场景服务"""

    @staticmethod
    async def list_scenes(db: AsyncSession, current_user: UserResponse) -> List[dict]:
        """
        按用户角色过滤场景列表（带缓存，TTL 30 分钟）。
        预置场景所有人可见；非预置按 team_code 过滤。
        """
        from app.core.cache import get_cache, set_cache, CACHE_KEY_PREFIXES, CACHE_TTL
        from app.core.database import get_redis_optional
        import json  # 用于缓存序列化
        
        # 构建缓存 key（包含用户角色信息）
        cache_key = f"{CACHE_KEY_PREFIXES['scene']}user:{current_user.id}:super:{current_user.is_superuser}:team:{current_user.team_code or 'none'}"
        redis_client = await get_redis_optional()
        
        # 尝试从缓存读取
        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass
        
        # 在数据库层面过滤，而不是查询所有后在内存中过滤
        conditions = []
        if current_user.is_superuser:
            # 系统管理员：预置场景 + team_code 为 None 的场景
            conditions.append(
                or_(
                    Scene.is_predefined == True,
                    Scene.team_code.is_(None)
                )
            )
        elif current_user.is_team_admin:
            # 团队管理员：预置场景 + 自己团队的场景
            conditions.append(
                or_(
                    Scene.is_predefined == True,
                    Scene.team_code == current_user.team_code
                )
            )
        else:
            # 普通用户：只有预置场景
            conditions.append(Scene.is_predefined == True)
        
        # 执行查询（数据库层面过滤）
        query = select(Scene).where(and_(*conditions)).order_by(Scene.code)
        result = await db.execute(query)
        scenes = result.scalars().all()
        filtered = [scene.to_dict() for scene in scenes]
        
        # 写入缓存
        if redis_client:
            try:
                await redis_client.setex(
                    cache_key,
                    CACHE_TTL["scene"],
                    json.dumps(filtered, default=str),
                )
            except Exception:
                pass
        
        return filtered

    @staticmethod
    async def get_by_code(db: AsyncSession, code: str, team_id: Optional[str] = None) -> Optional[Scene]:
        """
        根据场景代码获取场景
        如果提供了 team_id，则查询该团队的场景；否则查询全局场景（team_id 为 NULL）
        """
        q = select(Scene).where(Scene.code == code)
        if team_id is not None:
            q = q.where(Scene.team_id == team_id)
        else:
            q = q.where(Scene.team_id.is_(None))
        result = await db.execute(q)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_scene(
        db: AsyncSession,
        code: str,
        name: str,
        current_user: UserResponse,
        placeholders: Optional[List[dict]] = None,
    ) -> dict:
        """创建场景并可选创建占位符，事务在 Service 内提交。"""
        team_code = None
        team_id = None
        if current_user.is_team_admin:
            team_code = current_user.team_code
            if team_code:
                r = await db.execute(select(Team).where(Team.code == team_code))
                t = r.scalar_one_or_none()
                if t:
                    team_id = t.id
        
        # 检查场景代码是否已存在（考虑团队隔离）
        existing = await SceneService.get_by_code(db, code, team_id=team_id)
        if existing:
            if team_id:
                raise ValueError(f"场景代码 '{code}' 在当前团队中已存在")
            else:
                raise ValueError(f"场景代码 '{code}' 已存在（全局场景）")

        scene = Scene(
            code=code,
            name=name,
            is_predefined=False,
            team_code=team_code,
            team_id=team_id,
        )
        db.add(scene)
        await db.flush()

        if placeholders:
            from app.services.prompt_service import PlaceholderService
            import logging
            logger = logging.getLogger(__name__)
            
            logger.info(f"创建场景 {code}，占位符数量: {len(placeholders)}")
            
            # 用于存储要关联的占位符对象
            placeholders_to_associate = []
            
            for item in placeholders:
                placeholder_key = item.get("key", "")
                placeholder_label = item.get("label", "")
                if not placeholder_key:
                    logger.warning(f"跳过无效的占位符（缺少 key）: {item}")
                    continue
                
                logger.info(f"处理占位符: key={placeholder_key}, label={placeholder_label}")
                
                # 查找全局占位符（scene=""）
                placeholder_result = await db.execute(
                    select(Placeholder).where(
                        and_(
                            Placeholder.key == placeholder_key,
                            Placeholder.scene == "",
                            Placeholder.is_active == True
                        )
                    )
                )
                placeholder = placeholder_result.scalar_one_or_none()
                
                if not placeholder:
                    # 如果占位符不存在，创建全局占位符
                    logger.info(f"占位符 {placeholder_key} 不存在，创建全局占位符")
                    placeholder_data = PlaceholderCreate(
                        key=placeholder_key,
                        label=placeholder_label,
                        scene="",  # 全局占位符，scene 为空字符串
                        description=item.get("description"),
                    )
                    placeholder = await PlaceholderService.create_placeholder(db, placeholder_data, commit=False)
                    logger.info(f"成功创建全局占位符 {placeholder_key}")
                else:
                    # 如果占位符已存在，更新 label 和 description（如果需要）
                    if placeholder_label and placeholder.label != placeholder_label:
                        placeholder.label = placeholder_label
                    if item.get("description") and placeholder.description != item.get("description"):
                        placeholder.description = item.get("description")
                    logger.info(f"找到全局占位符 {placeholder_key}，将关联到场景")
                
                placeholders_to_associate.append(placeholder)
            
            # 通过关联表建立场景和占位符的关系（直接插入关联表，避免懒加载问题）
            if placeholders_to_associate:
                from app.models.prompt import scene_placeholders
                for placeholder in placeholders_to_associate:
                    await db.execute(
                        scene_placeholders.insert().values(
                            scene_id=scene.id,
                            placeholder_id=placeholder.id
                        )
                    )
                logger.info(f"场景 {code} 关联了 {len(placeholders_to_associate)} 个占位符")

        try:
            await db.commit()
            await db.refresh(scene)
            
            # 失效场景列表缓存和占位符缓存 - 只有在 commit 成功后才失效
            from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['scene']}*")
                # 清除该场景的占位符缓存
                await redis_client.delete(f"{CACHE_KEY_PREFIXES['placeholder']}{code}")
                # 也清除所有占位符缓存模式（因为占位符可能被多个场景共享）
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}*")
        except Exception:
            await db.rollback()
            raise
        
        return scene.to_dict()

    @staticmethod
    async def update_scene(
        db: AsyncSession,
        scene_code: str,
        name: str,
        current_user: UserResponse,
        placeholders: Optional[List[dict]] = None,
    ) -> dict:
        """更新场景名称及占位符，事务在 Service 内提交。"""
        # 根据用户角色确定 team_id
        team_id = None
        if current_user.is_team_admin and current_user.team_id:
            team_id = current_user.team_id
        
        scene = await SceneService.get_by_code(db, scene_code, team_id=team_id)
        if not scene:
            raise ValueError("场景不存在")

        if current_user.is_superuser and scene.team_code is not None:
            raise ValueError("系统管理员只能更新系统创建的场景")
        if current_user.is_team_admin and scene.team_code != current_user.team_code:
            raise ValueError("只能更新自己团队创建的场景")

        scene.name = name
        await db.flush()

        if placeholders is not None:
            from app.services.prompt_service import PlaceholderService
            from app.models.prompt import Placeholder
            from sqlalchemy import select, and_
            import logging
            logger = logging.getLogger(__name__)
            
            logger.info(f"更新场景 {scene_code}，占位符数量: {len(placeholders) if placeholders else 0}")
            
            # 清空场景的占位符关联（直接操作关联表，避免懒加载问题）
            from app.models.prompt import scene_placeholders
            await db.execute(
                delete(scene_placeholders).where(
                    scene_placeholders.c.scene_id == scene.id
                )
            )
            await db.flush()
            
            if placeholders:
                # 用于存储要关联的占位符对象
                placeholders_to_associate = []
                
                for item in placeholders:
                    placeholder_key = item.get("key", "")
                    placeholder_label = item.get("label", "")
                    if not placeholder_key:
                        logger.warning(f"跳过无效的占位符（缺少 key）: {item}")
                        continue
                    
                    logger.info(f"处理占位符: key={placeholder_key}, label={placeholder_label}")
                    
                    # 查找全局占位符（scene=""）
                    placeholder_result = await db.execute(
                        select(Placeholder).where(
                            and_(
                                Placeholder.key == placeholder_key,
                                Placeholder.scene == "",
                                Placeholder.is_active == True
                            )
                        )
                    )
                    placeholder = placeholder_result.scalar_one_or_none()
                    
                    if not placeholder:
                        # 如果占位符不存在，创建全局占位符
                        logger.info(f"占位符 {placeholder_key} 不存在，创建全局占位符")
                        placeholder_data = PlaceholderCreate(
                            key=placeholder_key,
                            label=placeholder_label,
                            scene="",  # 全局占位符，scene 为空字符串
                            description=item.get("description"),
                        )
                        placeholder = await PlaceholderService.create_placeholder(db, placeholder_data, commit=False)
                        logger.info(f"成功创建全局占位符 {placeholder_key}")
                    else:
                        # 如果占位符已存在，更新 label 和 description（如果需要）
                        if placeholder_label and placeholder.label != placeholder_label:
                            placeholder.label = placeholder_label
                        if item.get("description") and placeholder.description != item.get("description"):
                            placeholder.description = item.get("description")
                        logger.info(f"找到全局占位符 {placeholder_key}，将关联到场景")
                    
                    placeholders_to_associate.append(placeholder)
                
                # 通过关联表建立场景和占位符的关系（直接插入关联表，避免懒加载问题）
                if placeholders_to_associate:
                    from app.models.prompt import scene_placeholders
                    for placeholder in placeholders_to_associate:
                        await db.execute(
                            scene_placeholders.insert().values(
                                scene_id=scene.id,
                                placeholder_id=placeholder.id
                            )
                        )
                    logger.info(f"场景 {scene_code} 关联了 {len(placeholders_to_associate)} 个占位符")

        try:
            await db.commit()
            await db.refresh(scene)
            
            # 失效场景列表缓存和占位符缓存 - 只有在 commit 成功后才失效
            from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['scene']}*")
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt_default']}{scene_code}:*")
                # 清除该场景的占位符缓存
                await redis_client.delete(f"{CACHE_KEY_PREFIXES['placeholder']}{scene_code}")
                # 也清除所有占位符缓存模式（因为占位符可能被多个场景共享）
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}*")
        except Exception:
            await db.rollback()
            raise
        
        return scene.to_dict()

    @staticmethod
    async def delete_scene(db: AsyncSession, scene_code: str, current_user: UserResponse) -> dict:
        """删除场景及其提示词、占位符，事务在 Service 内提交。"""
        # 根据用户角色确定 team_id
        team_id = None
        if current_user.is_team_admin and current_user.team_id:
            team_id = current_user.team_id
        
        scene = await SceneService.get_by_code(db, scene_code, team_id=team_id)
        if not scene:
            raise ValueError("场景不存在")

        if current_user.is_superuser and scene.team_code is not None:
            raise ValueError("系统管理员只能删除系统创建的场景")
        if current_user.is_team_admin and scene.team_code != current_user.team_code:
            raise ValueError("只能删除自己团队创建的场景")

        scene_data = scene.to_dict()
        
        # 删除该场景的所有提示词
        delete_prompts = await db.execute(delete(Prompt).where(Prompt.scene == scene_code))
        
        # 删除场景与占位符的关联关系（占位符本身是全局的，不删除）
        delete_placeholders_association = await db.execute(
            delete(scene_placeholders).where(scene_placeholders.c.scene_id == scene.id)
        )
        
        # 删除场景
        await db.delete(scene)
        
        try:
            await db.commit()
            
            # 失效场景列表缓存和默认提示词缓存 - 只有在 commit 成功后才失效
            from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['scene']}*")
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt_default']}{scene_code}:*")
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}{scene_code}:*")
        except Exception:
            await db.rollback()
            raise

        return {
            **scene_data,
            "deleted_prompts_count": delete_prompts.rowcount,
            "deleted_placeholders_count": delete_placeholders_association.rowcount,  # 删除的关联关系数量
        }
