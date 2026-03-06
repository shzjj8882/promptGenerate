# APITable 多维表格架构分析

> 参考 [APITable 开源项目](https://github.com/apitable/apitable) 的实现思路

## 一、APITable 技术栈

| 技术 | 用途 |
|------|------|
| **Konva** | Canvas 2D 渲染引擎，替代原生 Canvas API |
| **react-konva** | Konva 的 React 绑定 |
| **react-custom-scrollbars** | 自定义滚动条，实现 Header/Body 分离滚动 |
| **react-window** | 虚拟化（部分场景） |

## 二、核心组件结构

```
KonvaGridView (主入口)
├── 容器 + 滚动条
│   ├── horizontalBarRef (横向滚动条)
│   ├── verticalBarRef (纵向滚动条)
│   └── cellVerticalBarRef (单元格内纵向滚动)
├── KonvaGridStage (Konva Stage)
│   └── KonvaGrid (Canvas 绘制)
│       ├── frozenCells (冻结区单元格)
│       ├── cells (数据单元格)
│       ├── fieldHeads (列头)
│       ├── groupStats (分组统计)
│       └── ...
└── DomGrid (DOM 覆盖层)
    ├── Editor (单元格编辑器)
    ├── ContextMenu (右键菜单)
    ├── QuickAppend (快速添加行)
    └── ...
```

## 三、滚动架构

- **Header/Body 拆分**：横向、纵向滚动条独立，通过 `Scrollbars` 组件控制
- **scrollState**：`{ scrollTop, scrollLeft, isScrolling }`
- **useGridScroller**：同步多个滚动条，提供 `scrollTo` 方法
- **虚拟化**：根据 scrollTop/scrollLeft 计算 `rowStartIndex`、`rowStopIndex`、`columnStartIndex`、`columnStopIndex`，只渲染可见区域

## 四、坐标系统 (GridCoordinate)

- `getRowOffset(rowIndex)` / `getColumnOffset(columnIndex)`：行列偏移
- `getRowStartIndex` / `getRowStopIndex`：可见行范围
- `getColumnStartIndex` / `getColumnStopIndex`：可见列范围
- `frozenColumnCount` / `frozenColumnWidth`：冻结列

## 五、与当前实现的差异

| 维度 | 当前实现 | APITable |
|------|----------|----------|
| 渲染引擎 | 原生 Canvas 2D | Konva |
| 滚动条 | 原生 overflow | react-custom-scrollbars |
| 布局 | 单容器 / split 尝试 | Header + Body 独立滚动 |
| 虚拟化 | 有 | 有 |
| DOM 覆盖 | 有 | DomGrid 独立组件 |

## 六、对齐 APITable 的改造方向

1. **引入 Konva**：用 Konva Stage/Layer 替代原生 Canvas，便于复杂布局和事件
2. **引入 react-custom-scrollbars**：实现 Header 固定、Body 独立滚动的滚动条
3. **GridCoordinate**：抽象坐标系统，支持 frozen、虚拟化
4. **DomGrid 分离**：将 Editor、ContextMenu 等从 Canvas 覆盖层抽离为独立 DOM 层
