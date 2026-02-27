"use client";

import { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, ChevronRight, ChevronDown } from "lucide-react";
import { Permission, getMenuTree, updateMenuConfig, getPermissions, MenuItem } from "@/lib/api/rbac";
import { showSuccessToast } from "@/lib/utils/toast";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

interface MenusConfigClientProps {}

function MenusConfigClientImpl(props: MenusConfigClientProps) {
  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [editingPermission, setEditingPermission] = useState<MenuItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [parentId, setParentId] = useState<string>("__root__");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [allMenus, setAllMenus] = useState<Permission[]>([]);
  const [error, setError] = useState<string>("");
  
  const { handleError } = useErrorHandler({ setError, showToast: false });

  // 获取菜单树
  const fetchMenuTree = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getMenuTree();
      setMenuTree(response);
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

  // 获取所有菜单权限（用于父菜单选择）
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

  // 切换节点展开/折叠
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

  // 打开编辑对话框
  const handleEdit = (permission: MenuItem) => {
    setEditingPermission(permission);
    setParentId(permission.parent_id || permission.parentId || "__root__");
    setSortOrder(permission.sort_order || permission.sortOrder || 0);
    setIsDialogOpen(true);
  };

  // 保存菜单配置
  const handleSave = async () => {
    if (!editingPermission) return;
    
    try {
      setError("");
      await updateMenuConfig(editingPermission.id, {
        parent_id: parentId === "__root__" ? null : parentId,
        sort_order: sortOrder,
      });
      showSuccessToast("菜单配置已保存");
      setIsDialogOpen(false);
      await fetchMenuTree();
      await fetchAllMenus();
    } catch (err) {
      handleError(err, "保存菜单配置失败");
    }
  };

  // 渲染菜单树节点
  const renderTreeNode = (node: MenuItem, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const indent = level * 24;

    return (
      <div key={node.id} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-3 hover:bg-accent rounded-md",
            level > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${indent + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-1 hover:bg-accent rounded"
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
          <div className="flex-1 flex items-center gap-2">
            <span className="font-medium">{node.name}</span>
            <Badge variant="outline" className="text-xs">
              {node.code}
            </Badge>
            {(node.parent_id || node.parentId) && (
              <Badge variant="secondary" className="text-xs">
                子菜单
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              排序: {node.sort_order || node.sortOrder || 0}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEdit(node)}
            className="h-8"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 获取可选的父菜单列表（排除当前编辑的菜单及其子菜单，避免循环引用）
  const getAvailableParents = () => {
    if (!editingPermission) return allMenus;
    
    // 排除当前菜单本身
    const excludeIds = new Set([editingPermission.id]);
    
    // 递归收集所有子菜单ID
    const collectChildren = (node: MenuItem) => {
      if (node.children) {
        node.children.forEach(child => {
          excludeIds.add(child.id);
          collectChildren(child);
        });
      }
    };
    
    // 找到当前菜单在树中的位置
    const findNode = (nodes: MenuItem[]): MenuItem | null => {
      for (const node of nodes) {
        if (node.id === editingPermission.id) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const currentNode = findNode(menuTree);
    if (currentNode) {
      collectChildren(currentNode);
    }
    
    return allMenus.filter(menu => !excludeIds.has(menu.id));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">菜单配置</h2>
          <p className="text-muted-foreground text-sm mt-1">
            配置菜单的父子关系和排序顺序，支持二级菜单折叠
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="border rounded-lg p-4 bg-card">
        <div className="space-y-1">
          {menuTree.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无菜单数据
            </div>
          ) : (
            menuTree.map(node => renderTreeNode(node))
          )}
        </div>
      </div>

      {/* 编辑对话框 */}
      <Dialog 
        open={isDialogOpen} 
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            // 对话框关闭时重置状态
            setEditingPermission(null);
            setParentId("__root__");
            setSortOrder(0);
            setError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑菜单配置</DialogTitle>
            <DialogDescription>
              配置菜单的父菜单和排序顺序
            </DialogDescription>
          </DialogHeader>
          
          {editingPermission && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>菜单名称</Label>
                <Input value={editingPermission.name} disabled />
              </div>
              
              <div className="space-y-2">
                <Label>菜单代码</Label>
                <Input value={editingPermission.code} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_id">父菜单</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger id="parent_id">
                    <SelectValue placeholder="选择父菜单（留空表示根菜单）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">无（根菜单）</SelectItem>
                    {getAvailableParents().map(menu => (
                      <SelectItem key={menu.id} value={menu.id}>
                        {menu.name} ({menu.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  选择父菜单后，此菜单将成为子菜单，支持二级菜单折叠
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort_order">排序顺序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  数字越小越靠前，相同数字按名称排序
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  取消
                </Button>
                <Button onClick={handleSave}>
                  保存
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const MenusConfigClient = observer(MenusConfigClientImpl);
