# APITable Canvas 表格移植指南

> 目标：分析 APITable 中**仅表格功能**相关代码，实现 100% 还原其 Canvas 表格逻辑

## 一、APITable 表格相关源码结构

### 1.1 核心包与依赖

| 包/文件 | 路径 | 表格相关度 | 说明 |
|--------|------|-----------|------|
| **datasheet** | `packages/datasheet` | 高 | 主表格视图，含 Konva 渲染 |
| **core** | `packages/core` | 中 | 数据模型、Selectors，表格强依赖 |
| **components** | `packages/components` | 低 | 通用 UI，表格用 react-window 等 |

### 1.2 表格专用依赖（datasheet/package.json）

```json
{
  "konva": "^8.3.13",           // Canvas 2D 渲染引擎
  "react-konva": "^18.2.2",    // Konva React 绑定
  "react-custom-scrollbars": "^4.2.1",  // 自定义滚动条
  "react-window": "^1.8.8",    // 虚拟化
  "react-virtualized-auto-sizer": "1.0.2"
}
```

### 1.3 表格视图调用链

```
DataSheetPane
  └── ViewContainer
        └── View (view.tsx)  ← 根据 viewType 渲染不同视图
              └── GridView (viewType === ViewType.Grid)
                    └── 来自 @apitable/datasheet 的 Grid 组件
```

## 二、仅表格功能 vs 平台功能

### 2.1 纯表格功能（可移植）

| 功能模块 | 说明 | 建议移植方式 |
|---------|------|-------------|
| **滚动架构** | Header/Body 拆分、scrollState、useGridScroller | 抽取逻辑，用原生或 react-custom-scrollbars 实现 |
| **坐标系统** | GridCoordinate：getRowOffset、getColumnOffset、可见行列范围 | 抽成独立工具类 |
| **虚拟化** | rowStartIndex、rowStopIndex、columnStartIndex、columnStopIndex | 已有，可对齐算法 |
| **Canvas 绘制** | 单元格、表头、边框、选中态 | 保持原生 Canvas 或迁移到 Konva |
| **DOM 覆盖层** | 编辑器、右键菜单、快速添加行 | 已有，可优化结构 |

### 2.2 平台/业务功能（不移植）

| 功能 | 说明 |
|------|------|
| Redux/Store | 全局状态、Selectors |
| @apitable/core | 数据模型、权限、协作 |
| 多视图 | Gallery、Kanban、Gantt、Calendar |
| 协作/OT | 实时编辑、Yjs |
| 空间/权限 | 工作区、分享、嵌入 |

## 三、可搬运的表格核心代码清单

### 3.1 需从 APITable 克隆后提取的路径

```bash
# 克隆 APITable
git clone --depth 1 https://github.com/apitable/apitable.git apitable-ref
cd apitable-ref
```

| 目标 | 源路径 | 用途 |
|------|--------|------|
| 滚动条逻辑 | `packages/datasheet/...` 中 Scrollbars、useGridScroller | 滚动同步 |
| 坐标计算 | 搜索 `getRowOffset`、`getColumnOffset`、`rowStartIndex` | 虚拟化与点击检测 |
| Konva 网格 | 搜索 `KonvaGrid`、`konva` 引用 | 若采用 Konva 则参考 |
| 单元格绘制 | 搜索 `drawCell`、`fillRect`、`strokeRect` | 绘制逻辑 |

### 3.2 关键文件（已定位）

| 文件 | 路径 | 已搬运 |
|------|------|--------|
| 坐标系统 | `konva_grid/model/coordinate/coordinate.ts` | ✅ `lib/grid-coordinate.ts` |
| 网格坐标 | `konva_grid/model/coordinate/grid_coordinate.ts` | ✅ 已合并 |
| 滚动 Hook | `konva_grid/hooks/use_grid_scroller.ts` | ✅ `config/tables/hooks/use-grid-scroller.ts` |
| 滚动条 | `scroll_bar.tsx` | 使用 react-custom-scrollbars |
| 主视图 | `konva_grid/konva_grid_view.tsx` | 参考布局结构 |

## 四、100% 还原 Canvas 表格逻辑的改造方案

### 4.1 方案 A：保持原生 Canvas，对齐 APITable 逻辑

**不引入 Konva**，沿用当前 `canvas-grid-renderer.ts`，只对齐：

1. **滚动架构**
   - 使用 `react-custom-scrollbars` 或等效实现
   - Header 固定，Body 独立纵向滚动
   - 横向滚动条与 Header 联动

2. **坐标系统**
   - 抽象 `GridCoordinate` 类
   - 统一 `getRowOffset`、`getColumnOffset`、可见范围计算

3. **虚拟化**
   - 对齐 `startRow`、`endRow`、`startCol`、`endCol` 计算公式
   - 确保底部/右侧数据在滚动时正确绘制

4. **滚动条位置**
   - 滚动条仅出现在 Body 区域
   - 内容高度 = 行数 × 行高 + 添加行按钮高度

### 4.2 方案 B：引入 Konva，完全对齐技术栈

**引入 konva + react-konva**，参考 APITable 的 Konva 实现：

1. 安装依赖：`pnpm add konva react-konva react-custom-scrollbars`
2. 将 `canvas-grid-renderer` 改为 Konva Stage/Layer
3. 使用 Konva 的 Rect、Text、Group 等绘制单元格
4. 事件通过 Konva 的 onMouseMove、onClick 等处理

### 4.3 推荐：方案 A + 部分搬运

- **搬运**：滚动架构、坐标计算、虚拟化公式
- **保持**：原生 Canvas 渲染（避免 Konva 依赖与迁移成本）
- **修复**：当前 split 布局下的滚动条与底部数据渲染问题

## 五、具体搬运步骤

### Step 1：定位 APITable 表格滚动与坐标代码

```bash
cd apitable-ref/packages/datasheet
rg "scrollTop|scrollLeft|scrollState" --type-add 'ts:*.ts' -t ts
rg "getRowOffset|getColumnOffset|rowStartIndex" --type-add 'ts:*.ts' -t ts
rg "react-custom-scrollbars" --type-add 'ts:*.ts' -t ts
```

### Step 2：抽取并适配

1. 将滚动同步逻辑抽成 `useGridScroller` 或等效 hook
2. 将坐标计算抽成 `grid-coordinate.ts`
3. 在 `canvas-spreadsheet-table-view.tsx` 中接入

### Step 3：验证

- 纵向滚动到底部，最后几行完整显示
- 横向滚动，表头与 Body 同步
- 滚动条 thumb 大小与内容成比例
- 添加行按钮、单元格编辑器、行菜单位置正确

## 六、当前实现与 APITable 差异对照

| 项目 | 当前实现 | APITable | 对齐建议 |
|------|----------|----------|----------|
| 渲染 | 原生 Canvas | Konva | 可选迁移，优先修逻辑 |
| 滚动条 | 原生 overflow | react-custom-scrollbars | 可引入或 CSS 模拟 |
| 布局 | split Header/Body | 同左 | 已实现，需修 bug |
| 虚拟化 | 有 | 有 | 核对 startRow/endRow |
| 坐标 | 内联计算 | GridCoordinate | 抽成工具类 |

## 七、下一步行动

1. **克隆 APITable** 到本地参考目录
2. **搜索并阅读** 表格滚动、坐标、虚拟化相关代码
3. **抽取** 与业务无关的纯表格逻辑
4. **接入** 到 `canvas-spreadsheet-table-view` 与 `canvas-grid-renderer`
5. **回归测试** 滚动、底部数据、滚动条、覆盖层
