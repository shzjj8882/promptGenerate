"use client";

import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MinusCircle } from "lucide-react";
import type { WidgetSize } from "./types";

interface WidgetPromptsProps {
  size: WidgetSize;
  widgetId: string;
  onRemove?: (id: string) => void;
}

export function WidgetPrompts({ size, widgetId, onRemove }: WidgetPromptsProps) {
  return (
    <Card className="h-full flex flex-col py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">提示词</CardTitle>
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onRemove(widgetId)}
          >
            <MinusCircle className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        <p className="text-xs text-muted-foreground">
          {size === "small" && "编辑和管理提示词，支持占位符"}
          {size === "medium" && "编辑和管理提示词，支持占位符和场景关联"}
          {size === "large" && "编辑和管理提示词，支持占位符、场景关联和调试预览"}
        </p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" asChild>
          <Link href="/dashboard/prompts">进入管理 →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
