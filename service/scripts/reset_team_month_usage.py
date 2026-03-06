# -*- coding: utf-8 -*-
"""
重置指定团队某月用量（tokens_used、calls_used 及消费分项归零）

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.reset_team_month_usage [团队名称] [YYYY-MM]

示例:
  PYTHONPATH=. venv/bin/python -m scripts.reset_team_month_usage 爱达 2026-03
"""
import asyncio
import sys
from datetime import datetime, timezone
from sqlalchemy import select

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def reset_month_usage(team_name: str, year_month: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.name.ilike(f"%{team_name}%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print(f"❌ 未找到团队: {team_name}")
            return False

        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == year_month,
            )
        )
        usage = usage_result.scalar_one_or_none()
        if usage:
            usage.tokens_used = 0
            usage.calls_used = 0
            usage.gift_tokens_used = 0
            usage.rollover_tokens_used = 0
            usage.base_tokens_used = 0
            usage.extra_tokens_used = 0
            print(f"✅ 已重置 {team.name} {year_month} 用量")
        else:
            print(f"⚠️ 该月无用量记录，无需重置")
        await db.commit()
        return True


def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "爱达"
    year_month = sys.argv[2] if len(sys.argv) > 2 else datetime.now(timezone.utc).strftime("%Y-%m")
    asyncio.run(reset_month_usage(team_name, year_month))


if __name__ == "__main__":
    main()
