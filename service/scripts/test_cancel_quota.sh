#!/bin/bash
# 解约接口测试脚本（使用 curl）
#
# 测试流程：
# 1. 登录获取 token
# 2. 创建测试团队
# 3. 设置套餐（2026-03 起 6 个月）
# 4. 解约 3 个月（应解约 8、7、6）
# 5. 验证结果并删除测试团队
#
# 运行前确保后端已启动（默认 http://localhost:8000）
# 环境变量：API_BASE_URL, TEST_ADMIN_USER, TEST_ADMIN_PASS
#
# 若登录失败（用户名或密码错误），可运行：
#   cd service && ./venv/bin/python scripts/test_cancel_quota_api.py
# 该脚本直接通过数据库测试解约逻辑，无需登录。

set -e
API_BASE="${API_BASE_URL:-http://localhost:8000}"
ADMIN_USER="${TEST_ADMIN_USER:-admin}"
ADMIN_PASS="${TEST_ADMIN_PASS:-admin}"
TEST_TEAM_CODE="test_cancel_quota_$$"
TEST_TEAM_NAME="解约测试团队（测试后可删）"

log() { echo "  $1"; }

echo "============================================================"
echo "解约接口测试"
echo "============================================================"

# 1. 登录
log "1. 登录..."
LOGIN_RESP=$(curl -s -X POST "$API_BASE/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('access_token','') if d.get('success') else '')" 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  echo "   登录失败: $LOGIN_RESP"
  echo "   提示: 可设置 TEST_ADMIN_USER / TEST_ADMIN_PASS，或运行 python scripts/test_cancel_quota_api.py 直接测试"
  exit 1
fi
log "   登录成功"

# 2. 创建测试团队
log "2. 创建测试团队..."
CREATE_RESP=$(curl -s -X POST "$API_BASE/admin/teams" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"code\":\"$TEST_TEAM_CODE\",\"name\":\"$TEST_TEAM_NAME\"}")
TEAM_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id','') if d.get('success') else '')" 2>/dev/null || echo "")
if [ -z "$TEAM_ID" ]; then
  echo "   创建团队失败: $CREATE_RESP"
  exit 1
fi
log "   团队已创建: id=$TEAM_ID"

cleanup() {
  log "清理: 删除测试团队..."
  curl -s -X DELETE "$API_BASE/admin/teams/$TEAM_ID" -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 3. 设置套餐
log "3. 设置套餐（2026-03 起 6 个月）..."
PKG_RESP=$(curl -s -X POST "$API_BASE/admin/teams/$TEAM_ID/package" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"monthly_token_limit":10000,"start_year_month":"2026-03","duration_months":6}')
if ! echo "$PKG_RESP" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
  echo "   设置套餐失败: $PKG_RESP"
  exit 1
fi
log "   套餐设置成功"

# 4. 解约 3 个月
log "4. 解约 3 个月（应从最后往前解约 8、7、6）..."
CANCEL_RESP=$(curl -s -X DELETE "$API_BASE/admin/teams/$TEAM_ID/quota?months=3" \
  -H "Authorization: Bearer $TOKEN")
CANCELLED=$(echo "$CANCEL_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if not d.get('success'):
  print('FAIL')
  sys.exit(1)
m=d.get('data',{}).get('cancelled_months',[])
print(','.join(sorted(m)))
" 2>/dev/null || echo "FAIL")
if [ "$CANCELLED" = "FAIL" ]; then
  echo "   解约失败: $CANCEL_RESP"
  exit 1
fi
log "   解约月份: $CANCELLED"
if [ "$CANCELLED" != "2026-06,2026-07,2026-08" ]; then
  echo "   预期解约 2026-06,2026-07,2026-08，实际 $CANCELLED"
  exit 1
fi
log "   解约结果正确"

# 5. 验证剩余套餐
log "5. 验证剩余套餐..."
OVERVIEW_RESP=$(curl -s "$API_BASE/admin/teams/$TEAM_ID/package-overview" \
  -H "Authorization: Bearer $TOKEN")
REMAINING=$(echo "$OVERVIEW_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
months=d.get('data',{}).get('months',[])
ym_list=sorted([m['year_month'] for m in months])
print(','.join(ym_list))
" 2>/dev/null || echo "")
log "   剩余月份: $REMAINING"
if [ "$REMAINING" != "2026-03,2026-04,2026-05" ]; then
  echo "   预期剩余 2026-03,2026-04,2026-05，实际 $REMAINING"
  exit 1
fi
log "   剩余套餐正确"

echo ""
echo "============================================================"
echo "✓ 所有测试通过"
echo "============================================================"
