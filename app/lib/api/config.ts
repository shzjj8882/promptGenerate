/**
 * API 配置文件
 */

// 服务端 API 基础地址
// 如果未设置 NEXT_PUBLIC_API_BASE_URL，使用相对路径：
//   - docker-nginx 模式：通过 Nginx 代理（支持 SSE 流式传输）
//   - docker/pm2 模式：通过 Next.js rewrites 代理（不支持 SSE）
// 开发模式下，如果没有设置，默认使用 http://localhost:8000
const getDefaultApiBaseUrl = () => {
  // 如果明确设置了环境变量（包括空字符串），使用设置的值
  if (process.env.NEXT_PUBLIC_API_BASE_URL !== undefined) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  
  // 开发模式下，如果没有设置环境变量，默认使用 localhost:8000
  // 这样可以避免开发时忘记创建 .env.local 文件导致的问题
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    return 'http://localhost:8000';
  }
  
  // 生产模式下，如果没有设置，使用相对路径（通过 rewrites 代理）
  return '';
};

export const API_BASE_URL = getDefaultApiBaseUrl();

/**
 * API 请求配置
 */
export const apiConfig = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * 获取认证 token
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

/**
 * 设置认证 token
 */
export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("auth_token", token);
}

/**
 * 移除认证 token
 */
export function removeAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("auth_token");
}

/**
 * 构建完整的 API URL（客户端使用）
 * 如果 API_BASE_URL 为空，返回相对路径：
 *   - docker-nginx 模式：通过 Nginx 代理（支持 SSE 流式传输）
 *   - docker/pm2 模式：通过 Next.js rewrites 代理（不支持 SSE）
 */
export function buildApiUrl(path: string): string {
  // 如果 API_BASE_URL 为空，使用相对路径
  // 在 docker-nginx 模式下，相对路径会通过 Nginx 代理到后端（支持 SSE）
  // 在 docker/pm2 模式下，相对路径会通过 Next.js rewrites 代理（不支持 SSE）
  if (!API_BASE_URL) {
    const apiPath = path.startsWith("/") ? path : `/${path}`;
    return apiPath;
  }
  
  // 如果设置了 API_BASE_URL，直接使用绝对路径
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${apiPath}`;
}

/**
 * 构建服务端 API URL（服务端组件使用）
 * 服务端的 fetch 需要完整 URL，不能使用相对路径
 */
export function buildServerApiUrl(path: string): string {
  // 如果 API_BASE_URL 已设置，直接使用
  if (API_BASE_URL) {
    const baseUrl = API_BASE_URL.replace(/\/$/, "");
    const apiPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${apiPath}`;
  }
  
  // 如果 API_BASE_URL 为空，说明使用 rewrites 模式
  // 在服务端，需要通过 Next.js 服务器的 rewrites 来访问后端
  // 使用 localhost:3000 作为基础 URL（rewrites 会在同一个服务器上处理）
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'dev';
  
  if (deploymentMode === 'docker') {
    // Docker 模式：服务端通过 rewrites 访问，使用 localhost:3000
    // 或者直接使用 BACKEND_URL（如果设置了）
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const apiPath = path.startsWith("/") ? path : `/${path}`;
    // 如果 BACKEND_URL 是 Docker 内部地址，服务端无法直接访问，需要使用 localhost:3000 通过 rewrites
    if (backendUrl.includes('service:8000')) {
      return `http://localhost:3000${apiPath}`;
    }
    return `${backendUrl}${apiPath}`;
  }
  
  // 开发模式或 PM2 模式：使用默认的后端地址
  const defaultBackendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  return `${defaultBackendUrl}${apiPath}`;
}

/**
 * 统一响应结构
 */
export interface ApiResponse<T = any> {
  success?: boolean;
  code?: number;
  message?: string;
  data?: T;
  /** FastAPI HTTPException 使用 detail 字段 */
  detail?: string | Record<string, unknown>;
}

/** 从响应中提取错误文案：支持 ResponseModel.message 与 FastAPI HTTPException.detail */
function getResponseMessage(result: ApiResponse, fallback: string): string {
  const msg = result.message ?? (typeof result.detail === "string" ? result.detail : fallback);
  return msg || fallback;
}

/**
 * API 错误类
 */
export class ApiError extends Error {
  code: number;
  data?: unknown;

  constructor(message: string, code: number = 400, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.data = data;
  }
}

/**
 * 处理 401 未授权错误
 */
function handleUnauthorized(message?: string): void {
  // 清除 token
  removeAuthToken();
  
  // 触发自定义事件，显示 AlertDialog
  if (typeof window !== "undefined") {
    const event = new CustomEvent("unauthorized", {
      detail: message,
    });
    window.dispatchEvent(event);
  }
}

// 请求去重和取消管理
const pendingRequests = new Map<string, AbortController>();
const requestCache = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
const CACHE_DURATION = 100; // 100ms 内的相同请求会被去重

/**
 * 生成请求的唯一标识
 */
function getRequestKey(path: string, options: RequestInit): string {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : '';
  return `${method}:${path}:${body}`;
}

/**
 * 清理过期的缓存
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      requestCache.delete(key);
    }
  }
}

/**
 * 通用 API 请求函数（支持请求去重和取消）
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = buildApiUrl(path);
  const token = getAuthToken();
  const requestKey = getRequestKey(path, options);

  // 清理过期缓存
  cleanupCache();

  // 检查是否有相同的请求正在进行（去重）
  const cached = requestCache.get(requestKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.promise as Promise<T>;
  }

  // 取消之前的相同请求
  const existingController = pendingRequests.get(requestKey);
  if (existingController) {
    existingController.abort();
  }

  // 创建新的 AbortController
  const controller = new AbortController();
  pendingRequests.set(requestKey, controller);

  const headers: HeadersInit = {
    ...apiConfig.headers,
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // 创建请求 Promise
  const requestPromise = (async (): Promise<T> => {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

    // 处理非 JSON 响应
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      if (!response.ok) {
        // 仅当本次请求携带了 token 时，401 表示 token 失效，需清除并提示重新登录；登录接口失败已用 400
        if (response.status === 401 && token) {
          handleUnauthorized("登录已过期，请重新登录");
          throw new ApiError("登录已过期，请重新登录", 401);
        }
        throw new ApiError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }
      return {} as T;
    }

    const result: ApiResponse<T> = await response.json();

    // 统一响应结构处理
    if (!result.success) {
      // 401 且本次请求带了 token：视为 token 失效/未授权，清除 token 并提示重新登录（登录密码错误由后端返回 400）
      if ((result.code === 401 || response.status === 401) && token) {
        const msg = getResponseMessage(result, "登录已过期，请重新登录");
        handleUnauthorized(msg);
        throw new ApiError(msg, 401, result.data);
      }
      // 401 但未带 token（如登录失败若误返回 401）：不清理 token，只抛错
      if (result.code === 401 || response.status === 401) {
        throw new ApiError(
          getResponseMessage(result, "认证失败"),
          401,
          result.data
        );
      }
      
      // 业务错误（含登录密码错误 400 等）；FastAPI HTTPException 使用 detail
      throw new ApiError(
        getResponseMessage(result, "请求失败"),
        result.code ?? response.status,
        result.data
      );
    }

    // 如果 HTTP 状态码不是 2xx，但业务逻辑成功，也抛出错误
    if (!response.ok) {
      if (response.status === 401 && token) {
        const msg = getResponseMessage(result, "登录已过期，请重新登录");
        handleUnauthorized(msg);
        throw new ApiError(msg, 401, result.data);
      }
      if (response.status === 401) {
        throw new ApiError(
          getResponseMessage(result, "认证失败"),
          401,
          result.data
        );
      }
      
      throw new ApiError(
        getResponseMessage(result, `HTTP error! status: ${response.status}`),
        response.status,
        result.data
      );
    }

      // 返回数据部分
      return result.data as T;
    } catch (error) {
      // 如果是取消请求，抛出特殊错误
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError("请求已取消", -1);
      }

      // 如果是 ApiError，直接抛出
      if (error instanceof ApiError) {
        throw error;
      }

      // 网络错误或其他错误
      if (error instanceof Error) {
        throw new ApiError(error.message, 0);
      }

      throw new ApiError("未知错误", 0);
    } finally {
      // 清理
      pendingRequests.delete(requestKey);
      requestCache.delete(requestKey);
    }
  })();

  // 缓存请求 Promise
  requestCache.set(requestKey, {
    promise: requestPromise,
    timestamp: Date.now(),
  });

  return requestPromise;
}

/**
 * 取消指定的请求
 */
export function cancelRequest(path: string, options: RequestInit = {}): void {
  const requestKey = getRequestKey(path, options);
  const controller = pendingRequests.get(requestKey);
  if (controller) {
    controller.abort();
    pendingRequests.delete(requestKey);
    requestCache.delete(requestKey);
  }
}

/**
 * 取消所有待处理的请求
 */
export function cancelAllRequests(): void {
  for (const controller of pendingRequests.values()) {
    controller.abort();
  }
  pendingRequests.clear();
  requestCache.clear();
}

