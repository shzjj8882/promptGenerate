"use client";

import { LayoutGrid, MessageSquareText, Key, GripVertical, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DRAG_DATA_KEY, type WidgetType } from "../dashboard-widgets/types";

const WIDGET_META: { type: WidgetType; label: string; icon: React.ReactNode }[] = [
  { type: "tables", label: "多维表格", icon: <LayoutGrid className="h-4 w-4" /> },
  { type: "prompts", label: "提示词", icon: <MessageSquareText className="h-4 w-4" /> },
  { type: "team_code", label: "团队 Code", icon: <Key className="h-4 w-4" /> },
];

interface DashboardConfigPanelProps {
  /** 仅折叠侧边栏，不退出配置状态 */
  onCollapse: () => void;
}

export function DashboardConfigPanel({ onCollapse }: DashboardConfigPanelProps) {
  const handleDragStart = (e: React.DragEvent, type: WidgetType) => {
    e.dataTransfer.setData(DRAG_DATA_KEY, JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className="w-80 shrink-0 h-full flex flex-col border-l border-zinc-700 bg-zinc-900 shadow-[-4px_0_12px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <h3 className="font-semibold text-zinc-100">添加组件</h3>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={onCollapse}
          title="收起侧边栏（仍处于配置状态）"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="text-xs">收起</span>
        </Button>
      </div>

      {/* 多个组件卡片 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {WIDGET_META.map(({ type, label, icon }) => (
          <Card
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            className="w-full cursor-grab active:cursor-grabbing transition-colors border-zinc-700 bg-zinc-800 hover:bg-zinc-700 hover:border-zinc-600"
          >
            <CardHeader className="flex flex-row items-center gap-2 px-4 py-3">
              <span className="text-zinc-500 shrink-0">
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="text-zinc-300">{icon}</span>
              <CardTitle className="text-sm font-medium text-zinc-100">{label}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </aside>
  );
}
