import { useCallback, useState, useEffect } from "react";
import { createScene, updateScene, deleteScene, SceneCreate, SceneUpdate } from "@/lib/api/scenes";
import { getPlaceholders, type Placeholder } from "@/lib/api/prompts";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { logger } from "@/lib/utils/logger";
import type { Scene, PromptScene } from "../prompts-client";

interface UseSceneManagementProps {
  scenes: Scene[];
  onScenesChange: () => void;
  onPlaceholdersChange?: (scene: PromptScene) => void;
  canCreateSceneApi: boolean;
  canUpdateSceneApi: boolean;
  canDeleteSceneApi: boolean;
  selectedScene: PromptScene | "all";
  onSelectedSceneChange?: (scene: PromptScene | "all") => void;
}

/**
 * 管理场景的创建、编辑、删除操作的 Hook
 */
export function useSceneManagement({
  scenes,
  onScenesChange,
  onPlaceholdersChange,
  canCreateSceneApi,
  canUpdateSceneApi,
  canDeleteSceneApi,
  selectedScene,
  onSelectedSceneChange,
}: UseSceneManagementProps) {
  // 创建场景对话框状态
  const [isCreateSceneDialogOpen, setIsCreateSceneDialogOpen] = useState(false);
  const [newSceneCode, setNewSceneCode] = useState("");
  const [newSceneName, setNewSceneName] = useState("");
  const [createSceneError, setCreateSceneError] = useState<string | null>(null);
  const [creatingScene, setCreatingScene] = useState(false);
  const [selectedPlaceholderKeys, setSelectedPlaceholderKeys] = useState<Set<string>>(new Set());
  
  // 编辑场景对话框状态
  const [isEditSceneDialogOpen, setIsEditSceneDialogOpen] = useState(false);
  const [sceneToEdit, setSceneToEdit] = useState<Scene | null>(null);
  const [editSceneName, setEditSceneName] = useState("");
  const [editSelectedPlaceholderKeys, setEditSelectedPlaceholderKeys] = useState<Set<string>>(new Set());
  const [isEditingScene, setIsEditingScene] = useState(false);
  const [editSceneError, setEditSceneError] = useState<string | null>(null);
  
  // 删除场景对话框状态
  const [isDeleteSceneDialogOpen, setIsDeleteSceneDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [deletingScene, setDeletingScene] = useState(false);
  const [deleteSceneError, setDeleteSceneError] = useState<string | null>(null);
  
  // 占位符列表状态
  const [availablePlaceholders, setAvailablePlaceholders] = useState<Placeholder[]>([]);
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);

  const { handleError: handleCreateSceneError } = useErrorHandler({
    setError: (error: string) => setCreateSceneError(error),
    showToast: false,
  });

  const { handleError: handleEditSceneError } = useErrorHandler({
    setError: (error: string) => setEditSceneError(error),
    showToast: false,
  });

  const { handleError: handleDeleteSceneError } = useErrorHandler({
    setError: (error: string) => setDeleteSceneError(error),
    showToast: false,
  });

  // 加载占位符列表
  useEffect(() => {
    const fetchPlaceholders = async () => {
      try {
        setLoadingPlaceholders(true);
        const response = await getPlaceholders({ limit: 500 });
        const allPlaceholders = response.items || [];
        
        // 去重：同一个 key 只保留一个占位符
        // 优先保留全局占位符（scene 为空字符串），如果没有则保留第一个
        const uniquePlaceholdersMap = new Map<string, Placeholder>();
        for (const placeholder of allPlaceholders) {
          const key = placeholder.key;
          const currentScene = (placeholder as any).scene || "";
          
          if (!uniquePlaceholdersMap.has(key)) {
            uniquePlaceholdersMap.set(key, placeholder);
          } else {
            // 如果已存在，优先保留全局占位符（scene 为空字符串）
            const existing = uniquePlaceholdersMap.get(key)!;
            const existingScene = (existing as any).scene || "";
            if (currentScene === "" && existingScene !== "") {
              // 当前是全局占位符，替换现有的
              uniquePlaceholdersMap.set(key, placeholder);
            }
            // 如果当前不是全局占位符，且已存在的是全局占位符，则保留已存在的
            // 如果两者都不是全局占位符，保留第一个（已存在的）
          }
        }
        
        setAvailablePlaceholders(Array.from(uniquePlaceholdersMap.values()));
      } catch (error) {
        logger.error("加载占位符列表失败", error);
        setAvailablePlaceholders([]);
      } finally {
        setLoadingPlaceholders(false);
      }
    };
    
    fetchPlaceholders();
  }, []);

  // 切换占位符选择
  const handleTogglePlaceholder = useCallback((key: string) => {
    setSelectedPlaceholderKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  // 切换编辑场景时的占位符选择
  const handleToggleEditPlaceholder = useCallback((key: string) => {
    setEditSelectedPlaceholderKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  // 创建场景
  const handleCreateScene = useCallback(async () => {
    if (!canCreateSceneApi) {
      setCreateSceneError("您没有创建场景的接口权限，如有需要请联系管理员。");
      return;
    }
    
    if (!newSceneCode.trim() || !newSceneName.trim()) {
      setCreateSceneError("场景代码和名称不能为空");
      return;
    }

    // 检查 code 格式（只允许字母、数字、下划线）
    if (!/^[a-zA-Z0-9_]+$/.test(newSceneCode.trim())) {
      setCreateSceneError("场景代码只能包含字母、数字和下划线");
      return;
    }

    // 检查 code 是否已存在
    if (scenes.some((s) => s.code === newSceneCode.trim())) {
      setCreateSceneError("场景代码已存在");
      return;
    }

    setCreatingScene(true);
    setCreateSceneError(null);

    try {
      // 准备占位符数据（如果有选中的）
      const placeholders: Array<{ key: string; label: string; description?: string }> | undefined = 
        selectedPlaceholderKeys.size > 0
          ? (() => {
              const result: Array<{ key: string; label: string; description?: string }> = [];
              for (const key of selectedPlaceholderKeys) {
                const placeholderDef = availablePlaceholders.find((p) => p.key === key);
                if (placeholderDef) {
                  result.push({
                    key: placeholderDef.key,
                    label: placeholderDef.label,
                    ...(placeholderDef.description && { description: placeholderDef.description }),
                  });
                }
              }
              return result.length > 0 ? result : undefined;
            })()
          : undefined;

      const sceneData: SceneCreate = {
        code: newSceneCode.trim(),
        name: newSceneName.trim(),
        placeholders,
      };
      await createScene(sceneData);
      
      // 刷新场景列表
      await onScenesChange();
      
      // 重置表单并关闭对话框
      setNewSceneCode("");
      setNewSceneName("");
      setSelectedPlaceholderKeys(new Set());
      setIsCreateSceneDialogOpen(false);
    } catch (error: any) {
      logger.error("创建场景失败", error);
      handleCreateSceneError(error, error?.message || "创建场景失败，请稍后重试");
    } finally {
      setCreatingScene(false);
    }
  }, [
    canCreateSceneApi,
    newSceneCode,
    newSceneName,
    selectedPlaceholderKeys,
    availablePlaceholders,
    scenes,
    onScenesChange,
    handleCreateSceneError,
  ]);

  // 打开编辑场景对话框
  const handleOpenEditSceneDialog = useCallback(async (scene: Scene) => {
    setSceneToEdit(scene);
    setEditSceneName(scene.name);
    setEditSceneError(null);
    
    // 加载当前场景的占位符
    try {
      const currentPlaceholdersResponse = await getPlaceholders({ scene: scene.code });
      // getPlaceholders 返回的是 PaginatedPlaceholdersResponse，需要提取 items
      const currentPlaceholders = currentPlaceholdersResponse.items || currentPlaceholdersResponse;
      // 确保 currentPlaceholders 是数组
      const placeholdersArray = Array.isArray(currentPlaceholders) ? currentPlaceholders : [];
      const currentKeys = new Set(placeholdersArray.map((p: any) => p.key));
      setEditSelectedPlaceholderKeys(currentKeys);
    } catch (error) {
      logger.error("加载占位符失败", error);
      setEditSelectedPlaceholderKeys(new Set());
    }
    
    setIsEditSceneDialogOpen(true);
  }, []);

  // 编辑场景
  const handleEditScene = useCallback(async () => {
    if (!sceneToEdit || !editSceneName.trim()) return;

    if (!canUpdateSceneApi) {
      setEditSceneError("您没有编辑场景的接口权限，如有需要请联系管理员。");
      return;
    }

    setIsEditingScene(true);
    setEditSceneError(null);

    try {
      // 准备占位符数据（如果有选中的）
      // 注意：即使没有选中任何占位符，也要传递空数组 []，而不是 undefined
      // 这样后端才能正确清空关联关系
      const placeholders: Array<{ key: string; label: string; description?: string }> = [];
      if (editSelectedPlaceholderKeys.size > 0) {
        for (const key of editSelectedPlaceholderKeys) {
          const placeholderDef = availablePlaceholders.find((p) => p.key === key);
          if (placeholderDef) {
            placeholders.push({
              key: placeholderDef.key,
              label: placeholderDef.label,
              ...(placeholderDef.description && { description: placeholderDef.description }),
            });
          }
        }
      }

      const updateData: SceneUpdate = {
        name: editSceneName.trim(),
        placeholders,
      };
      await updateScene(sceneToEdit.code, updateData);
      
      // 刷新场景列表和占位符列表
      await onScenesChange();
      if (onPlaceholdersChange) {
        await onPlaceholdersChange(sceneToEdit.code);
      }
      
      // 关闭对话框
      setIsEditSceneDialogOpen(false);
      setSceneToEdit(null);
      setEditSceneName("");
      setEditSelectedPlaceholderKeys(new Set());
    } catch (error: any) {
      logger.error("编辑场景失败", error);
      handleEditSceneError(error, error?.message || "编辑场景失败，请稍后重试");
    } finally {
      setIsEditingScene(false);
    }
  }, [
    sceneToEdit,
    editSceneName,
    editSelectedPlaceholderKeys,
    availablePlaceholders,
    canUpdateSceneApi,
    onScenesChange,
    onPlaceholdersChange,
    handleEditSceneError,
  ]);

  // 打开删除场景确认对话框
  const handleOpenDeleteSceneDialog = useCallback((scene: Scene) => {
    setSceneToDelete(scene);
    setDeleteSceneError(null);
    setIsDeleteSceneDialogOpen(true);
  }, []);

  // 删除场景
  const handleDeleteScene = useCallback(async () => {
    if (!sceneToDelete) return;

    if (!canDeleteSceneApi) {
      setDeleteSceneError("您没有删除场景的接口权限，如有需要请联系管理员。");
      return;
    }

    setDeletingScene(true);
    setDeleteSceneError(null);

    try {
      await deleteScene(sceneToDelete.code);
      
      // 如果删除的是当前选中的场景，切换到"全部场景"
      if (onSelectedSceneChange && selectedScene === sceneToDelete.code) {
        onSelectedSceneChange("all");
      }
      
      // 刷新场景列表
      await onScenesChange();
      
      // 关闭对话框
      setIsDeleteSceneDialogOpen(false);
      setSceneToDelete(null);
    } catch (error: any) {
      logger.error("删除场景失败", error);
      handleDeleteSceneError(error, error?.message || "删除场景失败，请稍后重试");
    } finally {
      setDeletingScene(false);
    }
  }, [sceneToDelete, canDeleteSceneApi, selectedScene, onScenesChange, onSelectedSceneChange, handleDeleteSceneError]);

  // 重置创建场景表单
  const resetCreateForm = useCallback(() => {
    setNewSceneCode("");
    setNewSceneName("");
    setSelectedPlaceholderKeys(new Set());
    setCreateSceneError(null);
  }, []);

  return {
    // 创建场景
    isCreateSceneDialogOpen,
    setIsCreateSceneDialogOpen,
    newSceneCode,
    setNewSceneCode,
    newSceneName,
    setNewSceneName,
    createSceneError,
    setCreateSceneError,
    creatingScene,
    selectedPlaceholderKeys,
    handleTogglePlaceholder,
    resetCreateForm,
    handleCreateScene,
    
    // 编辑场景
    isEditSceneDialogOpen,
    setIsEditSceneDialogOpen,
    sceneToEdit,
    editSceneName,
    setEditSceneName,
    editSelectedPlaceholderKeys,
    setEditSelectedPlaceholderKeys,
    isEditingScene,
    editSceneError,
    handleToggleEditPlaceholder,
    handleOpenEditSceneDialog,
    handleEditScene,
    
    // 删除场景
    isDeleteSceneDialogOpen,
    setIsDeleteSceneDialogOpen,
    sceneToDelete,
    deletingScene,
    deleteSceneError,
    handleOpenDeleteSceneDialog,
    handleDeleteScene,
    
    // 占位符列表
    availablePlaceholders,
    loadingPlaceholders,
  };
}
