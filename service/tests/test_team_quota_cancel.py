"""
团队解约接口测试

使用 pytest + httpx 直接调用 API，通过依赖注入绕过认证。
"""
import pytest
from datetime import datetime
from httpx import ASGITransport, AsyncClient

# 需在 service 目录下运行: pytest tests/test_team_quota_cancel.py -v


def _add_months(year: int, month: int, delta: int) -> str:
    total = (year * 12 + (month - 1)) + delta
    new_year = total // 12
    new_month = total % 12 + 1
    return f"{new_year:04d}-{new_month:02d}"


@pytest.fixture
def mock_superuser():
    """模拟超级管理员用户"""
    from app.schemas.user import UserResponse
    return UserResponse(
        id="test-admin-id",
        username="test_admin",
        email="test@example.com",
        full_name="Test Admin",
        team_code=None,
        team_id=None,
        is_active=True,
        is_superuser=True,
        is_team_admin=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def app_with_auth(mock_superuser):
    """返回已覆盖认证依赖的 app"""
    from main import app
    from app.core.auth import get_current_user
    from app.core.permissions import require_superuser

    async def override_get_current_user():
        return mock_superuser

    async def override_require_superuser():
        return mock_superuser

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[require_superuser] = override_require_superuser
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def client(app_with_auth):
    """异步 HTTP 客户端"""
    transport = ASGITransport(app=app_with_auth)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_team(client):
    """创建测试团队并设置套餐，yield team_id，测试后删除"""
    now = datetime.utcnow()
    start_year = now.year
    start_month = now.month
    if start_month == 12:
        start_year += 1
        start_month = 1
    else:
        start_month += 1
    start_ym = f"{start_year:04d}-{start_month:02d}"
    duration = 6
    team_code = f"test_cancel_{now.strftime('%Y%m%d%H%M%S')}"

    # 创建团队
    create_resp = await client.post(
        "/admin/teams",
        json={"code": team_code, "name": "解约测试团队", "description": "测试用"},
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    create_data = create_resp.json()
    assert create_data.get("success"), create_data.get("message", "")
    team_id = create_data["data"]["id"]

    # 设置套餐
    pkg_resp = await client.post(
        f"/admin/teams/{team_id}/package",
        json={
            "start_year_month": start_ym,
            "duration_months": duration,
            "monthly_token_limit": 10000,
        },
    )
    assert pkg_resp.status_code == 200, pkg_resp.text
    assert pkg_resp.json().get("success"), pkg_resp.json().get("message", "")

    yield team_id

    # 清理
    await client.delete(f"/admin/teams/{team_id}")


@pytest.mark.asyncio
async def test_cancel_one_month(client, test_team):
    """解约 1 个月：应从最后一个月开始"""
    team_id = test_team
    current_ym = datetime.utcnow().strftime("%Y-%m")

    # 获取套餐概览
    overview_resp = await client.get(f"/admin/teams/{team_id}/package-overview")
    assert overview_resp.status_code == 200
    months = overview_resp.json()["data"].get("months", [])
    future_months = sorted([m["year_month"] for m in months if m["year_month"] > current_ym])
    if not future_months:
        pytest.skip("无未来月份可解约（当前月可能已超过套餐结束）")

    expected_last = future_months[-1]

    # 解约 1 个月
    cancel_resp = await client.delete(
        f"/admin/teams/{team_id}/quota",
        params={"months": 1},
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    data = cancel_resp.json()
    assert data.get("success"), data.get("message", "")
    cancelled = data["data"].get("cancelled_months", [])
    assert len(cancelled) == 1, f"应解约 1 个月，实际 {cancelled}"
    assert cancelled[0] == expected_last, f"应解约最后月 {expected_last}，实际 {cancelled[0]}"


@pytest.mark.asyncio
async def test_cancel_three_months(client, test_team):
    """解约 3 个月：应先解约 1 个月，再解约 3 个月"""
    team_id = test_team
    current_ym = datetime.utcnow().strftime("%Y-%m")

    # 先解约 1 个月
    await client.delete(f"/admin/teams/{team_id}/quota", params={"months": 1})

    # 获取剩余未来月
    overview = (await client.get(f"/admin/teams/{team_id}/package-overview")).json()
    future_months = sorted([
        m["year_month"] for m in overview["data"].get("months", [])
        if m["year_month"] > current_ym
    ])
    if len(future_months) < 3:
        pytest.skip("剩余未来月不足 3 个，跳过解约 3 个月测试")

    expected_3 = future_months[-3:]

    # 解约 3 个月
    cancel_resp = await client.delete(
        f"/admin/teams/{team_id}/quota",
        params={"months": 3},
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    data = cancel_resp.json()
    assert data.get("success"), data.get("message", "")
    cancelled = data["data"].get("cancelled_months", [])
    assert len(cancelled) == 3, f"应解约 3 个月，实际 {len(cancelled)}: {cancelled}"
    assert set(cancelled) == set(expected_3), f"预期 {expected_3}，实际 {cancelled}"
