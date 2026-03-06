# -*- coding: utf-8 -*-
"""
为爱达团队 3 月增加：结余 2、赠送 3、购买 4

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.seed_aida_march_quota

结余来自 2 月未用完的套餐基础额度；赠送和购买通过 topup 逻辑写入。
"""
import asyncio
import sys
from sqlalchemy import select

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def seed_aida_march():
    """为爱达团队 3 月增加结余 2、赠送 3、购买 4"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.name.ilike("%爱达%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print("❌ 未找到名称包含 '爱达' 的团队")
            return False

        print(f"✅ 找到团队: {team.name} (id={team.id})")
        team_id = team.id

        # 1. 2 月套餐：base=2，0 已用 → 3 月结余 2
        feb_ym = "2026-02"
        feb_plan = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team_id,
                TeamMonthlyPlan.year_month == feb_ym,
            )
        )
        plan_feb = feb_plan.scalar_one_or_none()
        if plan_feb:
            plan_feb.base_token_limit = 2
            plan_feb.gift_tokens = 0
            plan_feb.extra_tokens = 0
            plan_feb.token_limit = 2
            print(f"   更新 {feb_ym} 套餐: base=2")
        else:
            db.add(TeamMonthlyPlan(
                id=f"{team_id}-{feb_ym}",
                team_id=team_id,
                year_month=feb_ym,
                base_token_limit=2,
                gift_tokens=0,
                extra_tokens=0,
                token_limit=2,
            ))
            print(f"   创建 {feb_ym} 套餐: base=2")

        # 2 月用量：0 已用
        feb_usage = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team_id,
                TeamMonthlyTokenUsage.year_month == feb_ym,
            )
        )
        usage_feb = feb_usage.scalar_one_or_none()
        if usage_feb:
            usage_feb.tokens_used = 0
            usage_feb.gift_tokens_used = 0
            usage_feb.rollover_tokens_used = 0
            usage_feb.base_tokens_used = 0
            usage_feb.extra_tokens_used = 0
            usage_feb.rollover_from_prev_tokens = 0
            print(f"   更新 {feb_ym} 用量: 0 已用")
        else:
            db.add(TeamMonthlyTokenUsage(
                id=f"{team_id}-{feb_ym}",
                team_id=team_id,
                year_month=feb_ym,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=0,
            ))
            print(f"   创建 {feb_ym} 用量: 0 已用")

        # 2. 3 月套餐：base=0，先创建空 plan
        mar_ym = "2026-03"
        mar_plan = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team_id,
                TeamMonthlyPlan.year_month == mar_ym,
            )
        )
        plan_mar = mar_plan.scalar_one_or_none()
        if plan_mar:
            plan_mar.base_token_limit = plan_mar.base_token_limit or 0
            plan_mar.gift_tokens = (plan_mar.gift_tokens or 0) + 3
            plan_mar.extra_tokens = (plan_mar.extra_tokens or 0) + 4
            plan_mar.token_limit = (plan_mar.base_token_limit or 0) + (plan_mar.gift_tokens or 0) + (plan_mar.extra_tokens or 0)
            print(f"   更新 {mar_ym}: 赠送+3, 购买+4")
        else:
            db.add(TeamMonthlyPlan(
                id=f"{team_id}-{mar_ym}",
                team_id=team_id,
                year_month=mar_ym,
                base_token_limit=0,
                gift_tokens=3,
                extra_tokens=4,
                token_limit=7,
            ))
            print(f"   创建 {mar_ym} 套餐: 赠送 3, 购买 4")

        # 3 月用量：0 已用，结余 2（来自 2 月）
        mar_usage = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team_id,
                TeamMonthlyTokenUsage.year_month == mar_ym,
            )
        )
        usage_mar = mar_usage.scalar_one_or_none()
        if usage_mar:
            usage_mar.tokens_used = 0
            usage_mar.rollover_from_prev_tokens = 2
            usage_mar.gift_tokens_used = 0
            usage_mar.rollover_tokens_used = 0
            usage_mar.base_tokens_used = 0
            usage_mar.extra_tokens_used = 0
            print(f"   更新 {mar_ym} 用量: 结余 2, 0 已用")
        else:
            db.add(TeamMonthlyTokenUsage(
                id=f"{team_id}-{mar_ym}",
                team_id=team_id,
                year_month=mar_ym,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=2,
            ))
            print(f"   创建 {mar_ym} 用量: 结余 2, 0 已用")

        await db.commit()
        print("✅ 已为爱达 3 月增加：结余 2、赠送 3、购买 4")
        return True


def main():
    asyncio.run(seed_aida_march())


if __name__ == "__main__":
    main()
