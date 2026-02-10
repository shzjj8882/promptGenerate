/**
 * 服务端 API 抛错约定：带 status 便于 page 层按 401/403 做 redirect
 */
export class ServerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ServerApiError";
    Object.setPrototypeOf(this, ServerApiError.prototype);
  }
}

export function isServerApiError(e: unknown): e is ServerApiError {
  return e instanceof ServerApiError;
}
