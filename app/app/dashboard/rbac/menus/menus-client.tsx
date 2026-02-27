"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Save, RotateCcw } from "lucide-react";
import { Permission, getMenuTree, updateMenuConfig, getPermissions, MenuItem } from "@/lib/api/rbac";
import { showSuccessToast } from "@/lib/utils/toast";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { userStore } from "@/store/user-store";

interface MenusClientProps {}

// 菜单项编辑状态
interface MenuEditState {
  parent_id: string | null;
  sort_order: number;
}

function MenusClientImpl(props: MenusClientProps) {
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [allMenus, setAllMenus] = useState<Permission[]>([]);
  const [error, setError] = useState<string>("");
  // 编辑状态：记录每个菜单项的修改
  const [editStates, setEditStates] = useState<Map<string, MenuEditState>>(new Map());
  const [saving, setSaving] = useState(false);
  
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const fetchMenuTree = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getMenuTree();
      setMenuTree(response);
      // 初始化编辑状态：使用当前菜单树的值
      const newEditStates = new Map<string, MenuEditState>();
      const initEditStates = (items: MenuItem[]) => {
        items.forEach(item => {
          newEditStates.set(item.id, {
            parent_id: item.parent_id || item.parentId || null,
            sort_order: item.sort_order || item.sortOrder || 0,
          });
          if (item.children && item.children.length > 0) {
            initEditStates(item.children);
          }
        });
      };
      initEditStates(response);
      setEditStates(newEditStates);
      // 默认展开所有节点
      const allIds = new Set<string>();
      const collectIds = (items: MenuItem[]) => {
        items.forEach(item => {
          allIds.add(item.id);
          if (item.children && item.children.length > 0) {
            collectIds(item.children);
          }
        });
      };
      collectIds(response);
      setExpandedNodes(allIds);
    } catch (err) {
      handleError(err, "获取菜单树失败");
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const fetchAllMenus = useCallback(async () => {
    try {
      const response = await getPermissions({ type: "menu", is_active: true, limit: 500 });
      setAllMenus(response.items);
    } catch (err) {
      handleError(err, "获取菜单列表失败");
    }
  }, [handleError]);

  useEffect(() => {
    fetchMenuTree();
    fetchAllMenus();
  }, [fetchMenuTree, fetchAllMenus]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // 更新编辑状态
  const updateEditState = (permissionId: string, field: keyof MenuEditState, value: string | number | null) => {
    setEditStates(prev => {
      const next = new Map(prev);
      const current = next.get(permissionId) || {
        parent_id: null,
        sort_order: 0,
      };
      next.set(permissionId, {
        ...current,
        [field]: value,
      });
      return next;
    });
  };

  // 检查是否有未保存的更改
  const hasChanges = useMemo(() => {
    const checkChanges = (items: MenuItem[]): boolean => {
      for (const item of items) {
        const editState = editStates.get(item.id);
        if (editState) {
          const currentParentId = item.parent_id || item.parentId || null;
          const currentSortOrder = item.sort_order || item.sortOrder || 0;
          if (editState.parent_id !== currentParentId || editState.sort_order !== currentSortOrder) {
            return true;
          }
        }
        if (item.children && item.children.length > 0) {
          if (checkChanges(item.children)) {
            return true;
          }
        }
      }
      return false;
    };
    return checkChanges(menuTree);
  }, [menuTree, editStates]);

  // 批量保存所有更改
  const handleSaveAll = async () => {
    try {
      setError("");
      setSaving(true);
      
      // 收集所有需要更新的菜单项
      const updates: Array<{ permissionId: string; data: { parent_id: string | null; sort_order: number } }> = [];
      
      const collectUpdates = (items: MenuItem[]) => {
        items.forEach(item => {
          const editState = editStates.get(item.id);
          if (editState) {
            const currentParentId = item.parent_id || item.parentId || null;
            const currentSortOrder = item.sort_order || item.sortOrder || 0;
            // 只保存有变化的项
            if (editState.parent_id !== currentParentId || editState.sort_order !== currentSortOrder) {
              updates.push({
                permissionId: item.id,
                data: {
                  parent_id: editState.parent_id,
                  sort_order: editState.sort_order,
                },
              });
            }
          }
          if (item.children && item.children.length > 0) {
            collectUpdates(item.children);
          }
        });
      };
      
      collectUpdates(menuTree);
      
      if (updates.length === 0) {
        showSuccessToast("没有需要保存的更改");
        return;
      }
      
      // 批量提交所有更新
      await Promise.all(
        updates.map(({ permissionId, data }) =>
          updateMenuConfig(permissionId, data)
        )
      );
      
      showSuccessToast(`成功保存 ${updates.length} 个菜单配置`);
      
      // 刷新菜单树（同时更新本地状态和左侧菜单）
      const freshMenuTree = await getMenuTree();
      setMenuTree(freshMenuTree);
      // 更新左侧菜单（通过 userStore）
      userStore.setMenuTree(freshMenuTree);
      
      // 重新初始化编辑状态
      const newEditStates = new Map<string, MenuEditState>();
      const initEditStates = (items: MenuItem[]) => {
        items.forEach(item => {
          newEditStates.set(item.id, {
            parent_id: item.parent_id || item.parentId || null,
            sort_order: item.sort_order || item.sortOrder || 0,
          });
          if (item.children && item.children.length > 0) {
            initEditStates(item.children);
          }
        });
      };
      initEditStates(freshMenuTree);
      setEditStates(newEditStates);
    } catch (err) {
      handleError(err, "保存菜单配置失败");
    } finally {
      setSaving(false);
    }
  };

  // 重置所有更改
  const handleReset = () => {
    const newEditStates = new Map<string, MenuEditState>();
    const initEditStates = (items: MenuItem[]) => {
      items.forEach(item => {
        newEditStates.set(item.id, {
          parent_id: item.parent_id || item.parentId || null,
          sort_order: item.sort_order || item.sortOrder || 0,
        });
        if (item.children && item.children.length > 0) {
          initEditStates(item.children);
        }
      });
    };
    initEditStates(menuTree);
    setEditStates(newEditStates);
    setError("");
  };

  // 获取可选的父菜单列表（排除自己和子菜单，避免循环引用）
  const getAvailableParents = (currentItem: MenuItem): Permission[] => {
    const excludeIds = new Set<string>([currentItem.id]);
    // 收集所有子菜单ID
    const collectChildrenIds = (item: MenuItem) => {
      if (item.children && item.children.length > 0) {
        item.children.forEach(child => {
          excludeIds.add(child.id);
          collectChildrenIds(child);
        });
      }
    };
    collectChildrenIds(currentItem);
    return allMenus.filter(m => !excludeIds.has(m.id));
  };

  const renderMenuTree = (items: MenuItem[], level = 0) => {
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isExpanded = expandedNodes.has(item.id);
      const editState = editStates.get(item.id) || {
        parent_id: item.parent_id || item.parentId || null,
        sort_order: item.sort_order || item.sortOrder || 0,
      };
      const availableParents = getAvailableParents(item);
      
      return (
        <div key={item.id} className="select-none">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-md",
              level > 0 && "ml-6"
            )}
            style={{ paddingLeft: `${level * 24 + 12}px` }}
          >
            {hasChildren ? (
              <button
                onClick={() => toggleNode(item.id)}
                className="p-1 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{item.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* 父菜单选择 */}
              <Select
                value={editState.parent_id || "__root__"}
                onValueChange={(value) => {
                  updateEditState(item.id, "parent_id", value === "__root__" ? null : value);
                }}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="选择父菜单" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">根节点（顶级菜单）</SelectItem>
                  {availableParents.map((menu) => (
                    <SelectItem key={menu.id} value={menu.id}>
                      {menu.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 排序输入 */}
              <Input
                type="number"
                value={editState.sort_order}
                onChange={(e) => {
                  updateEditState(item.id, "sort_order", Number(e.target.value) || 0);
                }}
                className="w-20 h-8 text-xs"
                placeholder="排序"
              />
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div className="ml-6">
              {renderMenuTree(item.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="菜单管理"
        description="管理系统菜单的层级结构和排序顺序，修改后点击保存按钮生效"
        action={
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                重置
              </Button>
            )}
            <Button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "保存中..." : "保存更改"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 菜单列表 */}
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : menuTree.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无菜单数据
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-md p-4">
            {/* 表头 */}
            <div className="flex items-center gap-2 px-3 py-2 mb-2 border-b text-sm font-medium text-muted-foreground">
              <div className="w-6" />
              <div className="flex-1">菜单名称</div>
              <div className="w-[180px]">父菜单</div>
              <div className="w-20">排序</div>
            </div>
            {renderMenuTree(menuTree)}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export const MenusClient = observer(MenusClientImpl);
