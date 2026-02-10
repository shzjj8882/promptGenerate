from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, delete
from typing import List, Optional, Dict, Any, Callable
from app.models.prompt import Prompt, Tenant, Placeholder
from app.models.scene import Scene
from app.models.team import Team
from app.schemas.prompt import (
    PromptCreate, PromptUpdate, PlaceholderCreate, PlaceholderUpdate, TenantCreate, TenantUpdate
)
from app.core.config import settings
import re
import json
import asyncio
import inspect
import traceback


class PromptService:
    """提示词服务类"""
    
    @staticmethod
    async def get_prompts(
        db: AsyncSession,
        scene: Optional[str] = None,
        tenant_id: Optional[str] = None,
        is_default: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
        team_code: Optional[str] = None,
    ) -> List[Prompt]:
        """
        获取提示词列表（优化：使用 team_id 外键减少查询次数）
        """
        from app.models.team import Team
        
        query = select(Prompt)
        conditions = []
        
        if scene:
            conditions.append(Prompt.scene == scene)
        
        # 如果指定了团队代码，使用 team_id 外键优化查询
        if team_code:
            # 一次查询获取 team_id
            team_result = await db.execute(select(Team.id).where(Team.code == team_code))
            team_row = team_result.scalar_one_or_none()
            if not team_row:
                # 团队不存在，返回空结果
                conditions.append(False)
            else:
                team_id = team_row
                # 使用 team_id 外键直接 JOIN 查询租户，避免 N+1
                # 构建团队过滤条件
                team_conditions = []
                
                # 处理默认提示词的过滤
                if is_default is True:
                    # 只返回该团队的默认提示词
                    team_conditions.append(
                        and_(
                            Prompt.is_default == True,
                            Prompt.team_id == team_id
                        )
                    )
                elif is_default is False:
                    # 不包含默认提示词，只返回租户提示词
                    if tenant_id:
                        # 验证租户是否属于该团队（使用 JOIN）
                        tenant_check = await db.execute(
                            select(Tenant.id).where(
                                and_(
                                    Tenant.id == tenant_id,
                                    Tenant.team_id == team_id,
                                    Tenant.is_deleted == False
                                )
                            )
                        )
                        if tenant_check.scalar_one_or_none():
                            team_conditions.append(Prompt.tenant_id == tenant_id)
                        else:
                            # 租户不属于该团队，返回空结果
                            conditions.append(False)
                            team_conditions = []
                    else:
                        # 使用子查询：该团队的租户ID列表
                        team_tenants_subq = select(Tenant.id).where(
                            and_(
                                Tenant.team_id == team_id,
                                Tenant.is_deleted == False
                            )
                        )
                        team_conditions.append(Prompt.tenant_id.in_(team_tenants_subq))
                else:
                    # is_default 未指定，返回租户提示词或该团队的默认提示词
                    if tenant_id:
                        # 验证租户是否属于该团队
                        tenant_check = await db.execute(
                            select(Tenant.id).where(
                                and_(
                                    Tenant.id == tenant_id,
                                    Tenant.team_id == team_id,
                                    Tenant.is_deleted == False
                                )
                            )
                        )
                        if tenant_check.scalar_one_or_none():
                            team_conditions.append(Prompt.tenant_id == tenant_id)
                        else:
                            # 租户不属于该团队，返回空结果
                            conditions.append(False)
                            team_conditions = []
                    else:
                        # 该团队的租户提示词
                        team_tenants_subq = select(Tenant.id).where(
                            and_(
                                Tenant.team_id == team_id,
                                Tenant.is_deleted == False
                            )
                        )
                        team_conditions.append(Prompt.tenant_id.in_(team_tenants_subq))
                        # 该团队的默认提示词
                        team_conditions.append(
                            and_(
                                Prompt.is_default == True,
                                Prompt.team_id == team_id
                            )
                        )
                
                if team_conditions:
                    conditions.append(or_(*team_conditions))
        else:
            # 如果没有指定团队代码（超级管理员），查询 team_id 为 None 的数据
            if tenant_id:
                conditions.append(Prompt.tenant_id == tenant_id)
            if is_default is not None:
                if is_default is True:
                    # 系统管理员查询全局默认提示词（team_id 为 None）
                    conditions.append(
                        and_(
                            Prompt.is_default == True,
                            Prompt.team_id.is_(None)
                        )
                    )
                else:
                    # is_default is False，不包含默认提示词
                    conditions.append(Prompt.is_default == False)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def get_prompt_by_id(db: AsyncSession, prompt_id: str) -> Optional[Prompt]:
        """根据ID获取提示词"""
        result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_default_prompt(db: AsyncSession, scene: str, team_code: Optional[str] = None) -> Optional[Prompt]:
        """
        获取默认提示词（带缓存，TTL 10 分钟）
        
        Args:
            db: 数据库会话
            scene: 场景代码
            team_code: 团队代码（如果提供，优先返回该团队的默认提示词）
        
        Returns:
            默认提示词，优先返回指定团队的默认提示词，如果没有则返回全局默认提示词（team_code为None）
        """
        from app.core.cache import get_cache, set_cache, CACHE_KEY_PREFIXES, CACHE_TTL
        from app.core.database import get_redis_optional
        
        # 构建缓存 key
        cache_key = f"{CACHE_KEY_PREFIXES['prompt_default']}{scene}:{team_code or 'global'}"
        redis_client = await get_redis_optional()
        
        # 尝试从缓存读取
        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    # 重建 Prompt 对象（简化版，只返回必要字段）
                    prompt = Prompt(
                        id=data["id"],
                        scene=data["scene"],
                        tenant_id=data["tenant_id"],
                        content=data["content"],
                        placeholders=data.get("placeholders", []),
                        is_default=True,
                    )
                    return prompt
            except json.JSONDecodeError as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"缓存数据格式错误，key={cache_key}: {e}")
                # 删除损坏的缓存
                try:
                    await redis_client.delete(cache_key)
                except Exception:
                    pass
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"缓存读取失败，key={cache_key}: {e}")
        
        # 查询数据库（优化：并行查询团队和全局默认提示词）
        import asyncio
        
        if team_code:
            # 先查询 team_id
            from app.models.team import Team
            team_result = await db.execute(select(Team.id).where(Team.code == team_code))
            team_id = team_result.scalar_one_or_none()
            
            if team_id:
                # 并行查询团队默认提示词和全局默认提示词
                team_prompt_query = select(Prompt).where(
                    and_(
                        Prompt.scene == scene,
                        Prompt.is_default == True,
                        Prompt.team_id == team_id
                    )
                ).order_by(desc(Prompt.created_at)).limit(1)
                global_prompt_query = select(Prompt).where(
                    and_(
                        Prompt.scene == scene,
                        Prompt.is_default == True,
                        Prompt.team_id.is_(None)
                    )
                ).order_by(desc(Prompt.created_at)).limit(1)
                
                team_result, global_result = await asyncio.gather(
                    db.execute(team_prompt_query),
                    db.execute(global_prompt_query),
                    return_exceptions=True
                )
                
                # 优先返回团队的默认提示词（已经并行查询了团队和全局）
                prompt = None
                if not isinstance(team_result, Exception):
                    team_prompt = team_result.scalar_one_or_none()
                    if team_prompt:
                        prompt = team_prompt
                
                if not prompt and not isinstance(global_result, Exception):
                    prompt = global_result.scalar_one_or_none()
                
                # 写入缓存（如果找到提示词）
                if prompt and redis_client:
                    try:
                        await redis_client.setex(
                            cache_key,
                            CACHE_TTL["prompt_default"],
                            json.dumps({
                                "id": prompt.id,
                                "scene": prompt.scene,
                                "tenant_id": prompt.tenant_id,
                                "content": prompt.content,
                                "placeholders": prompt.placeholders,
                            }),
                        )
                    except Exception:
                        pass
                
                # 已经查询了团队和全局提示词，直接返回结果
                return prompt
            else:
                # team_code 不存在，只查询全局默认提示词
                result = await db.execute(
                    select(Prompt).where(
                        and_(
                            Prompt.scene == scene,
                            Prompt.is_default == True,
                            Prompt.team_id.is_(None)
                        )
                    ).order_by(desc(Prompt.created_at)).limit(1)
                )
                prompt = result.scalar_one_or_none()
        else:
            # 没有 team_code，只查询全局默认提示词
            result = await db.execute(
                select(Prompt).where(
                    and_(
                        Prompt.scene == scene,
                        Prompt.is_default == True,
                        Prompt.team_id.is_(None)
                    )
                ).order_by(desc(Prompt.created_at)).limit(1)
            )
            prompt = result.scalar_one_or_none()
        
        # 写入缓存
        if prompt and redis_client:
            try:
                await redis_client.setex(
                    cache_key,
                    CACHE_TTL["prompt_default"],
                    json.dumps({
                        "id": prompt.id,
                        "scene": prompt.scene,
                        "tenant_id": prompt.tenant_id,
                        "content": prompt.content,
                        "placeholders": prompt.placeholders,
                    }),
                )
            except Exception:
                pass
        
        return prompt
    
    @staticmethod
    async def create_prompt(db: AsyncSession, prompt_data: PromptCreate, team_code: Optional[str] = None) -> Prompt:
        """
        创建提示词
        
        Args:
            db: 数据库会话
            prompt_data: 提示词创建数据
            team_code: 团队代码（如果创建默认提示词，自动设置为team_code）
        """
        # 解析占位符
        placeholders = PromptService._parse_placeholders(prompt_data.content)
        
        is_default = (prompt_data.tenant_id == "default")
        # 如果是默认提示词，设置team_code；否则team_code为None（租户提示词不关联团队）
        prompt_team_code = team_code if is_default else None
        scene_id = None
        team_id = None
        
        # 先获取团队ID（如果提供了team_code）
        if prompt_team_code:
            t = (await db.execute(select(Team).where(Team.code == prompt_team_code))).scalar_one_or_none()
            if t:
                team_id = t.id
        
        # 查询场景（考虑团队隔离）
        from app.services.scene_service import SceneService
        s = await SceneService.get_by_code(db, prompt_data.scene, team_id=team_id)
        if s:
            scene_id = s.id
        prompt = Prompt(
            scene=prompt_data.scene,
            scene_id=scene_id,
            tenant_id=prompt_data.tenant_id,
            team_code=prompt_team_code,
            team_id=team_id,
            # 前端不再需要 title，这里落空字符串以兼容数据库 NOT NULL
            title="",
            content=prompt_data.content,
            placeholders=placeholders,
            is_default=is_default,
        )
        db.add(prompt)
        try:
            await db.commit()
            await db.refresh(prompt)
            
            # 失效默认提示词缓存（如果是默认提示词）- 只有在 commit 成功后才失效
            if is_default:
                from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt_default']}{prompt_data.scene}:*")
        except Exception:
            await db.rollback()
            raise
        
        return prompt
    
    @staticmethod
    async def update_prompt(
        db: AsyncSession, prompt_id: str, prompt_data: PromptUpdate
    ) -> Optional[Prompt]:
        """更新提示词"""
        prompt = await PromptService.get_prompt_by_id(db, prompt_id)
        if not prompt:
            return None
        
        if prompt_data.content is not None:
            prompt.content = prompt_data.content
            # 重新解析占位符
            prompt.placeholders = PromptService._parse_placeholders(prompt_data.content)
        if prompt_data.placeholders is not None:
            prompt.placeholders = prompt_data.placeholders
        
        try:
            await db.commit()
            await db.refresh(prompt)
            
            # 失效默认提示词缓存（如果是默认提示词）- 只有在 commit 成功后才失效
            if prompt.is_default:
                from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt_default']}{prompt.scene}:*")
        except Exception:
            await db.rollback()
            raise
        
        return prompt
    
    @staticmethod
    async def delete_prompt(db: AsyncSession, prompt_id: str) -> bool:
        """删除提示词"""
        prompt = await PromptService.get_prompt_by_id(db, prompt_id)
        if not prompt:
            return False
        
        if prompt.is_default:
            return False  # 默认提示词不允许删除
        
        scene_code = prompt.scene
        await db.delete(prompt)
        
        try:
            await db.commit()
            
            # 失效相关缓存 - 只有在 commit 成功后才失效
            from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
            from app.core.database import get_redis_optional
            redis_client = await get_redis_optional()
            if redis_client:
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt']}*")
                await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['prompt_default']}{scene_code}:*")
        except Exception:
            await db.rollback()
            raise
        
        return True
    
    @staticmethod
    def _parse_placeholders(content: str) -> List[str]:
        """从内容中解析占位符"""
        regex = r"\{([^{}]+)\}"
        matches = re.findall(regex, content)
        return list(set(matches))  # 去重


class PlaceholderService:
    """占位符服务类"""
    
    @staticmethod
    async def get_placeholders_by_scene(
        db: AsyncSession, scene: str, team_id: Optional[str] = None, team_code: Optional[str] = None
    ) -> List[Placeholder]:
        """
        根据场景获取占位符列表（通过关联表查询，带缓存，TTL 10 分钟）
        
        Args:
            db: 数据库会话
            scene: 场景代码
            team_id: 团队ID（优先使用）
            team_code: 团队代码（备用）
        """
        from app.core.cache import get_cache, set_cache, CACHE_KEY_PREFIXES, CACHE_TTL
        from app.core.database import get_redis_optional
        from app.models.scene import Scene
        import logging
        
        logger = logging.getLogger(__name__)
        # 缓存 key 包含团队信息
        cache_key = f"{CACHE_KEY_PREFIXES['placeholder']}{scene}:{team_id or team_code or 'global'}"
        redis_client = await get_redis_optional()
        
        # 尝试从缓存读取
        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data_list = json.loads(cached)
                    # 重建 Placeholder 对象列表
                    return [
                        Placeholder(
                            id=item["id"],
                            key=item["key"],
                            label=item["label"],
                            scene=item.get("scene", ""),
                            description=item.get("description"),
                            is_active=item.get("is_active", True),
                            team_id=item.get("team_id"),
                            team_code=item.get("team_code"),
                            data_source_type=item.get("data_source_type"),
                            data_type=item.get("data_type"),
                            table_id=item.get("table_id"),
                            table_column_key=item.get("table_column_key"),
                            table_row_id_param_key=item.get("table_row_id_param_key"),
                        )
                        for item in data_list
                    ]
            except json.JSONDecodeError as e:
                logger.warning(f"缓存数据格式错误，key={cache_key}: {e}")
                # 删除损坏的缓存
                try:
                    await redis_client.delete(cache_key)
                except Exception:
                    pass
            except Exception as e:
                logger.warning(f"缓存读取失败，key={cache_key}: {e}")
        
        # 通过关联表查询：先查找场景，然后通过关联表查询占位符
        # 使用 SceneService.get_by_code 方法，它会自动处理团队隔离
        from app.services.scene_service import SceneService
        
        # 如果提供了 team_code，先查询 team_id
        actual_team_id = team_id
        if not actual_team_id and team_code:
            from app.models.team import Team
            team_result = await db.execute(select(Team).where(Team.code == team_code))
            team = team_result.scalar_one_or_none()
            if team:
                actual_team_id = team.id
        
        # 查询场景（优先团队场景，其次全局场景）
        scene_obj = await SceneService.get_by_code(db, scene, team_id=actual_team_id)
        
        # 如果没有找到团队场景且提供了团队信息，尝试查询全局场景
        if not scene_obj and actual_team_id:
            scene_obj = await SceneService.get_by_code(db, scene, team_id=None)
        
        if not scene_obj:
            # 如果场景不存在，返回空列表
            return []
        
        # 通过关联表直接查询占位符（避免懒加载问题）
        from app.models.prompt import scene_placeholders
        query = (
            select(Placeholder)
            .join(scene_placeholders, Placeholder.id == scene_placeholders.c.placeholder_id)
            .where(
                and_(
                    scene_placeholders.c.scene_id == scene_obj.id,
                    Placeholder.is_active == True
                )
            )
        )
        
        # 添加团队过滤
        # 如果提供了团队信息，返回该团队的占位符 + 系统默认占位符（team_id 为 None）
        # 如果没有提供团队信息（系统管理员），返回所有占位符
        if team_id:
            query = query.where(
                or_(
                    Placeholder.team_id == team_id,
                    Placeholder.team_id.is_(None)  # 系统默认占位符
                )
            )
        elif team_code:
            query = query.where(
                or_(
                    Placeholder.team_code == team_code,
                    Placeholder.team_id.is_(None)  # 系统默认占位符
                )
            )
        # 如果没有提供团队信息（系统管理员），不添加过滤条件，返回所有占位符
        
        result = await db.execute(query)
        placeholders = result.scalars().all()
        
        # 写入缓存
        if redis_client:
            try:
                await redis_client.setex(
                    cache_key,
                    CACHE_TTL["placeholder"],
                    json.dumps([
                        {
                            "id": p.id,
                            "key": p.key,
                            "label": p.label,
                            "scene": p.scene or "",
                            "description": p.description,
                            "is_active": p.is_active,
                            "team_id": p.team_id,
                            "team_code": p.team_code,
                            "data_source_type": p.data_source_type,
                            "data_type": p.data_type,
                            "table_id": p.table_id,
                            "table_column_key": p.table_column_key,
                            "table_row_id_param_key": p.table_row_id_param_key,
                        }
                        for p in placeholders
                    ], default=str),
                )
            except Exception:
                pass
        
        return placeholders
    
    @staticmethod
    async def get_all_placeholders(
        db: AsyncSession, 
        team_id: Optional[str] = None, 
        team_code: Optional[str] = None
    ) -> List[Placeholder]:
        """
        获取所有占位符（按团队过滤）
        
        Args:
            db: 数据库会话
            team_id: 团队ID（优先使用）
            team_code: 团队代码（备用）
        """
        query = select(Placeholder).where(Placeholder.is_active == True)
        
        # 添加团队过滤
        # 如果提供了团队信息，返回该团队的占位符 + 系统默认占位符（team_id 为 None）
        # 如果没有提供团队信息（系统管理员），返回所有占位符
        if team_id:
            query = query.where(
                or_(
                    Placeholder.team_id == team_id,
                    Placeholder.team_id.is_(None)  # 系统默认占位符
                )
            )
        elif team_code:
            query = query.where(
                or_(
                    Placeholder.team_code == team_code,
                    Placeholder.team_id.is_(None)  # 系统默认占位符
                )
            )
        # 如果没有提供团队信息（系统管理员），不添加过滤条件，返回所有占位符
        
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def create_placeholder(
        db: AsyncSession, 
        placeholder_data: PlaceholderCreate, 
        team_id: Optional[str] = None,
        team_code: Optional[str] = None,
        commit: bool = True
    ) -> Placeholder:
        """
        创建占位符
        
        Args:
            db: 数据库会话
            placeholder_data: 占位符数据
            team_id: 团队ID（优先使用）
            team_code: 团队代码（备用）
            commit: 是否提交事务（默认 True，如果由其他方法调用且需要统一提交，设为 False）
        """
        # 占位符的 key 在团队内必须唯一
        # 检查同一团队内是否已存在相同 key 的占位符
        query = select(Placeholder).where(Placeholder.key == placeholder_data.key)
        if team_id:
            query = query.where(Placeholder.team_id == team_id)
        elif team_code:
            query = query.where(Placeholder.team_code == team_code)
        else:
            # 如果没有提供团队信息，检查 team_id 为 None 的占位符
            query = query.where(Placeholder.team_id.is_(None))
        
        existing = await db.execute(query)
        existing_placeholder = existing.scalar_one_or_none()
        if existing_placeholder:
            if not existing_placeholder.is_active:
                # 如果存在已停用的占位符，先删除它（物理删除），然后创建新的
                # 因为已停用的占位符不应该阻止创建新的同名占位符
                from app.models.prompt import scene_placeholders
                # 先删除关联表中的记录
                await db.execute(
                    delete(scene_placeholders).where(
                        scene_placeholders.c.placeholder_id == existing_placeholder.id
                    )
                )
                # 然后删除占位符
                await db.delete(existing_placeholder)
                await db.flush()  # 刷新以确保删除完成
            else:
                raise ValueError(f"占位符代码 '{placeholder_data.key}' 在该团队内已存在")
        
        # 创建占位符，scene 始终为空字符串，scene_id 为 None
        placeholder = Placeholder(
            key=placeholder_data.key,
            label=placeholder_data.label,
            scene="",  # 占位符不直接关联场景，通过关联表关联
            scene_id=None,  # 占位符不直接关联场景，通过关联表关联
            team_id=team_id,
            team_code=team_code,
            description=placeholder_data.description,
            method=placeholder_data.method,
            method_params=placeholder_data.method_params,
            tenant_param_key=placeholder_data.tenant_param_key,
            data_source_type=placeholder_data.data_source_type,
            data_type=placeholder_data.data_type,
            table_id=placeholder_data.table_id,
            table_column_key=placeholder_data.table_column_key,
            table_row_id_param_key=placeholder_data.table_row_id_param_key,
        )
        db.add(placeholder)
        
        if commit:
            try:
                await db.commit()
                await db.refresh(placeholder)
                
                # 失效占位符缓存（包含团队信息）
                from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}*")
            except Exception:
                await db.rollback()
                raise
        else:
            await db.flush()  # 只 flush，不 commit
        
        return placeholder
    
    @staticmethod
    async def update_placeholder(
        db: AsyncSession, 
        placeholder_id: str, 
        placeholder_data: PlaceholderUpdate, 
        team_id: Optional[str] = None,
        team_code: Optional[str] = None,
        commit: bool = True
    ) -> Optional[Placeholder]:
        """
        更新占位符
        
        Args:
            db: 数据库会话
            placeholder_id: 占位符 ID
            placeholder_data: 占位符更新数据
            team_id: 团队ID（用于权限检查）
            team_code: 团队代码（用于权限检查）
            commit: 是否提交事务（默认 True）
        """
        query = select(Placeholder).where(Placeholder.id == placeholder_id)
        # 添加团队过滤，确保只能更新自己团队的占位符
        if team_id:
            query = query.where(Placeholder.team_id == team_id)
        elif team_code:
            query = query.where(Placeholder.team_code == team_code)
        # 注意：如果是系统管理员（team_id 为 None），可以更新 team_id 为 None 的占位符
        
        result = await db.execute(query)
        placeholder = result.scalar_one_or_none()
        if not placeholder:
            return None
        
        # 更新字段
        if placeholder_data.label is not None:
            placeholder.label = placeholder_data.label
        if placeholder_data.description is not None:
            placeholder.description = placeholder_data.description
        if placeholder_data.method is not None:
            placeholder.method = placeholder_data.method
        if placeholder_data.method_params is not None:
            placeholder.method_params = placeholder_data.method_params
        if placeholder_data.tenant_param_key is not None:
            placeholder.tenant_param_key = placeholder_data.tenant_param_key
        
        # 更新新增字段
        if placeholder_data.data_source_type is not None:
            placeholder.data_source_type = placeholder_data.data_source_type
        if placeholder_data.data_type is not None:
            placeholder.data_type = placeholder_data.data_type
        if placeholder_data.table_id is not None:
            placeholder.table_id = placeholder_data.table_id
        if placeholder_data.table_column_key is not None:
            placeholder.table_column_key = placeholder_data.table_column_key
        if placeholder_data.table_row_id_param_key is not None:
            placeholder.table_row_id_param_key = placeholder_data.table_row_id_param_key
        
        if commit:
            try:
                await db.commit()
                await db.refresh(placeholder)
                
                # 失效占位符缓存
                from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}*")
            except Exception:
                await db.rollback()
                raise
        else:
            await db.flush()
        
        return placeholder
    
    @staticmethod
    async def delete_placeholder(
        db: AsyncSession, 
        placeholder_id: str, 
        team_id: Optional[str] = None,
        team_code: Optional[str] = None,
        commit: bool = True
    ) -> bool:
        """
        删除占位符（软删除）
        
        Args:
            db: 数据库会话
            placeholder_id: 占位符 ID
            team_id: 团队ID（用于权限检查）
            team_code: 团队代码（用于权限检查）
            commit: 是否提交事务（默认 True）
        """
        query = select(Placeholder).where(Placeholder.id == placeholder_id)
        # 添加团队过滤，确保只能删除自己团队的占位符
        if team_id:
            query = query.where(Placeholder.team_id == team_id)
        elif team_code:
            query = query.where(Placeholder.team_code == team_code)
        # 注意：如果是系统管理员（team_id 为 None），可以删除 team_id 为 None 的占位符
        
        result = await db.execute(query)
        placeholder = result.scalar_one_or_none()
        if not placeholder:
            return False
        
        placeholder.is_active = False
        
        if commit:
            try:
                await db.commit()
                
                # 失效占位符缓存
                from app.core.cache import delete_cache_pattern, CACHE_KEY_PREFIXES
                from app.core.database import get_redis_optional
                redis_client = await get_redis_optional()
                if redis_client:
                    await delete_cache_pattern(f"{CACHE_KEY_PREFIXES['placeholder']}*")
            except Exception:
                await db.rollback()
                raise
        
        return True


class TenantService:
    """租户服务类"""
    
    @staticmethod
    async def get_tenants(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False,
        team_code: Optional[str] = None,
        team_id: Optional[str] = None,
        only_superuser: bool = False,
    ) -> List[Tenant]:
        """
        获取租户列表（排除已删除的）
        
        Args:
            team_code: 如果指定了team_code，只返回该团队的租户
            team_id: 如果指定了team_id，只返回该团队的租户（优先于team_code）
            only_superuser: 如果为True，只返回系统创建的租户（team_code为None），忽略team_code和team_id参数
        """
        from app.models.user import User
        
        query = select(Tenant)
        
        if not include_deleted:
            query = query.where(Tenant.is_deleted == False)
        
        # 租户过滤
        if only_superuser:
            # 只返回系统创建的租户（team_code为None）
            query = query.where(Tenant.team_code.is_(None))
        elif team_id is not None:
            # 优先使用 team_id 查询
            query = query.where(Tenant.team_id == team_id)
        elif team_code is not None:
            # 返回指定团队的租户
            query = query.where(Tenant.team_code == team_code)
        
        query = query.offset(skip).limit(limit).order_by(Tenant.created_at.desc())
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def count_tenants(
        db: AsyncSession,
        include_deleted: bool = False,
        team_code: Optional[str] = None,
        team_id: Optional[str] = None,
        only_superuser: bool = False,
    ) -> int:
        """
        获取租户总数
        
        Args:
            team_code: 如果指定了team_code，只统计该团队的租户
            team_id: 如果指定了team_id，只统计该团队的租户（优先于team_code）
            only_superuser: 如果为True，只统计系统创建的租户（team_code为None），忽略team_code和team_id参数
        """
        from sqlalchemy import func
        
        query = select(func.count(Tenant.id))
        
        if not include_deleted:
            query = query.where(Tenant.is_deleted == False)
        
        # 租户过滤
        if only_superuser:
            # 只统计系统创建的租户（team_code为None）
            query = query.where(Tenant.team_code.is_(None))
        elif team_id is not None:
            # 优先使用 team_id 查询
            query = query.where(Tenant.team_id == team_id)
        elif team_code is not None:
            # 统计指定团队的租户
            query = query.where(Tenant.team_code == team_code)
        
        result = await db.execute(query)
        return result.scalar() or 0
    
    @staticmethod
    async def get_tenant_by_id(db: AsyncSession, tenant_id: str) -> Optional[Tenant]:
        """根据ID获取租户（包括已删除的）"""
        result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_tenant_by_code_id(db: AsyncSession, code_id: str) -> Optional[Tenant]:
        """根据编号ID获取租户"""
        result = await db.execute(
            select(Tenant).where(
                and_(Tenant.code_id == code_id, Tenant.is_deleted == False)
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_tenant(
        db: AsyncSession, 
        tenant_data: TenantCreate,
        created_by: Optional[str] = None,
        team_code: Optional[str] = None,
    ) -> Tenant:
        """
        创建租户
        
        Args:
            team_code: 团队代码（系统创建的数据team_code为None，团队创建的数据team_code为该团队的team_code）
        """
        team_id = None
        if team_code:
            t = (await db.execute(select(Team).where(Team.code == team_code))).scalar_one_or_none()
            if t:
                team_id = t.id
        tenant = Tenant(
            code_id=tenant_data.code_id,
            name=tenant_data.name,
            description=tenant_data.description,
            app_id=tenant_data.app_id,
            app_secret=tenant_data.app_secret,
            team_code=team_code,
            team_id=team_id,
            created_by=created_by,
        )
        db.add(tenant)
        try:
            await db.commit()
            await db.refresh(tenant)
        except Exception:
            await db.rollback()
            raise
        return tenant
    
    @staticmethod
    async def update_tenant(
        db: AsyncSession,
        tenant_id: str,
        tenant_data: TenantUpdate,
        updated_by: Optional[str] = None
    ) -> Optional[Tenant]:
        """更新租户"""
        tenant = await TenantService.get_tenant_by_id(db, tenant_id)
        if not tenant or tenant.is_deleted:
            return None
        
        # 更新字段
        if tenant_data.code_id is not None:
            tenant.code_id = tenant_data.code_id
        if tenant_data.name is not None:
            tenant.name = tenant_data.name
        if tenant_data.description is not None:
            tenant.description = tenant_data.description
        if tenant_data.app_id is not None:
            tenant.app_id = tenant_data.app_id
        if tenant_data.app_secret is not None:
            tenant.app_secret = tenant_data.app_secret
        if tenant_data.is_active is not None:
            tenant.is_active = tenant_data.is_active
        
        if updated_by is not None:
            tenant.updated_by = updated_by
        
        try:
            await db.commit()
            await db.refresh(tenant)
        except Exception:
            await db.rollback()
            raise
        return tenant
    
    @staticmethod
    async def delete_tenant(
        db: AsyncSession,
        tenant_id: str,
        updated_by: Optional[str] = None
    ) -> bool:
        """逻辑删除租户"""
        tenant = await TenantService.get_tenant_by_id(db, tenant_id)
        if not tenant or tenant.is_deleted:
            return False
        
        tenant.is_deleted = True
        tenant.updated_by = updated_by
        
        await db.commit()
        return True


class PlaceholderDataSourceService:
    """占位符数据源服务类（从 Placeholder 模型获取方法配置）"""
    
    # 数据获取方法注册表
    _methods: Dict[str, Callable] = {}
    
    @classmethod
    def register_method(cls, method_name: str, method_func: Callable):
        """注册数据获取方法"""
        cls._methods[method_name] = method_func
    
    @classmethod
    def get_method(cls, method_name: str) -> Optional[Callable]:
        """获取数据获取方法"""
        return cls._methods.get(method_name)
    
    @classmethod
    def list_methods(cls) -> List[str]:
        """列出所有已注册的方法"""
        return list(cls._methods.keys())
    
    @classmethod
    async def get_placeholder_value(
        cls, db: AsyncSession, placeholder_key: str, tenant_id: Optional[str] = None, 
        additional_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """获取占位符的实际值（从 Placeholder 模型获取方法配置）
        
        返回格式：
        {
            "value": "实际值",
            "source": "方法名称",
            "success": True/False,
            "error": "错误信息（如果有）"
        }
        """
        additional_params = additional_params or {}
        
        # 从 Placeholder 表获取占位符配置
        result = await db.execute(
            select(Placeholder).where(
                and_(
                    Placeholder.key == placeholder_key,
                    Placeholder.is_active == True
                )
            )
        )
        placeholder = result.scalar_one_or_none()
        
        if not placeholder:
            return {
                "value": None,
                "source": None,
                "success": False,
                "error": f"占位符 {placeholder_key} 不存在或未激活"
            }
        
        if not placeholder.method:
            return {
                "value": None,
                "source": None,
                "success": False,
                "error": f"占位符 {placeholder_key} 没有配置数据获取方法"
            }
        
        # 获取注册的方法
        method_func = cls.get_method(placeholder.method)
        if not method_func:
            return {
                "value": None,
                "source": None,
                "success": False,
                "error": f"方法 {placeholder.method} 未注册"
            }
        
        try:
            # 解析方法参数
            method_params = {}
            if placeholder.method_params:
                try:
                    method_params = json.loads(placeholder.method_params)
                except json.JSONDecodeError:
                    method_params = {}
            
            # 如果有租户参数 key，添加租户ID
            if placeholder.tenant_param_key and tenant_id:
                method_params[placeholder.tenant_param_key] = tenant_id
            
            # 合并额外参数
            method_params.update(additional_params)
            
            # 如果方法需要数据库会话，传入 db
            sig = inspect.signature(method_func)
            if 'db' in sig.parameters:
                method_params['db'] = db
            
            # 调用方法获取值
            if asyncio.iscoroutinefunction(method_func):
                value = await method_func(**method_params)
            else:
                # 使用线程池执行同步方法，避免阻塞事件循环
                loop = asyncio.get_event_loop()
                value = await loop.run_in_executor(
                    None,
                    lambda: method_func(**method_params)
                )
            
            if value is not None:
                return {
                    "value": str(value),
                    "source": placeholder.method,
                    "success": True,
                    "error": None
                }
            else:
                return {
                    "value": None,
                    "source": placeholder.method,
                    "success": False,
                    "error": f"方法 {placeholder.method} 返回了 None"
                }
        except Exception as e:
            if settings.DEBUG:
                traceback.print_exc()
            return {
                "value": None,
                "source": placeholder.method,
                "success": False,
                "error": f"方法 {placeholder.method} 执行失败: {str(e)}"
            }

