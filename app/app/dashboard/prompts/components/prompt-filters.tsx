"use client";

import { memo } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PromptScene, Scene, Tenant } from "../prompts-client";

interface PromptFiltersProps {
  isMounted: boolean;
  selectedScene: PromptScene | "all";
  selectedTenant: string;
  searchQuery: string;
  scenes: Scene[];
  tenants: Tenant[];
  loadingTenants: boolean;
  tenantsError: string | null;
  canCreateScene: boolean;
  canUpdateScene: boolean;
  canDeleteScene: boolean;
  onSceneChange: (scene: PromptScene | "all") => void;
  onTenantChange: (tenant: string) => void;
  onSearchChange: (query: string) => void;
  onCreateScene: () => void;
  onEditScene: (scene: Scene) => void;
  onDeleteScene: (scene: Scene) => void;
}

/**
 * 提示词筛选栏组件
 * 包含场景选择、租户选择、搜索功能以及场景管理按钮
 */
export const PromptFilters = memo(function PromptFilters({
  isMounted,
  selectedScene,
  selectedTenant,
  searchQuery,
  scenes,
  tenants,
  loadingTenants,
  tenantsError,
  canCreateScene,
  canUpdateScene,
  canDeleteScene,
  onSceneChange,
  onTenantChange,
  onSearchChange,
  onCreateScene,
  onEditScene,
  onDeleteScene,
}: PromptFiltersProps) {
  const currentScene = selectedScene !== "all" 
    ? scenes.find((s) => s.code === selectedScene)
    : null;

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 shrink-0">
        <Label className="whitespace-nowrap text-sm">场景：</Label>
        {!isMounted ? (
          <div className="h-9 w-[160px] rounded-md border bg-muted animate-pulse" />
        ) : (
          <Select value={selectedScene} onValueChange={(v) => onSceneChange(v as PromptScene | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="选择场景" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部场景</SelectItem>
              {scenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.code}>
                  <span className="flex items-center gap-2">
                    <span>{scene.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      scene.is_predefined 
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {scene.is_predefined ? "预置" : "自定义"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isMounted && (
          <>
            {canCreateScene && (
              <Button
                variant="outline"
                size="icon"
                onClick={onCreateScene}
                className="h-9 w-9"
                title="添加场景"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {/* 编辑和删除场景按钮（仅当选中非预置场景时显示） */}
            {currentScene && !currentScene.is_predefined && (
              <>
                {canUpdateScene && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onEditScene(currentScene)}
                    title="编辑场景"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDeleteScene && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onDeleteScene(currentScene)}
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    title="删除场景"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Label className="whitespace-nowrap text-sm">租户：</Label>
        {!isMounted ? (
          <div className="h-9 w-[160px] rounded-md border bg-muted animate-pulse" />
        ) : (
          <Select
            value={selectedTenant}
            onValueChange={onTenantChange}
            disabled={loadingTenants}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={loadingTenants ? "加载中..." : "选择租户"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认</SelectItem>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {tenantsError && (
          <span className="text-xs text-destructive">{tenantsError}</span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Label className="whitespace-nowrap text-sm shrink-0">搜索：</Label>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索提示词内容..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
      </div>
    </div>
  );
});
