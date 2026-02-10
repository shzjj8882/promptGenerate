"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { removeAuthToken } from "@/lib/api/config";

// 扩展 Window 接口以支持自定义事件
declare global {
  interface WindowEventMap {
    unauthorized: CustomEvent<string | undefined>;
  }
}

/**
 * 全局 401 错误处理组件
 * 监听全局事件，显示未授权确认对话框
 */
export function UnauthorizedDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>("登录已过期，请重新登录");

  useEffect(() => {
    const handleUnauthorized = (event: CustomEvent<string | undefined>) => {
      setMessage(event.detail || "登录已过期，请重新登录");
      setOpen(true);
    };

    // 监听自定义事件
    window.addEventListener("unauthorized", handleUnauthorized as EventListener);

    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized as EventListener);
    };
  }, []);

  const handleConfirm = () => {
    // 清除 token
    removeAuthToken();
    // 跳转到登录页面
    window.location.href = "/login";
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>登录已过期</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {message}
            <br />
            <span className="text-muted-foreground">请重新登录以继续使用。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleConfirm}>
            确认并返回登录
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
