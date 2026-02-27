"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  MENU_BUTTON_PERMISSIONS,
  BUTTON_PERMISSIONS,
  useHasMenuButtonPermission,
  useHasButtonPermission,
} from "@/lib/permissions";
import { PromptPlaceholderDebugDialog } from "./components/prompt-placeholder-debug-dialog";
import { PromptFilters } from "./components/prompt-filters";
import { PromptFormDialog } from "./components/prompt-form-dialog";
import { SceneCreateDialog } from "./components/scene-create-dialog";
import { SceneEditDialog } from "./components/scene-edit-dialog";
import { SceneDeleteDialog } from "./components/scene-delete-dialog";
import { PromptList } from "./components/prompt-list";
import { parsePlaceholdersFromText, parsePlaceholderDetails } from "./utils/prompt-utils";
import { useScenes } from "./hooks/use-scenes";
import { useTenants } from "./hooks/use-tenants";
import { usePrompts } from "./hooks/use-prompts";
import { usePlaceholders } from "./hooks/use-placeholders";
import { usePromptFilters } from "./hooks/use-prompt-filters";
import { useSceneManagement } from "./hooks/use-scene-management";
import { usePromptForm } from "./hooks/use-prompt-form";

// ==================== 类型定义 ====================

// 场景类型
export type PromptScene = string;

export type Scene = {
  id: string;
  code: PromptScene;
  name: string;
  is_predefined?: boolean; // 是否是预置场景
  team_code?: string | null; // 团队代码，null表示系统创建的场景
};

// 占位符类型（从服务端获取）
export type Placeholder = {
  key: string;
  label: string;
  scene: PromptScene;
  description?: string;
  data_source_type?: string; // user_input | multi_dimension_table
  data_type?: string;
  table_id?: string;
  table_column_key?: string;
  table_row_id_param_key?: string;
};

// 提示词类型（不包含 title）
export type Prompt = {
  id: string;
  scene: PromptScene;
  tenantId: string | "default";
  content: string;
  placeholders: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

// 租户类型（与 API 返回的数据结构匹配）
export type Tenant = {
  id: string;
  code_id: string;
  name: string;
};

// ==================== 主组件 ====================

type PromptsClientProps = {
  initialTenants?: Tenant[];
  initialPrompts?: Prompt[];
};

function PromptsClientImpl({ initialTenants, initialPrompts }: PromptsClientProps) {
  // 客户端挂载状态，用于避免 hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const canCreate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.prompts.create);
  const canUpdate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.prompts.update);
  // 接口级权限（提示词管理）
  const canCreateApi = useHasButtonPermission(BUTTON_PERMISSIONS.prompts.create);
  const canUpdateApi = useHasButtonPermission(BUTTON_PERMISSIONS.prompts.update);
  
  // 场景管理权限
  const canCreateScene = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.scenes.create);
  const canUpdateScene = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.scenes.update);
  const canDeleteScene = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.scenes.delete);
  // 接口级权限（场景管理）
  const canCreateSceneApi = useHasButtonPermission(BUTTON_PERMISSIONS.scenes.create);
  const canUpdateSceneApi = useHasButtonPermission(BUTTON_PERMISSIONS.scenes.update);
  const canDeleteSceneApi = useHasButtonPermission(BUTTON_PERMISSIONS.scenes.delete);

  // 数据管理 Hooks
  const { scenes, loadingScenes, scenesError, fetchScenes, setScenes } = useScenes();
  const { tenants, loadingTenants, tenantsError, fetchTenants } = useTenants(initialTenants);
  const { prompts, loadingPrompts, fetchPrompts, setPrompts } = usePrompts(initialPrompts);
  const { placeholders, loadingPlaceholders, fetchPlaceholdersByScene, setPlaceholders } = usePlaceholders();

  // 筛选逻辑 Hook
  const {
    selectedScene,
    selectedTenant,
    searchQuery,
    filteredPrompts,
    missingPrompts,
    setSelectedScene,
    setSelectedTenant,
    setSearchQuery,
  } = usePromptFilters(prompts, scenes, tenants);
  
  // 调试对话框状态
  const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false);
  const [debuggingPrompt, setDebuggingPrompt] = useState<Prompt | null>(null);

  // 场景管理 Hook
  const sceneManagement = useSceneManagement({
    scenes,
    onScenesChange: fetchScenes,
    onPlaceholdersChange: fetchPlaceholdersByScene,
    canCreateSceneApi,
    canUpdateSceneApi,
    canDeleteSceneApi,
    selectedScene,
    onSelectedSceneChange: setSelectedScene,
  });

  // 校验占位符函数（需要访问 placeholders 和 scenes）
  const validatePlaceholders = useCallback((
    text: string,
    scene: PromptScene
  ): { valid: boolean; error?: string } => {
    let depth = 0;
    let inPlaceholder = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === "{") {
        if (inPlaceholder) {
          return {
            valid: false,
            error: "不允许嵌套的占位符，请确保每个 { 都有对应的 }",
          };
        }
        inPlaceholder = true;
        depth++;
      } else if (char === "}") {
        if (!inPlaceholder) {
          return {
            valid: false,
            error: "检测到多余的 }，请确保每个 } 都有对应的 {",
          };
        }
        inPlaceholder = false;
        depth--;
        if (depth < 0) {
          return {
            valid: false,
            error: "占位符格式错误：} 的数量多于 {",
          };
        }
      }
    }

    if (depth > 0 || inPlaceholder) {
      return {
        valid: false,
        error: "占位符未闭合，请确保每个 { 都有对应的 }",
      };
    }

    // 检查占位符是否在允许列表中
    // 解析所有占位符（支持新格式和旧格式）
    const usedPlaceholderTexts = parsePlaceholdersFromText(text);
    const allowedKeys = new Set(placeholders.map((p) => p.key));
    const allowedLabels = new Set(placeholders.map((p) => p.label));
    
    const invalidPlaceholders: string[] = [];
    
    for (const placeholderText of usedPlaceholderTexts) {
      // 解析占位符详细信息（支持新格式）
      const details = parsePlaceholderDetails(`{${placeholderText}}`);
      
      if (details) {
        // 检查占位符配置中是否存在该 key
        const isValid = allowedKeys.has(details.key) || allowedLabels.has(details.key);
        if (!isValid) {
          invalidPlaceholders.push(details.originalText);
        }
      } else {
        // 如果解析失败，使用旧格式检查（向后兼容）
        const isValid = allowedKeys.has(placeholderText) || allowedLabels.has(placeholderText);
        if (!isValid) {
          invalidPlaceholders.push(`{${placeholderText}}`);
        }
      }
    }

    if (invalidPlaceholders.length > 0) {
      const sceneLabel = scenes.find((s) => s.code === scene)?.name || scene;
      return {
        valid: false,
        error: `检测到未配置的占位符：${invalidPlaceholders.join(", ")}。请使用当前场景（${sceneLabel}）的可用占位符。`,
      };
    }

    return { valid: true };
  }, [placeholders, scenes]);

  // 提示词表单管理 Hook
  const promptForm = usePromptForm({
    canCreateApi,
    canUpdateApi,
    validatePlaceholders,
    onPromptsChange: useCallback(() => {
      fetchPrompts(selectedScene, selectedTenant);
    }, [selectedScene, selectedTenant, fetchPrompts]),
  });

  // 组件加载时获取数据
  useEffect(() => {
    fetchScenes();
    // 如果 SSR 已经提供首屏租户列表，则首屏不再重复请求
    if (initialTenants && initialTenants.length > 0) {
      return;
    }
    fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTenants]);

  // 根据筛选条件加载提示词；首屏有初始数据且为默认筛选时不再重复请求
  useEffect(() => {
    if (
      initialPrompts &&
      initialPrompts.length > 0 &&
      selectedScene === "all" &&
      selectedTenant === "default"
    ) {
      return;
    }
    fetchPrompts(selectedScene, selectedTenant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompts, selectedScene, selectedTenant]);

  // 当场景变化时，获取对应的占位符
  useEffect(() => {
    if (promptForm.editingScene) {
      fetchPlaceholdersByScene(promptForm.editingScene);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptForm.editingScene]);



  // 打开调试对话框
  const handleOpenDebugDialog = useCallback(async (prompt: Prompt) => {
    setDebuggingPrompt(prompt);
    // 加载占位符列表
    await fetchPlaceholdersByScene(prompt.scene);
    setIsDebugDialogOpen(true);
  }, [fetchPlaceholdersByScene]);


  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">提示词管理</h2>
          <p className="text-muted-foreground">
            创建和管理提示词模板，支持多场景、多租户配置
          </p>
        </div>
      </div>

      {/* 筛选栏 */}
      <PromptFilters
        isMounted={isMounted}
        selectedScene={selectedScene}
        selectedTenant={selectedTenant}
        searchQuery={searchQuery}
        scenes={scenes}
        tenants={tenants}
        loadingTenants={loadingTenants}
        tenantsError={tenantsError}
        canCreateScene={canCreateScene}
        canUpdateScene={canUpdateScene}
        canDeleteScene={canDeleteScene}
        onSceneChange={setSelectedScene}
        onTenantChange={setSelectedTenant}
        onSearchChange={setSearchQuery}
        onCreateScene={() => {
          sceneManagement.setIsCreateSceneDialogOpen(true);
          sceneManagement.setCreateSceneError(null);
        }}
        onEditScene={sceneManagement.handleOpenEditSceneDialog}
        onDeleteScene={sceneManagement.handleOpenDeleteSceneDialog}
      />

      {/* 提示词列表 */}
      <PromptList
        loadingPrompts={loadingPrompts}
        filteredPrompts={filteredPrompts}
        missingPrompts={missingPrompts}
        tenants={tenants}
        isMounted={isMounted}
        canUpdate={canUpdate}
        canCreate={canCreate}
        onEditById={promptForm.handleEditPromptById}
        onEdit={promptForm.handleEditPrompt}
        onDebug={handleOpenDebugDialog}
      />

      {/* 编辑对话框 */}
      {isMounted && (
        <PromptFormDialog
          open={promptForm.isDialogOpen}
          onOpenChange={(open) => {
            promptForm.setIsDialogOpen(open);
            if (!open) {
              promptForm.setValidationError(null);
            }
          }}
          editingPrompt={promptForm.editingPrompt}
          editingScene={promptForm.editingScene}
          editingTenant={promptForm.editingTenant}
          formContent={promptForm.formContent}
          validationError={promptForm.validationError}
          usedPlaceholders={promptForm.usedPlaceholders}
          placeholders={placeholders}
          loadingPlaceholders={loadingPlaceholders}
          tenants={tenants}
          onContentChange={(content) => {
            promptForm.setFormContent(content);
            if (promptForm.validationError) {
              promptForm.setValidationError(null);
            }
          }}
          onSave={promptForm.handleSavePrompt}
        />
      )}

      {/* 创建场景对话框 */}
      {isMounted && (
        <SceneCreateDialog
          open={sceneManagement.isCreateSceneDialogOpen}
          onOpenChange={(open) => {
            sceneManagement.setIsCreateSceneDialogOpen(open);
            if (!open) {
              sceneManagement.resetCreateForm();
            }
          }}
          newSceneCode={sceneManagement.newSceneCode}
          newSceneName={sceneManagement.newSceneName}
          selectedPlaceholderKeys={sceneManagement.selectedPlaceholderKeys}
          creatingScene={sceneManagement.creatingScene}
          createSceneError={sceneManagement.createSceneError}
          availablePlaceholders={sceneManagement.availablePlaceholders}
          loadingPlaceholders={sceneManagement.loadingPlaceholders}
          onCodeChange={(code) => {
            sceneManagement.setNewSceneCode(code);
            if (sceneManagement.createSceneError) {
              sceneManagement.setCreateSceneError(null);
            }
          }}
          onNameChange={(name) => {
            sceneManagement.setNewSceneName(name);
            if (sceneManagement.createSceneError) {
              sceneManagement.setCreateSceneError(null);
            }
          }}
          onTogglePlaceholder={sceneManagement.handleTogglePlaceholder}
          onCreate={sceneManagement.handleCreateScene}
        />
      )}

      {/* 编辑场景对话框 */}
      {isMounted && (
        <SceneEditDialog
          open={sceneManagement.isEditSceneDialogOpen}
          onOpenChange={(open) => {
            sceneManagement.setIsEditSceneDialogOpen(open);
            if (!open) {
              sceneManagement.setEditSelectedPlaceholderKeys(new Set());
            }
          }}
          scene={sceneManagement.sceneToEdit}
          editSceneName={sceneManagement.editSceneName}
          editSelectedPlaceholderKeys={sceneManagement.editSelectedPlaceholderKeys}
          isEditingScene={sceneManagement.isEditingScene}
          editSceneError={sceneManagement.editSceneError}
          availablePlaceholders={sceneManagement.availablePlaceholders}
          loadingPlaceholders={sceneManagement.loadingPlaceholders}
          onNameChange={sceneManagement.setEditSceneName}
          onTogglePlaceholder={sceneManagement.handleToggleEditPlaceholder}
          onSave={sceneManagement.handleEditScene}
        />
      )}

      {/* 删除场景确认对话框 */}
      {isMounted && (
        <SceneDeleteDialog
          open={sceneManagement.isDeleteSceneDialogOpen}
          onOpenChange={sceneManagement.setIsDeleteSceneDialogOpen}
          scene={sceneManagement.sceneToDelete}
          deletingScene={sceneManagement.deletingScene}
          deleteSceneError={sceneManagement.deleteSceneError}
          onConfirm={sceneManagement.handleDeleteScene}
        />
      )}

      {/* 占位符调试对话框（仅占位符转换，不调用 LLM） */}
      {isMounted && (
        <PromptPlaceholderDebugDialog
          open={isDebugDialogOpen}
          onOpenChange={setIsDebugDialogOpen}
          prompt={debuggingPrompt}
          tenants={tenants}
          placeholders={placeholders}
        />
      )}
    </div>
  );
}

export const PromptsClient = observer(PromptsClientImpl);
