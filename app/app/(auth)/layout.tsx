import { ReactNode } from "react";
import Image from "next/image";
import { LANDING_BRAND } from "@/lib/landing-config";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* 左侧背景区域 */}
      <div className="hidden w-1/2 bg-gradient-to-br from-zinc-900 to-zinc-800 lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md space-y-6 text-white">
          <Image
            src="/logo-prompthub.png"
            alt={LANDING_BRAND.name}
            width={140}
            height={48}
            className="h-12 w-auto invert mix-blend-lighten"
          />
          <p className="text-lg text-zinc-300">
            智能体占位符 SaaS 平台，支持占位符配置、结构化 API 与流式聊天接口，多场景、多租户，助力业务快速接入 AI 能力
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">占位符配置与生成</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">结构化 API 与聊天接口</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">多场景、多租户提示词管理</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧表单区域 */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-y-auto bg-background p-4 sm:p-6 lg:w-1/2">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}

