import { useCallback, useMemo, useState } from "react";
import { getPrompt, getPromptBySceneTenant, createPrompt, updatePrompt } from "@/lib/api/prompts";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { parsePlaceholdersFromText } from "../utils/prompt-utils";
import { logger } from "@/lib/utils/logger";
import type { Prompt, PromptScene, Placeholder } from "../prompts-client";

interface UsePromptFormProps {
  canCreateApi: boolean;
  canUpdateApi: boolean;
  validatePlaceholders: (text: string, scene: PromptScene) => { valid: boolean; error?: string };
  onPromptsChange: () => void;
}

/**
 * 管理提示词表单状态和操作的 Hook
 */
export function usePromptForm({
  canCreateApi,
  canUpdateApi,
  validatePlaceholders,
  onPromptsChange,
}: UsePromptFormProps) {
  // 对话框状态
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editingScene, setEditingScene] = useState<PromptScene | null>(null);
  const [editingTenant, setEditingTenant] = useState<string | "default">("default");
  
  // 表单状态
  const [formContent, setFormContent] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { handleError: handleValidationError } = useErrorHandler({ 
    setError: (error: string) => setValidationError(error), 
    showToast: false 
  });

  // 当前使用的占位符
  const usedPlaceholders = useMemo(() => {
    return parsePlaceholdersFromText(formContent);
  }, [formContent]);

  // 通过 ID 编辑提示词（更可靠）
  const handleEditPromptById = useCallback(async (promptId: string) => {
    if (!canUpdateApi) {
      setValidationError("您没有编辑提示词的接口权限，如有需要请联系管理员。");
      return;
    }
    try {
      const p = await getPrompt(promptId);
      
      logger.debug("通过 ID 获取到的提示词数据", p);
      
      if (p && p.id) {
        const promptData: Prompt = {
          id: p.id,
          scene: p.scene,
          tenantId: p.tenant_id === "default" ? "default" : p.tenant_id,
          content: p.content,
          placeholders: p.placeholders || [],
          isDefault: p.is_default,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        };
        logger.debug("设置编辑提示词", promptData);
        setEditingPrompt(promptData);
        setEditingScene(p.scene as PromptScene);
        setEditingTenant(p.tenant_id === "default" ? "default" : p.tenant_id);
        setFormContent(p.content);
        setValidationError(null);
        setIsDialogOpen(true);
      } else {
        setValidationError("无法加载提示词数据");
      }
    } catch (error) {
      handleValidationError(error, "获取提示词失败，请稍后重试");
    }
  }, [canUpdateApi, handleValidationError]);

  // 编辑提示词（或创建新的）
  const handleEditPrompt = useCallback(async (scene: PromptScene, tenantId: string | "default") => {
    if (!canCreateApi) {
      setValidationError("您没有创建提示词的接口权限，如有需要请联系管理员。");
      return;
    }
    setEditingScene(scene);
    setEditingTenant(tenantId);
    
    try {
      const p = await getPromptBySceneTenant({
        scene,
        tenant_id: tenantId,
      });
      
      logger.debug("获取到的提示词数据", p);
      
      if (p && p.id) {
        // 已有提示词，编辑
        const promptData: Prompt = {
          id: p.id,
          scene: p.scene,
          tenantId: p.tenant_id === "default" ? "default" : p.tenant_id,
          content: p.content,
          placeholders: p.placeholders || [],
          isDefault: p.is_default,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        };
        logger.debug("设置编辑提示词", promptData);
        setEditingPrompt(promptData);
        setFormContent(p.content);
      } else {
        // 没有提示词，创建新的
        logger.debug("未找到提示词，将创建新的");
        setEditingPrompt(null);
        setFormContent("");
      }
      
      setValidationError(null);
      setIsDialogOpen(true);
    } catch (error) {
      handleValidationError(error, "获取提示词失败");
      // 即使获取失败，也打开对话框创建新的
      setEditingPrompt(null);
      setEditingScene(scene);
      setEditingTenant(tenantId);
      setFormContent("");
      setValidationError(null);
      setIsDialogOpen(true);
    }
  }, [canCreateApi, handleValidationError]);

  // 保存提示词
  const handleSavePrompt = useCallback(async () => {
    if (!editingScene) return;

    // 接口权限校验：区分创建 / 编辑
    if (editingPrompt && editingPrompt.id) {
      if (!canUpdateApi) {
        setValidationError("您没有编辑提示词的接口权限，如有需要请联系管理员。");
        return;
      }
    } else if (!canCreateApi) {
      setValidationError("您没有创建提示词的接口权限，如有需要请联系管理员。");
      return;
    }

    const validation = validatePlaceholders(formContent, editingScene);
    if (!validation.valid) {
      setValidationError(validation.error || "占位符格式错误");
      return;
    }

    setValidationError(null);
    const parsed = parsePlaceholdersFromText(formContent);

    try {
      logger.debug("保存提示词", {
        editingPrompt,
        editingScene,
        editingTenant,
      });
      
      if (editingPrompt && editingPrompt.id) {
        // 更新
        logger.debug("执行更新操作", { id: editingPrompt.id });
        await updatePrompt(editingPrompt.id, {
          content: formContent,
          placeholders: parsed,
        });
      } else {
        // 创建
        logger.debug("执行创建操作");
        await createPrompt({
          scene: editingScene,
          tenant_id: editingTenant,
          content: formContent,
          placeholders: parsed,
        });
      }
      
      setIsDialogOpen(false);
      setEditingPrompt(null);
      await onPromptsChange();
    } catch (error) {
      handleValidationError(error, "保存失败，请稍后重试");
    }
  }, [
    editingScene,
    editingPrompt,
    editingTenant,
    formContent,
    canCreateApi,
    canUpdateApi,
    validatePlaceholders,
    onPromptsChange,
    handleValidationError,
  ]);

  // 重置表单
  const resetForm = useCallback(() => {
    setEditingPrompt(null);
    setEditingScene(null);
    setEditingTenant("default");
    setFormContent("");
    setValidationError(null);
  }, []);

  return {
    // 对话框状态
    isDialogOpen,
    setIsDialogOpen,
    editingPrompt,
    editingScene,
    editingTenant,
    
    // 表单状态
    formContent,
    setFormContent,
    validationError,
    setValidationError,
    usedPlaceholders,
    
    // 操作方法
    handleEditPromptById,
    handleEditPrompt,
    handleSavePrompt,
    resetForm,
  };
}
