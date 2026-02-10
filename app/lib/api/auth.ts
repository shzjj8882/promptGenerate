/**
 * 认证相关 API
 */

import { apiRequest, setAuthToken, removeAuthToken } from "./config";

/**
 * 登录请求参数
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * 登录响应数据
 */
export interface LoginResponseData {
  access_token: string;
  token_type: string;
}

/**
 * 用户信息
 */
export interface UserInfo {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  team_code?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_team_admin?: boolean;
  /** 菜单权限 code 列表，用于动态侧栏与路由守卫（由 /me 返回） */
  menu_permission_codes?: string[];
  /** 接口/按钮权限 code 列表，用于页面按钮显隐如编辑、新建、删除（由 /me 返回） */
  api_permission_codes?: string[];
  /** 团队认证码，用于生成业务场景的 CURL 命令（由 /me 返回） */
  team_authcode?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 注册请求参数
 */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  team_code: string;
}

/**
 * 用户登录
 */
export async function login(data: LoginRequest): Promise<LoginResponseData> {
  const response = await apiRequest<LoginResponseData>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });

  // 保存 token
  if (response?.access_token) {
    setAuthToken(response.access_token);
    // 额外在 cookie 中写入一份，供 Next.js 服务端读取做 SSR（与 localStorage 风险相同，仅作为过渡方案）
    if (typeof document !== "undefined") {
      document.cookie = `auth_token=${response.access_token}; path=/;`;
    }
  }

  return response;
}

/**
 * 用户注册
 */
export async function register(data: RegisterRequest): Promise<UserInfo> {
  return apiRequest<UserInfo>("/admin/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(): Promise<UserInfo> {
  return apiRequest<UserInfo>("/admin/auth/me");
}

/**
 * 用户登出
 */
export function logout(): void {
  removeAuthToken();
  // 清除 cookie 中的 token
  if (typeof document !== "undefined") {
    document.cookie = "auth_token=; Max-Age=0; path=/;";
  }
  // 清空用户信息 store
  if (typeof window !== "undefined") {
    // 动态导入避免 SSR 问题
    import("@/store/user-store").then(({ userStore }) => {
      userStore.clearUser();
    });
  }
  // 如果是在浏览器环境，跳转到登录页
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

