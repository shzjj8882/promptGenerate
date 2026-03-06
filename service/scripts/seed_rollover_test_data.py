# -*- coding: utf-8 -*-
"""
为指定团队创建带结余的测试数据

用法:
  cd service && python -m scripts.seed_rollover_test_data [团队名称]

示例:
  python -m scripts.seed_rollover_test_data 爱达

将创建:
  - 2026-01: 1 token 套餐，0 已用
  - 2026-02: 1 token 套餐，0 已用，结余 1（来自 1 月未用完）
  - 2026-03: 1 token 套餐，0 已用，结余 2（来自 2 月未用完：1 套餐 + 1 结余）
"""
import asyncio
import sys
from sqlalchemy import select
from datetime import datetime, timezone

# 确保 RBAC 模型先加载，避免 User.roles 的 secondary="user_roles" 解析失败
import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def seed_rollover_for_team(team_name: str):
    """为名称包含 team_name 的团队创建 1 月、2 月套餐及 2 月结余"""
    async with AsyncSessionLocal() as db:
        # 查找团队
        result = await db.execute(
            select(Team).where(Team.name.ilike(f"%{team_name}%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print(f"❌ 未找到名称包含 '{team_name}' 的团队")
            return False

        print(f"✅ 找到团队: {team.name} (id={team.id})")

        # 1 月、2 月、3 月套餐（各 1 token）
        for ym in ["2026-01", "2026-02", "2026-03"]:
            plan_id = f"{team.id}-{ym}"
            plan_result = await db.execute(
                select(TeamMonthlyPlan).where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month == ym,
                )
            )
            plan = plan_result.scalar_one_or_none()
            if plan:
                plan.base_token_limit = 1
                plan.token_limit = 1
                plan.gift_tokens = 0
                plan.extra_tokens = 0
                print(f"   更新 {ym} 套餐: 1 token")
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
                db.add(plan)
                print(f"   创建 {ym} 套餐: 1 token")

        # 1 月用量：0 已用（1 token 可结转到 2 月）
        usage_jan_id = f"{team.id}-2026-01"
        usage_jan_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == "2026-01",
            )
        )
        usage_jan = usage_jan_result.scalar_one_or_none()
        if usage_jan:
            usage_jan.tokens_used = 0
            usage_jan.rollover_from_prev_tokens = 0
            print(f"   更新 2026-01 用量: 0 已用")
        else:
            usage_jan = TeamMonthlyTokenUsage(
                id=usage_jan_id,
                team_id=team.id,
                year_month="2026-01",
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=0,
            )
            db.add(usage_jan)
            print(f"   创建 2026-01 用量: 0 已用")

        # 2 月用量：0 已用，结余 1（来自 1 月）
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
            usage_feb.rollover_from_prev_tokens = 1
            print(f"   更新 2026-02 用量: 0 已用, 结余 1")
        else:
            usage_feb = TeamMonthlyTokenUsage(
                id=usage_feb_id,
                team_id=team.id,
                year_month="2026-02",
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=1,
            )
            db.add(usage_feb)
            print(f"   创建 2026-02 用量: 0 已用, 结余 1")

        # 3 月用量：0 已用，结余 2（来自 2 月：1 套餐 + 1 结余，均未用）
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
            usage_mar.rollover_from_prev_tokens = 2
            print(f"   更新 2026-03 用量: 0 已用, 结余 2")
        else:
            usage_mar = TeamMonthlyTokenUsage(
                id=usage_mar_id,
                team_id=team.id,
                year_month="2026-03",
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=2,
            )
            db.add(usage_mar)
            print(f"   创建 2026-03 用量: 0 已用, 结余 2")

        # 更新团队 plan_expire_at
        team.monthly_token_limit = 1
        team.plan_expire_at = datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc)

        await db.commit()
        print(f"✅ 结余测试数据创建完成")
        print(f"   2 月应显示: 套餐 1 + 结余 1 = 有效额度 2")
        print(f"   3 月应显示: 套餐 1 + 结余 2 = 有效额度 3（含「上月结余」卡片）")
        return True


async def main():
    team_name = sys.argv[1] if len(sys.argv) > 1 else "爱达"
    print("=" * 50)
    print("创建结余测试数据")
    print("=" * 50)
    print(f"团队名称: {team_name}")
    print("=" * 50)
    try:
        await seed_rollover_for_team(team_name)
    except Exception as e:
        print(f"❌ 失败: {e}")
        raise
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
