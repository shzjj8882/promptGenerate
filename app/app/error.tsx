"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error boundary]", error.message, error.digest);
  }, [error]);

  const showDetail =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_SHOW_ERROR_DETAIL === "true";

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold">出错了</h2>
        <p className="text-muted-foreground text-sm">
          {showDetail ? error.message : "加载此页面时发生错误。"}
          {error.digest && (
            <span className="block mt-2 text-xs text-muted-foreground/80">
              错误摘要: {error.digest}
            </span>
          )}
        </p>
        <Button onClick={() => reset()} variant="outline">
          重试
        </Button>
      </div>
    </div>
  );
}
