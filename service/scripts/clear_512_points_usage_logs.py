# -*- coding: utf-8 -*-
"""
清除 tokens_used=512 的错误用量日志，并恢复正确的月度用量

用法:
  cd service && PYTHONPATH=. venv/bin/python -m scripts.clear_512_points_usage_logs
  cd service && PYTHONPATH=. venv/bin/python -m scripts.clear_512_points_usage_logs --recalc   # 仅按日志重算月度用量（用于恢复）

将:
  1. 删除 team_usage_logs 中 tokens_used=512 的错误记录
  2. 按剩余日志重算 team_monthly_token_usage，恢复正确用量
"""
import asyncio
import sys
from sqlalchemy import select, delete, func

import app.models.rbac  # noqa: F401
from app.core.database import AsyncSessionLocal
from app.models.team_usage_log import TeamUsageLog
from app.models.team_token_usage import TeamMonthlyTokenUsage


async def recalc_monthly_from_logs(db, team_id: str, year_month: str):
    """按 team_usage_logs 重算指定 team/month 的月度用量"""
    agg = await db.execute(
        select(
            func.coalesce(func.sum(TeamUsageLog.tokens_used), 0).label("tokens"),
            func.coalesce(func.sum(TeamUsageLog.calls_count), 0).label("calls"),
        ).where(
            TeamUsageLog.team_id == team_id,
            TeamUsageLog.year_month == year_month,
        )
    )
    row = agg.one()
    new_tokens = int(row.tokens)
    new_calls = int(row.calls)

    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team_id,
            TeamMonthlyTokenUsage.year_month == year_month,
        )
    )
    usage = usage_result.scalar_one_or_none()
    if not usage:
        return

    old_tokens = usage.tokens_used or 0
    to_reduce = old_tokens - new_tokens
    if to_reduce <= 0:
        usage.tokens_used = new_tokens
        usage.calls_used = new_calls
        print(f"   恢复 {team_id} {year_month}: tokens {old_tokens} -> {new_tokens}, calls -> {new_calls}")
    else:
        e = getattr(usage, "extra_tokens_used", None) or 0
        b = getattr(usage, "base_tokens_used", None) or 0
        r_used = getattr(usage, "rollover_tokens_used", None) or 0
        g = getattr(usage, "gift_tokens_used", None) or 0
        de = min(e, to_reduce)
        to_reduce -= de
        e -= de
        db_inc = min(b, to_reduce)
        to_reduce -= db_inc
        b -= db_inc
        dr = min(r_used, to_reduce)
        to_reduce -= dr
        r_used -= dr
        dg = min(g, to_reduce)
        g -= dg
        usage.extra_tokens_used = e
        usage.base_tokens_used = b
        usage.rollover_tokens_used = r_used
        usage.gift_tokens_used = g
        usage.tokens_used = new_tokens
        usage.calls_used = new_calls
        print(f"   恢复 {team_id} {year_month}: tokens {old_tokens} -> {new_tokens}, calls -> {new_calls}")


async def clear_512_usage(recalc_only: bool = False):
    async with AsyncSessionLocal() as db:
        if recalc_only:
            # 仅重算：找出所有有日志的 (team_id, year_month)，按日志重算月度用量
            distinct = await db.execute(
                select(TeamUsageLog.team_id, TeamUsageLog.year_month).distinct()
            )
            affected = set((r[0], r[1]) for r in distinct.fetchall())
            # 也包含有月度用量但可能无日志的（上次误改的）
            usage_rows = await db.execute(
                select(TeamMonthlyTokenUsage.team_id, TeamMonthlyTokenUsage.year_month).distinct()
            )
            affected.update((r[0], r[1]) for r in usage_rows.fetchall())
            print(f"按日志重算 {len(affected)} 个 team/month 的月度用量...")
            for (team_id, year_month) in sorted(affected):
                await recalc_monthly_from_logs(db, team_id, year_month)
            await db.commit()
            print("✅ 月度用量已按日志恢复")
            return

        # 1. 查出要删除的记录及受影响的 (team_id, year_month)
        to_delete = await db.execute(
            select(TeamUsageLog).where(TeamUsageLog.tokens_used == 512)
        )
        logs = list(to_delete.scalars().all())
        if not logs:
            print("✅ 无 tokens_used=512 的记录，无需清理")
            return

        affected = set((log.team_id, log.year_month) for log in logs)

        # 2. 删除错误记录
        r = await db.execute(delete(TeamUsageLog).where(TeamUsageLog.tokens_used == 512))
        deleted = r.rowcount
        print(f"✅ 已删除 team_usage_logs 中 tokens_used=512 的记录: {deleted} 条")

        # 3. 按剩余日志重算月度用量（恢复正确数据）
        for (team_id, year_month) in sorted(affected):
            await recalc_monthly_from_logs(db, team_id, year_month)

        await db.commit()
        print("✅ 清理完成，月度用量已按剩余日志恢复")


if __name__ == "__main__":
    recalc_only = "--recalc" in sys.argv
    asyncio.run(clear_512_usage(recalc_only=recalc_only))
