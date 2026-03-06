# -*- coding: utf-8 -*-
"""
为指定团队创建 3 月份配额数据：月度套餐 2、上月结余 2、赠送 2、追加 2

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.seed_march_quota_data [团队名称]

示例:
  PYTHONPATH=. venv/bin/python -m scripts.seed_march_quota_data 爱达

将创建:
  - 2026-02: 套餐 base=2，用量 0（用于产生 3 月结余 2）
  - 2026-03: 套餐 base=2、gift=2、extra=2，结余 2
"""
import asyncio
import sys
from sqlalchemy import select

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def seed_march_quota_data(team_name: str):
    """为团队创建 3 月配额：套餐 2、结余 2、赠送 2、追加 2"""
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

        # 2026-02：套餐 base=2，用量 0，用于产生 3 月结余 2
        for ym, base, gift, extra in [("2026-02", 2, 0, 0), ("2026-03", 2, 2, 2)]:
            plan_result = await db.execute(
                select(TeamMonthlyPlan).where(
                    TeamMonthlyPlan.team_id == team_id,
                    TeamMonthlyPlan.year_month == ym,
                )
            )
            plan = plan_result.scalar_one_or_none()
            total = base + gift + extra
            if plan:
                plan.base_token_limit = base
                plan.gift_tokens = gift
                plan.extra_tokens = extra
                plan.token_limit = total
                print(f"   更新 {ym} 套餐: base={base}, gift={gift}, extra={extra}")
            else:
                plan = TeamMonthlyPlan(
                    id=f"{team_id}-{ym}",
                    team_id=team_id,
                    year_month=ym,
                    base_token_limit=base,
                    gift_tokens=gift,
                    extra_tokens=extra,
                    token_limit=total,
                )
                db.add(plan)
                print(f"   创建 {ym} 套餐: base={base}, gift={gift}, extra={extra}")

        # 2026-02 用量：0 已用，结余 2 可转到 3 月
        for ym, tokens_used, rollover in [("2026-02", 0, 0), ("2026-03", 0, 2)]:
            usage_result = await db.execute(
                select(TeamMonthlyTokenUsage).where(
                    TeamMonthlyTokenUsage.team_id == team_id,
                    TeamMonthlyTokenUsage.year_month == ym,
                )
            )
            usage = usage_result.scalar_one_or_none()
            if usage:
                usage.tokens_used = tokens_used
                usage.rollover_from_prev_tokens = rollover
                print(f"   更新 {ym} 用量: tokens_used={tokens_used}, rollover={rollover}")
            else:
                usage = TeamMonthlyTokenUsage(
                    id=f"{team_id}-{ym}",
                    team_id=team_id,
                    year_month=ym,
                    tokens_used=tokens_used,
                    calls_used=0,
                    rollover_from_prev_tokens=rollover,
                )
                db.add(usage)
                print(f"   创建 {ym} 用量: tokens_used={tokens_used}, rollover={rollover}")

        team.monthly_token_limit = 2
        team.plan_expire_at = None  # 无合约期限
        await db.commit()
        print("✅ 3 月配额已创建：套餐 2、结余 2、赠送 2、追加 2（总额 8）")
        return True


def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "爱达"
    asyncio.run(seed_march_quota_data(team_name))


if __name__ == "__main__":
    main()
