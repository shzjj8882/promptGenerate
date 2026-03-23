# -*- coding: utf-8 -*-
"""
将爱达团队当月用量减少 2（因之前统计缺失导致多计）

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.adjust_aida_usage_minus2

效果: tokens_used 6->4, calls_used 6->4，分项按逆序退还（extra->base->rollover->gift）
"""
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team import Team
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def adjust():
    year_month = datetime.now(timezone.utc).strftime("%Y-%m")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.name.ilike("%爱达%"))
        )
        team = result.scalar_one_or_none()
        if not team:
            print("❌ 未找到名称包含 '爱达' 的团队")
            return

        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == year_month,
            )
        )
        usage = usage_result.scalar_one_or_none()
        if not usage:
            print(f"❌ 爱达团队 {year_month} 无用量记录")
            return

        total = usage.tokens_used or 0
        calls = usage.calls_used or 0
        print(f"当前: tokens_used={total}, calls_used={calls}")

        refund = 2
        if total < refund or calls < refund:
            print(f"❌ 当前用量不足 {refund}，无法扣减")
            return

        g_used = getattr(usage, "gift_tokens_used", None) or 0
        r_used = getattr(usage, "rollover_tokens_used", None) or 0
        b_used = getattr(usage, "base_tokens_used", None) or 0
        e_used = getattr(usage, "extra_tokens_used", None) or 0

        # 逆序退还：extra -> base -> rollover -> gift
        rem = refund
        de = min(rem, e_used)
        usage.extra_tokens_used = e_used - de
        rem -= de
        db_dec = min(rem, b_used)
        usage.base_tokens_used = b_used - db_dec
        rem -= db_dec
        dr = min(rem, r_used)
        usage.rollover_tokens_used = r_used - dr
        rem -= dr
        dg = min(rem, g_used)
        usage.gift_tokens_used = g_used - dg
        usage.tokens_used = max(0, total - refund)
        usage.calls_used = max(0, calls - refund)

        await db.commit()
        print(f"✅ 爱达团队 {year_month} 用量已调整: tokens_used {total}->{usage.tokens_used}, calls_used {calls}->{usage.calls_used}")


if __name__ == "__main__":
    asyncio.run(adjust())
