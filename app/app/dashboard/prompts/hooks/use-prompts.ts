import { useCallback, useRef, useState } from "react";
import { getPrompts, Prompt as ApiPrompt } from "@/lib/api/prompts";
import { useErrorHandler } from "@/hooks/use-error-handler";
import type { Prompt, PromptScene } from "../prompts-client";

/**
 * 管理提示词数据的 Hook
 */
export function usePrompts(initialPrompts?: Prompt[]) {
  const [prompts, setPrompts] = useState<Prompt[]>(initialPrompts ?? []);
  const [loadingPrompts, setLoadingPrompts] = useState(!initialPrompts);
  
  const loadingPromptsRef = useRef(false);
  
  const { handleError: handleValidationError } = useErrorHandler({ 
    setError: () => {}, 
    showToast: false 
  });

  const fetchPrompts = useCallback(async (
    selectedScene: PromptScene | "all",
    selectedTenant: string
  ) => {
    if (loadingPromptsRef.current) return;
    try {
      loadingPromptsRef.current = true;
      setLoadingPrompts(true);
      const response = await getPrompts({
        scene: selectedScene !== "all" ? selectedScene : undefined,
        tenant_id: selectedTenant !== "default" ? selectedTenant : undefined,
        is_default: selectedTenant === "default" ? true : undefined,
      });
      
      const promptList: Prompt[] = (response as ApiPrompt[]).map((p) => ({
        id: p.id,
        scene: p.scene,
        tenantId: p.tenant_id === "default" ? "default" : p.tenant_id,
        content: p.content,
        placeholders: p.placeholders || [],
        isDefault: p.is_default,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
      
      setPrompts(promptList);
    } catch (error) {
      handleValidationError(error, "获取提示词列表失败");
      setPrompts([]);
    } finally {
      setLoadingPrompts(false);
      loadingPromptsRef.current = false;
    }
  }, [handleValidationError]);

  return {
    prompts,
    loadingPrompts,
    fetchPrompts,
    setPrompts,
  };
}
