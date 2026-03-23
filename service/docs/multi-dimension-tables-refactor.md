# 多维表格路由优化建议

## 现状分析

- **文件行数**：约 2831 行
- **端点数量**：约 30 个
- **主要问题**：
  1. **ID/Code 双路径重复**：大量端点成对出现（`/{table_id}` 与 `/by-code/{table_code}`），逻辑几乎相同
  2. **无服务层**：业务逻辑全部写在 router 中，难以复用和测试
  3. **单文件过大**：维护成本高，职责混杂

## 优化方案

### 方案一：统一 ID/Code 路径（推荐，减少约 40% 代码）

将 `/{table_id}` 与 `/by-code/{table_code}` 合并为单一路径 `/{table_ref}`：

- `table_ref` 支持 UUID 或 code，由 `get_table_by_code_or_id` 解析
- 删除所有 `/by-code/{table_code}` 端点
- **影响**：前端需将 `/by-code/xxx` 改为 `/xxx`（code 与 id 同路径）

```python
# 统一路径参数
TABLE_REF = Annotated[str, Path(..., description="表格 ID 或 code")]

@router.get("/multi-dimension-tables/{table_ref}")
async def get_table(table_ref: TABLE_REF, ...):
    table = await get_table_by_code_or_id(table_ref, current_user, db)
    ...
```

### 方案二：提取服务层（推荐，提升可测试性）

新建 `app/services/multi_dimension_table_service.py`，将业务逻辑迁移：

- `MultiDimensionTableService.create_table(...)`
- `MultiDimensionTableService.update_table(...)`
- `MultiDimensionTableService.bulk_save_rows(...)`
- 等

Router 仅负责：解析请求 → 调用服务 → 返回响应。

### 方案三：按领域拆分模块（可选）

```
app/routers/admin/
├── multi_dimension_tables.py      # 表格 CRUD（约 600 行）
├── multi_dimension_table_rows.py # 行 CRUD（约 1500 行）
└── multi_dimension_table_search.py # 搜索（约 100 行）
```

通过 `include_router` 挂载子路由，保持 URL 前缀一致。

## 建议实施顺序

1. **先做方案二**：提取服务层，router 变薄，为后续重构打基础
2. **再做方案一**：统一路径，删除 by-code 重复端点
3. **视情况做方案三**：若单文件仍过长，再按领域拆分

## 预估效果

| 优化项       | 预计减少行数 |
|--------------|--------------|
| 统一 ID/Code | ~800 行      |
| 提取服务层   | router 减 ~1200 行（逻辑迁至 service） |
| 拆分模块     | 单文件控制在 600–800 行 |
