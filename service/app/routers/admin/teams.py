"""
Admin 团队管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func, cast, String, or_
from typing import Optional
from datetime import datetime
import calendar

from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_permission
from app.services.team_service import TeamService
from app.schemas.team import (
    TeamCreate,
    TeamUpdate,
    TeamResponse,
    TeamQuotaDetail,
    TeamQuotaUpdateRequest,
    TeamQuotaTopupRequest,
    TeamPackageRequest,
    TeamPackageOverview,
    TeamPackageMonthOverview,
    TeamPaymentLogItem,
    TeamUsageLogItem,
    TeamUsageDailyItem,
    TeamUsageByBusinessItem,
)
from app.models.team import Team
from app.models.team_token_usage import TeamMonthlyTokenUsage
from app.models.team_monthly_plan import TeamMonthlyPlan
from app.models.team_payment_log import TeamPaymentLog
from app.models.team_usage_log import TeamUsageLog
from app.services.team_quota_service import TeamQuotaService
from app.schemas.user import UserResponse

router = APIRouter()


@router.post("/teams", status_code=status.HTTP_201_CREATED, summary="创建团队", tags=["管理接口 > 团队管理"])
async def create_team(
    team_data: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    创建团队（需要超级管理员权限）
    
    创建新的团队代码，用于用户注册时的团队验证。
    """
    try:
        team = await TeamService.create_team(db, team_data)
        team_response = TeamResponse.model_validate(team)
        return ResponseModel.success_response(
            data=team_response.model_dump(),
            message="创建团队成功",
            code=status.HTTP_201_CREATED
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/teams", summary="获取团队列表", tags=["管理接口 > 团队管理"])
async def get_teams(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    is_active: Optional[bool] = Query(None, description="是否激活"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队列表（需要超级管理员权限）"""
    teams = await TeamService.get_teams(db, skip=skip, limit=limit, is_active=is_active)
    total = await TeamService.count_teams(db, is_active=is_active)

    # 为每个团队添加成员数量 + 当前月份配额信息概览
    now = datetime.utcnow()
    year_month = now.strftime("%Y-%m")

    team_list = []
    for team in teams:
        team_resp = TeamResponse.model_validate(team)

        # 成员数量
        member_count = await TeamService.get_team_member_count(db, team.code)
        team_dict = team_resp.model_dump()
        team_dict["member_count"] = member_count

        # 仅剩追加/赠送时视为无合约：若所有 plan 的 base_token_limit 均为 0，则 plan_expire_at 按无合约处理
        plans_check = await db.execute(
            select(TeamMonthlyPlan.base_token_limit).where(TeamMonthlyPlan.team_id == team.id)
        )
        plans_bases = [r[0] for r in plans_check.fetchall()]
        if plans_bases and not any((b or 0) > 0 for b in plans_bases):
            team_dict["plan_expire_at"] = None

        # 当前月配额信息
        token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
            db=db,
            team=team,
            year_month=year_month,
        )
        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == year_month,
            )
        )
        usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

        # 展示给前端的 token 上限 = 本月基础上限 + 上月结转（若已生成用量记录）
        effective_token_limit = token_limit
        if effective_token_limit and effective_token_limit > 0 and usage:
            effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

        team_dict["current_month_year_month"] = year_month
        team_dict["current_month_token_limit"] = effective_token_limit
        team_dict["current_month_call_limit"] = call_limit
        team_dict["current_month_tokens_used"] = usage.tokens_used if usage else 0
        team_dict["current_month_calls_used"] = usage.calls_used if usage else 0

        team_list.append(team_dict)

    return ResponseModel.success_response(
        data={
            "items": team_list,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取团队列表成功",
        code=status.HTTP_200_OK
    )


async def _require_team_reset_authcode(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """要求具备 team:reset_authcode 接口权限"""
    return await require_permission("team:reset_authcode", current_user, db)


@router.get("/teams/my-team", summary="获取当前用户的团队信息", tags=["管理接口 > 团队管理"])
async def get_my_team(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取当前登录用户所属团队的信息（包括 authcode、当前月用量），普通团队成员可访问"""
    if not current_user.team_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未关联团队"
        )

    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
    else:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )

    team_response = TeamResponse.model_validate(team)
    team_dict = team_response.model_dump()

    # 附带当前月份配额与用量（允许团队成员查看自身团队使用量）
    now = datetime.utcnow()
    year_month = now.strftime("%Y-%m")
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=year_month,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == year_month,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    team_dict["current_month_year_month"] = year_month
    team_dict["current_month_token_limit"] = effective_token_limit
    team_dict["current_month_call_limit"] = call_limit
    team_dict["current_month_tokens_used"] = usage.tokens_used if usage else 0
    team_dict["current_month_calls_used"] = usage.calls_used if usage else 0

    # 三张统计卡片所需分项：套餐状态、套餐外额度、上月结余
    plan_result = await db.execute(
        select(TeamMonthlyPlan).where(
            TeamMonthlyPlan.team_id == team.id,
            TeamMonthlyPlan.year_month == year_month,
        )
    )
    plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()
    base = (plan.base_token_limit or 0) if plan else 0
    gift = (plan.gift_tokens or 0) if plan else 0
    extra = (plan.extra_tokens or 0) if plan else 0
    # 赠送/购买通用月份：当月 gift+extra 为 0 时，取首个有 topup 的月份作为总额（与管理员视图一致）
    if gift + extra == 0:
        fallback_result = await db.execute(
            select(TeamMonthlyPlan)
            .where(TeamMonthlyPlan.team_id == team.id)
            .where(
                or_(
                    TeamMonthlyPlan.gift_tokens > 0,
                    TeamMonthlyPlan.extra_tokens > 0,
                )
            )
            .order_by(TeamMonthlyPlan.year_month.asc())
            .limit(1)
        )
        fallback_plan = fallback_result.scalar_one_or_none()
        if fallback_plan:
            gift = fallback_plan.gift_tokens or 0
            extra = fallback_plan.extra_tokens or 0
    rollover = await TeamQuotaService._compute_rollover_from_previous_month(
        db=db, team=team, current_year_month=year_month
    )
    tokens_used = usage.tokens_used if usage else 0
    g_used = (getattr(usage, "gift_tokens_used", None) or 0) if usage else 0
    r_used = (getattr(usage, "rollover_tokens_used", None) or 0) if usage else 0
    b_used = (getattr(usage, "base_tokens_used", None) or 0) if usage else 0
    e_used = (getattr(usage, "extra_tokens_used", None) or 0) if usage else 0
    team_dict["current_month_breakdown"] = {
        "year_month": year_month,
        "base_token_limit": base,
        "gift_tokens": gift,
        "extra_tokens": extra,
        "rollover_from_prev_tokens": rollover,
        "tokens_used": tokens_used,
        "gift_tokens_used": g_used,
        "rollover_tokens_used": r_used,
        "base_tokens_used": b_used,
        "extra_tokens_used": e_used,
    }

    return ResponseModel.success_response(
        data=team_dict,
        message="获取团队信息成功",
        code=status.HTTP_200_OK
    )


async def _get_my_team_or_404(db: AsyncSession, current_user: UserResponse):
    """获取当前用户所属团队，不存在则 404"""
    if not current_user.team_code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户未关联团队")
    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
    else:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")
    return team


@router.get(
    "/teams/my-team/usage/daily",
    summary="获取当前团队按日用量（折线图）",
    tags=["管理接口 > 团队管理"],
)
async def get_my_team_usage_daily(
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """当前用户所属团队按日用量，用于工作台折线图"""
    team = await _get_my_team_or_404(db, current_user)
    return await get_team_usage_daily(team.id, year_month, start_date, end_date, db, current_user)


@router.get(
    "/teams/my-team/usage/by-business",
    summary="获取当前团队按业务用量（饼图）",
    tags=["管理接口 > 团队管理"],
)
async def get_my_team_usage_by_business(
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """当前用户所属团队按业务用量，用于工作台饼图"""
    team = await _get_my_team_or_404(db, current_user)
    return await get_team_usage_by_business(team.id, year_month, start_date, end_date, db, current_user)


@router.get(
    "/teams/my-team/usage-logs",
    summary="获取当前团队用量日志（分页）",
    tags=["管理接口 > 团队管理"],
)
async def get_my_team_usage_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    year_month: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    business_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """当前用户所属团队用量日志，支持查看日志"""
    team = await _get_my_team_or_404(db, current_user)
    # 复用逻辑，需绕过 require_superuser，直接调用内部实现
    q = select(TeamUsageLog).where(TeamUsageLog.team_id == team.id)
    if year_month:
        q = q.where(TeamUsageLog.year_month == year_month)
    if start_date:
        q = q.where(TeamUsageLog.usage_date >= start_date)
    if end_date:
        q = q.where(TeamUsageLog.usage_date <= end_date)
    if business_name:
        q = q.where(TeamUsageLog.business_name == business_name)
    q = q.order_by(TeamUsageLog.usage_date.desc(), TeamUsageLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    logs = list(result.scalars().all())
    items = [TeamUsageLogItem.model_validate(log) for log in logs]
    count_q = select(func.count()).select_from(TeamUsageLog).where(TeamUsageLog.team_id == team.id)
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
    return ResponseModel.success_response(
        data={"items": [i.model_dump() for i in items], "total": total, "skip": skip, "limit": limit},
        message="获取用量日志成功",
        code=status.HTTP_200_OK,
    )


@router.post("/teams/my-team/reset-authcode", summary="重置当前用户的团队认证码", tags=["管理接口 > 团队管理"])
async def reset_my_team_authcode(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(_require_team_reset_authcode),
):
    """重置当前登录用户所属团队的 API 认证码（需要 team:reset_authcode 权限）"""
    if not current_user.team_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未关联团队"
        )

    if current_user.team_id:
        team = await TeamService.get_team_by_id(db, current_user.team_id)
    else:
        team = await TeamService.get_team_by_code(db, current_user.team_code)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )

    updated_team = await TeamService.reset_team_authcode(db, team.id)
    if not updated_team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )

    team_response = TeamResponse.model_validate(updated_team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="重置认证码成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/{team_id}", summary="获取团队详情", tags=["管理接口 > 团队管理"])
async def get_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队详情（需要超级管理员权限）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(team)
    team_dict = team_response.model_dump()

    # 仅剩追加/赠送时视为无合约
    plans_check = await db.execute(
        select(TeamMonthlyPlan.base_token_limit).where(TeamMonthlyPlan.team_id == team.id)
    )
    plans_bases = [r[0] for r in plans_check.fetchall()]
    if plans_bases and not any((b or 0) > 0 for b in plans_bases):
        team_dict["plan_expire_at"] = None

    # 附带当前月份配额信息
    now = datetime.utcnow()
    year_month = now.strftime("%Y-%m")
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=year_month,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == year_month,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()
    # 展示给前端的 token 上限 = 本月基础上限 + 上月结转（若已生成用量记录）
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    team_dict["current_month_year_month"] = year_month
    team_dict["current_month_token_limit"] = effective_token_limit
    team_dict["current_month_call_limit"] = call_limit
    team_dict["current_month_tokens_used"] = usage.tokens_used if usage else 0
    team_dict["current_month_calls_used"] = usage.calls_used if usage else 0
    return ResponseModel.success_response(
        data=team_dict,
        message="获取团队详情成功",
        code=status.HTTP_200_OK
    )


@router.put("/teams/{team_id}", summary="更新团队", tags=["管理接口 > 团队管理"])
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """更新团队信息（需要超级管理员权限）"""
    try:
        team = await TeamService.update_team(db, team_id, team_data)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="团队不存在"
            )
        
        team_response = TeamResponse.model_validate(team)
        return ResponseModel.success_response(
            data=team_response.model_dump(),
            message="更新团队成功",
            code=status.HTTP_200_OK
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/teams/{team_id}/reset-authcode", summary="重置团队认证码", tags=["管理接口 > 团队管理"])
async def reset_team_authcode(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """重置团队的 API 认证码（需要超级管理员权限）"""
    team = await TeamService.reset_team_authcode(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    team_response = TeamResponse.model_validate(team)
    return ResponseModel.success_response(
        data=team_response.model_dump(),
        message="重置认证码成功",
        code=status.HTTP_200_OK
    )


@router.delete("/teams/{team_id}", summary="删除团队", tags=["管理接口 > 团队管理"])
async def delete_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """删除团队（需要超级管理员权限）"""
    success = await TeamService.delete_team(db, team_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    return ResponseModel.success_response(
        data=None,
        message="删除团队成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/{team_id}/members", summary="获取团队成员列表", tags=["管理接口 > 团队管理"])
async def get_team_members(
    team_id: str,
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量"),
    search: Optional[str] = Query(None, description="搜索关键词（用户名、邮箱、全名）"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队成员列表（需要超级管理员权限）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在"
        )
    
    members = await TeamService.get_team_members(db, team.code, skip=skip, limit=limit, search=search)
    total = await TeamService.get_team_member_count(db, team.code, search=search)
    
    return ResponseModel.success_response(
        data={
            "items": members,
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取团队成员列表成功",
        code=status.HTTP_200_OK
    )


def _normalize_year_month(value: Optional[str]) -> str:
    """将 year_month 规范化为 YYYY-MM，默认取当前月"""
    if value:
        try:
            dt = datetime.strptime(value, "%Y-%m")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="year_month 格式不正确，应为 YYYY-MM，例如 2025-03",
            )
    else:
        dt = datetime.utcnow()
    return dt.strftime("%Y-%m")


def _add_months(year: int, month: int, delta: int) -> str:
    """
    在 (year, month) 基础上增加 delta 个月，返回 YYYY-MM 字符串。
    例如：2025-03 + 1 -> 2025-04；2025-12 + 1 -> 2026-01
    """
    total = (year * 12 + (month - 1)) + delta
    new_year = total // 12
    new_month = total % 12 + 1
    return f"{new_year:04d}-{new_month:02d}"


def _plan_effective_token_limit(plan: TeamMonthlyPlan, team: Team) -> Optional[int]:
    """
    计算 plan 的有效 token 上限。
    新模型：base_token_limit + extra_tokens；旧数据：回退到 token_limit。
    """
    base = getattr(plan, "base_token_limit", None)
    extra = getattr(plan, "extra_tokens", None)
    if base is not None or extra is not None:
        return (base or 0) + (extra or 0)
    return plan.token_limit if plan.token_limit is not None else team.monthly_token_limit


@router.get(
    "/teams/{team_id}/quota",
    summary="查看团队某月配额与用量",
    tags=["管理接口 > 团队管理"],
)
async def get_team_quota_detail(
    team_id: str,
    year_month: Optional[str] = Query(
        None,
        description="月份，格式 YYYY-MM；为空表示当前月",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """查看指定团队在某个月的 token / 调用次数配额与用量。"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    ym = _normalize_year_month(year_month)
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=ym,
    )

    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == ym,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

    # 展示用 token_limit = 基础上限 + 上月结转（若已有用量记录）
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    detail = TeamQuotaDetail(
        team_id=team.id,
        year_month=ym,
        token_limit=effective_token_limit,
        call_limit=call_limit,
        tokens_used=usage.tokens_used if usage else 0,
        calls_used=usage.calls_used if usage else 0,
    )

    return ResponseModel.success_response(
        data=detail.model_dump(),
        message="获取团队配额详情成功",
        code=status.HTTP_200_OK,
    )


@router.put(
    "/teams/{team_id}/quota",
    summary="编辑团队某月套餐",
    tags=["管理接口 > 团队管理"],
)
async def update_team_quota(
    team_id: str,
    body: TeamQuotaUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    编辑团队在某个月的套餐：
    - 若该月无单独套餐记录，则创建一条 TeamMonthlyPlan 作为覆盖；
    - 若已存在，则仅更新传入的字段（token_limit / call_limit）。
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    ym = _normalize_year_month(body.year_month)

    plan_result = await db.execute(
        select(TeamMonthlyPlan).where(
            TeamMonthlyPlan.team_id == team.id,
            TeamMonthlyPlan.year_month == ym,
        )
    )
    plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()

    if not plan:
        plan = TeamMonthlyPlan(
            id=f"{team.id}-{ym}",
            team_id=team.id,
            year_month=ym,
        )
        db.add(plan)

    if body.token_limit is not None:
        plan.token_limit = body.token_limit
    if body.call_limit is not None:
        plan.call_limit = body.call_limit

    await db.commit()

    # 返回最新详情
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=ym,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == ym,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

    detail = TeamQuotaDetail(
        team_id=team.id,
        year_month=ym,
        token_limit=token_limit,
#         call_limit=call_limit,
        call_limit=call_limit,
        tokens_used=usage.tokens_used if usage else 0,
        calls_used=usage.calls_used if usage else 0,
    )

    return ResponseModel.success_response(
        data=detail.model_dump(),
        message="更新团队套餐成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/quota/topup",
    summary="为团队某月套餐追加 token 上限",
    tags=["管理接口 > 团队管理"],
)
async def topup_team_quota_tokens(
    team_id: str,
    body: TeamQuotaTopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    为团队套餐追加 token 上限。追加额度不受月份限制，顺延续到当月及所有未来月份。
    - 若该月已有 TeamMonthlyPlan，则在 extra_tokens 基础上增加；
    - 否则以团队默认 monthly_token_limit 作为基数创建按月套餐；
    - 同时将追加额度同步到所有未来月份（year_month > 操作月）的套餐。
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    ym = _normalize_year_month(body.year_month)
    amount = body.extra_tokens
    payment_type = (body.type or "purchase").lower()
    if payment_type not in ("gift", "purchase"):
        payment_type = "purchase"
    is_gift = payment_type == "gift"

    # 1. 处理当月：赠送→gift_tokens，购买→extra_tokens（消费优先级 赠送>节余>本月>追加）
    plan_result = await db.execute(
        select(TeamMonthlyPlan).where(
            TeamMonthlyPlan.team_id == team.id,
            TeamMonthlyPlan.year_month == ym,
        )
    )
    plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()

    if not plan:
        base_limit = team.monthly_token_limit or 0
        plan = TeamMonthlyPlan(
            id=f"{team.id}-{ym}",
            team_id=team.id,
            year_month=ym,
            base_token_limit=base_limit,
            gift_tokens=amount if is_gift else 0,
            extra_tokens=0 if is_gift else amount,
            token_limit=base_limit + amount,
        )
        db.add(plan)
    else:
        if is_gift:
            prev_gift = plan.gift_tokens or 0
            plan.gift_tokens = prev_gift + amount
        else:
            prev_extra = plan.extra_tokens or 0
            plan.extra_tokens = prev_extra + amount
        plan.token_limit = (plan.base_token_limit or 0) + (plan.gift_tokens or 0) + (plan.extra_tokens or 0)

    # 2. 赠送/追加无时间限制，顺延续到所有月份（含过去、未来）
    other_plans_result = await db.execute(
        select(TeamMonthlyPlan).where(
            TeamMonthlyPlan.team_id == team.id,
            TeamMonthlyPlan.year_month != ym,
        )
    )
    for p in other_plans_result.scalars().all():
        if is_gift:
            prev_gift = p.gift_tokens or 0
            p.gift_tokens = prev_gift + amount
        else:
            prev_extra = p.extra_tokens or 0
            p.extra_tokens = prev_extra + amount
        p.token_limit = (p.base_token_limit or 0) + (p.gift_tokens or 0) + (p.extra_tokens or 0)

    payment_log = TeamPaymentLog(
        team_id=team.id,
        payment_type=payment_type,
        year_month=ym,
        amount=body.extra_tokens,
        comment=body.comment if body.comment and body.comment.strip() else None,
    )
    db.add(payment_log)

    await db.commit()

    # 返回最新详情
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=ym,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == ym,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    detail = TeamQuotaDetail(
        team_id=team.id,
        year_month=ym,
        token_limit=effective_token_limit,
        call_limit=call_limit,
        tokens_used=usage.tokens_used if usage else 0,
        calls_used=usage.calls_used if usage else 0,
    )

    return ResponseModel.success_response(
        data=detail.model_dump(),
        message="追加 token 上限成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/package",
    summary="为团队设置套餐（每月基础 token 配额 + 持续月份）",
    tags=["管理接口 > 团队管理"],
)
async def set_team_package(
    team_id: str,
    body: TeamPackageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    为团队设置一个从指定月份开始、持续若干月的套餐：
    - 套餐定义的是“每月基础 token 配额”（monthly_token_limit）；
    - 系统会为这段时间内的每个月创建或更新 TeamMonthlyPlan 记录；
    - 已存在的同一月份记录会被覆盖 token_limit（保留当月加购和用量数据）；
    - 团队的 monthly_token_limit 和 plan_expire_at 也会同步更新，便于兜底与展示。
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    # 解析起始月份
    try:
        start_year = int(body.start_year_month[:4])
        start_month = int(body.start_year_month[5:])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_year_month 格式不正确，应为 YYYY-MM，例如 2025-03",
        )

    # 为持续区间内的每个月创建/更新 TeamMonthlyPlan
    for i in range(body.duration_months):
        ym = _add_months(start_year, start_month, i)
        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == ym,
            )
        )
        plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()

        if not plan:
            plan = TeamMonthlyPlan(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
                base_token_limit=body.monthly_token_limit,
                gift_tokens=0,
                extra_tokens=0,
                token_limit=body.monthly_token_limit,
            )
            db.add(plan)
        else:
            # 签约只更新合约基础配额，保留赠送与追加配额
            plan.base_token_limit = body.monthly_token_limit
            plan.token_limit = (body.monthly_token_limit or 0) + (plan.gift_tokens or 0) + (plan.extra_tokens or 0)

    # 同步团队级别的默认 monthly_token_limit 与 plan_expire_at（套餐结束月份的最后一天）
    team.monthly_token_limit = body.monthly_token_limit

    # 计算结束月份
    end_ym = _add_months(start_year, start_month, body.duration_months - 1)
    end_year = int(end_ym[:4])
    end_month = int(end_ym[5:])
    last_day = calendar.monthrange(end_year, end_month)[1]
    team.plan_expire_at = datetime(end_year, end_month, last_day, 23, 59, 59)

    payment_log = TeamPaymentLog(
        team_id=team.id,
        payment_type="contract",
        year_month=body.start_year_month,
        amount=body.monthly_token_limit * body.duration_months,
        comment=f"签约 {body.duration_months} 个月，每月 {body.monthly_token_limit}",
    )
    db.add(payment_log)

    await db.commit()
    # 刷新 team 实例，确保 updated_at 等字段已加载，避免 MissingGreenlet
    await db.refresh(team)

    # 返回当前团队信息（附带当前月配额概览）
    team_response = TeamResponse.model_validate(team)
    now = datetime.utcnow()
    current_ym = now.strftime("%Y-%m")
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=current_ym,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == current_ym,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    team_dict = team_response.model_dump()
    team_dict["current_month_year_month"] = current_ym
    team_dict["current_month_token_limit"] = effective_token_limit
    team_dict["current_month_call_limit"] = call_limit
    team_dict["current_month_tokens_used"] = usage.tokens_used if usage else 0
    team_dict["current_month_calls_used"] = usage.calls_used if usage else 0

    return ResponseModel.success_response(
        data=team_dict,
        message="套餐设置成功",
        code=status.HTTP_200_OK,
    )


def _last_day_of_month(year: int, month: int) -> int:
    """返回某月的最后一天（正确处理闰年）"""
    return calendar.monthrange(year, month)[1]


@router.delete(
    "/teams/{team_id}/quota",
    summary="解约团队月度套餐（从最后一个月开始减少）",
    tags=["管理接口 > 团队管理"],
)
async def delete_team_monthly_plan(
    team_id: str,
    months: int = Query(1, ge=1, le=120, description="解约月数，从最后一个月开始往前数，如 3 表示解约 8、7、6 月"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    解约团队按月套餐配置（TeamMonthlyPlan）：
    - 可解约当月及未来月份，从最后一个月开始减少，例如合约 2026/3-2026/8，解约 3 个月则解约 8、7、6 月；
    - 删除后该月将回退为使用团队默认 monthly_token_limit；
    - 不会删除当月的用量统计（TeamMonthlyTokenUsage），仅影响后续配额计算；
    - 解约后自动更新团队 plan_expire_at。
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    now = datetime.utcnow()
    current_ym = now.strftime("%Y-%m")

    # 查出可解约的套餐：当月及未来月份（按时间排序）
    future_plans_result = await db.execute(
        select(TeamMonthlyPlan).where(
            TeamMonthlyPlan.team_id == team.id,
            TeamMonthlyPlan.year_month >= current_ym,
        )
    )
    future_plans = future_plans_result.scalars().all()
    future_months = sorted({p.year_month for p in future_plans})

    if not future_months:
        # 无当月及未来月份套餐，视为幂等
        return ResponseModel.success_response(
            data={"team_id": team.id, "cancelled_months": [], "remaining_months": []},
            message="无当月及未来月份套餐可解约",
            code=status.HTTP_200_OK,
        )

    # 取最后 months 个月进行解约（如 months=3 则取 8、7、6）
    to_cancel = future_months[-months:] if months <= len(future_months) else future_months
    if len(to_cancel) < months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"可解约月份仅剩 {len(future_months)} 个月，无法解约 {months} 个月",
        )

    # 解约这些月份：只清零合约基础配额，保留追加配额
    for ym in to_cancel:
        plan_result = await db.execute(
            select(TeamMonthlyPlan).where(
                TeamMonthlyPlan.team_id == team.id,
                TeamMonthlyPlan.year_month == ym,
            )
        )
        plan: Optional[TeamMonthlyPlan] = plan_result.scalar_one_or_none()
        if plan:
            payment_log = TeamPaymentLog(
                team_id=team.id,
                payment_type="cancel",
                year_month=ym,
                amount=1,
                comment=f"解约 {ym}",
            )
            db.add(payment_log)
            gift = plan.gift_tokens or 0
            extra = plan.extra_tokens or 0
            plan.base_token_limit = 0
            plan.token_limit = gift + extra
            if plan.token_limit <= 0:
                await db.delete(plan)

    # 解约后重新计算 plan_expire_at：仅当存在合约基础配额（base_token_limit > 0）的月份时才设置，仅剩追加/赠送时置空
    remaining_result = await db.execute(
        select(TeamMonthlyPlan.year_month, TeamMonthlyPlan.base_token_limit).where(
            TeamMonthlyPlan.team_id == team.id,
        )
    )
    remaining = list(remaining_result.fetchall())
    has_contract_base = any((b or 0) > 0 for _, b in remaining)
    if has_contract_base and remaining:
        remaining_months = [r[0] for r in remaining]
        max_ym = max(remaining_months)
        y, m = int(max_ym[:4]), int(max_ym[5:])
        last_day = _last_day_of_month(y, m)
        team.plan_expire_at = datetime(y, m, last_day, 23, 59, 59)
    else:
        team.plan_expire_at = None

    await db.commit()

    # 返回解约后的当前月配额详情
    ym = current_ym
    token_limit, call_limit = await TeamQuotaService._get_effective_plan_limits(
        db=db,
        team=team,
        year_month=ym,
    )
    usage_result = await db.execute(
        select(TeamMonthlyTokenUsage).where(
            TeamMonthlyTokenUsage.team_id == team.id,
            TeamMonthlyTokenUsage.year_month == ym,
        )
    )
    usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()
    effective_token_limit = token_limit
    if effective_token_limit and effective_token_limit > 0 and usage:
        effective_token_limit = effective_token_limit + (usage.rollover_from_prev_tokens or 0)

    detail = TeamQuotaDetail(
        team_id=team.id,
        year_month=ym,
        token_limit=effective_token_limit,
        call_limit=call_limit,
        tokens_used=usage.tokens_used if usage else 0,
        calls_used=usage.calls_used if usage else 0,
    )

    return ResponseModel.success_response(
        data={
            **detail.model_dump(),
            "cancelled_months": to_cancel,
            "cancelled_count": len(to_cancel),
        },
        message=f"已解约 {len(to_cancel)} 个月套餐配置",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/package-overview",
    summary="查看团队套餐区间及各月配额概览",
    tags=["管理接口 > 团队管理"],
)
async def get_team_package_overview(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    返回团队当前套餐区间（按 TeamMonthlyPlan）以及区间内每个月的配额概览：
    - start_year_month / end_year_month：从 TeamMonthlyPlan 的最小/最大 year_month 得出；
    - months：每个月的基础配额、结转、已用和生效上限。

    注意：若未配置任何 TeamMonthlyPlan，区间为空。
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

    plans_result = await db.execute(
        select(TeamMonthlyPlan).where(TeamMonthlyPlan.team_id == team.id)
    )
    plans: list[TeamMonthlyPlan] = list(plans_result.scalars().all())
    if not plans:
        overview = TeamPackageOverview(
            team_id=team.id,
            start_year_month=None,
            end_year_month=None,
            months=[],
        )
        return ResponseModel.success_response(
            data=overview.model_dump(),
            message="暂无套餐配置",
            code=status.HTTP_200_OK,
        )

    # 按 year_month 排序
    plans.sort(key=lambda p: p.year_month)
    start_ym = plans[0].year_month
    end_ym = plans[-1].year_month

    months: list[TeamPackageMonthOverview] = []
    for plan in plans:
        ym = plan.year_month
        base = plan.base_token_limit or 0
        gift = plan.gift_tokens or 0
        extra = plan.extra_tokens or 0
        raw_limit = plan.token_limit if plan.token_limit is not None else (base + gift + extra or team.monthly_token_limit)
        if raw_limit and raw_limit > 0:
            total_limit: Optional[int] = raw_limit
        else:
            total_limit = None

        usage_result = await db.execute(
            select(TeamMonthlyTokenUsage).where(
                TeamMonthlyTokenUsage.team_id == team.id,
                TeamMonthlyTokenUsage.year_month == ym,
            )
        )
        usage: Optional[TeamMonthlyTokenUsage] = usage_result.scalar_one_or_none()

        # rollover 始终动态计算，不读库中旧值（避免历史错误数据影响展示）
        rollover = await TeamQuotaService._compute_rollover_from_previous_month(
            db=db,
            team=team,
            current_year_month=ym,
        )
        tokens_used = usage.tokens_used if usage else 0

        if usage and usage.rollover_from_prev_tokens != rollover:
            # 同步修正库中旧值，保证消费逻辑与展示一致
            usage.rollover_from_prev_tokens = rollover
        elif not usage:
            # 用量记录不存在时预创建，供后续消费时使用
            usage = TeamMonthlyTokenUsage(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=rollover,
            )
            db.add(usage)

        if total_limit is not None:
            effective_limit: Optional[int] = total_limit + rollover
        else:
            effective_limit = None

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
            )
        )

    # 若预创建了用量记录，需提交以持久化
    await db.commit()

    overview = TeamPackageOverview(
        team_id=team.id,
        start_year_month=start_ym,
        end_year_month=end_ym,
        months=months,
    )

    return ResponseModel.success_response(
        data=overview.model_dump(),
        message="获取套餐区间成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/payment-logs",
    summary="获取团队缴费日志",
    tags=["管理接口 > 团队管理"],
)
async def get_team_payment_logs(
    team_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队的缴费日志（续约、签约、赠送、购买、解约）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    result = await db.execute(
        select(TeamPaymentLog)
        .where(TeamPaymentLog.team_id == team_id)
        .order_by(TeamPaymentLog.created_at.desc())
        .limit(limit)
    )
    logs = list(result.scalars().all())
    items = [TeamPaymentLogItem.model_validate(log) for log in logs]
    return ResponseModel.success_response(
        data={"items": [i.model_dump() for i in items]},
        message="获取缴费日志成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage/daily",
    summary="获取团队按日用量（折线图）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_daily(
    team_id: str,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """按 usage_date 聚合团队用量，返回 [{date, tokens_used}]，用于折线图"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

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
    rows = result.fetchall()
    items = [TeamUsageDailyItem(date=r[0], tokens_used=r[1] or 0) for r in rows]
    return ResponseModel.success_response(
        data={"items": [i.model_dump() for i in items]},
        message="获取按日用量成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage/by-business",
    summary="获取团队按业务用量（饼图）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_by_business(
    team_id: str,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """按 business_name 聚合团队用量，business_name 为空时用 usage_type 描述，返回 [{business_name, tokens_used}]"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

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
    rows = result.fetchall()
    items = []
    for r in rows:
        bn = r[0]
        if bn and bn.isdigit():
            bn = usage_type_labels.get(int(bn), f"类型{bn}")
        elif not bn:
            bn = "未知"
        items.append(TeamUsageByBusinessItem(business_name=bn, tokens_used=r[1] or 0))
    return ResponseModel.success_response(
        data={"items": [i.model_dump() for i in items]},
        message="获取按业务用量成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage-logs",
    summary="获取团队用量日志（分页）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_logs(
    team_id: str,
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=500, description="每页数量"),
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则返回全部"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    business_name: Optional[str] = Query(None, description="按业务名称筛选"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队的用量日志（分页，支持日期范围、业务筛选）"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    q = select(TeamUsageLog).where(TeamUsageLog.team_id == team_id)
    if year_month:
        q = q.where(TeamUsageLog.year_month == year_month)
    if start_date:
        q = q.where(TeamUsageLog.usage_date >= start_date)
    if end_date:
        q = q.where(TeamUsageLog.usage_date <= end_date)
    if business_name:
        q = q.where(TeamUsageLog.business_name == business_name)
    q = q.order_by(TeamUsageLog.usage_date.desc(), TeamUsageLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    logs = list(result.scalars().all())
    items = [TeamUsageLogItem.model_validate(log) for log in logs]

    # 获取总数
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

    return ResponseModel.success_response(
        data={
            "items": [i.model_dump() for i in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        message="获取用量日志成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/quota/reset-current-month",
    summary="重置团队当月用量（tokens_used、calls_used 归零）",
    tags=["管理接口 > 团队管理"],
)
async def reset_team_current_month_usage(
    team_id: str,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，默认当月"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """重置指定团队某月的用量统计，便于测试或修正数据。仅影响 tokens_used、calls_used。"""
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")
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
    return ResponseModel.success_response(
        data={"team_id": team_id, "year_month": ym, "tokens_used": 0, "calls_used": 0},
        message=f"已重置 {ym} 用量",
        code=status.HTTP_200_OK,
    )


@router.delete(
    "/teams/{team_id}/logs",
    summary="清空团队历史记录（可选完整重置合约）",
    tags=["管理接口 > 团队管理"],
)
async def clear_team_logs(
    team_id: str,
    full_reset: bool = Query(
        False,
        description="为 true 时同时删除合约和用量统计，团队将无合约",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    清空指定团队的记录。不可恢复。
    - 默认：仅清空缴费日志、用量日志
    - full_reset=true：同时删除所有月度套餐(TeamMonthlyPlan)、月度用量(TeamMonthlyTokenUsage)，清除 plan_expire_at、monthly_token_limit，团队将无合约
    """
    team = await TeamService.get_team_by_id(db, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="团队不存在")

    cleared = ["payment_logs", "usage_logs"]
    await db.execute(delete(TeamPaymentLog).where(TeamPaymentLog.team_id == team_id))
    await db.execute(delete(TeamUsageLog).where(TeamUsageLog.team_id == team_id))

    if full_reset:
        await db.execute(delete(TeamMonthlyPlan).where(TeamMonthlyPlan.team_id == team_id))
        await db.execute(
            delete(TeamMonthlyTokenUsage).where(TeamMonthlyTokenUsage.team_id == team_id)
        )
        team.plan_expire_at = None
        team.monthly_token_limit = None
        cleared.extend(["monthly_plans", "monthly_token_usage", "plan_expire_at", "monthly_token_limit"])

    await db.commit()

    return ResponseModel.success_response(
        data={"team_id": team_id, "cleared": cleared},
        message="已清空该团队所有历史记录" + ("，并解除合约" if full_reset else ""),
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/seed-rollover-test",
    summary="创建结余测试数据（1月、2月各1 token，2月结余1）",
    tags=["管理接口 > 团队管理"],
)
async def seed_rollover_test_data(
    team_id: Optional[str] = Query(None, description="团队 ID，与 team_name 二选一"),
    team_name: Optional[str] = Query(None, description="团队名称（模糊匹配），与 team_id 二选一"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    为指定团队创建带结余的测试数据，用于验证「上月结余」展示：
    - 2026-01: 1 token 套餐，0 已用
    - 2026-02: 1 token 套餐，0 已用，结余 1（来自 1 月未用完）
    """
    if team_id:
        team = await TeamService.get_team_by_id(db, team_id)
    elif team_name:
        result = await db.execute(
            select(Team).where(Team.name.ilike(f"%{team_name}%")).limit(1)
        )
        team = result.scalar_one_or_none()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请提供 team_id 或 team_name",
        )
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="团队不存在",
        )

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
            plan = TeamMonthlyPlan(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
                base_token_limit=1,
                gift_tokens=0,
                extra_tokens=0,
                token_limit=1,
            )
            db.add(plan)

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
            usage = TeamMonthlyTokenUsage(
                id=f"{team.id}-{ym}",
                team_id=team.id,
                year_month=ym,
                tokens_used=0,
                calls_used=0,
                rollover_from_prev_tokens=rollover,
            )
            db.add(usage)

    team.monthly_token_limit = 1
    team.plan_expire_at = datetime(2026, 2, 28, 23, 59, 59)

    await db.commit()

    return ResponseModel.success_response(
        data={
            "team_id": team.id,
            "team_name": team.name,
            "months": [
                {"year_month": "2026-01", "base": 1, "tokens_used": 0, "rollover": 0},
                {"year_month": "2026-02", "base": 1, "tokens_used": 0, "rollover": 1},
            ],
        },
        message="结余测试数据已创建，2 月应显示结余 1",
        code=status.HTTP_200_OK,
    )
