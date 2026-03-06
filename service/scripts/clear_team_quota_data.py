# -*- coding: utf-8 -*-
"""
清空指定团队的所有套餐、额度、日志数据

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.clear_team_quota_data [团队名称]

示例:
  PYTHONPATH=. venv/bin/python -m scripts.clear_team_quota_data 爱达

将删除:
  - 所有月度套餐 (TeamMonthlyPlan)
  - 所有月度用量 (TeamMonthlyTokenUsage)
  - 缴费日志 (TeamPaymentLog)
  - 用量日志 (TeamUsageLog)
  - 并清除 team.plan_expire_at、team.monthly_token_limit
"""
import asyncio
import sys
from sqlalchemy import select, delete

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_token_usage import TeamMonthlyTokenUsage
from app.models.team_payment_log import TeamPaymentLog
from app.models.team_usage_log import TeamUsageLog


async def clear_team_quota_data(team_name: str):
    """清空名称包含 team_name 的团队的所有套餐、额度、日志"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.name.ilike(f"%{team_name}%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print(f"❌ 未找到名称包含 '{team_name}' 的团队")
            return False

        print(f"✅ 找到团队: {team.name} (id={team.id})")
        team_id = team.id

        # 删除缴费日志
        r1 = await db.execute(delete(TeamPaymentLog).where(TeamPaymentLog.team_id == team_id))
        print(f"   删除缴费日志: {r1.rowcount} 条")

        # 删除用量日志
        r2 = await db.execute(delete(TeamUsageLog).where(TeamUsageLog.team_id == team_id))
        print(f"   删除用量日志: {r2.rowcount} 条")

        # 删除月度套餐
        r3 = await db.execute(delete(TeamMonthlyPlan).where(TeamMonthlyPlan.team_id == team_id))
        print(f"   删除月度套餐: {r3.rowcount} 条")

        # 删除月度用量
        r4 = await db.execute(
            delete(TeamMonthlyTokenUsage).where(TeamMonthlyTokenUsage.team_id == team_id)
        )
        print(f"   删除月度用量: {r4.rowcount} 条")

        # 清除团队级别字段
        team.plan_expire_at = None
        team.monthly_token_limit = None
        print("   清除 plan_expire_at、monthly_token_limit")

        await db.commit()
        print("✅ 已清空该团队所有套餐、额度、日志")
        return True


def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "爱达"
    asyncio.run(clear_team_quota_data(team_name))


if __name__ == "__main__":
    main()
