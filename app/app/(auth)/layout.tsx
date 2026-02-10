import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* 左侧背景区域 */}
      <div className="hidden w-1/2 bg-gradient-to-br from-zinc-900 to-zinc-800 lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md space-y-6 text-white">
          <h1 className="text-4xl font-bold">AILY 控制台</h1>
          <p className="text-lg text-zinc-300">
            智能化的多租户管理系统，助力您的业务高效运营
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">多租户管理</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">智能配置</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <span className="text-zinc-300">提示词编辑器</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧表单区域 */}
      <div className="flex w-full flex-col items-center justify-center bg-zinc-50 p-6 dark:bg-black lg:w-1/2">
        {children}
      </div>
    </div>
  );
}

