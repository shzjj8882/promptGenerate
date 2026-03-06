from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func

from app.core.database import Base


class TeamMonthlyTokenUsage(Base):
    """
    团队按月 token 消耗统计

    - year_month: 形如 '2025-03' 的字符串
    - tokens_used: 当月已消耗的 token 数量（= gift + rollover + base + extra）
    - calls_used: 当月已调用的次数
    - rollover_from_prev_tokens: 从上一个自然月结转到本月的 token 数量
    - gift_tokens_used / rollover_tokens_used / base_tokens_used / extra_tokens_used:
      按消费优先级记录的分项消耗（赠送 > 结余 > 套餐 > 追加）
    """

    __tablename__ = "team_monthly_token_usage"

    id = Column(String, primary_key=True)
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False)  # YYYY-MM
    tokens_used = Column(Integer, nullable=False, default=0)
    calls_used = Column(Integer, nullable=False, default=0)
    rollover_from_prev_tokens = Column(Integer, nullable=False, default=0)
    # 消费分项（优先级：赠送 > 结余 > 套餐 > 追加）
    gift_tokens_used = Column(Integer, nullable=False, default=0)
    rollover_tokens_used = Column(Integer, nullable=False, default=0)
    base_tokens_used = Column(Integer, nullable=False, default=0)
    extra_tokens_used = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("team_id", "year_month", name="uq_team_month_usage"),
        Index("idx_team_month_usage", "team_id", "year_month"),
    )

    def __repr__(self) -> str:
        return (
            f"<TeamMonthlyTokenUsage(team_id={self.team_id}, "
            f"year_month={self.year_month}, tokens_used={self.tokens_used}, "
            f"calls_used={self.calls_used}, rollover_from_prev_tokens={self.rollover_from_prev_tokens})>"
        )

