import { useMemo, useState } from "react";
import { useSearch } from "@/hooks/use-search";
import type { Prompt, PromptScene, Scene, Tenant } from "../prompts-client";

/**
 * 管理提示词筛选逻辑的 Hook
 */
export function usePromptFilters(
  prompts: Prompt[],
  scenes: Scene[],
  tenants: Tenant[]
) {
  const [selectedScene, setSelectedScene] = useState<PromptScene | "all">("all");
  const [selectedTenant, setSelectedTenant] = useState<string>("default");
  const { searchQuery, debouncedSearchQuery, setSearchQuery } = useSearch({ 
    debounceDelay: 300 
  });

  // 过滤后的提示词列表（根据场景和租户筛选）
  const filteredPrompts = useMemo(() => {
    let result = prompts;

    // 场景筛选
    if (selectedScene !== "all") {
      result = result.filter((p) => p.scene === selectedScene);
    }

    // 租户筛选
    if (selectedTenant === "default") {
      result = result.filter((p) => p.isDefault);
    } else {
      result = result.filter((p) => p.tenantId === selectedTenant && !p.isDefault);
    }

    // 搜索筛选（使用防抖搜索）
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter((p) =>
        p.content.toLowerCase().includes(query)
      );
    }

    return result;
  }, [prompts, selectedScene, selectedTenant, debouncedSearchQuery]);

  // 计算缺失的提示词卡片（仅在无搜索条件时显示）
  const missingPrompts = useMemo(() => {
    // 如果有搜索条件，不显示缺失卡片
    if (searchQuery) {
      return [];
    }

    const scenesToCheck = selectedScene === "all" 
      ? scenes 
      : scenes.filter(s => s.code === selectedScene);
    
    const missing: Array<{
      scene: PromptScene;
      tenantId: string | "default";
      tenant: Tenant | null;
    }> = [];

    scenesToCheck.forEach((scene) => {
      let hasPrompt = false;
      
      if (selectedTenant === "default") {
        // 检查是否有默认提示词
        hasPrompt = prompts.some(
          (p) => p.scene === scene.code && p.isDefault
        );
      } else {
        // 检查是否有该租户的提示词
        hasPrompt = prompts.some(
          (p) => p.scene === scene.code && p.tenantId === selectedTenant && !p.isDefault
        );
      }
      
      // 如果该场景没有对应的提示词，添加到缺失列表
      if (!hasPrompt) {
        const tenant = selectedTenant === "default" ? null : tenants.find((t) => t.id === selectedTenant);
        missing.push({
          scene: scene.code,
          tenantId: selectedTenant,
          tenant: tenant || null,
        });
      }
    });

    return missing;
  }, [scenes, prompts, selectedScene, selectedTenant, searchQuery, tenants]);

  return {
    selectedScene,
    selectedTenant,
    searchQuery,
    filteredPrompts,
    missingPrompts,
    setSelectedScene,
    setSelectedTenant,
    setSearchQuery,
  };
}
