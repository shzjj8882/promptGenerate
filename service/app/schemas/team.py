"""
团队相关 Schema
平台配额单位使用 points（积点），与第三方 LLM token 区分。
"""
import enum
from pydantic import BaseModel, ConfigDict, Field, AliasChoices
from typing import Optional, List, Literal
from datetime import datetime


class PaymentType(str, enum.Enum):
    """缴费记录类型枚举"""

    GIFT = "gift"
    PURCHASE = "purchase"
    CONTRACT = "contract"
    RENEWAL = "renewal"
    CANCEL = "cancel"


class TeamBase(BaseModel):
    """团队基础模型"""
    code: str = Field(..., min_length=2, max_length=50, description="团队代码（唯一标识）")
    name: str = Field(..., min_length=1, max_length=100, description="团队名称")
    description: Optional[str] = Field(None, max_length=500, description="团队描述")


class TeamCreate(BaseModel):
    """创建团队请求模型"""
    code: str = Field(..., min_length=2, max_length=50, description="团队代码（唯一标识）")
    name: str = Field(..., min_length=1, max_length=100, description="团队名称")
    description: Optional[str] = Field(None, max_length=500, description="团队描述")
    # 套餐有效期（按月）：前端可按“年-月”选择，后端存具体时间
    plan_expire_at: Optional[datetime] = Field(
        None,
        description="团队套餐有效期（精确到月，例如当月最后一天 23:59:59）",
    )
    # 每月积点上限（为空或 <=0 表示不限制）
    monthly_token_limit: Optional[int] = Field(
        None,
        ge=0,
        serialization_alias="monthly_points_limit",
        validation_alias="monthly_points_limit",
        description="每月积点消耗上限（为空或 0 表示不限制）",
    )


class TeamUpdate(BaseModel):
    """更新团队请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="团队名称")
    is_active: Optional[bool] = Field(None, description="是否激活")
    plan_expire_at: Optional[datetime] = Field(
        None,
        description="团队套餐有效期（精确到月，例如当月最后一天 23:59:59）",
    )
    monthly_token_limit: Optional[int] = Field(
        None,
        ge=0,
        serialization_alias="monthly_points_limit",
        validation_alias="monthly_points_limit",
        description="每月积点消耗上限（为空或 0 表示不限制）",
    )


class TeamResponse(TeamBase):
    """团队响应模型"""
    id: str
    authcode: Optional[str] = None  # API 认证码（用于调用 /api 接口）
    is_active: bool
    is_system_admin_team: bool = False  # 是否为系统管理员团队
    member_count: Optional[int] = None  # 团队成员数量（可选，由接口填充）
    plan_expire_at: Optional[datetime] = None
    monthly_token_limit: Optional[int] = Field(
        None,
        serialization_alias="monthly_points_limit",
        validation_alias="monthly_points_limit",
    )
    # 当前月份配额与用量信息（可选，由接口填充）
    current_month_year_month: Optional[str] = Field(
        None, description="当前月份标识，格式 YYYY-MM"
    )
    current_month_token_limit: Optional[int] = Field(
        None,
        serialization_alias="current_month_points_limit",
        validation_alias="current_month_points_limit",
        description="当前月份生效的积点上限（考虑按月套餐覆盖）",
    )
    current_month_call_limit: Optional[int] = Field(
        None, description="当前月份生效的调用次数上限"
    )
    current_month_tokens_used: Optional[int] = Field(
        None,
        serialization_alias="current_month_points_used",
        validation_alias="current_month_points_used",
        description="当前月份已消耗的积点数量",
    )
    current_month_calls_used: Optional[int] = Field(
        None, description="当前月份已调用的次数"
    )
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TeamQuotaDetail(BaseModel):
    """团队某月配额详情"""

    team_id: str
    year_month: str = Field(..., description="月份，格式 YYYY-MM")
    token_limit: Optional[int] = Field(
        None,
        serialization_alias="points_limit",
        validation_alias=AliasChoices("points_limit", "token_limit"),
        description="该月积点上限（为空或 <=0 表示不限制）",
    )
    call_limit: Optional[int] = Field(
        None, description="该月调用次数上限（为空或 <=0 表示不限制）"
    )
    tokens_used: int = Field(
        0,
        serialization_alias="points_used",
        validation_alias=AliasChoices("points_used", "tokens_used"),
        description="该月已消耗积点数量",
    )
    calls_used: int = Field(0, description="该月已调用次数")


class TeamQuotaUpdateRequest(BaseModel):
    """更新团队某月套餐请求"""

    year_month: Optional[str] = Field(
        None,
        description="月份，格式 YYYY-MM；为空表示当前月",
    )
    token_limit: Optional[int] = Field(
        None,
        ge=0,
        validation_alias=AliasChoices("points_limit", "token_limit"),
        description="该月积点上限；为空表示不变，0 表示不限制",
    )
    call_limit: Optional[int] = Field(
        None,
        ge=0,
        description="该月调用次数上限；为空表示不变，0 表示不限制",
    )


class TeamQuotaTopupRequest(BaseModel):
    """为某月套餐增加积点上限请求"""

    year_month: Optional[str] = Field(
        None,
        description="月份，格式 YYYY-MM；为空表示当前月",
    )
    extra_tokens: int = Field(
        ...,
        gt=0,
        validation_alias=AliasChoices("extra_points", "extra_tokens"),
        description="追加的积点数量，会在当前生效上限基础上增加",
    )
    type: Literal["gift", "purchase"] = Field(
        "purchase",
        description="类型：gift=赠送, purchase=购买",
    )
    comment: Optional[str] = Field(
        None,
        description="备注说明",
    )


class TeamPackageRequest(BaseModel):
    """为团队设置套餐（按月基础积点配额 + 持续月份）"""

    monthly_token_limit: int = Field(
        ...,
        ge=0,
        validation_alias=AliasChoices("monthly_points_limit", "monthly_token_limit"),
        description="每月基础积点配额（0 表示不限制）",
    )
    start_year_month: str = Field(
        ...,
        description="套餐起始月份，格式 YYYY-MM，例如 2025-03",
    )
    duration_months: int = Field(
        ...,
        ge=1,
        le=60,
        description="套餐持续月份数，例如 6 表示 6 个月",
    )


class TeamPaymentLogItem(BaseModel):
    """缴费日志单项"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    payment_type: PaymentType
    year_month: Optional[str]
    amount: int
    comment: Optional[str]
    created_at: datetime


class TeamUsageLogItem(BaseModel):
    """用量日志单项"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    usage_type: int
    business_name: Optional[str] = None
    usage_date: str
    year_month: str
    tokens_used: int = Field(0, serialization_alias="points_used", validation_alias=AliasChoices("points_used", "tokens_used"))
    calls_count: int
    extra_info: Optional[str] = None
    created_at: datetime


class TeamUsageDailyItem(BaseModel):
    """按日用量（折线图）"""

    date: str = Field(..., description="日期 YYYY-MM-DD")
    tokens_used: int = Field(
        0,
        serialization_alias="points_used",
        validation_alias=AliasChoices("points_used", "tokens_used"),
        description="该日消耗的积点数量",
    )


class TeamUsageByBusinessItem(BaseModel):
    """按业务用量（饼图）"""

    business_name: str = Field(..., description="业务名称（business_name 为空时用 usage_type 描述）")
    tokens_used: int = Field(
        0,
        serialization_alias="points_used",
        validation_alias=AliasChoices("points_used", "tokens_used"),
        description="该业务消耗的积点数量",
    )


class TeamPackageMonthOverview(BaseModel):
    """套餐区间内单个月份的配额概览。消费优先级：赠送 > 节余 > 本月 > 追加"""

    year_month: str = Field(..., description="月份，格式 YYYY-MM")
    base_token_limit: Optional[int] = Field(
        None,
        serialization_alias="base_points_limit",
        validation_alias=AliasChoices("base_points_limit", "base_token_limit"),
        description="该月积点总配额（合约+赠送+追加，<=0 或 None 表示不限）",
    )
    gift_tokens: int = Field(
        0,
        serialization_alias="gift_points",
        validation_alias=AliasChoices("gift_points", "gift_tokens"),
        description="赠送配额，消费优先",
    )
    extra_tokens: int = Field(
        0,
        serialization_alias="extra_points",
        validation_alias=AliasChoices("extra_points", "extra_tokens"),
        description="追加配额，消费最后",
    )
    effective_token_limit: Optional[int] = Field(
        None,
        serialization_alias="effective_points_limit",
        validation_alias=AliasChoices("effective_points_limit", "effective_token_limit"),
        description="该月生效的积点上限（总配额 + 上月结转，<=0 或 None 表示不限）",
    )
    tokens_used: int = Field(
        0,
        serialization_alias="points_used",
        validation_alias=AliasChoices("points_used", "tokens_used"),
        description="该月已消耗积点数量",
    )
    rollover_from_prev_tokens: int = Field(
        0,
        serialization_alias="rollover_from_prev_points",
        validation_alias=AliasChoices("rollover_from_prev_points", "rollover_from_prev_tokens"),
        description="该月从上一自然月结转而来的积点数量",
    )
    # 消费分项（按优先级记录，后端持久化）
    gift_tokens_used: int = Field(
        0,
        serialization_alias="gift_points_used",
        validation_alias=AliasChoices("gift_points_used", "gift_tokens_used"),
        description="赠送已消耗",
    )
    rollover_tokens_used: int = Field(
        0,
        serialization_alias="rollover_points_used",
        validation_alias=AliasChoices("rollover_points_used", "rollover_tokens_used"),
        description="结余已消耗",
    )
    base_tokens_used: int = Field(
        0,
        serialization_alias="base_points_used",
        validation_alias=AliasChoices("base_points_used", "base_tokens_used"),
        description="套餐已消耗",
    )
    extra_tokens_used: int = Field(
        0,
        serialization_alias="extra_points_used",
        validation_alias=AliasChoices("extra_points_used", "extra_tokens_used"),
        description="追加已消耗",
    )


class TeamPackageOverview(BaseModel):
    """团队套餐区间汇总"""

    team_id: str
    start_year_month: Optional[str] = Field(
        None, description="套餐区间起始月份，格式 YYYY-MM；无套餐时为 None"
    )
    end_year_month: Optional[str] = Field(
        None, description="套餐区间结束月份，格式 YYYY-MM；无套餐时为 None"
    )
    months: List[TeamPackageMonthOverview] = Field(
        default_factory=list, description="区间内各月份配额概览"
    )
