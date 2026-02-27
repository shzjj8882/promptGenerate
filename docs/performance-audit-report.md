# 性能检测与优化点报告

## 一、后端 (service/)

### 1. 数据库查询

#### 1.1 N+1 查询（P0）

| 问题 | 文件 | 优化建议 |
|------|------|----------|
| **占位符处理循环内多次查询** | `llmchat.py` process_placeholders_in_content | 按 table_id、row_id 批量预查，内存中按 key 组织后按需取用 |

#### 1.2 索引（P1）

| 问题 | 文件 | 优化建议 |
|------|------|----------|
| MultiDimensionTableCell.column_key 无单列索引 | `models/multi_dimension_table.py` | 增加 `idx_cell_column_key` 或复合索引 |
| 按 row_id 单列查询 | 同上 | 评估单独索引 |

### 2. Redis 缓存

#### 2.1 keys() 阻塞（P0）

| 问题 | 文件 | 优化建议 |
|------|------|----------|
| delete_cache_pattern 使用 keys() | `core/cache.py` | 用 SCAN 替代 keys() |
| 启动时 delete_cache_pattern | `main.py` | 改为精确 key 或 SCAN |
| scene_service 多处 delete_cache_pattern | `services/scene_service.py` | 维护 key Set，用 delete_cache_by_set |
| prompt_service 多处 delete_cache_pattern | `services/prompt_service.py` | 同上 |
| rbac admin delete_cache_pattern | `routers/admin/rbac.py` | 同上 |

### 3. 连接池

- PostgreSQL：pool_size=20, max_overflow=10，配置合理
- Redis：max_connections=50，合理

### 4. 同步阻塞

- LLM 已默认走异步队列 ✓
- 占位符同步方法已用 run_in_executor ✓

---

## 二、前端 (app/)

### 1. 大组件（P1）

| 文件 | 行数 | 建议 |
|------|------|------|
| canvas-spreadsheet-table-view.tsx | ~2116 | 拆分子组件，非首屏 dynamic 懒加载 |
| tables-config-client.tsx | ~1573 | 同上 |

### 2. 请求与缓存（P0）

| 问题 | 建议 |
|------|------|
| 无 SWR/React Query | 引入请求去重、缓存、重试 |
| 重复请求 | useEffect + fetch 易重复，用 SWR 或 useRef 防重复 |
| 搜索无防抖 | 对搜索输入 debounce 300ms |

### 3. 渲染优化（P1）

- 部分列表项已 memo，长列表可加虚拟滚动

---

## 三、API 设计

| 问题 | 文件 | 建议 | 优先级 |
|------|------|------|--------|
| 表格行全量返回 | multi_dimension_tables.py get_table_rows | 增加 skip/limit 分页 | P0 |
| 菜单树可能较大 | rbac menu-tree | 考虑懒加载子菜单 | P2 |

---

## 四、通用

| 问题 | 文件 | 建议 | 优先级 |
|------|------|------|--------|
| 生产环境 print | llmchat.py | 改为 logger.debug，DEBUG 控制 | P1 |
| SQL echo | database.py | 确认生产 DEBUG=False | P2 |

---

## 五、优先级汇总

| 优先级 | 数量 | 建议处理顺序 |
|--------|------|--------------|
| P0 | 8 项 | 优先：Redis keys→SCAN、N+1、API 分页、前端 SWR/防抖 |
| P1 | 10 项 | 索引、大组件拆分、print 替换 |
| P2 | 6 项 | 序列化、依赖、菜单懒加载 |

---

## 六、快速改进清单

1. **后端**：delete_cache_pattern 改为 SCAN；优化 process_placeholders_in_content N+1
2. **API**：get_table_rows 增加分页
3. **前端**：引入 SWR；搜索防抖
4. **通用**：print → logger.debug
