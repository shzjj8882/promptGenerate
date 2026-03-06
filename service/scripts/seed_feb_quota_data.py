# -*- coding: utf-8 -*-
"""
为指定团队创建 2 月、3 月套餐及结余数据（支持每月不同套餐）

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.seed_feb_quota_data [团队名称]

示例:
  PYTHONPATH=. venv/bin/python -m scripts.seed_feb_quota_data 爱达

场景:
  - 2 月: 套餐 4，未用完，充值 3、赠送 5 → 结余 4 转入 3 月
  - 3 月: 套餐 1（与 2 月不同，符合现实：每月可独立签约/变更）
"""
import asyncio
import sys
from sqlalchemy import select

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def seed_feb_quota_data(team_name: str):
    """2 月套餐 4 + 赠送 5 + 购买 3，已用 0；3 月套餐 1，结余 4"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.name.ilike(f"%{team_name}%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print(f"❌ 未找到名称包含 '{team_name}' 的团队")
            return False

        print(f"✅ 找到团队: {team.name} (id={team.id})")

        # 2 月套餐：base=4、赠送 5、购买 3
        for ym in ["2026-02", "2026-03"]:
            plan_id = f"{team.id}-{ym}"
            plan_result = await db.execute(
                select(TeamMonthlyPlan).where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month == ym,
                )
            )
            plan = plan_result.scalar_one_or_none()
            if plan:
                if ym == "2026-02":
                    plan.base_token_limit = 4
                    plan.gift_tokens = 5
                    plan.extra_tokens = 3
                    plan.token_limit = 4 + 5 + 3
                    print(f"   更新 {ym}: 套餐 4 + 赠送 5 + 购买 3")
                else:
                    plan.base_token_limit = 1
                    plan.gift_tokens = 0
                    plan.extra_tokens = 0
                    plan.token_limit = 1
                    print(f"   更新 {ym}: 套餐 1（与 2 月不同）")
            else:
                if ym == "2026-02":
                    plan = TeamMonthlyPlan(
                        id=plan_id,
                        team_id=team.id,
                        year_month=ym,
                        base_token_limit=4,
                        gift_tokens=5,
                        extra_tokens=3,
                        token_limit=4 + 5 + 3,
                    )
                    print(f"   创建 {ym}: 套餐 4 + 赠送 5 + 购买 3")
                else:
                    plan = TeamMonthlyPlan(
                        id=plan_id,
                        team_id=team.id,
                        year_month=ym,
                        base_token_limit=1,
                        gift_tokens=0,
                        extra_tokens=0,
                        token_limit=1,
                    )
                    print(f"   创建 {ym}: 套餐 1（与 2 月不同）")
                db.add(plan)

        # 2 月用量：已用 0（套餐 4 未用，结余 4 转入 3 月）
        usage_feb_id = f"{team.id}-2026-02"
        usage_feb_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == "2026-02",
            )
        )
        usage_feb = usage_feb_result.scalar_one_or_none()
        if usage_feb:
            usage_feb.tokens_used = 0
            usage_feb.rollover_from_prev_tokens = 0
            print(f"   更新 2026-02 用量: 已用 0 → 结余 4 留给 3 月")
        else:
            usage_feb = TeamMonthlyTokenUsage(
                id=usage_feb_id,
                team_id=team.id,
                year_month="2026-02",
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=0,
            )
            db.add(usage_feb)
            print(f"   创建 2026-02 用量: 已用 0 → 结余 4 留给 3 月")

        # 3 月用量：结余由系统根据 2 月动态计算为 4
        usage_mar_id = f"{team.id}-2026-03"
        usage_mar_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == "2026-03",
            )
        )
        usage_mar = usage_mar_result.scalar_one_or_none()
        if usage_mar:
            usage_mar.tokens_used = 0
            print(f"   更新 2026-03 用量")
        else:
            usage_mar = TeamMonthlyTokenUsage(
                id=usage_mar_id,
                team_id=team.id,
                year_month="2026-03",
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=4,
            )
            db.add(usage_mar)
            print(f"   创建 2026-03 用量（结余 4 由 2 月动态计算）")

        await db.commit()
        print("✅ 数据已按要求更新")
        print(f"   2 月: 套餐 4 + 赠送 5 + 购买 3，已用 0 → 结余 4 留给 3 月")
        print(f"   3 月: 套餐 1 + 上月结余 4 = 有效额度 5（每月套餐可不同）")
        return True


def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "爱达"
    asyncio.run(seed_feb_quota_data(team_name))


if __name__ == "__main__":
    main()
