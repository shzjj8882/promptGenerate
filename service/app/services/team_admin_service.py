"""
团队管理 Admin 服务
提取配额、套餐、用量、支付等业务逻辑，供 admin/teams router 调用
业务层抛出领域异常，由 Router 映射为 HTTP 响应
"""
from __future__ import annotations

import calendar
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from sqlalchemy import select, delete, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.exceptions import NotFoundError, ValidationError
from app.models.team import Team
from app.models.team_token_usage import TeamMonthlyTokenUsage
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_payment_log import TeamPaymentLog
from app.models.team_usage_log import TeamUsageLog
from app.services.team_service import TeamService
from app.services.team_quota_service import TeamQuotaService


def normalize_year_month(value: Optional[str]) -> str:
    """将 year_month 规范化为 YYYY-MM，默认取当前月"""
    if value:
        try:
            dt = datetime.strptime(value, "%Y-%m")
        except ValueError:
            raise ValidationError("year_month 格式不正确，应为 YYYY-MM，例如 2025-03")
    else:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m")


def add_months(year: int, month: int, delta: int) -> str:
    """在 (year, month) 基础上增加 delta 个月，返回 YYYY-MM 字符串"""
    total = (year * 12 + (month - 1)) + delta
    new_year = total // 12
    new_month = total % 12 + 1
    return f"{new_year:04d}-{new_month:02d}"


def _last_day_of_month(year: int, month: int) -> int:
    """返回某月的最后一天"""
    return calendar.monthrange(year, month)[1]


async def _get_quota_detail(
    db: AsyncSession,
    team: Team,
    year_month: str,
) -> Dict[str, Any]:
    """获取团队某月配额详情（内部复用）"""
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db, team=team, year_month=year_month
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == year_month,
        )
    )
    usage = usage_result.scalar_one_or_none()
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)
    return {
        "team_id": team.id,
        "year_month": year_month,
        "token_limit": effective_token_limit,
        "call_limit": call_limit,
        "tokens_used": usage.tokens_used if usage else 0,
        "calls_used": usage.calls_used if usage else 0,
    }


class TeamAdminService:
    """团队管理 Admin 服务"""

    @staticmethod
    async def get_team_quota_detail(
        db: AsyncSession,
        team_id: str,
        year_month: Optional[str],
    ) -> Dict[str, Any]:
        """查看团队某月配额与用量"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        ym = normalize_year_month(year_month)
        return await _get_quota_detail(db, team, ym)

    @staticmethod
    async def update_team_quota(
        db: AsyncSession,
        team_id: str,
        year_month: str,
        token_limit: Optional[int],
        call_limit: Optional[int],
    ) -> Dict[str, Any]:
        """编辑团队某月套餐"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        ym = normalize_year_month(year_month)

        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == ym,
            )
        )
        plan = plan_result.scalar_one_or_none()
        if not plan:
            plan = TeamMonthlyPlan(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
            )
            db.add(plan)

        if token_limit is not None:
            plan.token_limit = token_limit
        if call_limit is not None:
            plan.call_limit = call_limit

        await db.commit()
        return await _get_quota_detail(db, team, ym)

    @staticmethod
    async def topup_team_quota_tokens(
        db: AsyncSession,
        team_id: str,
        year_month: str,
        extra_tokens: int,
        payment_type: str,
        comment: Optional[str],
    ) -> Dict[str, Any]:
        """为团队某月套餐追加积点上限"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        ym = normalize_year_month(year_month)
        pt = (payment_type or "purchase").lower()
        if pt not in ("gift", "purchase"):
            pt = "purchase"
        is_gift = pt == "gift"

        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == ym,
            )
        )
        plan = plan_result.scalar_one_or_none()

        if not plan:
            base_limit = team.monthly_token_limit or 0
            plan = TeamMonthlyPlan(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
                base_token_limit=base_limit,
                gift_tokens=extra_tokens if is_gift else 0,
                extra_tokens=0 if is_gift else extra_tokens,
                token_limit=base_limit + extra_tokens,
            )
            db.add(plan)
        else:
            if is_gift:
                plan.gift_tokens = (plan.gift_tokens or 0) + extra_tokens
            else:
                plan.extra_tokens = (plan.extra_tokens or 0) + extra_tokens
            plan.token_limit = (plan.base_token_limit or 0) + (plan.gift_tokens or 0) + (plan.extra_tokens or 0)

        other_plans_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month != ym,
            )
        )
        for p in other_plans_result.scalars().all():
            if is_gift:
                p.gift_tokens = (p.gift_tokens or 0) + extra_tokens
            else:
                p.extra_tokens = (p.extra_tokens or 0) + extra_tokens
            p.token_limit = (p.base_token_limit or 0) + (p.gift_tokens or 0) + (p.extra_tokens or 0)

        db.add(
            TeamPaymentLog(
                team_id=team.id,
                payment_type=pt,
                year_month=ym,
                amount=extra_tokens,
                comment=comment.strip() if comment and comment.strip() else None,
            )
        )
        await db.commit()
        return await _get_quota_detail(db, team, ym)

    @staticmethod
    async def set_team_package(
        db: AsyncSession,
        team_id: str,
        start_year_month: str,
        duration_months: int,
        monthly_token_limit: int,
    ) -> Dict[str, Any]:
        """为团队设置套餐"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        try:
            start_year = int(start_year_month[:4])
            start_month = int(start_year_month[5:])
        except Exception:
            raise ValidationError("start_year_month 格式不正确，应为 YYYY-MM，例如 2025-03")

        for i in range(duration_months):
            ym = add_months(start_year, start_month, i)
            plan_result = await db.execute(
                select(TeamMonthlyPlan).where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month == ym,
                )
            )
            plan = plan_result.scalar_one_or_none()
            if not plan:
                plan = TeamMonthlyPlan(
                    id=f"{team.id}-{ym}",
                    team_id=team.id,
                    year_month=ym,
                    base_token_limit=monthly_token_limit,
                    gift_tokens=0,
                    extra_tokens=0,
                    token_limit=monthly_token_limit,
                )
                db.add(plan)
            else:
                plan.base_token_limit = monthly_token_limit
                plan.token_limit = (monthly_token_limit or 0) + (plan.gift_tokens or 0) + (plan.extra_tokens or 0)

        team.monthly_token_limit = monthly_token_limit
        end_ym = add_months(start_year, start_month, duration_months - 1)
        end_year, end_month = int(end_ym[:4]), int(end_ym[5:])
        team.plan_expire_at = datetime(end_year, end_month, _last_day_of_month(end_year, end_month), 23, 59, 59)

        db.add(
            TeamPaymentLog(
                team_id=team.id,
                payment_type="contract",
                year_month=start_year_month,
                amount=monthly_token_limit * duration_months,
                comment=f"签约 {duration_months} 个月，每月 {monthly_token_limit}",
            )
        )
        await db.commit()
        await db.refresh(team)

        current_ym = datetime.utcnow().strftime("%Y-%m")
        from app.schemas.team import TeamResponse
        team_resp = await TeamQuotaService.enrich_team_response(
            db, team, current_ym,
            team_response=TeamResponse.model_validate(team),
        )
        return team_resp.model_dump(by_alias=True)

    @staticmethod
    async def delete_team_monthly_plan(
        db: AsyncSession,
        team_id: str,
        months: int,
    ) -> Dict[str, Any]:
        """解约团队月度套餐"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        current_ym = datetime.utcnow().strftime("%Y-%m")

        future_plans_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month >= current_ym,
            )
        )
        future_months = sorted({p.year_month for p in future_plans_result.scalars().all()})
        if not future_months:
            return {
                "team_id": team.id,
                "year_month": current_ym,
                "cancelled_months": [],
                "cancelled_count": 0,
            }

        to_cancel = future_months[-months:] if months <= len(future_months) else future_months
        if len(to_cancel) < months:
            raise ValidationError(f"可解约月份仅剩 {len(future_months)} 个月，无法解约 {months} 个月")

        for ym in to_cancel:
            plan_result = await db.execute(
                select(TeamMonthlyPlan).where(
                    TeamMonthlyPlan.team_id == team.id,
                    TeamMonthlyPlan.year_month == ym,
                )
            )
            plan = plan_result.scalar_one_or_none()
            if plan:
                db.add(
                    TeamPaymentLog(
                        team_id=team.id,
                        payment_type="cancel",
                        year_month=ym,
                        amount=1,
                        comment=f"解约 {ym}",
                    )
                )
                gift, extra = plan.gift_tokens or 0, plan.extra_tokens or 0
                plan.base_token_limit = 0
                plan.token_limit = gift + extra
                if plan.token_limit <= 0:
                    await db.delete(plan)

        remaining_result = await db.execute(
            select(TeamMonthlyPlan.year_month, TeamMonthlyPlan.base_token_limit).where(
                TeamMonthlyPlan.team_id == team.id,
            )
        )
        remaining = list(remaining_result.fetchall())
        has_contract_base = any((b or 0) > 0 for _, b in remaining)
        if has_contract_base and remaining:
            max_ym = max(r[0] for r in remaining)
            y, m = int(max_ym[:4]), int(max_ym[5:])
            team.plan_expire_at = datetime(y, m, _last_day_of_month(y, m), 23, 59, 59)
        else:
            team.plan_expire_at = None

        await db.commit()
        detail = await _get_quota_detail(db, team, current_ym)
        return {**detail, "cancelled_months": to_cancel, "cancelled_count": len(to_cancel)}

    @staticmethod
    async def get_team_package_overview(db: AsyncSession, team_id: str) -> Dict[str, Any]:
        """查看团队套餐区间及各月配额概览"""
        from app.schemas.team import TeamPackageOverview, TeamPackageMonthOverview

        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)

        plans_result = await db.execute(
            select(TeamMonthlyPlan).where(TeamMonthlyPlan.team_id == team.id)
        )
        plans = list(plans_result.scalars().all())
        if not plans:
            return TeamPackageOverview(
                team_id=team.id,
                start_year_month=None,
                end_year_month=None,
                months=[],
            ).model_dump(by_alias=True)

        plans.sort(key=lambda p: p.year_month)
        start_ym, end_ym = plans[0].year_month, plans[-1].year_month
        months: List[Dict] = []

        for plan in plans:
            ym = plan.year_month
            base = plan.base_token_limit or 0
            gift = plan.gift_tokens or 0
            extra = plan.extra_tokens or 0
            raw_limit = plan.token_limit if plan.token_limit is not None else (base + gift + extra or team.monthly_token_limit)
            total_limit = raw_limit if raw_limit and raw_limit > 0 else None

            usage_result = await db.execute(
                select(TeamMonthlyTokenUsage).where(
                    TeamMonthlyTokenUsage.team_id == team.id,
                    TeamMonthlyTokenUsage.year_month == ym,
                )
            )
            usage = usage_result.scalar_one_or_none()
            rollover = await TeamQuotaService._compute_rollover_from_previous_month(db, team, ym)
            tokens_used = usage.tokens_used if usage else 0

            if usage and usage.rollover_from_prev_tokens != rollover:
                usage.rollover_from_prev_tokens = rollover
            elif not usage:
                usage = TeamMonthlyTokenUsage(
                    id=f"{team.id}-{ym}",
                    team_id=team.id,
                    year_month=ym,
                    tokens_used=0,
                    calls_used=0,
                    rollover_from_prev_tokens=rollover,
                )
                db.add(usage)

            effective_limit = (total_limit + rollover) if total_limit is not None else None
            g_used = (getattr(usage, "gift_tokens_used", None) or 0) if usage else 0
            r_used = (getattr(usage, "rollover_tokens_used", None) or 0) if usage else 0
            b_used = (getattr(usage, "base_tokens_used", None) or 0) if usage else 0
            e_used = (getattr(usage, "extra_tokens_used", None) or 0) if usage else 0

            months.append(
                TeamPackageMonthOverview(
                    year_month=ym,
                    base_token_limit=base if base > 0 else None,
                    gift_tokens=gift,
                    extra_tokens=extra,
                    effective_token_limit=effective_limit,
                    tokens_used=tokens_used,
                    rollover_from_prev_tokens=rollover,
                    gift_tokens_used=g_used,
                    rollover_tokens_used=r_used,
                    base_tokens_used=b_used,
                    extra_tokens_used=e_used,
                ).model_dump(by_alias=True)
            )

        await db.commit()
        return TeamPackageOverview(
            team_id=team.id,
            start_year_month=start_ym,
            end_year_month=end_ym,
            months=months,
        ).model_dump(by_alias=True)

    @staticmethod
    async def get_team_payment_logs(db: AsyncSession, team_id: str, limit: int) -> List[Dict]:
        """获取团队缴费日志"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        result = await db.execute(
            select(TeamPaymentLog)
            .where(TeamPaymentLog.team_id == team_id)
            .order_by(TeamPaymentLog.created_at.desc())
            .limit(limit)
        )
        from app.schemas.team import TeamPaymentLogItem
        return [TeamPaymentLogItem.model_validate(log).model_dump() for log in result.scalars().all()]

    @staticmethod
    async def get_team_usage_daily(
        db: AsyncSession,
        team_id: str,
        year_month: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict]:
        """获取团队按日用量"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        q = (
            select(TeamUsageLog.usage_date, func.sum(TeamUsageLog.tokens_used).label("tokens_used"))
            .where(TeamUsageLog.team_id == team_id)
            .group_by(TeamUsageLog.usage_date)
        )
        if year_month:
            q = q.where(TeamUsageLog.year_month == year_month)
        if start_date:
            q = q.where(TeamUsageLog.usage_date >= start_date)
        if end_date:
            q = q.where(TeamUsageLog.usage_date <= end_date)
        if not year_month and not start_date and not end_date:
            q = q.where(TeamUsageLog.year_month == datetime.utcnow().strftime("%Y-%m"))
        q = q.order_by(TeamUsageLog.usage_date.asc())
        result = await db.execute(q)
        from app.schemas.team import TeamUsageDailyItem
        return [TeamUsageDailyItem(date=r[0], tokens_used=r[1] or 0).model_dump(by_alias=True) for r in result.fetchall()]

    @staticmethod
    async def get_team_usage_by_business(
        db: AsyncSession,
        team_id: str,
        year_month: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
    ) -> List[Dict]:
        """获取团队按业务用量"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        usage_type_labels = {
            1: "多维表格-单条新增",
            2: "多维表格-按条件编辑",
            3: "多维表格-按条件删除",
            4: "多维表格-按条件查询",
            5: "组合LLM接口",
        }
        bn_expr = func.coalesce(TeamUsageLog.business_name, cast(TeamUsageLog.usage_type, String))
        q = (
            select(bn_expr.label("bn"), func.sum(TeamUsageLog.tokens_used).label("tokens_used"))
            .where(TeamUsageLog.team_id == team_id)
            .group_by(bn_expr)
        )
        if year_month:
            q = q.where(TeamUsageLog.year_month == year_month)
        if start_date:
            q = q.where(TeamUsageLog.usage_date >= start_date)
        if end_date:
            q = q.where(TeamUsageLog.usage_date <= end_date)
        if not year_month and not start_date and not end_date:
            q = q.where(TeamUsageLog.year_month == datetime.utcnow().strftime("%Y-%m"))
        result = await db.execute(q)
        from app.schemas.team import TeamUsageByBusinessItem
        items = []
        for r in result.fetchall():
            bn = r[0]
            if bn and bn.isdigit():
                bn = usage_type_labels.get(int(bn), f"类型{bn}")
            elif not bn:
                bn = "未知"
            items.append(TeamUsageByBusinessItem(business_name=bn, tokens_used=r[1] or 0).model_dump(by_alias=True))
        return items

    @staticmethod
    async def get_team_usage_logs(
        db: AsyncSession,
        team_id: str,
        skip: int,
        limit: int,
        year_month: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
        business_name: Optional[str],
    ) -> Tuple[List[Dict], int]:
        """获取团队用量日志（分页），返回 (items, total)"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        q = select(TeamUsageLog).where(TeamUsageLog.team_id == team_id)
        if year_month:
            q = q.where(TeamUsageLog.year_month == year_month)
        if start_date:
            q = q.where(TeamUsageLog.usage_date >= start_date)
        if end_date:
            q = q.where(TeamUsageLog.usage_date <= end_date)
        if business_name:
            q = q.where(TeamUsageLog.business_name == business_name)
        count_q = select(func.count()).select_from(TeamUsageLog).where(TeamUsageLog.team_id == team_id)
        if year_month:
            count_q = count_q.where(TeamUsageLog.year_month == year_month)
        if start_date:
            count_q = count_q.where(TeamUsageLog.usage_date >= start_date)
        if end_date:
            count_q = count_q.where(TeamUsageLog.usage_date <= end_date)
        if business_name:
            count_q = count_q.where(TeamUsageLog.business_name == business_name)
        total_result = await db.execute(count_q)
        total = total_result.scalar() or 0
        q = q.order_by(TeamUsageLog.usage_date.desc(), TeamUsageLog.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(q)
        from app.schemas.team import TeamUsageLogItem
        items = [TeamUsageLogItem.model_validate(log).model_dump(by_alias=True) for log in result.scalars().all()]
        return items, total

    @staticmethod
    async def reset_team_current_month_usage(
        db: AsyncSession,
        team_id: str,
        year_month: Optional[str],
    ) -> Dict[str, Any]:
        """重置团队当月用量"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        ym = year_month or datetime.utcnow().strftime("%Y-%m")
        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team_id,
                TeamMonthlyTokenUsage.year_month == ym,
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
        else:
            rollover = await TeamQuotaService._compute_rollover_from_previous_month(db, team, ym)
            usage = TeamMonthlyTokenUsage(
                id=f"{team_id}-{ym}",
                team_id=team_id,
                year_month=ym,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=rollover,
            )
            db.add(usage)
        await db.commit()
        return {"team_id": team_id, "year_month": ym, "tokens_used": 0, "calls_used": 0}

    @staticmethod
    async def clear_team_logs(
        db: AsyncSession,
        team_id: str,
        full_reset: bool,
    ) -> Dict[str, Any]:
        """清空团队历史记录"""
        team = await TeamService.get_team_by_id(db, team_id)
        if not team:
            raise NotFoundError("团队", team_id)
        cleared = ["payment_logs", "usage_logs"]
        await db.execute(delete(TeamPaymentLog).where(TeamPaymentLog.team_id == team_id))
        await db.execute(delete(TeamUsageLog).where(TeamUsageLog.team_id == team_id))
        if full_reset:
            await db.execute(delete(TeamMonthlyPlan).where(TeamMonthlyPlan.team_id == team_id))
            await db.execute(delete(TeamMonthlyTokenUsage).where(TeamMonthlyTokenUsage.team_id == team_id))
            team.plan_expire_at = None
            team.monthly_token_limit = None
            cleared.extend(["monthly_plans", "monthly_token_usage", "plan_expire_at", "monthly_token_limit"])
        await db.commit()
        return {"team_id": team_id, "cleared": cleared}

    @staticmethod
    async def seed_rollover_test_data(
        db: AsyncSession,
        team_id: Optional[str],
        team_name: Optional[str],
    ) -> Dict[str, Any]:
        """创建结余测试数据"""
        if team_id:
            team = await TeamService.get_team_by_id(db, team_id)
        elif team_name:
            result = await db.execute(
                select(Team).where(Team.name.ilike(f"%{team_name}%")).limit(1)
            )
            team = result.scalar_one_or_none()
        else:
            raise ValidationError("请提供 team_id 或 team_name")
        if not team:
            raise NotFoundError("团队", team_id)

        for ym in ["2026-01", "2026-02"]:
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
            else:
                db.add(
                    TeamMonthlyPlan(
                        id=f"{team.id}-{ym}",
                        team_id=team.id,
                        year_month=ym,
                        base_token_limit=1,
                        gift_tokens=0,
                        extra_tokens=0,
                        token_limit=1,
                    )
                )

        for ym, rollover in [("2026-01", 0), ("2026-02", 1)]:
            usage_result = await db.execute(
                select(TeamMonthlyTokenUsage).where(
                    TeamMonthlyTokenUsage.team_id == team.id,
                    TeamMonthlyTokenUsage.year_month == ym,
                )
            )
            usage = usage_result.scalar_one_or_none()
            if usage:
                usage.tokens_used = 0
                usage.rollover_from_prev_tokens = rollover
            else:
                db.add(
                    TeamMonthlyTokenUsage(
                        id=f"{team.id}-{ym}",
                        team_id=team.id,
                        year_month=ym,
                        tokens_used=0,
                        calls_used=0,
                        rollover_from_prev_tokens=rollover,
                    )
                )

        team.monthly_token_limit = 1
        team.plan_expire_at = datetime(2026, 2, 28, 23, 59, 59)
        await db.commit()

        return {
            "team_id": team.id,
            "team_name": team.name,
            "months": [
                {"year_month": "2026-01", "base": 1, "tokens_used": 0, "rollover": 0},
                {"year_month": "2026-02", "base": 1, "tokens_used": 0, "rollover": 1},
            ],
        }
