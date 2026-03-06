/**
 * 团队管理相关 API
 */

import { apiRequest, ApiError } from "./config";

/**
 * 团队信息
 */
export interface Team {
  id: string;
  code: string;
  name: string;
  description?: string;
  authcode?: string; // API 认证码（用于调用 /api 接口）
  is_active: boolean;
  member_count?: number; // 团队成员数量
  // 订阅与配额信息
  plan_expire_at?: string | null;
  monthly_token_limit?: number | null;
  // 当前月份配额与用量概览（后端附带）
  current_month_year_month?: string;
  current_month_token_limit?: number | null;
  current_month_call_limit?: number | null;
  current_month_tokens_used?: number;
  current_month_calls_used?: number;
  /** 三张统计卡片分项：套餐状态、套餐外额度、上月结余 */
  current_month_breakdown?: {
    year_month: string;
    base_token_limit: number;
    gift_tokens: number;
    extra_tokens: number;
    rollover_from_prev_tokens: number;
    tokens_used: number;
    gift_tokens_used: number;
    rollover_tokens_used: number;
    base_tokens_used: number;
    extra_tokens_used: number;
  };
  created_at: string;
  updated_at: string;
}

export interface TeamQuotaDetail {
  team_id: string;
  year_month: string;
  token_limit: number | null;
  call_limit: number | null;
  tokens_used: number;
  calls_used: number;
}

export interface TeamQuotaUpdateRequest {
  year_month?: string; // YYYY-MM，默认当前月
  token_limit?: number; // 为空不变，0 表示不限制
  call_limit?: number; // 为空不变，0 表示不限制
}

export interface TeamQuotaTopupRequest {
  year_month?: string; // YYYY-MM，默认当前月
  extra_tokens: number; // >0
  type?: "gift" | "purchase"; // 赠送 | 购买
  comment?: string; // 备注说明
}

export interface TeamPackageRequest {
  monthly_token_limit: number; // 每月基础 token 配额
  start_year_month: string; // 套餐起始月份 YYYY-MM
  duration_months: number; // 套餐持续月份数
}

export interface DeleteTeamMonthlyPlanParams {
  months: number; // 解约月数，从最后一个月开始往前数，如 3 表示解约 8、7、6 月
}

export interface TeamPackageMonthOverview {
  year_month: string;
  base_token_limit: number | null;
  gift_tokens?: number;
  extra_tokens?: number;
  effective_token_limit: number | null;
  tokens_used: number;
  rollover_from_prev_tokens: number;
  /** 消费分项（后端按优先级记录） */
  gift_tokens_used?: number;
  rollover_tokens_used?: number;
  base_tokens_used?: number;
  extra_tokens_used?: number;
}

export interface TeamPackageOverview {
  team_id: string;
  start_year_month: string | null;
  end_year_month: string | null;
  months: TeamPackageMonthOverview[];
}

/**
 * 创建团队请求参数
 */
export interface TeamCreate {
  code: string;
  name: string;
}

/**
 * 更新团队请求参数
 */
export interface TeamUpdate {
  name?: string;
  is_active?: boolean;
}

/**
 * 团队成员信息
 */
export interface TeamMember {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_team_admin: boolean;
  is_superuser: boolean;
  created_at: string;
}

/**
 * 团队成员列表响应
 */
export interface TeamMembersResponse {
  items: TeamMember[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 团队列表响应
 */
export interface TeamsResponse {
  items: Team[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 获取团队列表
 */
export async function getTeams(params?: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
}): Promise<TeamsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/teams${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<TeamsResponse>(path);
}

/**
 * 获取单个团队
 */
export async function getTeam(teamId: string): Promise<Team> {
  return apiRequest<Team>(`/admin/teams/${teamId}`);
}

/**
 * 获取团队某月配额详情
 */
export async function getTeamQuota(
  teamId: string,
  params?: { year_month?: string }
): Promise<TeamQuotaDetail> {
  const queryParams = new URLSearchParams();
  if (params?.year_month) queryParams.append("year_month", params.year_month);
  const queryString = queryParams.toString();
  const path = `/admin/teams/${teamId}/quota${queryString ? `?${queryString}` : ""}`;
  return apiRequest<TeamQuotaDetail>(path);
}

/**
 * 编辑团队某月套餐
 */
export async function updateTeamQuota(
  teamId: string,
  body: TeamQuotaUpdateRequest
): Promise<TeamQuotaDetail> {
  return apiRequest<TeamQuotaDetail>(`/admin/teams/${teamId}/quota`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * 为团队某月追加 token 上限
 */
export async function topupTeamQuotaTokens(
  teamId: string,
  body: TeamQuotaTopupRequest
): Promise<TeamQuotaDetail> {
  return apiRequest<TeamQuotaDetail>(`/admin/teams/${teamId}/quota/topup`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * 为团队设置套餐（每月基础 token 配额 + 持续月份）
 */
export async function setTeamPackage(
  teamId: string,
  body: TeamPackageRequest
): Promise<Team> {
  return apiRequest<Team>(`/admin/teams/${teamId}/package`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * 获取团队套餐区间及各月配额概览
 */
export async function getTeamPackageOverview(
  teamId: string
): Promise<TeamPackageOverview> {
  return apiRequest<TeamPackageOverview>(`/admin/teams/${teamId}/package-overview`);
}

/**
 * 获取团队缴费日志
 */
export interface TeamPaymentLogItem {
  id: string;
  team_id: string;
  payment_type: string;
  year_month: string | null;
  amount: number;
  comment: string | null;
  created_at: string;
}

export async function getTeamPaymentLogs(
  teamId: string,
  params?: { limit?: number }
): Promise<{ items: TeamPaymentLogItem[] }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append("limit", params.limit.toString());
  const qs = queryParams.toString();
  const res = await apiRequest<{ items?: TeamPaymentLogItem[] } | { data?: { items?: TeamPaymentLogItem[] } }>(
    `/admin/teams/${teamId}/payment-logs${qs ? `?${qs}` : ""}`
  );
  const items = Array.isArray(res?.items)
    ? res.items
    : Array.isArray((res as { data?: { items?: TeamPaymentLogItem[] } })?.data?.items)
      ? (res as { data: { items: TeamPaymentLogItem[] } }).data.items
      : [];
  return { items };
}

/**
 * 获取团队用量日志
 */
export interface TeamUsageLogItem {
  id: string;
  team_id: string;
  usage_type: number;
  usage_date: string;
  year_month: string;
  tokens_used: number;
  calls_count: number;
  extra_info: string | null;
  business_name?: string | null;
  created_at: string;
}

/** 按日用量（折线图） */
export interface TeamUsageDailyItem {
  date: string;
  tokens_used: number;
}

/** 按业务用量（饼图） */
export interface TeamUsageByBusinessItem {
  business_name: string;
  tokens_used: number;
}

/** 获取当前团队按日用量（折线图） */
export async function getMyTeamUsageDaily(params?: {
  year_month?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ items: TeamUsageDailyItem[] }> {
  const q = new URLSearchParams();
  if (params?.year_month) q.append("year_month", params.year_month);
  if (params?.start_date) q.append("start_date", params.start_date);
  if (params?.end_date) q.append("end_date", params.end_date);
  const res = await apiRequest<{ items?: TeamUsageDailyItem[] }>(
    `/admin/teams/my-team/usage/daily${q.toString() ? `?${q}` : ""}`
  );
  return { items: res?.items ?? [] };
}

/** 获取当前团队按业务用量（饼图） */
export async function getMyTeamUsageByBusiness(params?: {
  year_month?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ items: TeamUsageByBusinessItem[] }> {
  const q = new URLSearchParams();
  if (params?.year_month) q.append("year_month", params.year_month);
  if (params?.start_date) q.append("start_date", params.start_date);
  if (params?.end_date) q.append("end_date", params.end_date);
  const res = await apiRequest<{ items?: TeamUsageByBusinessItem[] }>(
    `/admin/teams/my-team/usage/by-business${q.toString() ? `?${q}` : ""}`
  );
  return { items: res?.items ?? [] };
}

/** 获取当前团队用量日志（分页） */
export async function getMyTeamUsageLogs(params?: {
  skip?: number;
  limit?: number;
  year_month?: string;
  start_date?: string;
  end_date?: string;
  business_name?: string;
}): Promise<{ items: TeamUsageLogItem[]; total: number; skip: number; limit: number }> {
  const q = new URLSearchParams();
  if (params?.skip != null) q.append("skip", String(params.skip));
  if (params?.limit != null) q.append("limit", String(params.limit));
  if (params?.year_month) q.append("year_month", params.year_month);
  if (params?.start_date) q.append("start_date", params.start_date);
  if (params?.end_date) q.append("end_date", params.end_date);
  if (params?.business_name) q.append("business_name", params.business_name);
  const res = await apiRequest<{ items?: TeamUsageLogItem[]; total?: number; skip?: number; limit?: number }>(
    `/admin/teams/my-team/usage-logs${q.toString() ? `?${q}` : ""}`
  );
  return {
    items: res?.items ?? [],
    total: res?.total ?? 0,
    skip: res?.skip ?? 0,
    limit: res?.limit ?? 100,
  };
}

export async function getTeamUsageLogs(
  teamId: string,
  params?: { year_month?: string; usage_date?: string; limit?: number }
): Promise<{ items: TeamUsageLogItem[] }> {
  const queryParams = new URLSearchParams();
  if (params?.year_month) queryParams.append("year_month", params.year_month);
  if (params?.usage_date) queryParams.append("usage_date", params.usage_date);
  if (params?.limit) queryParams.append("limit", params.limit.toString());
  const qs = queryParams.toString();
  const res = await apiRequest<{ items?: TeamUsageLogItem[] }>(
    `/admin/teams/${teamId}/usage-logs${qs ? `?${qs}` : ""}`
  );
  return { items: res?.items ?? [] };
}

/**
 * 解约团队月度套餐（从最后一个月开始减少）
 */
export async function deleteTeamMonthlyPlan(
  teamId: string,
  params: DeleteTeamMonthlyPlanParams
): Promise<TeamQuotaDetail & { cancelled_months?: string[]; cancelled_count?: number }> {
  const queryParams = new URLSearchParams();
  queryParams.append("months", String(params.months));
  const queryString = queryParams.toString();
  const path = `/admin/teams/${teamId}/quota${queryString ? `?${queryString}` : ""}`;
  return apiRequest(path, {
    method: "DELETE",
  });
}

/**
 * 创建团队
 */
export async function createTeam(data: TeamCreate): Promise<Team> {
  return apiRequest<Team>("/admin/teams", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新团队
 */
export async function updateTeam(teamId: string, data: TeamUpdate): Promise<Team> {
  return apiRequest<Team>(`/admin/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除团队
 */
export async function deleteTeam(teamId: string): Promise<void> {
  return apiRequest<void>(`/admin/teams/${teamId}`, {
    method: "DELETE",
  });
}

/**
 * 重置团队认证码（仅系统管理员）
 */
export async function resetTeamAuthcode(teamId: string): Promise<Team> {
  return apiRequest<Team>(`/admin/teams/${teamId}/reset-authcode`, {
    method: "POST",
  });
}

/**
 * 重置当前用户的团队认证码（普通用户可调用）
 */
export async function resetMyTeamAuthcode(): Promise<Team> {
  return apiRequest<Team>("/admin/teams/my-team/reset-authcode", {
    method: "POST",
  });
}

/**
 * 获取当前用户的团队信息
 */
export async function getMyTeam(): Promise<Team> {
  return apiRequest<Team>("/admin/teams/my-team");
}

/**
 * 获取团队成员列表
 */
export async function getTeamMembers(
  teamId: string,
  params?: {
    skip?: number;
    limit?: number;
    search?: string;
  }
): Promise<TeamMembersResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.search) queryParams.append("search", params.search);
  
  const queryString = queryParams.toString();
  const path = `/admin/teams/${teamId}/members${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<TeamMembersResponse>(path);
}
