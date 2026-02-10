from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from typing import Optional, List
from app.models.user import User
from app.schemas.user import UserCreate
from app.core.security import get_password_hash, verify_password, create_access_token
from app.services.team_service import TeamService


class UserService:
    """用户服务类"""
    
    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
        """根据ID获取用户"""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_by_username_or_email(
        db: AsyncSession, username_or_email: str
    ) -> Optional[User]:
        """根据用户名或邮箱获取用户"""
        result = await db.execute(
            select(User).where(
                or_(
                    User.username == username_or_email,
                    User.email == username_or_email
                )
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
        """创建用户"""
        # 检查用户名是否已存在
        existing_user = await UserService.get_user_by_username(db, user_data.username)
        if existing_user:
            raise ValueError("用户名已存在")
        
        # 检查邮箱是否已存在
        existing_email = await UserService.get_user_by_email(db, user_data.email)
        if existing_email:
            raise ValueError("邮箱已被注册")
        
        # 检查团队代码是否存在且激活
        team = await TeamService.get_team_by_code(db, user_data.team_code)
        if not team:
            raise ValueError(f"团队代码 '{user_data.team_code}' 不存在")
        if not team.is_active:
            raise ValueError(f"团队代码 '{user_data.team_code}' 已被禁用")
        
        # 创建新用户
        hashed_password = get_password_hash(user_data.password)
        user = User(
            username=user_data.username,
            email=user_data.email,
            full_name=user_data.full_name,
            team_code=user_data.team_code,
            team_id=team.id,
            hashed_password=hashed_password,
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            raise
        return user
    
    @staticmethod
    async def authenticate_user(
        db: AsyncSession, username: str, password: str
    ) -> Optional[User]:
        """验证用户身份"""
        user = await UserService.get_user_by_username_or_email(db, username)
        if not user:
            return None
        
        if not verify_password(password, user.hashed_password):
            return None
        
        if not user.is_active:
            return None
        
        return user
    
    @staticmethod
    async def create_user_token(user: User) -> str:
        """为用户创建访问令牌"""
        token_data = {"sub": user.username, "user_id": user.id}
        return create_access_token(data=token_data)
    
    @staticmethod
    async def update_user(
        db: AsyncSession,
        user_id: str,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        is_team_admin: Optional[bool] = None,
        team_code: Optional[str] = None,
    ) -> Optional[User]:
        """更新用户信息"""
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            return None
        
        # 如果更新邮箱，检查邮箱是否已被其他用户使用
        if email and email != user.email:
            existing_email = await UserService.get_user_by_email(db, email)
            if existing_email and existing_email.id != user_id:
                raise ValueError("邮箱已被其他用户使用")
            user.email = email
        
        if full_name is not None:
            user.full_name = full_name
        
        if is_team_admin is not None:
            user.is_team_admin = is_team_admin
        
        if team_code is not None:
            user.team_code = team_code
            team = await TeamService.get_team_by_code(db, team_code)
            user.team_id = team.id if team else None
        
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            raise
        return user
    
    @staticmethod
    async def update_user_password(
        db: AsyncSession,
        user_id: str,
        old_password: str,
        new_password: str,
    ) -> bool:
        """更新用户密码"""
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            return False
        
        # 验证旧密码
        if not verify_password(old_password, user.hashed_password):
            raise ValueError("旧密码错误")
        
        # 更新密码
        user.hashed_password = get_password_hash(new_password)
        await db.commit()
        return True
    
    @staticmethod
    async def get_users(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None,
        team_code: Optional[str] = None,
        team_id: Optional[str] = None,
        only_superuser: bool = False,
    ) -> List[User]:
        """
        获取用户列表
        
        Args:
            team_code: 如果指定了team_code，只返回该团队的用户
            team_id: 如果指定了team_id，只返回该团队的用户（优先于team_code）
            only_superuser: 如果为True，只返回系统管理员用户（team_code为None），忽略team_code参数
        """
        query = select(User)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        # 用户过滤
        if only_superuser:
            # 只返回系统管理员用户（team_code为None）
            query = query.where(User.team_code.is_(None))
        elif team_id is not None:
            # 优先使用 team_id 查询
            query = query.where(User.team_id == team_id)
        elif team_code is not None:
            # 返回指定团队的用户
            query = query.where(User.team_code == team_code)
        # 如果team_code和team_id都为None且only_superuser为False，则不添加团队过滤（返回所有用户）
        query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def count_users(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        team_code: Optional[str] = None,
        team_id: Optional[str] = None,
        only_superuser: bool = False,
    ) -> int:
        """
        统计用户数量
        
        Args:
            team_code: 如果指定了team_code，只统计该团队的用户
            team_id: 如果指定了team_id，只统计该团队的用户（优先于team_code）
            only_superuser: 如果为True，只统计系统管理员用户（team_code为None），忽略team_code参数
        """
        query = select(func.count(User.id))
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        # 用户过滤
        if only_superuser:
            # 只统计系统管理员用户（team_code为None）
            query = query.where(User.team_code.is_(None))
        elif team_id is not None:
            # 优先使用 team_id 查询
            query = query.where(User.team_id == team_id)
        elif team_code is not None:
            # 统计指定团队的用户
            query = query.where(User.team_code == team_code)
        result = await db.execute(query)
        return result.scalar_one() or 0
    
    @staticmethod
    async def delete_user(db: AsyncSession, user_id: str) -> bool:
        """删除用户（物理删除，同时删除用户角色关联）"""
        from app.models.rbac import user_roles
        
        # 获取用户
        user = await UserService.get_user_by_id(db, user_id)
        if not user:
            return False
        
        # 删除用户角色关联
        await db.execute(
            user_roles.delete().where(user_roles.c.user_id == user_id)
        )
        
        # 删除用户
        await db.delete(user)
        await db.commit()
        
        return True

