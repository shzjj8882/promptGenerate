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
import { register as registerApi } from "@/lib/api/auth";

const registerSchema = yup.object({
  username: yup
    .string()
    .min(3, "用户名至少需要3个字符")
    .max(50, "用户名不能超过50个字符")
    .required("用户名不能为空"),
  email: yup
    .string()
    .email("请输入有效的邮箱地址")
    .required("邮箱不能为空"),
  password: yup
    .string()
    .min(6, "密码至少需要6个字符")
    .required("密码不能为空"),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref("password")], "两次输入的密码不一致")
    .required("请确认密码"),
  fullName: yup.string().max(100, "全名不能超过100个字符").notRequired(),
  teamCode: yup
    .string()
    .min(2, "团队代码至少需要2个字符")
    .max(50, "团队代码不能超过50个字符")
    .required("团队代码不能为空"),
});

type RegisterFormData = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName?: string;
  teamCode: string;
};

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: yupResolver(registerSchema) as any,
  });

  const onSubmit = async (data: RegisterFormData) => {
    setError("");
    try {
      await registerApi({
        username: data.username,
        email: data.email,
        password: data.password,
        full_name: data.fullName || undefined,
        team_code: data.teamCode,
      });
      // 注册成功，跳转到登录页
      router.push("/login");
    } catch (error) {
      console.error("注册错误:", error);
      setError(error instanceof Error ? error.message : "注册失败，请稍后重试");
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-semibold">
          注册 PromptHub 控制台
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
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
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="请输入邮箱"
              {...register("email")}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">全名（可选）</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="请输入全名"
              {...register("fullName")}
              className={errors.fullName ? "border-destructive" : ""}
            />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamCode">
              团队代码 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="teamCode"
              type="text"
              placeholder="请输入团队代码"
              {...register("teamCode")}
              className={errors.teamCode ? "border-destructive" : ""}
            />
            {errors.teamCode && (
              <p className="text-sm text-destructive">{errors.teamCode.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              请联系超级管理员获取团队代码
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
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
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder="请再次输入密码"
              {...register("confirmPassword")}
              className={errors.confirmPassword ? "border-destructive" : ""}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "注册中..." : "注册"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          已有账号？{" "}
          <Link
            href="/login"
            className="text-primary underline hover:text-primary/80"
          >
            去登录
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
