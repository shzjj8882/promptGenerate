# 团队配额服务测试用例

本文档覆盖团队配额、套餐、解约、缴费日志、用量日志等功能的测试场景。

---

## 一、签约/套餐设置 `POST /admin/teams/{team_id}/package`

### 1.1 正常签约

| 用例编号 | TC-PKG-001 |
|---------|------------|
| **描述** | 为团队设置 5 个月套餐（2026-03 至 2026-08） |
| **前置** | 团队存在 |
| **请求** | `{ "monthly_token_limit": 10000, "start_year_month": "2026-03", "duration_months": 5 }` |
| **预期** | - 创建 2026-03、04、05、06、07 共 5 条 TeamMonthlyPlan<br>- team.monthly_token_limit = 10000<br>- team.plan_expire_at = 2026-07-31 23:59:59<br>- 写入 payment_log，payment_type=contract |
| **验证** | GET package-overview 返回 start_year_month=2026-03, end_year_month=2026-07 |

### 1.2 覆盖已有套餐

| 用例编号 | TC-PKG-002 |
|---------|------------|
| **描述** | 对已有月度套餐的月份再次签约，覆盖 token_limit |
| **前置** | 团队已有 2026-03 的 TeamMonthlyPlan（token_limit=5000） |
| **请求** | `{ "monthly_token_limit": 8000, "start_year_month": "2026-03", "duration_months": 1 }` |
| **预期** | 2026-03 的 plan.token_limit 更新为 8000，不新增记录 |
| **验证** | GET quota?year_month=2026-03 返回 token_limit=8000 |

### 1.3 起止月份格式校验

| 用例编号 | TC-PKG-003 |
|---------|------------|
| **描述** | start_year_month 格式错误 |
| **请求** | `{ "monthly_token_limit": 1000, "start_year_month": "2026/03", "duration_months": 1 }` |
| **预期** | 400，detail 含 "start_year_month 格式不正确" |

### 1.4 持续月数校验

| 用例编号 | TC-PKG-004 |
|---------|------------|
| **描述** | duration_months 超出范围 |
| **请求** | `{ "monthly_token_limit": 1000, "start_year_month": "2026-03", "duration_months": 61 }` |
| **预期** | 422 校验错误 |

### 1.5 跨年月份计算

| 用例编号 | TC-PKG-005 |
|---------|------------|
| **描述** | 签约跨年（2025-11 起 3 个月） |
| **请求** | `{ "monthly_token_limit": 5000, "start_year_month": "2025-11", "duration_months": 3 }` |
| **预期** | 创建 2025-11、2025-12、2026-01，plan_expire_at = 2026-01-31 23:59:59 |

---

## 二、配额查询 `GET /admin/teams/{team_id}/quota`

### 2.1 指定月份查询

| 用例编号 | TC-QUOTA-GET-001 |
|---------|------------------|
| **描述** | 查询指定月份配额与用量 |
| **请求** | `GET /admin/teams/{id}/quota?year_month=2026-05` |
| **预期** | 返回 team_id、year_month、token_limit、tokens_used、calls_used 等 |
| **验证** | 有 TeamMonthlyPlan 时 token_limit 为套餐值；无则回退 team.monthly_token_limit |

### 2.2 默认当前月

| 用例编号 | TC-QUOTA-GET-002 |
|---------|------------------|
| **描述** | 不传 year_month 时返回当前月 |
| **请求** | `GET /admin/teams/{id}/quota` |
| **预期** | year_month 为当前 YYYY-MM |

### 2.3 团队不存在

| 用例编号 | TC-QUOTA-GET-003 |
|---------|------------------|
| **描述** | team_id 不存在 |
| **预期** | 404，detail="团队不存在" |

---

## 三、配额编辑 `PUT /admin/teams/{team_id}/quota`

### 3.1 创建新月度套餐

| 用例编号 | TC-QUOTA-PUT-001 |
|---------|------------------|
| **描述** | 该月无 TeamMonthlyPlan 时创建 |
| **请求** | `{ "year_month": "2026-06", "token_limit": 15000 }` |
| **预期** | 新增 TeamMonthlyPlan，token_limit=15000 |

### 3.2 更新已有套餐

| 用例编号 | TC-QUOTA-PUT-002 |
|---------|------------------|
| **描述** | 该月已有套餐时仅更新传入字段 |
| **请求** | `{ "year_month": "2026-06", "token_limit": 20000 }` |
| **预期** | 更新 token_limit，其他字段不变 |

---

## 四、追加 Token `POST /admin/teams/{team_id}/quota/topup`

### 4.1 赠送追加

| 用例编号 | TC-TOPUP-001 |
|---------|--------------|
| **描述** | type=gift 时写入 gift_tokens，无时间限制，顺延续到未来月份 |
| **请求** | `{ "year_month": "2026-05", "extra_tokens": 3000, "type": "gift" }` |
| **预期** | - 该月及未来月份 gift_tokens 增加 3000<br>- payment_log.payment_type=gift |

### 4.2 购买追加

| 用例编号 | TC-TOPUP-002 |
|---------|--------------|
| **描述** | type=purchase 时写入 extra_tokens，无时间限制，顺延续到未来月份 |
| **请求** | `{ "year_month": "2026-05", "extra_tokens": 5000, "type": "purchase" }` |
| **预期** | - 该月及未来月份 extra_tokens 增加 5000<br>- payment_log.payment_type=purchase |

### 4.3 无月度套餐时创建

| 用例编号 | TC-TOPUP-003 |
|---------|--------------|
| **描述** | 该月无 TeamMonthlyPlan 时，以 team.monthly_token_limit 为基数创建 |
| **前置** | team.monthly_token_limit=5000，2026-05 无 plan |
| **请求** | `{ "year_month": "2026-05", "extra_tokens": 2000 }` |
| **预期** | 新建 plan，token_limit=5000+2000=7000 |

### 4.4 有月度套餐时追加

| 用例编号 | TC-TOPUP-004 |
|---------|--------------|
| **描述** | 该月已有 plan 时在 gift_tokens 或 extra_tokens 上增加 |
| **前置** | 2026-05 的 plan.token_limit=10000 |
| **请求** | `{ "year_month": "2026-05", "extra_tokens": 3000, "type": "purchase" }` |
| **预期** | plan.extra_tokens=3000，plan.token_limit=13000 |

---

## 五、解约 `DELETE /admin/teams/{team_id}/quota?months=N`

### 5.1 解约 1 个月

| 用例编号 | TC-CANCEL-001 |
|---------|---------------|
| **描述** | 解约最后 1 个月 |
| **前置** | 合约 2026-03～2026-08（6 个月），当前月 < 2026-08 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=1` |
| **预期** | - 删除 2026-08 的 TeamMonthlyPlan<br>- plan_expire_at 更新为 2026-07-31 23:59:59<br>- payment_log 写入 1 条 cancel<br>- 返回 cancelled_months=["2026-08"], cancelled_count=1 |

### 5.2 解约 3 个月（8、7、6）

| 用例编号 | TC-CANCEL-002 |
|---------|---------------|
| **描述** | 解约 3 个月，从最后一个月开始为 8、7、6 |
| **前置** | 合约 2026-03～2026-08，未来月份为 04、05、06、07、08 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=3` |
| **预期** | - 删除 2026-06、07、08 的 TeamMonthlyPlan<br>- plan_expire_at 更新为 2026-05-31 23:59:59<br>- payment_log 写入 3 条 cancel（每条 year_month 分别为 2026-06、07、08）<br>- 返回 cancelled_months=["2026-06","2026-07","2026-08"], cancelled_count=3 |

### 5.3 解约月数超过可解约月数

| 用例编号 | TC-CANCEL-003 |
|---------|---------------|
| **描述** | 请求解约 5 个月，但未来月份仅 3 个 |
| **前置** | 未来月份仅 2026-06、07、08 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=5` |
| **预期** | 400，detail 含 "未来月份仅剩 3 个月，无法解约 5 个月" |

### 5.4 无未来月份时的幂等

| 用例编号 | TC-CANCEL-004 |
|---------|---------------|
| **描述** | 无未来月份套餐时调用解约 |
| **前置** | 所有 TeamMonthlyPlan 的 year_month <= 当前月 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=1` |
| **预期** | 200，data.cancelled_months=[], message="无未来月份套餐可解约" |

### 5.5 解约后 plan_expire_at 更新

| 用例编号 | TC-CANCEL-005 |
|---------|---------------|
| **描述** | 解约全部未来月份后 plan_expire_at 置空 |
| **前置** | 仅 2026-08 有 plan，当前月 < 2026-08 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=1` |
| **预期** | team.plan_expire_at = None |

### 5.6 months 参数校验

| 用例编号 | TC-CANCEL-006 |
|---------|---------------|
| **描述** | months 超出范围 |
| **请求** | `DELETE /admin/teams/{id}/quota?months=0` 或 `months=121` |
| **预期** | 422 校验错误 |

---

## 六、套餐概览 `GET /admin/teams/{team_id}/package-overview`

### 6.1 有套餐

| 用例编号 | TC-OVERVIEW-001 |
|---------|-----------------|
| **描述** | 返回套餐区间及各月配额概览 |
| **前置** | 团队有 2026-03～2026-08 的 TeamMonthlyPlan |
| **预期** | start_year_month=2026-03, end_year_month=2026-08, months 含每月的 base_token_limit、effective_token_limit、tokens_used、rollover_from_prev_tokens |

### 6.2 无套餐

| 用例编号 | TC-OVERVIEW-002 |
|---------|-----------------|
| **描述** | 无 TeamMonthlyPlan 时 |
| **预期** | start_year_month=null, end_year_month=null, months=[] |

---

## 七、缴费日志 `GET /admin/teams/{team_id}/payment-logs`

### 7.1 按类型筛选

| 用例编号 | TC-PAYMENT-001 |
|---------|----------------|
| **描述** | 筛选 payment_type |
| **请求** | `GET .../payment-logs?payment_type=cancel` |
| **预期** | 仅返回 payment_type=cancel 的记录 |

### 7.2 签约/续约/赠送/购买/解约记录

| 用例编号 | TC-PAYMENT-002 |
|---------|----------------|
| **描述** | 验证各操作均写入缴费日志 |
| **验证** | - set_team_package → contract<br>- topup type=gift → gift<br>- topup type=purchase → purchase<br>- delete_team_monthly_plan → cancel，year_month 为解约月份，amount=1 |

---

## 八、用量日志 `GET /admin/teams/{team_id}/usage-logs`

### 8.1 按月份筛选

| 用例编号 | TC-USAGE-001 |
|---------|--------------|
| **描述** | year_month 筛选 |
| **请求** | `GET .../usage-logs?year_month=2026-05` |
| **预期** | 仅返回 year_month=2026-05 的用量记录 |

### 8.2 按日期筛选

| 用例编号 | TC-USAGE-002 |
|---------|--------------|
| **描述** | usage_date 筛选 |
| **请求** | `GET .../usage-logs?usage_date=2026-05-15` |
| **预期** | 仅返回 usage_date=2026-05-15 的记录 |

### 8.3 usage_type 含义

| 类型 | 说明 |
|------|------|
| 1 | 多维表格单条新增 |
| 2 | 多维表格按条件编辑 |
| 3 | 多维表格按条件删除 |
| 4 | 多维表格按条件查询 |
| 5 | 组合 LLM、接口查询 |

---

## 九、配额校验 `TeamQuotaService.check_and_consume_tokens`

### 9.1 套餐过期

| 用例编号 | TC-CHECK-001 |
|---------|--------------|
| **描述** | team.plan_expire_at 已过期 |
| **预期** | 402，detail="团队套餐已过期，请联系管理员续费" |

### 9.2 Token 超限

| 用例编号 | TC-CHECK-002 |
|---------|--------------|
| **描述** | 当月 tokens_used + requested_tokens > effective_token_limit |
| **预期** | 429，detail="本月团队 token 配额已用完" |

### 9.3 调用次数超限

| 用例编号 | TC-CHECK-003 |
|---------|--------------|
| **描述** | 当月 calls_used + 1 > call_limit |
| **预期** | 429，detail="本月团队调用次数已达上限" |

### 9.4 团队不存在或已禁用

| 用例编号 | TC-CHECK-004 |
|---------|--------------|
| **描述** | team_id 无效或 team.is_active=false |
| **预期** | 403 |

### 9.5 上月结转

| 用例编号 | TC-CHECK-005 |
|---------|--------------|
| **描述** | 上月有剩余配额时结转至当月 |
| **前置** | 上月 token_limit=10000, tokens_used=6000 |
| **预期** | 当月 effective_token_limit = 当月 base + 4000（结转） |

### 9.6 无配额限制

| 用例编号 | TC-CHECK-006 |
|---------|--------------|
| **描述** | token_limit 和 call_limit 均未配置或 <=0 |
| **预期** | 不校验，直接放行 |

### 9.7 消费优先级

| 用例编号 | TC-CHECK-007 |
|---------|--------------|
| **描述** | 消费优先级：赠送 > 节余 > 本月 > 追加 |
| **说明** | 赠送、追加均无时间限制，顺延续到未来月份；总配额 = base + gift + extra + rollover |
| **验证** | type=gift 写入 gift_tokens，type=purchase 写入 extra_tokens；package-overview 返回 gift_tokens、extra_tokens |

---

## 十、辅助逻辑

### 10.1 _add_months

| 用例 | 输入 | 预期输出 |
|------|------|----------|
| 跨月 | (2025, 3, 1) | 2025-04 |
| 跨年 | (2025, 12, 1) | 2026-01 |
| 多月 | (2025, 3, 5) | 2025-08 |

### 10.2 _normalize_year_month

| 用例 | 输入 | 预期 |
|------|------|------|
| 有效 | "2026-03" | "2026-03" |
| 无效 | "2026/03" | 400 |
| 空 | null | 当前月 YYYY-MM |

---

## 十一、集成场景

### 11.1 完整签约→追加→解约流程

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | 签约 2026-03～2026-08，每月 10000 | package-overview 有 6 个月 |
| 2 | 为 2026-05 追加 3000（赠送） | 2026-05 gift_tokens=3000，token_limit=13000，顺延续到 06～08 |
| 3 | 解约 2 个月 | 删除 2026-07、08，plan_expire_at=2026-06-30，payment_log 有 2 条 cancel |
| 4 | 查询 2026-05 配额 | token_limit=13000 不变（未解约） |

### 11.2 解约顺序验证

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | 合约 2026-03～2026-08 | future_months = [04,05,06,07,08] |
| 2 | 解约 3 个月 | 删除 06、07、08（从最后往前） |
| 3 | 再次解约 2 个月 | 删除 04、05 |
| 4 | 再次解约 1 个月 | 返回 "无未来月份套餐可解约" |

---

## 十二、权限与异常

| 用例 | 描述 | 预期 |
|------|------|------|
| 非超管 | 普通用户调用管理接口 | 403 |
| 无效 team_id | UUID 格式正确但不存在 | 404 |
| 并发解约 | 同一团队并发解约 | 需保证数据一致性（事务） |
