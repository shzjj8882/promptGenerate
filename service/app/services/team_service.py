"""
团队服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import Optional, List, Dict
import secrets
import string
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate


class TeamService:
    """团队服务类"""
    
    @staticmethod
    def generate_authcode() -> str:
        """生成 API 认证码（32位随机字符串）"""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(32))
    
    @staticmethod
    async def get_team_by_id(db: AsyncSession, team_id: str) -> Optional[Team]:
        """根据ID获取团队"""
        result = await db.execute(select(Team).where(Team.id == team_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_team_by_code(db: AsyncSession, code: str) -> Optional[Team]:
        """根据代码获取团队"""
        result = await db.execute(select(Team).where(Team.code == code))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_team_by_authcode(db: AsyncSession, authcode: str) -> Optional[Team]:
        """根据 authcode 获取团队"""
        result = await db.execute(
            select(Team).where(
                and_(
                    Team.authcode == authcode,
                    Team.is_active == True
                )
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_team(db: AsyncSession, team_data: TeamCreate) -> Team:
        """创建团队"""
        # 检查团队代码是否已存在
        existing_team = await TeamService.get_team_by_code(db, team_data.code)
        if existing_team:
            raise ValueError(f"团队代码 '{team_data.code}' 已存在")
        
        # 生成唯一的 authcode
        authcode = TeamService.generate_authcode()
        # 确保 authcode 唯一（极小概率冲突，但为了安全起见检查一下）
        while await TeamService.get_team_by_authcode(db, authcode):
            authcode = TeamService.generate_authcode()
        
        # 创建新团队
        team = Team(
            code=team_data.code,
            name=team_data.name,
            description=team_data.description,
            authcode=authcode,
        )
        db.add(team)
        try:
            await db.commit()
            await db.refresh(team)
        except Exception:
            await db.rollback()
            raise
        return team
    
    @staticmethod
    async def update_team(
        db: AsyncSession,
        team_id: str,
        team_data: TeamUpdate,
    ) -> Optional[Team]:
        """更新团队信息"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            return None
        
        if team_data.name is not None:
            team.name = team_data.name
        if team_data.is_active is not None:
            team.is_active = team_data.is_active
        
        try:
            await db.commit()
            await db.refresh(team)
        except Exception:
            await db.rollback()
            raise
        return team
    
    @staticmethod
    async def reset_team_authcode(db: AsyncSession, team_id: str) -> Optional[Team]:
        """重置团队的 authcode（仅系统管理员可操作）"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            return None
        
        # 生成新的唯一 authcode
        authcode = TeamService.generate_authcode()
        # 确保 authcode 唯一（极小概率冲突，但为了安全起见检查一下）
        while await TeamService.get_team_by_authcode(db, authcode):
            authcode = TeamService.generate_authcode()
        
        # 更新团队的 authcode
        team.authcode = authcode
        try:
            await db.commit()
            await db.refresh(team)
        except Exception:
            await db.rollback()
            raise
        return team
    
    @staticmethod
    async def delete_team(db: AsyncSession, team_id: str) -> bool:
        """删除团队"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            return False
        
        await db.delete(team)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        return True
    
    @staticmethod
    async def get_teams(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None,
        include_system_admin_team: bool = False,  # 是否包含系统管理员团队
    ) -> List[Team]:
        """
        获取团队列表
        
        Args:
            include_system_admin_team: 是否包含系统管理员团队（默认False，只有系统管理员可以查看）
        """
        query = select(Team)
        if is_active is not None:
            query = query.where(Team.is_active == is_active)
        if not include_system_admin_team:
            # 默认不包含系统管理员团队
            query = query.where(Team.is_system_admin_team == False)
        query = query.offset(skip).limit(limit).order_by(Team.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_team_member_count(db: AsyncSession, team_code: str, search: Optional[str] = None) -> int:
        """获取团队的成员数量"""
        query = select(func.count(User.id)).where(User.team_code == team_code)
        
        # 如果提供了搜索关键词，按用户名、邮箱、全名搜索
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                or_(
                    User.username.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                    User.full_name.ilike(search_pattern),
                )
            )
        
        result = await db.execute(query)
        return result.scalar_one() or 0
    
    @staticmethod
    async def get_team_members(
        db: AsyncSession,
        team_code: str,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
    ) -> List[Dict]:
        """获取团队的成员列表"""
        query = select(User).where(User.team_code == team_code)
        
        # 如果提供了搜索关键词，按用户名、邮箱、全名搜索
        if search:
            search_pattern = f"%{search}%"
            query = query.where(
                or_(
                    User.username.ilike(search_pattern),
                    User.email.ilike(search_pattern),
                    User.full_name.ilike(search_pattern),
                )
            )
        
        query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
        users = await db.execute(query)
        user_list = users.scalars().all()
        
        return [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
                "is_team_admin": user.is_team_admin,
                "is_superuser": user.is_superuser,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            }
            for user in user_list
        ]
    
    @staticmethod
    async def count_teams(
        db: AsyncSession,
        is_active: Optional[bool] = None,
    ) -> int:
        """统计团队数量"""
        query = select(func.count(Team.id))
        if is_active is not None:
            query = query.where(Team.is_active == is_active)
        result = await db.execute(query)
        return result.scalar_one() or 0
