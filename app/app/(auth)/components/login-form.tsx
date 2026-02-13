"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { login, getCurrentUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/config";
import { userStore } from "@/store/user-store";
import { useErrorHandler } from "@/hooks/use-error-handler";

const loginSchema = yup.object({
  username: yup
    .string()
    .min(3, "用户名至少需要3个字符")
    .required("用户名不能为空"),
  password: yup
    .string()
    .min(6, "密码至少需要6个字符")
    .required("密码不能为空"),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
  });

  // 错误处理（登录错误不显示 toast，不记录到控制台，只显示在表单中）
  const { handleError } = useErrorHandler({
    setError,
    showToast: false,
    logToConsole: false, // 登录错误是业务错误，不记录到控制台
  });

  const onSubmit = async (data: LoginFormData) => {
    setError("");
    try {
      // 1. 先调用登录接口
      await login({
        username: data.username,
        password: data.password,
      });
      
      // 2. 登录成功后获取用户信息并存储到 store
      // 如果获取用户信息失败，说明 token 可能有问题，不应该跳转
      const userInfo = await getCurrentUser();
      userStore.setUser(userInfo);
      
      // 3. 确保用户信息设置成功后再跳转
      router.push("/dashboard");
    } catch (error) {
      // 使用统一的错误处理
      if (error instanceof ApiError) {
        // ApiError 的错误消息通常已经是用户友好的，直接显示
        handleError(error, error.message, { showToast: false });
      } else {
        handleError(error, "登录失败，请稍后重试", { showToast: false });
      }
    }
  };

  return (
    <Card className="w-full max-w-sm min-w-0">
      <CardHeader className="pb-8">
        <CardTitle className="text-center text-2xl font-semibold">
          登录
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名<span className="text-destructive">*</span></Label>
            <Input
              id="username"
              type="text"
              placeholder="请输入用户名"
              {...register("username")}
              className={errors.username ? "border-destructive" : ""}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码<span className="text-destructive">*</span></Label>
            <PasswordInput
              id="password"
              placeholder="请输入密码"
              {...register("password")}
              className={errors.password ? "border-destructive" : ""}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="mt-6 w-full" disabled={isSubmitting}>
            {isSubmitting ? "登录中..." : "登录"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          还没有账号？{" "}
          <Link
            href="/register"
            className="text-primary underline hover:text-primary/80"
          >
            去注册
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
