"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error.message, error.digest);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">页面加载出错</h1>
          <p className="text-zinc-400 text-sm">
            生产模式下错误详情已隐藏。请查看服务器日志获取完整信息。
            {error.digest && (
              <span className="block mt-2 text-zinc-500">
                错误摘要: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
