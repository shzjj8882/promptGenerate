# 服务端性能分析：支持 10000 并发请求

## 一、当前架构概览

| 组件 | 当前配置 | 说明 |
|------|----------|------|
| **框架** | FastAPI | 异步框架，支持高并发 |
| **数据库** | PostgreSQL (asyncpg) | pool_size=20, max_overflow=10 |
| **缓存** | Redis | max_connections=50 |
| **进程** | 单 uvicorn worker | 默认单进程 |
| **LLM** | DeepSeek API | 同步 HTTP 调用，单次耗时 2–30s |
| **异步任务** | Redis Stream + Worker | 邮件通知等异步场景 |

---

## 二、瓶颈分析

### 1. 应用层

- **单 Worker**：uvicorn 默认单进程，无法利用多核
- **LLM 调用**：同步阻塞，单请求占用 worker 数秒至数十秒
- **数据库连接池**：单进程最多 30 连接（20+10），多进程需成倍增加

### 2. 数据库层

- **连接数**：PostgreSQL 默认 `max_connections=100`，多实例易打满
- **慢查询**：复杂 join、未建索引、N+1 等
- **长事务**：LLM 调用期间持有连接

### 3. 缓存层

- **Redis 连接**：单实例 50 连接，多进程需扩容
- **keys() 使用**：`delete_cache_pattern` 使用 `keys()`，生产环境可能阻塞

### 4. 外部依赖

- **DeepSeek API**：限流、网络延迟、超时
- **MCP 服务**：外部 HTTP 调用增加延迟

---

## 三、优化方案

### 1. 应用层优化

#### 1.1 多 Worker + Gunicorn

```bash
# 使用 gunicorn + uvicorn workers（建议 CPU 核数 * 2）
gunicorn main:app -w 8 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --keep-alive 5
```

- `-w 8`：8 个 worker，可按机器核数调整
- 每个 worker 独立连接池，总连接数 ≈ 8 × 30 = 240（需与 DB 配置匹配）

#### 1.2 LLM 调用异步化（已实现）

- **实现**：接口模式（非流式）默认走 Redis Stream 队列
  - `POST /api/llmchat/prompts/{scene}/api` 和组合 `request` 端点：创建任务、推队列、立即返回 `task_id`
  - 客户端轮询 `GET /api/llmchat/tasks/{task_id}` 获取结果
  - 环境变量 `LLM_API_ASYNC_DEFAULT=true`（默认），设为 `false` 可恢复同步阻塞
  - 查询参数 `?sync=true` 可单次请求覆盖为同步

#### 1.3 连接池调优

```python
# app/core/database.py
engine = create_async_engine(
    DATABASE_URL,
    pool_size=50,        # 单 worker 建议 20–50
    max_overflow=20,     # 峰值溢出
    pool_recycle=1800,   # 30 分钟回收
    pool_pre_ping=True,
)
```

- 多 worker 时：`总连接数 = workers × (pool_size + max_overflow)`，需小于 PostgreSQL `max_connections`

#### 1.4 Redis 连接池

```python
# 单实例多 worker 时，每个 worker 独立连接池
redis_pool = redis.ConnectionPool(
    max_connections=100,  # 按 worker 数调整
)
```

---

### 2. 数据库优化

#### 2.1 PostgreSQL 配置（示例）

```ini
# postgresql.conf
max_connections = 500
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 64MB
maintenance_work_mem = 512MB
```

#### 2.2 连接池代理（PgBouncer）

- 使用 PgBouncer 做连接池代理
- 应用连接 PgBouncer，PgBouncer 连接 PostgreSQL
- 可支持数千应用连接，映射到数百 DB 连接

```
[databases]
aily_db = host=localhost port=5432 dbname=aily_db

[pgbouncer]
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 100
```

#### 2.3 读写分离

- 读多写少场景：主库写，从库读
- SQLAlchemy 可配置多引擎，按读写路由

#### 2.4 索引与查询

- 为高频查询字段建索引
- 避免 `SELECT *`，只查必要列
- 已对多维表格等做批量查询，避免 N+1

---

### 3. 缓存优化

#### 3.1 避免 keys()

```python
# 用 SCAN 替代 keys()，避免阻塞
async def delete_cache_pattern_safe(pattern: str):
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break
```

#### 3.2 缓存预热

- 启动时预热菜单树、权限等热点数据
- 降低冷启动后的数据库压力

#### 3.3 缓存穿透防护

- 对空结果做短 TTL 缓存
- 或使用布隆过滤器

---

### 4. 架构扩展

#### 4.1 水平扩展

```
                    ┌─────────────┐
                    │ Load Balancer│
                    │ (Nginx/ALB)  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
   │ App-1   │        │ App-2   │        │ App-N   │
   │ 8 workers│       │ 8 workers│       │ 8 workers│
   └────┬────┘        └────┬────┘        └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
   │ PgBouncer│       │ Redis   │        │  LLM   │
   │         │        │ Cluster │        │  Queue │
   └────┬────┘        └─────────┘        └─────────┘
        │
   ┌────▼────┐
   │PostgreSQL│
   │ Primary  │
   └─────────┘
```

#### 4.2 LLM 请求队列

- 所有 LLM 请求入 Redis Stream
- 多 Worker 消费，控制并发调用 DeepSeek
- API 返回 `task_id`，客户端轮询或 WebSocket 获取结果

---

## 四、服务器配置建议

### 场景：10000 并发（含 LLM 长耗时请求）

#### 方案 A：中等规模（单机/小集群）

| 角色 | 配置 | 说明 |
|------|------|------|
| **应用服务器** | 16–32 vCPU, 32–64GB RAM | 8–16 个 app 实例，每实例 8 workers |
| **PostgreSQL** | 8 vCPU, 32GB RAM | 或使用 RDS/云数据库 |
| **Redis** | 4 vCPU, 16GB RAM | 或使用 ElastiCache/云 Redis |
| **PgBouncer** | 2 vCPU, 4GB RAM | 连接池代理 |

- 应用：`max_connections` 建议 500–1000
- PostgreSQL：`max_connections=500`，`shared_buffers=8GB`
- Redis：`maxclients=10000`（默认一般够用）

#### 方案 B：大规模（多机集群）

| 角色 | 数量 | 单机配置 |
|------|------|----------|
| **应用服务器** | 10–20 台 | 8 vCPU, 16GB RAM |
| **PostgreSQL** | 主 1 + 从 2 | 16 vCPU, 64GB RAM |
| **Redis** | 3 节点集群 | 8 vCPU, 32GB RAM |
| **负载均衡** | 1 | 按云厂商推荐 |

- 总应用 worker：约 10 × 8 × 8 = 640 个
- 单 worker 可处理约 50–100 并发（视请求类型）
- 理论可支撑数万并发（不含长时间 LLM 阻塞）

---

## 五、10000 并发的关键点

### 1. 请求类型差异

- **轻量请求**（健康检查、简单 CRUD、缓存命中）：单 worker 可处理数百 QPS
- **LLM 请求**（2–30s）：单 worker 同时只能处理少量请求

若 10000 并发中 LLM 占比较高，需要：

- 将 LLM 全部异步化（队列 + Worker）
- 或大幅增加 app 实例和 worker 数

### 2. 连接数估算

- 10000 并发，假设平均持有连接 1s
- 需要约 10000 个并发连接能力
- 单机难以支撑，必须多机 + 负载均衡

### 3. 推荐实施顺序

1. **短期**：gunicorn 多 worker、调大 DB/Redis 连接池
2. **中期**：引入 PgBouncer、优化慢查询和索引
3. **长期**：LLM 全异步队列、水平扩展、读写分离

---

## 六、配置示例

### Docker Compose 多实例

```yaml
services:
  app:
    build: .
    deploy:
      replicas: 8
    environment:
      - DATABASE_URL=...
      - REDIS_URL=...
```

### Kubernetes HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aily-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aily-api
  minReplicas: 4
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 七、监控建议

- **应用**：请求 QPS、延迟 P99、错误率、worker 利用率
- **数据库**：连接数、慢查询、锁等待
- **Redis**：内存、命中率、连接数
- **LLM**：队列长度、处理耗时、失败率

---

## 八、总结

| 目标 | 关键措施 |
|------|----------|
| **支持 10000 并发** | 多实例 + 负载均衡 + PgBouncer |
| **降低 DB 压力** | 连接池、索引、读写分离、缓存 |
| **LLM 不阻塞 API** | 全异步队列 + 独立 Worker |
| **成本可控** | 先单机多 worker + PgBouncer，再按需扩展 |

**最小可行配置（验证用）**：1 台 16 vCPU 机器，8 个 app 实例 × 8 workers，PgBouncer + PostgreSQL + Redis，可初步验证数千并发。达到 10000 并发需按上述方案做水平扩展和 LLM 异步化。
