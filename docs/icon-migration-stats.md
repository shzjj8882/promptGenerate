# 前端图标迁移统计

## 一、当前图标来源（迁移前）

| 来源 | 用途 | 文件数 |
|------|------|--------|
| lucide-react | 通用 UI 图标 | ~45 个文件 |
| model-logos (本地 SVG) | LLM 品牌 logo | 独立，不迁移 |
| SortIcon 组件 | 表格排序 | 1 个组件 |
| menu-config | 侧边栏菜单图标 | 1 个配置 |

## 二、lucide-react 图标使用统计

| Lucide 图标 | 使用场景 | IconPark 替代 |
|-------------|----------|---------------|
| Add / Plus | 新增按钮 | Add |
| Pencil / Edit | 编辑 | Edit |
| Trash2 | 删除 | Delete |
| ChevronRight/Down/Left/Up | 展开、分步、分页 | Right/Down/Left/Up |
| X / Close | 关闭 | Close |
| Save | 保存 | Save |
| Undo2 / Redo2 | 撤销/重做 | Undo/Redo |
| ArrowLeft | 返回 | ArrowLeft |
| Settings2 | 设置 | Setting |
| Search | 搜索 | Search |
| More / MoreVertical / MoreHorizontal | 更多菜单 | More |
| Filter | 筛选 | Filter |
| Upload | 上传 | Upload |
| Copy / Check | 复制/勾选 | Copy/Check |
| HelpCircle | 帮助 | Help |
| Send / Play | 发送/播放 | Send/Play |
| Globe | 接口模式 | Globe |
| MessageSquareText | 消息/提示词 | Message |
| Bot | 机器人 | Robot |
| Building2 | 租户/建筑 | BuildingTwo |
| Shield | 权限/安全 | Shield |
| Users | 用户/团队 | People |
| UserCog | 用户配置 | People |
| FileText | 文件/占位符 | FileText |
| Table | 表格 | Table |
| Cpu | 模型 | Cpu |
| Plug | MCP | Plug |
| Mail | 邮件/通知 | Mail |
| Menu | 菜单 | MenuUnfold |
| Puzzle | 组合 | Components |
| Layers | 场景 | Layers |
| LayoutGrid | 布局 | LayoutFour |
| Key | 密钥 | Key |
| GripVertical | 拖拽 | Drag |
| BarChart3 / PieChart / LineChart | 图表 | ChartHistogram/ChartPie/ChartLine |
| MinusCircle | 移除 | Minus |
| ArrowDown/Up/ArrowUpDown | 排序 | ArrowDown/ArrowUp/Sort |
| Eye / EyeOff | 显示/隐藏密码 | Eyes/FileHiding |
| CheckCircle | 完成 | Check |
| RotateCcw | 重置 | Refresh |
| CircleSlash | 无 | Close |
| Loader2 | 加载 | Loading |
| Calendar | 日期 | Calendar |
| AlertTriangle | 警告 | Tips |
| Sun / Moon / Monitor | 主题切换 | Sun/Moon/Computer |
| FileCode / Paperclip | 通知选项 | FileCode/Paperclip |
| Bug | 调试 | Bug |

## 三、统一图标库

- **路径**: `@/components/icons`
- **来源**: IconPark 官方 (iconpark.oceanengine.com)
- **导出**: 兼容 lucide 的别名 + 分组导出

## 四、迁移状态

- [x] 创建 `components/icons/index.tsx`
- [x] 替换各页面 lucide 导入
- [x] 更新 menu-config.ts
- [x] 更新 sort-icon.tsx
- [x] 更新 UI 组件 (select, dialog, checkbox, dropdown-menu 等)
- [ ] 移除 lucide-react 依赖（可选，若不再使用）
