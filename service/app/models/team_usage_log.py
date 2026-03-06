"""
团队用量日志模型

记录各类接口调用的 token 用量，用于按日/按月统计：
1) 多维表格单条新增接口
2) 多维表格按条件编辑接口
3) 多维表格按条件删除接口
4) 多维表格按条件查询接口
5) 组合的 LLM、接口查询逻辑
"""
import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.sql import func

from app.core.database import Base


class TeamUsageLog(Base):
    """
    团队用量日志

    - usage_type: 1=单条新增, 2=按条件编辑, 3=按条件删除, 4=按条件查询, 5=组合LLM接口
    - usage_date: 用量发生日期 YYYY-MM-DD
    - year_month: 所属月份 YYYY-MM（便于按月聚合）
    """

    __tablename__ = "team_usage_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    usage_type = Column(Integer, nullable=False)  # 1-5
    business_name = Column(String, nullable=True)  # 业务名称
    usage_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    year_month = Column(String(7), nullable=False)  # YYYY-MM
    tokens_used = Column(Integer, nullable=False, default=0)
    calls_count = Column(Integer, nullable=False, default=1)
    extra_info = Column(String, nullable=True)  # JSON 扩展信息，如 table_code 等
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_team_usage_team_date", "team_id", "usage_date"),
        Index("idx_team_usage_team_month", "team_id", "year_month"),
    )
