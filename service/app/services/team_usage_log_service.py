"""
团队用量日志服务

记录各类接口调用的 token 用量：
1) 多维表格单条新增
2) 多维表格按条件编辑
3) 多维表格按条件删除
4) 多维表格按条件查询
5) 组合 LLM、接口查询
"""
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.team_usage_log import TeamUsageLog


async def log_team_usage(
    db: AsyncSession,
    team_id: str,
    usage_type: int,
    tokens_used: int = 0,
    calls_count: int = 1,
    extra_info: str | None = None,
    business_name: str | None = None,
) -> None:
    """记录团队用量"""
    now = datetime.utcnow()
    usage_date = now.strftime("%Y-%m-%d")
    year_month = now.strftime("%Y-%m")
    log = TeamUsageLog(
        team_id=team_id,
        usage_type=usage_type,
        business_name=business_name,
        usage_date=usage_date,
        year_month=year_month,
        tokens_used=tokens_used,
        calls_count=calls_count,
        extra_info=extra_info,
    )
    db.add(log)


async def log_team_usage_refund(
    db: AsyncSession,
    team_id: str,
    amount: int = 1,
    business_name: str | None = None,
    extra_info: str | None = None,
) -> None:
    """
    记录用量退还（失败补偿）。与预扣时的 log 对应，保证历史用量与配额一致。
    tokens_used=-amount，聚合时与消费记录相抵。
    """
    await log_team_usage(
        db=db,
        team_id=team_id,
        usage_type=5,
        tokens_used=-amount,
        calls_count=-1,
        extra_info=extra_info,
        business_name=business_name,
    )
