/**
 * 统一日志管理工具
 * 提供统一的日志接口，支持开发/生产环境区分
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  level?: LogLevel;
  enableInProduction?: boolean;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  /**
   * Debug 日志（仅开发环境）
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info 日志
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Warning 日志
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  /**
   * Error 日志（始终记录）
   */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, error, ...args);
    
    // TODO: 可以在这里集成错误追踪服务（如 Sentry）
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error);
    // }
  }

  /**
   * 分组日志（仅开发环境）
   */
  group(label: string): void {
    if (this.isDevelopment) {
      console.group(label);
    }
  }

  /**
   * 结束分组（仅开发环境）
   */
  groupEnd(): void {
    if (this.isDevelopment) {
      console.groupEnd();
    }
  }

  /**
   * 表格日志（仅开发环境）
   */
  table(data: unknown): void {
    if (this.isDevelopment) {
      console.table(data);
    }
  }
}

// 导出单例
export const logger = new Logger();

// 导出类型
export type { LogLevel, LoggerOptions };
