# 团队 Code 图表与用量功能实现计划

## 已完成

### 1. 服务端：记录 token 消费时间、业务名称
- **TeamUsageLog** 模型：新增 `business_name` 列
- **log_team_usage**：支持传入 `business_name` 参数
- **调用方**：multi_dimension_tables、llmchat_api_executor、llmchat 均已传入业务名称
- **数据库迁移**：`ALTER TABLE team_usage_logs ADD COLUMN business_name VARCHAR NULL`

### 2. 服务端：用量统计 API
- **GET /admin/teams/my-team/usage/daily**：按日用量（折线图数据）
- **GET /admin/teams/my-team/usage/by-business**：按业务用量（饼图数据）
- **GET /admin/teams/my-team/usage-logs**：用量日志分页（支持查看日志）

### 3. 前端 API
- `getMyTeamUsageDaily()`：获取当前团队按日用量
- `getMyTeamUsageByBusiness()`：获取当前团队按业务用量
- `getMyTeamUsageLogs()`：获取当前团队用量日志（分页）

### 4. 配置扩展
- `teamCodeDisplayMode`：新增 `"chart"` 选项
- `teamCodeChartType`：`"line" | "pie"`（图表模式下使用）

## 待实现

### 1. 展示统计卡片改为下拉组件
- 配置弹窗中，将套餐状态/套餐外额度/上月结余的 radio 改为 `<Select>` 组件

### 2. 展示模式增加图表模式
- 配置弹窗增加「图表」按钮
- 图表模式下增加图表类型选择：折线图 | 饼图

### 3. 使用量折线图
- 调用 `getMyTeamUsageDaily()` 获取数据
- 使用 `@ant-design/charts` 的 Line 组件渲染
- 提供「查看日志」按钮，打开用量日志弹窗

### 4. 使用量饼图
- 调用 `getMyTeamUsageByBusiness()` 获取数据
- 使用 `@ant-design/charts` 的 Pie 组件渲染
- 提供「查看日志」按钮

### 5. 用量日志弹窗
- 调用 `getMyTeamUsageLogs()` 分页加载
- 展示：时间、业务名称、tokens_used、calls_count 等
- 支持按月份、日期范围、业务筛选

## 涉及文件

- `app/app/dashboard/components/dashboard-widgets/WidgetTeamCode.tsx`：主组件
- `app/lib/api/dashboard-config.ts`：已扩展 teamCodeChartType
- `app/store/dashboard-store.ts`：需支持 teamCodeChartType 的 sanitize/merge
- `app/app/dashboard/page.tsx`：handleUpdateTeamCodeConfig 需传 teamCodeChartType
- `app/app/dashboard/components/dashboard-grid/DashboardGrid.tsx`：传 teamCodeChartType
- 新建：`app/app/dashboard/components/dashboard-widgets/TeamCodeUsageChart.tsx`：折线图/饼图组件
- 新建：`app/app/dashboard/components/dashboard-widgets/TeamCodeUsageLogDialog.tsx`：日志弹窗
