"""
Admin 团队管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated, Optional
from datetime import datetime

# team_id 路径参数：UUID 格式校验，非法格式返回 422 避免无效 DB 查询
TEAM_ID_PATH = Annotated[
    str,
    Path(..., pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]

from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_superuser, require_permission
from app.services.team_service import TeamService
from app.services.team_admin_service import TeamAdminService
from app.schemas.team import (
    TeamCreate,
    TeamUpdate,
    TeamResponse,
    TeamQuotaUpdateRequest,
    TeamQuotaTopupRequest,
    TeamPackageRequest,
)
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
            data=team_response.model_dump(by_alias=True),
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
        member_count = await TeamService.get_team_member_count(db, team.code)
        team_resp = await TeamQuotaService.enrich_team_response(
            db=db,
            team=team,
            year_month=year_month,
            team_response=team_resp,
            apply_plans_check=True,
        )
        team_dict = team_resp.model_dump(by_alias=True)
        team_dict["member_count"] = member_count
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

    now = datetime.utcnow()
    year_month = now.strftime("%Y-%m")
    team_response = await TeamQuotaService.enrich_team_response(
        db=db,
        team=team,
        year_month=year_month,
        team_response=TeamResponse.model_validate(team),
    )
    breakdown = await TeamQuotaService.get_current_month_breakdown(
        db=db, team=team, year_month=year_month
    )
    team_dict = team_response.model_dump(by_alias=True)
    team_dict["current_month_breakdown"] = breakdown

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
    items, total = await TeamAdminService.get_team_usage_logs(
        db, team.id, skip, limit, year_month, start_date, end_date, business_name
    )
    return ResponseModel.success_response(
        data={"items": items, "total": total, "skip": skip, "limit": limit},
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
        data=team_response.model_dump(by_alias=True),
        message="重置认证码成功",
        code=status.HTTP_200_OK
    )


@router.get("/teams/{team_id}", summary="获取团队详情", tags=["管理接口 > 团队管理"])
async def get_team(
    team_id: TEAM_ID_PATH,
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
    
    now = datetime.utcnow()
    year_month = now.strftime("%Y-%m")
    team_response = await TeamQuotaService.enrich_team_response(
        db=db,
        team=team,
        year_month=year_month,
        team_response=TeamResponse.model_validate(team),
        apply_plans_check=True,
    )
    return ResponseModel.success_response(
        data=team_response.model_dump(by_alias=True),
        message="获取团队详情成功",
        code=status.HTTP_200_OK
    )


@router.put("/teams/{team_id}", summary="更新团队", tags=["管理接口 > 团队管理"])
async def update_team(
    team_id: TEAM_ID_PATH,
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
            data=team_response.model_dump(by_alias=True),
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
    team_id: TEAM_ID_PATH,
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
    team_id: TEAM_ID_PATH,
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
    team_id: TEAM_ID_PATH,
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


@router.get(
    "/teams/{team_id}/quota",
    summary="查看团队某月配额与用量",
    tags=["管理接口 > 团队管理"],
)
async def get_team_quota_detail(
    team_id: TEAM_ID_PATH,
    year_month: Optional[str] = Query(
        None,
        description="月份，格式 YYYY-MM；为空表示当前月",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """查看指定团队在某个月的 token / 调用次数配额与用量。"""
    data = await TeamAdminService.get_team_quota_detail(db, team_id, year_month)
    return ResponseModel.success_response(
        data=data,
        message="获取团队配额详情成功",
        code=status.HTTP_200_OK,
    )


@router.put(
    "/teams/{team_id}/quota",
    summary="编辑团队某月套餐",
    tags=["管理接口 > 团队管理"],
)
async def update_team_quota(
    team_id: TEAM_ID_PATH,
    body: TeamQuotaUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    编辑团队在某个月的套餐：
    - 若该月无单独套餐记录，则创建一条 TeamMonthlyPlan 作为覆盖；
    - 若已存在，则仅更新传入的字段（token_limit / call_limit）。
    """
    data = await TeamAdminService.update_team_quota(
        db, team_id, body.year_month, body.token_limit, body.call_limit
    )
    return ResponseModel.success_response(
        data=data,
        message="更新团队套餐成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/quota/topup",
    summary="为团队某月套餐追加积点上限",
    tags=["管理接口 > 团队管理"],
)
async def topup_team_quota_tokens(
    team_id: TEAM_ID_PATH,
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
    data = await TeamAdminService.topup_team_quota_tokens(
        db, team_id, body.year_month, body.extra_tokens, body.type, body.comment
    )
    return ResponseModel.success_response(
        data=data,
        message="追加积点上限成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/package",
    summary="为团队设置套餐（每月基础 token 配额 + 持续月份）",
    tags=["管理接口 > 团队管理"],
)
async def set_team_package(
    team_id: TEAM_ID_PATH,
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
    data = await TeamAdminService.set_team_package(
        db, team_id, body.start_year_month, body.duration_months, body.monthly_token_limit
    )
    return ResponseModel.success_response(
        data=data,
        message="套餐设置成功",
        code=status.HTTP_200_OK,
    )


@router.delete(
    "/teams/{team_id}/quota",
    summary="解约团队月度套餐（从最后一个月开始减少）",
    tags=["管理接口 > 团队管理"],
)
async def delete_team_monthly_plan(
    team_id: TEAM_ID_PATH,
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
    data = await TeamAdminService.delete_team_monthly_plan(db, team_id, months)
    return ResponseModel.success_response(
        data=data,
        message=f"已解约 {data.get('cancelled_count', 0)} 个月套餐配置",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/package-overview",
    summary="查看团队套餐区间及各月配额概览",
    tags=["管理接口 > 团队管理"],
)
async def get_team_package_overview(
    team_id: TEAM_ID_PATH,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """
    返回团队当前套餐区间（按 TeamMonthlyPlan）以及区间内每个月的配额概览：
    - start_year_month / end_year_month：从 TeamMonthlyPlan 的最小/最大 year_month 得出；
    - months：每个月的基础配额、结转、已用和生效上限。

    注意：若未配置任何 TeamMonthlyPlan，区间为空。
    """
    data = await TeamAdminService.get_team_package_overview(db, team_id)
    return ResponseModel.success_response(
        data=data,
        message="获取套餐区间成功" if data.get("months") else "暂无套餐配置",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/payment-logs",
    summary="获取团队缴费日志",
    tags=["管理接口 > 团队管理"],
)
async def get_team_payment_logs(
    team_id: TEAM_ID_PATH,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """获取团队的缴费日志（续约、签约、赠送、购买、解约）"""
    items = await TeamAdminService.get_team_payment_logs(db, team_id, limit)
    return ResponseModel.success_response(
        data={"items": items},
        message="获取缴费日志成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage/daily",
    summary="获取团队按日用量（折线图）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_daily(
    team_id: TEAM_ID_PATH,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """按 usage_date 聚合团队用量，返回 [{date, tokens_used}]，用于折线图"""
    items = await TeamAdminService.get_team_usage_daily(db, team_id, year_month, start_date, end_date)
    return ResponseModel.success_response(
        data={"items": items},
        message="获取按日用量成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage/by-business",
    summary="获取团队按业务用量（饼图）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_by_business(
    team_id: TEAM_ID_PATH,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，为空则取当前月"),
    start_date: Optional[str] = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """按 business_name 聚合团队用量，business_name 为空时用 usage_type 描述，返回 [{business_name, tokens_used}]"""
    items = await TeamAdminService.get_team_usage_by_business(db, team_id, year_month, start_date, end_date)
    return ResponseModel.success_response(
        data={"items": items},
        message="获取按业务用量成功",
        code=status.HTTP_200_OK,
    )


@router.get(
    "/teams/{team_id}/usage-logs",
    summary="获取团队用量日志（分页）",
    tags=["管理接口 > 团队管理"],
)
async def get_team_usage_logs(
    team_id: TEAM_ID_PATH,
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
    items, total = await TeamAdminService.get_team_usage_logs(
        db, team_id, skip, limit, year_month, start_date, end_date, business_name
    )
    return ResponseModel.success_response(
        data={"items": items, "total": total, "skip": skip, "limit": limit},
        message="获取用量日志成功",
        code=status.HTTP_200_OK,
    )


@router.post(
    "/teams/{team_id}/quota/reset-current-month",
    summary="重置团队当月用量（tokens_used、calls_used 归零）",
    tags=["管理接口 > 团队管理"],
)
async def reset_team_current_month_usage(
    team_id: TEAM_ID_PATH,
    year_month: Optional[str] = Query(None, description="月份 YYYY-MM，默认当月"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_superuser),
):
    """重置指定团队某月的用量统计，便于测试或修正数据。仅影响 tokens_used、calls_used。"""
    data = await TeamAdminService.reset_team_current_month_usage(db, team_id, year_month)
    return ResponseModel.success_response(
        data=data,
        message=f"已重置 {data['year_month']} 用量",
        code=status.HTTP_200_OK,
    )


@router.delete(
    "/teams/{team_id}/logs",
    summary="清空团队历史记录（可选完整重置合约）",
    tags=["管理接口 > 团队管理"],
)
async def clear_team_logs(
    team_id: TEAM_ID_PATH,
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
    data = await TeamAdminService.clear_team_logs(db, team_id, full_reset)
    return ResponseModel.success_response(
        data=data,
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
    data = await TeamAdminService.seed_rollover_test_data(db, team_id, team_name)
    return ResponseModel.success_response(
        data=data,
        message="结余测试数据已创建，2 月应显示结余 1",
        code=status.HTTP_200_OK,
    )
