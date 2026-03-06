from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.team import Team
from app.models.team_token_usage import TeamMonthlyTokenUsage
from app.models.team_monthly_plan import TeamMonthlyPlan


class TeamQuotaService:
    """
    团队配额服务：
    - 校验团队套餐有效期
    - 校验并累计每月 token / 调用次数 消耗
    - 消费优先级：赠送 > 节余 > 本月 > 追加（赠送与追加均无时间限制）
    """

    @staticmethod
    async def check_and_consume_tokens(
        db: AsyncSession,
        team_id: Optional[str],
        requested_tokens: Optional[int],
    ) -> None:
        """
        校验团队当月 token 配额，并累计一次请求的预计消耗。

        Args:
            db: 异步会话
            team_id: 团队 ID（为空时不做校验，例如使用全局 API Key 的场景）
            requested_tokens: 本次预计最大 token 消耗（通常取 llm_config.max_tokens）
        """
        if not team_id:
            # 无法确定团队的场景（如全局 API Key），暂不做配额控制
            return

        if not requested_tokens or requested_tokens <= 0:
            # 未指定 max_tokens 时，使用一个温和的默认值做估算
            requested_tokens = 512

        # 加载团队信息
        result = await db.execute(select(Team).where(Team.id == team_id))
        team: Optional[Team] = result.scalar_one_or_none()
        if not team or not team.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="团队不存在或已禁用",
            )

        # 1. 校验套餐有效期（如果配置了 plan_expire_at）
        now = datetime.now(timezone.utc)
        plan_expire = team.plan_expire_at
        if plan_expire is not None:
            # 兼容 naive/aware：若 DB 返回 naive 则视为 UTC
            if plan_expire.tzinfo is None:
                plan_expire = plan_expire.replace(tzinfo=timezone.utc)
            if now > plan_expire:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail="团队套餐已过期，请联系管理员续费",
                )

        year_month = now.strftime("%Y-%m")
        # 2. 读取当月套餐配置与分项
        plan_token_limit, plan_call_limit = await TeamQuotaService._get_effective_plan_limits(
            db=db,
            team=team,
            year_month=year_month,
        )
        base, gift, extra = await TeamQuotaService._get_plan_breakdown(db, team, year_month)

        # token 限制与调用次数限制均为可选；两者都未配置时，不做配额控制
        if (not plan_token_limit or plan_token_limit <= 0) and (not plan_call_limit or plan_call_limit <= 0):
            return

        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team_id,
                TeamMonthlyTokenUsage.year_month == year_month,
            )
        )
        usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

        if not usage:
            # 第一次使用本月配额：需要从上一个自然月结转未用完的基础配额
            rollover_from_prev = await TeamQuotaService._compute_rollover_from_previous_month(
                db=db,
                team=team,
                current_year_month=year_month,
            )
            usage = TeamMonthlyTokenUsage(
                id=f"{team_id}-{year_month}",
                team_id=team_id,
                year_month=year_month,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=rollover_from_prev,
            )
            db.add(usage)

        # 3. 根据套餐限制校验 token 与调用次数
        # 3.1 token 限制：按优先级消费并记录分项
        if plan_token_limit and plan_token_limit > 0:
            effective_token_cap = plan_token_limit + (usage.rollover_from_prev_tokens or 0)
            new_tokens_total = (usage.tokens_used or 0) + requested_tokens
            if new_tokens_total > effective_token_cap:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="本月团队 token 配额已用完，请联系管理员扩容或续费",
                )
            # 按优先级扣减并记录：赠送 > 结余 > 套餐 > 追加
            g_used = getattr(usage, "gift_tokens_used", None) or 0
            r_used = getattr(usage, "rollover_tokens_used", None) or 0
            b_used = getattr(usage, "base_tokens_used", None) or 0
            e_used = getattr(usage, "extra_tokens_used", None) or 0
            to_consume = requested_tokens
            gift_rem = max(0, gift - g_used)
            rollover_rem = max(0, (usage.rollover_from_prev_tokens or 0) - r_used)
            base_rem = max(0, base - b_used)
            extra_rem = max(0, extra - e_used)
            dg = min(to_consume, gift_rem)
            to_consume -= dg
            dr = min(to_consume, rollover_rem)
            to_consume -= dr
            db_inc = min(to_consume, base_rem)
            to_consume -= db_inc
            de = min(to_consume, extra_rem)
            usage.gift_tokens_used = g_used + dg
            usage.rollover_tokens_used = r_used + dr
            usage.base_tokens_used = b_used + db_inc
            usage.extra_tokens_used = e_used + de
            usage.tokens_used = (usage.tokens_used or 0) + requested_tokens

        # 3.2 调用次数限制（每次请求按 1 次）
        if plan_call_limit and plan_call_limit > 0:
            new_calls_total = (usage.calls_used or 0) + 1
            if new_calls_total > plan_call_limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="本月团队调用次数已达上限，请联系管理员扩容或续费",
                )
            usage.calls_used = new_calls_total

        await db.commit()

    @staticmethod
    async def record_usage_without_check(
        db: AsyncSession,
        team_id: Optional[str],
        requested_tokens: int = 1,
    ) -> None:
        """
        仅记录用量，不校验配额。用于多维表格等低频 API，避免因配额计算差异导致误拦截。
        仍会累加 tokens_used、calls_used，并按优先级记录分项。
        """
        if not team_id:
            return
        year_month = datetime.now(timezone.utc).strftime("%Y-%m")
        result = await db.execute(select(Team).where(Team.id == team_id))
        team = result.scalar_one_or_none()
        if not team:
            return
        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team_id,
                TeamMonthlyTokenUsage.year_month == year_month,
            )
        )
        usage = usage_result.scalar_one_or_none()
        if not usage:
            rollover = await TeamQuotaService._compute_rollover_from_previous_month(
                db, team, year_month
            )
            usage = TeamMonthlyTokenUsage(
                id=f"{team_id}-{year_month}",
                team_id=team_id,
                year_month=year_month,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=rollover,
            )
            db.add(usage)
        base, gift, extra = await TeamQuotaService._get_plan_breakdown(db, team, year_month)
        g_used = getattr(usage, "gift_tokens_used", None) or 0
        r_used = getattr(usage, "rollover_tokens_used", None) or 0
        b_used = getattr(usage, "base_tokens_used", None) or 0
        e_used = getattr(usage, "extra_tokens_used", None) or 0
        to_consume = requested_tokens
        gift_rem = max(0, gift - g_used)
        rollover_rem = max(0, (usage.rollover_from_prev_tokens or 0) - r_used)
        base_rem = max(0, base - b_used)
        extra_rem = max(0, extra - e_used)
        dg = min(to_consume, gift_rem)
        to_consume -= dg
        dr = min(to_consume, rollover_rem)
        to_consume -= dr
        db_inc = min(to_consume, base_rem)
        to_consume -= db_inc
        de = min(to_consume, extra_rem)
        usage.gift_tokens_used = g_used + dg
        usage.rollover_tokens_used = r_used + dr
        usage.base_tokens_used = b_used + db_inc
        usage.extra_tokens_used = e_used + de
        usage.tokens_used = (usage.tokens_used or 0) + requested_tokens
        usage.calls_used = (usage.calls_used or 0) + 1
        await db.commit()

    @staticmethod
    async def _get_effective_plan_limits(
        db: AsyncSession,
        team: Team,
        year_month: str,
    ) -> Tuple[Optional[int], Optional[int]]:
        """
        获取团队在指定月份的有效套餐配置（token 上限 + 调用次数上限）

        优先级：
        1. team_monthly_plans 中的按月配置
        2. Team.monthly_token_limit 作为兜底 token 上限
        调用次数上限若未配置则返回 None（视为无限制）
        """
        # 按月套餐：优先精确匹配当月，若无则使用套餐内最近月份（含赠送/追加）
        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == year_month,
            )
        )
        plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()

        if not plan:
            # 当月无套餐：使用套餐内首个 >= 当月的月份（避免当前月在套餐起始前时丢失赠送/追加）
            fallback_result = await db.execute(
                select(TeamMonthlyPlan)
                .where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month >= year_month,
                )
                .order_by(TeamMonthlyPlan.year_month)
                .limit(1)
            )
            plan = fallback_result.scalar_one_or_none()
            if not plan:
                # 当月晚于所有套餐：使用最后一个套餐月
                last_result = await db.execute(
                    select(TeamMonthlyPlan)
                    .where(TeamMonthlyPlan.team_id == team.id)
                    .order_by(TeamMonthlyPlan.year_month.desc())
                    .limit(1)
                )
                plan = last_result.scalar_one_or_none()

        token_limit: Optional[int] = None
        call_limit: Optional[int] = None

        if plan:
            call_limit = plan.call_limit
            # 消费优先级：赠送 > 节余 > 本月 > 追加；总上限 = base + gift + extra
            base = plan.base_token_limit or 0
            gift = plan.gift_tokens or 0
            extra = plan.extra_tokens or 0
            # 赠送/追加共享：当月为 0 时，取套餐内首个有值的月份（与消费逻辑一致）
            if gift == 0 and extra == 0:
                first_with_topup = await db.execute(
                    select(TeamMonthlyPlan)
                    .where(
                        TeamMonthlyPlan.team_id == team.id,
                        or_(
                            TeamMonthlyPlan.gift_tokens > 0,
                            TeamMonthlyPlan.extra_tokens > 0,
                        ),
                    )
                    .order_by(TeamMonthlyPlan.year_month)
                    .limit(1)
                )
                p = first_with_topup.scalar_one_or_none()
                if p:
                    gift = p.gift_tokens or 0
                    extra = p.extra_tokens or 0
            computed = base + gift + extra
            # 始终以 computed 为基准，确保赠送/追加被计入；plan.token_limit 可能未及时更新
            token_limit = computed if computed > 0 else (plan.token_limit or 0)
            if token_limit <= 0:
                token_limit = team.monthly_token_limit

        # 若按月套餐未设置 token 上限，则回退到团队默认 monthly_token_limit
        if token_limit is None or token_limit <= 0:
            token_limit = team.monthly_token_limit

        return token_limit, call_limit

    @staticmethod
    async def _get_plan_breakdown(
        db: AsyncSession,
        team: Team,
        year_month: str,
    ) -> Tuple[int, int, int]:
        """
        返回当月套餐分项 (base, gift, extra)。
        赠送/追加顺延续到所有月份：当月为 0 时，取套餐内首个有 gift/extra 的月份（与前端展示一致）。
        """
        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == year_month,
            )
        )
        plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()
        if not plan:
            fallback_result = await db.execute(
                select(TeamMonthlyPlan)
                .where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month >= year_month,
                )
                .order_by(TeamMonthlyPlan.year_month)
                .limit(1)
            )
            plan = fallback_result.scalar_one_or_none()
        if not plan:
            last_result = await db.execute(
                select(TeamMonthlyPlan)
                .where(TeamMonthlyPlan.team_id == team.id)
                .order_by(TeamMonthlyPlan.year_month.desc())
                .limit(1)
            )
            plan = last_result.scalar_one_or_none()
        if plan:
            base = plan.base_token_limit or 0
            gift = plan.gift_tokens or 0
            extra = plan.extra_tokens or 0
            # 赠送/追加共享：当月为 0 时，取套餐内首个有值的月份
            if gift == 0 and extra == 0:
                first_with_topup = await db.execute(
                    select(TeamMonthlyPlan)
                    .where(
                        TeamMonthlyPlan.team_id == team.id,
                        or_(
                            TeamMonthlyPlan.gift_tokens > 0,
                            TeamMonthlyPlan.extra_tokens > 0,
                        ),
                    )
                    .order_by(TeamMonthlyPlan.year_month)
                    .limit(1)
                )
                p = first_with_topup.scalar_one_or_none()
                if p:
                    gift = p.gift_tokens or 0
                    extra = p.extra_tokens or 0
            return base, gift, extra
        default = team.monthly_token_limit or 0
        return default, 0, 0

    @staticmethod
    async def _compute_rollover_from_previous_month(
        db: AsyncSession,
        team: Team,
        current_year_month: str,
    ) -> int:
        """
        计算从上一个自然月可结转到当前月的 token 数量。

        结转规则：结余只能保留到下一个月，不能跨月。
        - 上月必须是已结束的月份；若上月是当前月（未过完），则结余=0（当月未结束无法确定结余）。
        - 只结转「上月套餐基础 base」未用完的部分；赠送、追加不参与结转。
        - 消费顺序：赠送 > 结余 > 本月套餐 > 追加。
        """
        # 计算上一个自然月（YYYY-MM）
        year = int(current_year_month[:4])
        month = int(current_year_month[5:])
        if month == 1:
            prev_year = year - 1
            prev_month = 12
        else:
            prev_year = year
            prev_month = month - 1
        prev_year_month = f"{prev_year:04d}-{prev_month:02d}"

        # 上月是当前月（未过完）时，不存在结余数据
        now = datetime.now(timezone.utc)
        real_current_ym = now.strftime("%Y-%m")
        if prev_year_month >= real_current_ym:
            return 0

        # 只结转套餐基础 base，不结转赠送和追加
        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == prev_year_month,
            )
        )
        prev_plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()
        prev_base = (prev_plan.base_token_limit or 0) if prev_plan else 0
        prev_gift = (prev_plan.gift_tokens or 0) if prev_plan else 0

        if prev_base <= 0:
            return 0

        prev_usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == prev_year_month,
            )
        )
        prev_usage: Optional[TeamMonthlyTokenUsage] = prev_usage_result.scalar_one_or_none()
        used = prev_usage.tokens_used if prev_usage else 0
        prev_rollover = prev_usage.rollover_from_prev_tokens if prev_usage else 0

        # 优先使用记录的 base_tokens_used（新数据，分项已按优先级记录）
        if prev_usage and hasattr(prev_usage, "base_tokens_used"):
            g_u = getattr(prev_usage, "gift_tokens_used", 0) or 0
            r_u = getattr(prev_usage, "rollover_tokens_used", 0) or 0
            b_u = getattr(prev_usage, "base_tokens_used", 0) or 0
            e_u = getattr(prev_usage, "extra_tokens_used", 0) or 0
            if (g_u + r_u + b_u + e_u) == used:
                return max(0, prev_base - b_u)

        # 回退：旧数据或无分项时，按消费顺序推算套餐基础已用
        base_used = min(max(0, used - prev_gift - prev_rollover), prev_base)
        return max(0, prev_base - base_used)
