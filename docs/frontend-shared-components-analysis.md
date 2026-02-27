# 前端公共组件与业务抽离分析

## 一、可抽取的公共组件

### 1. 高优先级

| 组件 | 当前状态 | 建议路径 | 说明 |
|------|----------|----------|------|
| **TableColumnFormField** | `row-record-dialog.tsx`、`row-condition-dialog.tsx` 中 `renderFormField` 重复 | `components/shared/table-column-form-field.tsx` | 根据列类型渲染表单字段（文本、数字、日期等） |
| **ConfirmDialog**（通用） | `DeleteConfirmDialog` 已存在；compositions、scene-delete、WidgetTeamCode 使用内联 `AlertDialog` | 扩展 `DeleteConfirmDialog` 或新增 `ConfirmDialog` | 统一确认弹窗 |
| **EntityCard** | `TableCard`、`RoleCard`、`PromptCard`、组合卡片布局相似 | `components/shared/entity-card.tsx` | 提供 icon、title、description、actions 插槽 |
| **ImportExcelDialog** | `spreadsheet-table-view.tsx`、`canvas-spreadsheet-table-view.tsx` 中导入弹窗重复 | `components/shared/import-excel-dialog.tsx` | 表格导入 Excel 通用弹窗 |
| **MessageDialog** | 两个 spreadsheet 视图中的错误/成功弹窗 | `components/shared/message-dialog.tsx` | 通用消息提示弹窗 |

### 2. 中优先级

| 组件 | 当前状态 | 建议路径 | 说明 |
|------|----------|----------|------|
| **DateFormatConverter** | `tables-config-client.tsx`、`table-editor.tsx` 中 `convertDateFormat` 重复 | `lib/utils/date-format.ts` 或 `hooks/use-date-format-converter.ts` | 日期格式转换工具 |
| **ConfigFormDialog** | models、MCP、notification 的创建/编辑弹窗结构相似 | `components/shared/config-form-dialog.tsx` | 带 header/footer 的配置表单弹窗包装器 |
| **DataTablePage** | tenants、teams、models、MCP 等页面的 PageHeader + 表格 + 分页 + 操作栏 | `components/shared/data-table-page.tsx` | 数据表格页面布局模板 |

---

## 二、业务逻辑抽离建议

### 1. 配置类页面

| 组件 | 建议 Hook | 抽离逻辑 |
|------|-----------|----------|
| `models-config-client.tsx` | `useModelsConfig` | fetch、create、update、delete、表单状态、弹窗状态 |
| `mcp-config-client.tsx` | `useMCPConfig` | fetch、verify、create、delete、表单状态 |
| `notification-config-client.tsx` | `useNotificationConfig` | load、save、test、表单状态、provider 切换 |
| `menus-config-client.tsx` | `useMenusConfig` | 菜单树、展开/折叠、编辑流程 |
| `tables-config-client.tsx` | `useTablesConfig`、`useDateFormatConverter` | 表格 CRUD、列 CRUD、导入、日期转换 |

### 2. 表格视图

| 组件 | 建议 Hook | 抽离逻辑 |
|------|-----------|----------|
| `spreadsheet-table-view.tsx` | `useSpreadsheetTable`、`useTableImport`、`useTableFilters` | 单元格编辑、筛选、导入、弹窗 |
| `canvas-spreadsheet-table-view.tsx` | 同上 | 同上；canvas 渲染保留在视图层 |
| `table-editor.tsx` | `useDateFormatConverter`、`useColumnEditor` | 日期转换、列增删改 |

### 3. 业务页面

| 组件 | 建议 Hook | 抽离逻辑 |
|------|-----------|----------|
| `WidgetTables.tsx` | `useWidgetTables` | fetch 表格、fetch 行、图表配置 |
| `rbac-client.tsx` | `useRolePermissions` | 权限选择、卡片级选择 |
| `compositions-client.tsx` | `useCompositions`（已有，可扩展） | CRUD、删除确认、调试弹窗 |

---

## 三、重复 UI 模式汇总

### 卡片

- **实体卡片**：`table-card`、`role-card`、`prompt-card`、组合卡片 → 可统一为 `EntityCard`
- **区块卡片**：`object-field-section`、`menus-config-client` 等 → 已有 `ObjectFieldSection`

### 表单弹窗

- **Form Dialog**：composition-form、tenant-form、team-form、prompt-form、table-form 等 → 结构相似，可抽象 `ConfigFormDialog`

### 表格

- **数据表格**：tenants、teams、models、MCP、placeholders → 共享 PageHeader、TableSkeleton、TableState、ActionButtons、SortIcon、列可见性

---

## 四、已有良好实践

| 组件 | 路径 | 使用场景 |
|------|------|----------|
| DeleteConfirmDialog | `components/shared/delete-confirm-dialog.tsx` | tenants、tables、teams、roles、placeholders |
| ActionButtons | `components/shared/action-buttons.tsx` | TableCard、RoleCard、数据表格 |
| PageHeader | `components/shared/page-header.tsx` | 配置页、tenants、teams |
| TableState / TableSkeleton | `components/shared/` | 数据表格 |
| Pagination | `components/ui/pagination.tsx` | 列表分页 |
| ObjectFieldSection | `components/shared/object-field-section.tsx` | API 参数区块 |

---

## 五、实施建议

1. **Dialog 统一**：能用 `DeleteConfirmDialog` 的尽量使用；其他确认场景增加通用 `ConfirmDialog`
2. **表单字段**：从 `row-record-dialog`、`row-condition-dialog` 抽取 `TableColumnFormField`
3. **日期处理**：将 `convertDateFormat` 集中到 `lib/utils/date-format.ts`
4. **配置类页面**：将 fetch、CRUD、表单状态抽到 hooks
5. **Spreadsheet 视图**：抽 `useSpreadsheetTable`、`useTableImport`、`useTableFilters` 降低体积和重复
6. **实体卡片**：引入 `EntityCard` 统一 table、role、prompt、composition 卡片
