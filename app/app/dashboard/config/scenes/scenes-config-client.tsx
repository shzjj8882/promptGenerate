"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { observer } from "mobx-react-lite";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { getScenes, createScene, updateScene, deleteScene, type Scene, type SceneCreate, type SceneUpdate } from "@/lib/api/scenes";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { SceneCreateDialog } from "@/app/dashboard/prompts/components/scene-create-dialog";
import { SceneEditDialog } from "@/app/dashboard/prompts/components/scene-edit-dialog";
import { SceneDeleteDialog } from "@/app/dashboard/prompts/components/scene-delete-dialog";
import { useSceneManagement } from "@/app/dashboard/prompts/hooks/use-scene-management";
import { PREDEFINED_PLACEHOLDERS } from "@/app/dashboard/prompts/constants/placeholders";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemoizedTableRow } from "@/components/shared/memoized-table-row";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortIcon } from "@/components/shared/sort-icon";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";

function ScenesConfigClientImpl() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { handleError } = useErrorHandler({
    showToast: true,
  });

  // 场景管理 Hook
  const sceneManagement = useSceneManagement({
    scenes,
    onScenesChange: () => {
      fetchScenes();
    },
    canCreateSceneApi: true,
    canUpdateSceneApi: true,
    canDeleteSceneApi: true,
    selectedScene: "all",
  });

  const fetchScenes = async () => {
    try {
      setLoading(true);
      const data = await getScenes();
      setScenes(data);
    } catch (error) {
      handleError(error, "加载场景列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchScenes();
  }, []);

  // Data Table 状态
  const [sorting, setSorting] = useState<SortingState>([{ id: "code", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const columnsToggleable = useMemo(
    () => [
      { id: "code", label: "场景代码" },
      { id: "name", label: "场景名称" },
      { id: "is_predefined", label: "类型" },
    ],
    []
  );

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  const columns = useMemo<ColumnDef<Scene>[]>(
    () => [
      // 用于全局搜索，隐藏不展示
      {
        id: "search",
        accessorFn: (row) => `${row.code} ${row.name}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            场景代码
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.code}</div>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            场景名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        id: "is_predefined",
        accessorFn: (row) => row.is_predefined || false,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            类型
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => {
          const isPredefined = row.original.is_predefined || false;
          return (
            <Badge variant={isPredefined ? "outline" : "secondary"}>
              {isPredefined ? "预置" : "自定义"}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const scene = row.original;
          const canEdit = !scene.is_predefined;
          const canDelete = !scene.is_predefined;
          return (
            <ActionButtons
              onEdit={() => {
                if (canEdit) {
                  sceneManagement.handleOpenEditSceneDialog(scene);
                }
              }}
              onDelete={() => {
                if (canDelete) {
                  sceneManagement.handleOpenDeleteSceneDialog(scene);
                }
              }}
              canEdit={canEdit}
              canDelete={canDelete}
              variant="dropdown"
            />
          );
        },
      },
    ],
    [renderSortIcon, sceneManagement]
  );

  const table = useReactTable({
    data: scenes,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="场景值配置"
        description="管理系统中的所有业务场景，包括预置场景和自定义场景"
        action={null}
      />

      {/* 列表：中间可滚动 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏（搜索等） */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索场景（代码 / 名称）..."
              value={(table.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("search")?.setFilterValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuLabel>显示列</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columnsToggleable.map((c) => {
                  const col = table.getColumn(c.id);
                  if (!col) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-9" onClick={() => sceneManagement.setIsCreateSceneDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新建场景
            </Button>
          </div>
        </div>

        {/* 场景列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-muted/40">
                    {headerGroup.headers
                      .filter((h) => h.column.id !== "search")
                      .map((header) => (
                        <TableHead
                          key={header.id}
                          className={[
                            "h-12 px-4 align-middle",
                            header.column.id === "actions" ? "text-right" : "",
                          ].join(" ")}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={5} cols={4} />
                ) : (
                  <>
                    <TableState
                      loading={false}
                      empty={!table.getRowModel().rows?.length}
                      colSpan={4}
                      emptyText="暂无场景数据"
                    />
                    {table.getRowModel().rows?.length > 0 &&
                      table.getRowModel().rows.map((row) => (
                        <MemoizedTableRow key={row.id} row={row} />
                      ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* 创建场景对话框 */}
      {mounted && (
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
      {mounted && (
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
      {mounted && (
        <SceneDeleteDialog
          open={sceneManagement.isDeleteSceneDialogOpen}
          onOpenChange={sceneManagement.setIsDeleteSceneDialogOpen}
          scene={sceneManagement.sceneToDelete}
          deletingScene={sceneManagement.deletingScene}
          deleteSceneError={sceneManagement.deleteSceneError}
          onConfirm={sceneManagement.handleDeleteScene}
        />
      )}
    </div>
  );
}

export const ScenesConfigClient = observer(ScenesConfigClientImpl);
