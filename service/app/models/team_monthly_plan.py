"""
团队月度套餐配置模型
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func

from app.core.database import Base


class TeamMonthlyPlan(Base):
    """
    团队按月套餐配置

    - year_month: 形如 '2025-03' 的字符串
    - base_token_limit: 合约基础配额（签约产生，解约时清零）
    - gift_tokens: 赠送配额（无时间限制，消费优先级最高）
    - extra_tokens: 追加配额（购买产生，消费优先级最低）
    - token_limit: 总上限 = base + gift + extra（兼容旧数据）
    - call_limit: 本月调用次数上限（为空或 <=0 表示不限制）
    """

    __tablename__ = "team_monthly_plans"

    id = Column(String, primary_key=True)
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False)  # YYYY-MM
    base_token_limit = Column(Integer, nullable=True)  # 合约基础配额，解约时清零
    gift_tokens = Column(Integer, nullable=True, default=0)  # 赠送配额，无时间限制，消费优先
    extra_tokens = Column(Integer, nullable=True, default=0)  # 追加配额（购买），消费最后
    token_limit = Column(Integer, nullable=True)  # 兼容旧数据；新数据由 base+gift+extra 计算
    call_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("team_id", "year_month", name="uq_team_month_plan"),
        Index("idx_team_month_plan", "team_id", "year_month"),
    )

    def __repr__(self) -> str:
        return f"<TeamMonthlyPlan(team_id={self.team_id}, year_month={self.year_month}, token_limit={self.token_limit}, call_limit={self.call_limit})>"

