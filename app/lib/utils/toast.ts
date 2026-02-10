/**
 * Toast 提示工具
 * 用于在客户端显示提示信息
 */

/**
 * 显示错误提示
 */
export function showErrorToast(message: string): void {
  if (typeof window === "undefined") return;
  
  import("sonner").then(({ toast }) => {
    toast.error(message, {
      duration: 3000,
    });
  }).catch(() => {
    // 如果导入失败，降级使用 alert
    alert(message);
  });
}

/**
 * 显示成功提示
 */
export function showSuccessToast(message: string): void {
  if (typeof window === "undefined") return;
  
  import("sonner").then(({ toast }) => {
    toast.success(message, {
      duration: 3000,
    });
  }).catch(() => {
    // 如果导入失败，降级使用 alert
    alert(message);
  });
}

/**
 * 显示信息提示
 */
export function showInfoToast(message: string): void {
  if (typeof window === "undefined") return;
  
  import("sonner").then(({ toast }) => {
    toast.info(message, {
      duration: 3000,
    });
  }).catch(() => {
    // 如果导入失败，降级使用 alert
    alert(message);
  });
}

/**
 * 显示警告提示
 */
export function showWarningToast(message: string): void {
  if (typeof window === "undefined") return;
  
  import("sonner").then(({ toast }) => {
    toast.warning(message, {
      duration: 3000,
    });
  }).catch(() => {
    // 如果导入失败，降级使用 alert
    alert(message);
  });
}

