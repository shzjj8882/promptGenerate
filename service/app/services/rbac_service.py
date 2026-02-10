"""
RBAC（基于角色的访问控制）服务层
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from app.utils.json_utils import dumps as json_dumps, loads as json_loads
import logging
from typing import List, Optional, Dict, Any, Tuple
import redis.asyncio as redis
from app.models.rbac import Role, Permission, MenuConfig, user_roles, role_permissions
from app.models.user import User
from app.schemas.rbac import (
    RoleCreate, RoleUpdate, PermissionCreate, PermissionUpdate,
    RoleResponse, PermissionResponse
)


class PermissionService:
    """权限服务类"""
    
    @staticmethod
    async def get_permission_by_id(db: AsyncSession, permission_id: str) -> Optional[Permission]:
        """根据ID获取权限"""
        result = await db.execute(select(Permission).where(Permission.id == permission_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_permission_by_code(db: AsyncSession, code: str) -> Optional[Permission]:
        """根据代码获取权限"""
        result = await db.execute(select(Permission).where(Permission.code == code))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_permissions(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        resource: Optional[str] = None,
        is_active: Optional[bool] = None,
        permission_type: Optional[str] = None,
    ) -> List[Permission]:
        """获取权限列表。permission_type: 'menu'|'api' 区分菜单权限与接口权限"""
        query = select(Permission)
        if resource:
            query = query.where(Permission.resource == resource)
        if is_active is not None:
            query = query.where(Permission.is_active == is_active)
        if permission_type:
            query = query.where(Permission.type == permission_type)
        query = query.offset(skip).limit(limit).order_by(Permission.resource, Permission.action)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def count_permissions(
        db: AsyncSession,
        resource: Optional[str] = None,
        is_active: Optional[bool] = None,
        permission_type: Optional[str] = None,
    ) -> int:
        """统计权限数量。permission_type: 'menu'|'api'"""
        query = select(func.count(Permission.id))
        if resource:
            query = query.where(Permission.resource == resource)
        if is_active is not None:
            query = query.where(Permission.is_active == is_active)
        if permission_type:
            query = query.where(Permission.type == permission_type)
        result = await db.execute(query)
        return result.scalar() or 0

    # 菜单权限中属于「路由」的 action：控制动态路由/侧栏入口
    MENU_ROUTE_ACTIONS = ("menu_list", "menu")

    # 功能组展示顺序与展示名，由后端决定，前端仅按此渲染（角色管理-权限分配）
    RESOURCE_ORDER = ("tenant", "prompts", "scenes", "rbac")
    RESOURCE_LABELS = {
        "tenant": "租户管理",
        "prompts": "提示词管理",
        "scenes": "场景管理",
        "rbac": "权限管理",
    }

    @staticmethod
    async def get_permissions_grouped(
        db: AsyncSession,
        is_active: Optional[bool] = True,
    ) -> dict:
        """
        返回平铺的权限列表，由前端按 type / resource 等用 groupBy 组合。
        返回: { "items": [Permission, ...], "resource_order": [...], "resource_labels": {...} }
        """
        q = select(Permission)
        if is_active is not None:
            q = q.where(Permission.is_active.is_(is_active))
        result = await db.execute(q.order_by(Permission.resource, Permission.action))
        perms = list(result.scalars().all())
        return {
            "items": perms,
            "resource_order": list(PermissionService.RESOURCE_ORDER),
            "resource_labels": dict(PermissionService.RESOURCE_LABELS),
        }
    
    @staticmethod
    async def get_menu_tree(
        db: AsyncSession,
        user_id: Optional[str] = None,
        is_active: Optional[bool] = True,
        team_id: Optional[str] = None,
    ) -> Tuple[List[Permission], Dict[str, List[Permission]]]:
        """
        获取菜单权限树结构（仅返回路由级菜单权限，action 为 menu_list 或 menu）
        如果提供了 user_id，则只返回用户有权限的菜单
        优先使用团队级别的菜单配置（parent_id, sort_order），如果没有则使用全局配置
        返回树形结构，包含 children 子菜单
        """
        from app.models.user import User
        from app.models.team import Team
        
        # 如果提供了 user_id，获取用户的团队ID
        if user_id:
            user = await db.get(User, user_id)
            if not user:
                return [], {}
            
            # 优化：优先使用用户对象中的 team_id（如果存在），避免额外查询
            if not team_id:
                if user.team_id:
                    team_id = user.team_id
                elif user.team_code:
                    # 如果只有 team_code，才查询 Team 表
                    team_result = await db.execute(
                        select(Team.id).where(Team.code == user.team_code)
                    )
                    team_row = team_result.scalar_one_or_none()
                    if team_row:
                        team_id = team_row
        
        # 构建查询：只获取菜单权限，且是路由级的（action 为 menu_list 或 menu）
        q = select(Permission).where(
            Permission.type == Permission.TYPE_MENU,
            Permission.action.in_(PermissionService.MENU_ROUTE_ACTIONS)
        )
        
        if is_active is not None:
            q = q.where(Permission.is_active.is_(is_active))
        
        # 如果提供了 user_id，需要过滤用户权限（user 已在上面获取）
        if user_id:
            if not user:
                return [], {}
            
            # 系统超级管理员只能看到团队管理菜单，团队管理员不能看到团队管理菜单
            if user.is_superuser:
                # 系统管理员只能看到团队管理相关的菜单（code 以 menu:team 或 menu:teams 开头）
                q = q.where(
                    or_(
                        Permission.code.like("menu:team%"),
                        Permission.code.like("menu:teams%")
                    )
                )
                result = await db.execute(q)
                all_perms = list(result.scalars().all())
            elif user.is_team_admin:
                # 团队管理员拥有所有菜单权限，但排除团队管理菜单（仅系统管理员可见）
                q = q.where(
                    and_(
                        ~Permission.code.like("menu:team%"),
                        ~Permission.code.like("menu:teams%")
                    )
                )
                result = await db.execute(q)
                all_perms = list(result.scalars().all())
            else:
                # 获取用户有权限的菜单，但排除团队管理菜单（仅系统管理员可见）
                q = q.join(role_permissions, Permission.id == role_permissions.c.permission_id)\
                     .join(user_roles, role_permissions.c.role_id == user_roles.c.role_id)\
                     .join(Role, user_roles.c.role_id == Role.id)\
                     .where(user_roles.c.user_id == user_id)\
                     .where(Role.is_active.is_(True))\
                     .where(
                         and_(
                             ~Permission.code.like("menu:team%"),
                             ~Permission.code.like("menu:teams%")
                         )
                     )
                result = await db.execute(q)
                all_perms = list(result.scalars().all())
        else:
            result = await db.execute(q)
            all_perms = list(result.scalars().all())
        
        # 获取菜单配置（优先团队配置，其次全局配置）
        # 优化：使用一次查询获取所有需要的配置（团队配置 + 全局配置）
        if all_perms:
            perm_ids = [p.id for p in all_perms]
            
            # 构建查询条件：团队配置或全局配置
            config_conditions = [MenuConfig.permission_id.in_(perm_ids)]
            if team_id:
                # 查询团队配置和全局配置（使用 OR）
                config_conditions.append(
                    or_(
                        MenuConfig.team_id == team_id,
                        MenuConfig.team_id.is_(None)
                    )
                )
            else:
                # 只查询全局配置
                config_conditions.append(MenuConfig.team_id.is_(None))
            
            # 一次查询获取所有配置
            config_result = await db.execute(
                select(MenuConfig).where(and_(*config_conditions))
            )
            all_configs = list(config_result.scalars().all())
            
            # 分离团队配置和全局配置
            team_configs = {}
            global_configs = {}
            for cfg in all_configs:
                if cfg.team_id == team_id:
                    team_configs[cfg.permission_id] = cfg
                elif cfg.team_id is None:
                    global_configs[cfg.permission_id] = cfg
            
            # 应用菜单配置：优先使用团队配置，如果没有则使用全局配置，最后使用 Permission 表的默认值
            for perm in all_perms:
                config = team_configs.get(perm.id) or global_configs.get(perm.id)
                if config:
                    # 使用菜单配置中的 parent_id 和 sort_order
                    perm.parent_id = config.parent_id
                    perm.sort_order = config.sort_order
        
        # 构建树形结构
        # 使用字典存储所有权限，包括可能不在查询结果中的父节点
        perm_dict = {p.id: p for p in all_perms}
        
        # 如果某个权限的 parent_id 不在当前结果中，需要查询父节点
        missing_parent_ids = set()
        for perm in all_perms:
            if perm.parent_id and perm.parent_id not in perm_dict:
                missing_parent_ids.add(perm.parent_id)
        
        # 查询缺失的父节点（如果它们也是菜单权限）
        if missing_parent_ids:
            parent_query = select(Permission).where(
                Permission.id.in_(missing_parent_ids),
                Permission.type == Permission.TYPE_MENU,
                Permission.action.in_(PermissionService.MENU_ROUTE_ACTIONS)
            )
            if is_active is not None:
                parent_query = parent_query.where(Permission.is_active.is_(is_active))
            parent_result = await db.execute(parent_query)
            missing_parents = list(parent_result.scalars().all())
            for parent in missing_parents:
                perm_dict[parent.id] = parent
                all_perms.append(parent)
        
        # 使用字典结构构建树，避免操作 SQLAlchemy relationship
        # 构建 children 映射：parent_id -> [children]
        children_map: Dict[str, List[Permission]] = {}
        root_perms = []
        
        for perm in all_perms:
            if perm.parent_id and perm.parent_id in perm_dict:
                # 有父节点，添加到父节点的 children 列表
                if perm.parent_id not in children_map:
                    children_map[perm.parent_id] = []
                children_map[perm.parent_id].append(perm)
            else:
                # 根节点
                root_perms.append(perm)
        
        # 对每个父节点的子节点排序
        for parent_id in children_map:
            children_map[parent_id].sort(key=lambda x: (x.sort_order, x.name))
        
        # 对根节点排序
        root_perms.sort(key=lambda x: (x.sort_order, x.name))
        
        # 返回根节点和 children_map，让 API 层构建树结构
        # 注意：不在 Permission 对象上设置 children 属性，避免触发 SQLAlchemy relationship
        return root_perms, children_map
    
    @staticmethod
    async def create_permission(db: AsyncSession, permission_data: PermissionCreate) -> Permission:
        """创建权限"""
        # 检查代码是否已存在
        existing = await PermissionService.get_permission_by_code(db, permission_data.code)
        if existing:
            raise ValueError("权限代码已存在")
        
        permission = Permission(
            name=permission_data.name,
            code=permission_data.code,
            resource=permission_data.resource,
            action=permission_data.action,
            type=getattr(permission_data, "type", Permission.TYPE_API) or Permission.TYPE_API,
            description=permission_data.description,
            parent_id=getattr(permission_data, "parent_id", None),
            sort_order=getattr(permission_data, "sort_order", 0) or 0,
            is_active=permission_data.is_active,
        )
        db.add(permission)
        try:
            await db.commit()
            await db.refresh(permission)
        except Exception:
            await db.rollback()
            raise
        return permission
    
    @staticmethod
    async def update_permission(
        db: AsyncSession,
        permission_id: str,
        permission_data: PermissionUpdate,
    ) -> Optional[Permission]:
        """更新权限"""
        permission = await PermissionService.get_permission_by_id(db, permission_id)
        if not permission:
            return None
        
        if permission_data.name is not None:
            permission.name = permission_data.name
        if permission_data.description is not None:
            permission.description = permission_data.description
        if permission_data.is_active is not None:
            permission.is_active = permission_data.is_active
        if getattr(permission_data, "type", None) is not None:
            permission.type = permission_data.type
        if getattr(permission_data, "parent_id", None) is not None:
            permission.parent_id = permission_data.parent_id
        if getattr(permission_data, "sort_order", None) is not None:
            permission.sort_order = permission_data.sort_order

        try:
            await db.commit()
            await db.refresh(permission)
        except Exception:
            await db.rollback()
            raise
        return permission

    @staticmethod
    async def delete_permission(db: AsyncSession, permission_id: str) -> bool:
        """删除权限"""
        permission = await PermissionService.get_permission_by_id(db, permission_id)
        if not permission:
            return False
        
        await db.delete(permission)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        return True
    
    @staticmethod
    async def update_menu_config(
        db: AsyncSession,
        permission_id: str,
        parent_id: Optional[str],
        sort_order: int,
        team_id: Optional[str] = None,
    ) -> MenuConfig:
        """
        更新或创建菜单配置（支持团队级别的覆盖）
        
        Args:
            permission_id: 权限ID
            parent_id: 父权限ID（None表示根菜单）
            sort_order: 排序顺序
            team_id: 团队ID（None表示全局配置，系统管理员使用）
        
        Returns:
            菜单配置对象
        """
        # 查询是否已存在配置
        if team_id:
            existing = await db.execute(
                select(MenuConfig).where(
                    MenuConfig.permission_id == permission_id,
                    MenuConfig.team_id == team_id
                )
            )
        else:
            existing = await db.execute(
                select(MenuConfig).where(
                    MenuConfig.permission_id == permission_id,
                    MenuConfig.team_id.is_(None)
                )
            )
        
        config = existing.scalar_one_or_none()
        
        if config:
            # 更新现有配置
            config.parent_id = parent_id
            config.sort_order = sort_order
            config.updated_at = func.now()
        else:
            # 创建新配置
            config = MenuConfig(
                permission_id=permission_id,
                team_id=team_id,
                parent_id=parent_id,
                sort_order=sort_order,
            )
            db.add(config)
        
        try:
            await db.commit()
            await db.refresh(config)
        except Exception:
            await db.rollback()
            raise
        
        return config


class RoleService:
    """角色服务类"""
    
    @staticmethod
    async def get_role_by_id(db: AsyncSession, role_id: str) -> Optional[Role]:
        """根据ID获取角色（包含权限），一次查询"""
        result = await db.execute(
            select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_role_by_code(db: AsyncSession, code: str, team_code: Optional[str] = None) -> Optional[Role]:
        """根据代码获取角色，一次查询（code在团队内唯一）"""
        query = select(Role).where(Role.code == code).options(selectinload(Role.permissions))
        if team_code is not None:
            query = query.where(Role.team_code == team_code)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_roles(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None,
        team_code: Optional[str] = None,
        only_global: bool = False,
    ) -> List[Role]:
        """
        获取角色列表，selectinload 一次加载 permissions 避免 N+1
        
        Args:
            team_code: 如果指定了team_code，只返回该团队的角色
            only_global: 如果为True，只返回全局角色（team_code为None），忽略team_code参数
        """
        query = select(Role).options(selectinload(Role.permissions))
        if is_active is not None:
            query = query.where(Role.is_active == is_active)
        # 团队过滤
        if only_global:
            # 只返回全局角色（team_code为None）
            query = query.where(Role.team_code.is_(None))
        elif team_code is not None:
            # 返回指定团队的角色
            query = query.where(Role.team_code == team_code)
        # 如果team_code为None且only_global为False，则不添加团队过滤（返回所有角色，但这种情况不应该出现）
        query = query.offset(skip).limit(limit).order_by(Role.name)
        result = await db.execute(query)
        return list(result.unique().scalars().all())
    
    @staticmethod
    async def count_roles(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        team_code: Optional[str] = None,
        only_global: bool = False,
    ) -> int:
        """
        统计角色数量
        
        Args:
            team_code: 如果指定了team_code，只统计该团队的角色
            only_global: 如果为True，只统计全局角色（team_code为None），忽略team_code参数
        """
        query = select(func.count(Role.id))
        
        if is_active is not None:
            query = query.where(Role.is_active == is_active)
        # 团队过滤
        if only_global:
            # 只统计全局角色（team_code为None）
            query = query.where(Role.team_code.is_(None))
        elif team_code is not None:
            # 统计指定团队的角色
            query = query.where(Role.team_code == team_code)
        
        result = await db.execute(query)
        return result.scalar() or 0
    
    @staticmethod
    async def create_role(db: AsyncSession, role_data: RoleCreate, team_code: Optional[str] = None) -> Role:
        """创建角色"""
        # 检查代码是否在团队内已存在
        existing = await RoleService.get_role_by_code(db, role_data.code, team_code=team_code)
        if existing:
            raise ValueError("角色代码已存在")
        team_id = None
        if team_code:
            from app.models.team import Team
            r = await db.execute(select(Team).where(Team.code == team_code))
            t = r.scalar_one_or_none()
            if t:
                team_id = t.id
        role = Role(
            name=role_data.name,
            code=role_data.code,
            team_code=team_code,
            team_id=team_id,
            description=role_data.description,
            is_active=role_data.is_active,
        )
        
        # 分配权限
        if role_data.permission_ids:
            permissions = await db.execute(
                select(Permission).where(Permission.id.in_(role_data.permission_ids))
            )
            role.permissions = list(permissions.scalars().all())
        
        db.add(role)
        try:
            await db.commit()
            await db.refresh(role, ["permissions"])
        except Exception:
            await db.rollback()
            raise
        return role
    
    @staticmethod
    async def update_role(
        db: AsyncSession,
        role_id: str,
        role_data: RoleUpdate,
    ) -> Optional[Role]:
        """更新角色"""
        role = await RoleService.get_role_by_id(db, role_id)
        if not role:
            return None
        
        if role_data.name is not None:
            role.name = role_data.name
        if role_data.description is not None:
            role.description = role_data.description
        if role_data.is_active is not None:
            role.is_active = role_data.is_active
        
        # 更新权限
        if role_data.permission_ids is not None:
            permissions = await db.execute(
                select(Permission).where(Permission.id.in_(role_data.permission_ids))
            )
            role.permissions = list(permissions.scalars().all())
        
        try:
            await db.commit()
            await db.refresh(role, ["permissions"])
        except Exception:
            await db.rollback()
            raise
        return role
    
    @staticmethod
    async def delete_role(db: AsyncSession, role_id: str) -> bool:
        """删除角色"""
        role = await RoleService.get_role_by_id(db, role_id)
        if not role:
            return False
        
        await db.delete(role)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        return True
    
    @staticmethod
    async def assign_roles_to_user(
        db: AsyncSession,
        user_id: str,
        role_ids: List[str],
    ) -> Optional[User]:
        """为用户分配角色"""
        from app.models.rbac import user_roles
        
        # 检查用户是否存在（使用 selectinload 预加载角色，避免后续查询）
        from sqlalchemy.orm import selectinload
        user_result = await db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.roles))
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return None
        
        # 先删除用户的所有现有角色
        await db.execute(
            user_roles.delete().where(user_roles.c.user_id == user_id)
        )
        
        # 如果有新角色，插入新的关联关系
        if role_ids:
            # 验证角色是否存在
            roles_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
            existing_roles = roles_result.scalars().all()
            existing_role_ids = [role.id for role in existing_roles]
            
            # 只插入存在的角色
            if existing_role_ids:
                values = [{"user_id": user_id, "role_id": role_id} for role_id in existing_role_ids]
                await db.execute(user_roles.insert().values(values))
        
        try:
            await db.commit()
            # 刷新用户对象以获取最新的角色关联
            await db.refresh(user, ["roles"])
            
            # 失效用户相关的缓存（权限缓存和角色ID缓存）
            from app.core.database import get_redis_optional
            from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_keys
            redis_client = await get_redis_optional()
            if redis_client:
                # 失效权限缓存
                await RoleService.invalidate_user_perm_cache(redis_client, user_id)
                # 失效角色ID缓存（使用精确的 key，避免 keys() 性能问题）
                # 构建所有可能的缓存 key（基于已知的参数组合）
                cache_keys_to_delete = []
                cache_prefix = CACHE_KEY_PREFIXES['user_role']
                
                # 删除所有可能的组合（team_code=None, team_code=实际值, only_global=True/False）
                # 注意：这里假设 team_code 不会太多，如果很多可以考虑使用 Set 管理
                cache_keys_to_delete.append(f"{cache_prefix}{user_id}:team:none:global:False")
                cache_keys_to_delete.append(f"{cache_prefix}{user_id}:team:none:global:True")
                
                # 如果用户有 team_code，也删除对应的缓存
                if user.team_code:
                    cache_keys_to_delete.append(f"{cache_prefix}{user_id}:team:{user.team_code}:global:False")
                    cache_keys_to_delete.append(f"{cache_prefix}{user_id}:team:{user.team_code}:global:True")
                
                # 批量删除（避免 keys() 性能问题）
                try:
                    await delete_cache_keys(cache_keys_to_delete)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"删除用户角色缓存失败，user_id={user_id}: {e}")
        except Exception:
            await db.rollback()
            raise
        
        return user
    
    @staticmethod
    async def get_user_role_ids(
        db: AsyncSession, 
        user_id: str, 
        team_code: Optional[str] = None,
        only_global: bool = False,
        redis_client: Optional[Any] = None,
    ) -> List[str]:
        """
        获取用户当前的角色ID列表（优化：支持缓存）
        
        Args:
            team_code: 如果指定了team_code，只返回该团队的角色
            only_global: 如果为True，只返回全局角色（team_code为None），忽略team_code参数
            redis_client: Redis客户端（可选，用于缓存）
        """
        from app.models.user import User
        from app.core.database import get_redis_optional
        
        # 如果没有传入 redis_client，尝试获取
        if redis_client is None:
            redis_client = await get_redis_optional()
        
        # 构建缓存 key（包含过滤条件）- 使用统一的缓存前缀
        from app.core.cache import CACHE_KEY_PREFIXES, CACHE_TTL
        cache_key_suffix = f"{user_id}:team:{team_code or 'none'}:global:{only_global}"
        cache_key = f"{CACHE_KEY_PREFIXES['user_role']}{cache_key_suffix}"
        cache_ttl = CACHE_TTL.get("user_role", 300)
        
        # 尝试从缓存读取
        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached is not None:
                    return json_loads(cached)
            except (ValueError, TypeError) as e:
                # 缓存数据损坏，删除它（orjson 可能抛出 ValueError）
                try:
                    await redis_client.delete(cache_key)
                except Exception:
                    pass
            except (redis.ConnectionError, redis.TimeoutError) as e:
                # 连接错误，降级到数据库查询
                pass
            except Exception as e:
                # 其他错误，记录日志但继续
                import logging
                logging.getLogger(__name__).warning(f"缓存读取失败，key={cache_key}: {e}")
        
        query = select(user_roles.c.role_id).where(user_roles.c.user_id == user_id)
        
        # 角色过滤
        if only_global:
            # 只返回全局角色（team_code为None）
            query = query.join(Role, user_roles.c.role_id == Role.id).where(
                Role.team_code.is_(None)
            )
        elif team_code is not None:
            # 返回指定团队的角色
            query = query.join(Role, user_roles.c.role_id == Role.id).where(
                Role.team_code == team_code
            )
        
        result = await db.execute(query)
        role_ids = [row[0] for row in result.fetchall()]
        
        # 写入缓存（使用统一的 TTL）
        if redis_client:
            try:
                await redis_client.setex(cache_key, cache_ttl, json_dumps(role_ids))
            except (redis.ConnectionError, redis.TimeoutError) as e:
                # 连接错误，忽略（不影响主流程）
                pass
            except Exception as e:
                # 其他错误，记录日志但继续
                import logging
                logging.getLogger(__name__).warning(f"缓存写入失败，key={cache_key}: {e}")
        
        return role_ids

    @staticmethod
    async def get_user_role_ids_batch(
        db: AsyncSession, 
        user_ids: List[str], 
        team_code: Optional[str] = None,
        only_global: bool = False,
    ) -> dict:
        """
        批量获取用户角色ID，返回 { user_id: [role_id, ...] }
        
        Args:
            team_code: 如果指定了team_code，只返回该团队的角色
            only_global: 如果为True，只返回全局角色（team_code为None），忽略team_code参数
        """
        if not user_ids:
            return {}
        
        query = select(user_roles.c.user_id, user_roles.c.role_id).where(
            user_roles.c.user_id.in_(user_ids)
        )
        
        # 角色过滤
        if only_global:
            # 只返回全局角色（team_code为None）
            query = query.join(Role, user_roles.c.role_id == Role.id).where(
                Role.team_code.is_(None)
            )
        elif team_code is not None:
            # 返回指定团队的角色
            query = query.join(Role, user_roles.c.role_id == Role.id).where(
                Role.team_code == team_code
            )
        
        result = await db.execute(query)
        out = {uid: [] for uid in user_ids}
        for row in result.fetchall():
            out.setdefault(row[0], []).append(row[1])
        return out

    @staticmethod
    async def get_user_permissions(db: AsyncSession, user_id: str) -> List[Permission]:
        """获取用户的所有权限（通过角色），一次 JOIN 查询替代 N+1"""
        q = (
            select(Permission)
            .select_from(Permission)
            .join(role_permissions, Permission.id == role_permissions.c.permission_id)
            .join(user_roles, role_permissions.c.role_id == user_roles.c.role_id)
            .join(Role, user_roles.c.role_id == Role.id)
            .where(user_roles.c.user_id == user_id)
            .where(Role.is_active.is_(True))
            .where(Permission.is_active.is_(True))
        )
        result = await db.execute(q)
        return list(result.unique().scalars().all())

    # 使用统一的缓存配置（已迁移到 app/core/cache.py）
    USER_PERM_CACHE_KEY_PREFIX = "user_perm_codes:v1:"  # 保留兼容性
    USER_PERM_CACHE_TTL = 300  # 保留兼容性，实际使用 CACHE_TTL["user_perm"]

    @staticmethod
    async def get_user_permission_codes(
        db: AsyncSession,
        user_id: str,
        redis_client: Optional[Any] = None,
    ) -> Dict[str, List[str]]:
        """一次查询返回用户的菜单/接口权限 code；传入 redis_client 时优先读缓存并回填，TTL 300s。"""
        from app.core.cache import CACHE_KEY_PREFIXES, CACHE_TTL
        
        # 使用统一的缓存 key 前缀
        cache_key = f"{CACHE_KEY_PREFIXES.get('user_perm', RoleService.USER_PERM_CACHE_KEY_PREFIX)}{user_id}"
        if redis_client is not None:
            try:
                cached = await redis_client.get(cache_key)
                if cached is not None:
                    return json_loads(cached)
            except (ValueError, TypeError) as e:
                # 缓存数据损坏，删除它（orjson 可能抛出 ValueError）
                try:
                    await redis_client.delete(cache_key)
                except Exception:
                    pass
            except (redis.ConnectionError, redis.TimeoutError) as e:
                # 连接错误，降级到数据库查询
                pass
            except Exception as e:
                # 其他错误，记录日志但继续
                logger = logging.getLogger(__name__)
                logger.warning(f"缓存读取失败，key={cache_key}: {e}")
        user_row = await db.execute(select(User).where(User.id == user_id))
        user = user_row.scalar_one_or_none()
        if not user:
            return {"menu": [], "api": []}
        # 系统超级管理员只能拥有团队管理相关的权限，团队管理员不能拥有团队管理菜单权限
        if user.is_superuser:
            # 系统管理员只能拥有团队管理相关的菜单权限（code 以 menu:team 或 menu:teams 开头）
            # 接口权限：系统管理员可以拥有所有接口权限（用于管理功能）
            result = await db.execute(
                select(Permission.code, Permission.type).where(
                    Permission.is_active.is_(True),
                    or_(
                        Permission.code.like("menu:team%"),  # 团队管理菜单权限（单数）
                        Permission.code.like("menu:teams%"),  # 团队管理菜单权限（复数）
                        Permission.type == Permission.TYPE_API  # 所有接口权限
                    )
                )
            )
            rows = result.fetchall()
            menu = [r[0] for r in rows if r[1] == Permission.TYPE_MENU]
            api = [r[0] for r in rows if r[1] == Permission.TYPE_API]
            out = {"menu": menu, "api": api}
        elif user.is_team_admin:
            # 团队管理员拥有所有权限，但排除团队管理菜单权限（仅系统管理员可见）
            result = await db.execute(
                select(Permission.code, Permission.type).where(
                    Permission.is_active.is_(True),
                    and_(
                        ~Permission.code.like("menu:team%"),
                        ~Permission.code.like("menu:teams%")
                    )
                )
            )
            rows = result.fetchall()
            menu = [r[0] for r in rows if r[1] == Permission.TYPE_MENU]
            api = [r[0] for r in rows if r[1] == Permission.TYPE_API]
            out = {"menu": menu, "api": api}
        else:
            # 普通用户权限（通过角色），但排除团队管理菜单（仅系统管理员可见）
            q = (
                select(Permission.code, Permission.type)
                .select_from(Permission)
                .join(role_permissions, Permission.id == role_permissions.c.permission_id)
                .join(user_roles, role_permissions.c.role_id == user_roles.c.role_id)
                .join(Role, user_roles.c.role_id == Role.id)
                .where(user_roles.c.user_id == user_id)
                .where(Role.is_active.is_(True))
                .where(Permission.is_active.is_(True))
                .where(
                    and_(
                        ~Permission.code.like("menu:team%"),
                        ~Permission.code.like("menu:teams%")
                    )
                )
            )
            result = await db.execute(q)
            rows = result.fetchall()
            menu = [r[0] for r in rows if r[1] == Permission.TYPE_MENU]
            api = [r[0] for r in rows if r[1] == Permission.TYPE_API]
            out = {"menu": menu, "api": api}
        if redis_client is not None:
            try:
                # 使用统一的缓存 TTL
                from app.core.cache import CACHE_TTL
                cache_ttl = CACHE_TTL.get("user_perm", RoleService.USER_PERM_CACHE_TTL)
                await redis_client.setex(
                    cache_key,
                    cache_ttl,
                    json_dumps(out),
                )
            except (redis.ConnectionError, redis.TimeoutError) as e:
                # 连接错误，忽略（不影响主流程）
                pass
            except Exception as e:
                # 其他错误，记录日志但继续
                logger = logging.getLogger(__name__)
                logger.warning(f"缓存写入失败，key={cache_key}: {e}")
        return out

    @staticmethod
    async def get_user_permission_codes_batch(
        db: AsyncSession,
        user_ids: List[str],
        redis_client: Optional[Any] = None,
    ) -> Dict[str, Dict[str, List[str]]]:
        """
        批量获取多个用户的权限代码（使用 Redis Pipeline 优化）
        返回格式：{ user_id: {"menu": [...], "api": [...]} }
        """
        from app.core.cache import CACHE_KEY_PREFIXES, CACHE_TTL
        
        if not user_ids:
            return {}
        
        result = {}
        cache_keys = [f"{CACHE_KEY_PREFIXES.get('user_perm', RoleService.USER_PERM_CACHE_KEY_PREFIX)}{user_id}" 
                     for user_id in user_ids]
        cache_key_to_user_id = {key: user_id for key, user_id in zip(cache_keys, user_ids)}
        
        # 使用 Pipeline 批量获取缓存
        cache_hits = {}
        if redis_client is not None:
            try:
                pipe = redis_client.pipeline()
                for cache_key in cache_keys:
                    pipe.get(cache_key)
                cached_values = await pipe.execute()
                
                # 处理缓存命中
                for cache_key, cached_value in zip(cache_keys, cached_values):
                    if cached_value:
                        try:
                            user_id = cache_key_to_user_id[cache_key]
                            result[user_id] = json_loads(cached_value)
                            cache_hits[user_id] = True
                        except (ValueError, TypeError) as e:
                            # 缓存数据损坏，删除它（orjson 可能抛出 ValueError）
                            try:
                                await redis_client.delete(cache_key)
                            except Exception:
                                pass
            except (redis.ConnectionError, redis.TimeoutError):
                # 连接错误，降级到数据库查询
                pass
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.warning(f"批量缓存读取失败: {e}")
        
        # 查询未命中缓存的用户权限
        missing_user_ids = [user_id for user_id in user_ids if user_id not in result]
        if missing_user_ids:
            # 批量查询数据库
            users_result = await db.execute(
                select(User).where(User.id.in_(missing_user_ids))
            )
            users = users_result.scalars().all()
            user_map = {user.id: user for user in users}
            
            # 批量查询权限
            for user_id in missing_user_ids:
                user = user_map.get(user_id)
                if not user:
                    result[user_id] = {"menu": [], "api": []}
                    continue
                
                if user.is_superuser:
                    # 系统管理员权限：只能看到团队管理菜单和所有接口权限
                    perm_result = await db.execute(
                        select(Permission.code, Permission.type).where(
                            Permission.is_active.is_(True),
                            or_(
                                Permission.code.like("menu:team%"),
                                Permission.code.like("menu:teams%"),
                                Permission.type == Permission.TYPE_API
                            )
                        )
                    )
                elif user.is_team_admin:
                    # 团队管理员权限：拥有除团队管理菜单外的所有权限
                    perm_result = await db.execute(
                        select(Permission.code, Permission.type).where(
                            Permission.is_active.is_(True),
                            and_(
                                ~Permission.code.like("menu:team%"),
                                ~Permission.code.like("menu:teams%")
                            )
                        )
                    )
                elif user.is_team_admin:
                    # 团队管理员权限：拥有除团队管理菜单外的所有权限
                    perm_result = await db.execute(
                        select(Permission.code, Permission.type).where(
                            Permission.is_active.is_(True),
                            and_(
                                ~Permission.code.like("menu:team%"),
                                ~Permission.code.like("menu:teams%")
                            )
                        )
                    )
                else:
                    # 普通用户权限（通过角色），但排除团队管理菜单（仅系统管理员可见）
                    perm_result = await db.execute(
                        select(Permission.code, Permission.type)
                        .select_from(Permission)
                        .join(role_permissions, Permission.id == role_permissions.c.permission_id)
                        .join(user_roles, role_permissions.c.role_id == user_roles.c.role_id)
                        .join(Role, user_roles.c.role_id == Role.id)
                        .where(user_roles.c.user_id == user_id)
                        .where(Role.is_active.is_(True))
                        .where(Permission.is_active.is_(True))
                        .where(
                            and_(
                                ~Permission.code.like("menu:team%"),
                                ~Permission.code.like("menu:teams%")
                            )
                        )
                    )
                
                rows = perm_result.fetchall()
                menu = [r[0] for r in rows if r[1] == Permission.TYPE_MENU]
                api = [r[0] for r in rows if r[1] == Permission.TYPE_API]
                result[user_id] = {"menu": menu, "api": api}
            
            # 批量写入缓存（使用 Pipeline）
            if redis_client is not None:
                try:
                    cache_ttl = CACHE_TTL.get("user_perm", RoleService.USER_PERM_CACHE_TTL)
                    pipe = redis_client.pipeline()
                    for user_id in missing_user_ids:
                        cache_key = cache_keys[user_ids.index(user_id)]
                        pipe.setex(cache_key, cache_ttl, json_dumps(result[user_id]))
                    await pipe.execute()
                except (redis.ConnectionError, redis.TimeoutError):
                    pass
                except Exception as e:
                    logger = logging.getLogger(__name__)
                    logger.warning(f"批量缓存写入失败: {e}")
        
        return result

    @staticmethod
    async def invalidate_user_perm_cache(redis_client: Optional[Any], user_id: str) -> None:
        """角色分配变更后删除该用户的权限缓存，保证 /me 下次读到最新数据"""
        if redis_client is None:
            return
        try:
            from app.core.cache import CACHE_KEY_PREFIXES
            cache_key = f"{CACHE_KEY_PREFIXES.get('user_perm', RoleService.USER_PERM_CACHE_KEY_PREFIX)}{user_id}"
            await redis_client.delete(cache_key)
        except (redis.ConnectionError, redis.TimeoutError) as e:
            # 连接错误，忽略
            pass
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"删除权限缓存失败，user_id={user_id}: {e}")

    @staticmethod
    async def get_user_ids_for_role(db: AsyncSession, role_id: str) -> List[str]:
        """查询拥有该角色的所有 user_id（用于角色权限变更/删除时批量失效缓存）"""
        result = await db.execute(
            select(user_roles.c.user_id).where(user_roles.c.role_id == role_id)
        )
        return [row[0] for row in result.fetchall()]

    @staticmethod
    async def invalidate_user_perm_cache_for_role(
        db: AsyncSession,
        redis_client: Optional[Any],
        role_id: str,
    ) -> None:
        """角色权限变更或删除时，失效所有拥有该角色的用户的权限缓存"""
        if redis_client is None:
            return
        try:
            from app.core.cache import CACHE_KEY_PREFIXES, delete_cache_keys
            user_ids = await RoleService.get_user_ids_for_role(db, role_id)
            if not user_ids:
                return
            # 使用统一的缓存 key 前缀和批量删除方法
            cache_prefix = CACHE_KEY_PREFIXES.get('user_perm', RoleService.USER_PERM_CACHE_KEY_PREFIX)
            keys = [f"{cache_prefix}{uid}" for uid in user_ids]
            await delete_cache_keys(keys)
        except (redis.ConnectionError, redis.TimeoutError) as e:
            # 连接错误，忽略
            pass
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.warning(f"批量删除权限缓存失败，role_id={role_id}: {e}")

    @staticmethod
    async def get_user_menu_permission_codes(db: AsyncSession, user_id: str) -> List[str]:
        """获取用户的菜单权限 code 列表（用于前端动态菜单与路由守卫）"""
        codes = await RoleService.get_user_permission_codes(db, user_id)
        return codes["menu"]

    @staticmethod
    async def get_user_api_permission_codes(db: AsyncSession, user_id: str) -> List[str]:
        """获取用户的接口/按钮权限 code 列表（用于前端按钮显隐，如编辑、删除、新建）"""
        codes = await RoleService.get_user_permission_codes(db, user_id)
        return codes["api"]

    @staticmethod
    async def user_has_permission(
        db: AsyncSession,
        user_id: str,
        permission_code: str,
        redis_client: Optional[Any] = None,
    ) -> bool:
        """检查用户是否拥有指定权限（优化：使用缓存）"""
        from app.core.database import get_redis_optional
        
        # 如果没有传入 redis_client，尝试获取
        if redis_client is None:
            redis_client = await get_redis_optional()
        
        # 优化：使用缓存的权限代码列表，避免重复查询数据库
        if redis_client:
            try:
                # 尝试从缓存获取用户权限
                codes = await RoleService.get_user_permission_codes(db, user_id, redis_client)
                # 检查权限代码是否在菜单或接口权限中
                return permission_code in codes.get("menu", []) or permission_code in codes.get("api", [])
            except Exception:
                # 缓存失败，降级到数据库查询
                pass
        
        # 降级：直接查询数据库（原有逻辑）
        user = await db.execute(select(User).where(User.id == user_id))
        user = user.scalar_one_or_none()
        if user and (user.is_superuser or user.is_team_admin):
            return True
        
        # 检查用户角色中的权限
        permissions = await RoleService.get_user_permissions(db, user_id)
        return any(p.code == permission_code for p in permissions)

