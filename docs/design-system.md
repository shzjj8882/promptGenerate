# 设计规范

> 统一卡片、字体、配色，保持系统整体设计一致性

## 一、卡片布局原则

### icon + 多行文字

- **图标区**：左侧固定宽度（w-14），高度 `self-stretch` 占满整行
- **文字区**：主标题 + 副标题 + 底部内容（Badge 等）
- **操作区**：右侧可选

使用 `CardItem` 组件：

```tsx
<CardItem
  icon={<MessageSquareText className="h-7 w-7" />}
  iconVariant="chat"  // chat | api | primary | success | warning | default
  title="组合名称"
  subtitle="场景 · MCP"
  footer={<Badge>...</Badge>}
  actions={<DropdownMenu>...</DropdownMenu>}
  clickable
  onDoubleClick={() => handleOpen(comp)}
/>
```

### 配色变体

| 变体 | 用途 | 浅色 | 深色 |
|------|------|------|------|
| default | 中性 | bg-muted | - |
| primary | 主色 | bg-primary/10 | - |
| chat | LLM 消息 | 紫色 | 紫色 |
| api | 接口模式 | 蓝色 | 蓝色 |
| success | 成功/完成 | 绿色 | 绿色 |
| warning | 警告 | 琥珀色 | 琥珀色 |

## 二、字体层级

| 用途 | 类名 | 说明 |
|------|------|------|
| 页面主标题 | `TYPOGRAPHY.pageTitle` | text-2xl font-semibold |
| 页面副标题 | `TYPOGRAPHY.pageSubtitle` | text-sm text-muted-foreground |
| 卡片主标题 | `TYPOGRAPHY.cardTitle` | text-base font-semibold |
| 卡片副标题 | `TYPOGRAPHY.cardSubtitle` | text-sm text-muted-foreground |
| 正文 | `TYPOGRAPHY.body` | text-sm |
| 辅助信息 | `TYPOGRAPHY.caption` | text-xs text-muted-foreground |
| 列表项主文字 | `TYPOGRAPHY.listItem` | text-sm font-medium |
| 列表项副文字 | `TYPOGRAPHY.listItemSecondary` | text-sm text-muted-foreground |

## 三、卡片样式

| 用途 | 类名 |
|------|------|
| 列表项卡片 | `CARD_STYLES.listItem` |
| 内容区卡片 | `CARD_STYLES.content` |

## 四、文件位置

- `lib/design-tokens.ts` - 设计 token 定义
- `components/shared/card-item.tsx` - 统一卡片项组件
- `app/globals.css` - 语义色 CSS 变量（--accent-chat 等）
