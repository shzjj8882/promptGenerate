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
  created_at: string;
  updated_at: string;
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
