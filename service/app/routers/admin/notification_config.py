"""
通知配置管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.response import ResponseModel
from app.core.permissions import require_permission
from app.services.notification_config_service import NotificationConfigService
from app.schemas.notification_config import (
    NotificationConfigUpdate,
    NotificationConfigResponse,
    NotificationConfigListResponse,
)
from app.schemas.user import UserResponse

router = APIRouter()


async def require_notification_list_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("config:notification:list", current_user, db)


async def require_notification_update_permission(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await require_permission("config:notification:update", current_user, db)


@router.get("/notification-config", summary="获取通知配置列表", tags=["管理接口 > 通知中心"])
async def list_notification_configs(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_notification_list_permission),
):
    """
    获取当前团队可用的通知配置列表。
    用于前端展示虚线卡片（未配置）或已配置卡片。
    """
    team_id = current_user.team_id if not current_user.is_superuser else None
    configs = await NotificationConfigService.list_for_team(db, team_id=team_id)

    # 确保有 email 类型的占位（若不存在则创建占位记录）
    email_cfg = await NotificationConfigService.get_by_type(db, "email", team_id)
    if not email_cfg:
        email_cfg = await NotificationConfigService.get_or_create_by_type(
            db, "email", "邮件通知（SendCloud）", team_id
        )
        await db.commit()
        configs = await NotificationConfigService.list_for_team(db, team_id=team_id)

    items = []
    for cfg in configs:
        config_dict = await NotificationConfigService.get_config_dict(cfg)
        items.append(NotificationConfigListResponse(
            id=cfg.id,
            type=cfg.type,
            name=cfg.name,
            is_configured=bool(config_dict and config_dict.get("api_user") and config_dict.get("api_key")),
            is_active=cfg.is_active,
            created_at=cfg.created_at,
            updated_at=cfg.updated_at,
        ))

    return ResponseModel.success_response(
        data={"items": [i.model_dump() for i in items]},
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.get("/notification-config/list-for-debug", summary="获取用于调试的通知配置列表", tags=["管理接口 > 通知中心"])
async def list_notification_configs_for_debug(
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_notification_list_permission),
):
    """获取已配置且可用的通知方式（用于提示词调试-接口模式-通知选项）"""
    team_id = current_user.team_id if not current_user.is_superuser else None
    configs = await NotificationConfigService.list_for_team(db, team_id=team_id)

    items = []
    for cfg in configs:
        config_dict = await NotificationConfigService.get_config_dict(cfg)
        if config_dict and config_dict.get("api_user") and config_dict.get("api_key"):
            items.append({"id": cfg.id, "type": cfg.type, "name": cfg.name})

    return ResponseModel.success_response(
        data={"items": items},
        message="获取成功",
        code=status.HTTP_200_OK,
    )


@router.get("/notification-config/{config_id}", summary="获取通知配置详情", tags=["管理接口 > 通知中心"])
async def get_notification_config(
    config_id: str,
    for_edit: bool = Query(False, description="编辑时传入 true，返回完整 config（含 api_key）"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_notification_list_permission),
):
    """获取通知配置详情。for_edit=true 且用户有更新权限时返回完整配置（含 api_key）"""
    from sqlalchemy import select
    from app.models.notification_config import NotificationConfig

    team_id = current_user.team_id if not current_user.is_superuser else None
    result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    if team_id and cfg.team_id and cfg.team_id != team_id:
        raise HTTPException(status_code=403, detail="无权限访问该配置")

    config_dict = await NotificationConfigService.get_config_dict(cfg)
    # 编辑时且用户有更新权限，返回完整 config；否则脱敏
    if for_edit:
        await require_permission("config:notification:update", current_user, db)
        config_to_return = config_dict
    else:
        config_to_return = _mask_config(config_dict, cfg.type) if config_dict else None

    return ResponseModel.success_response(
        data=NotificationConfigResponse(
            id=cfg.id,
            type=cfg.type,
            name=cfg.name,
            config=config_to_return,
            is_active=cfg.is_active,
            team_id=cfg.team_id,
            created_at=cfg.created_at,
            updated_at=cfg.updated_at,
        ).model_dump(),
        message="获取成功",
        code=status.HTTP_200_OK,
    )


def _mask_config(config: dict, config_type: str) -> dict:
    """脱敏"""
    if not config:
        return {}
    masked = config.copy()
    if config_type == "email" and "api_key" in masked and masked["api_key"]:
        masked["api_key"] = "****" + masked["api_key"][-4:] if len(masked["api_key"]) > 4 else "****"
    return masked


class TestEmailBody(BaseModel):
    """测试邮件请求体（使用已保存配置）"""
    email_to: str = Field(..., description="收件人邮箱")


class TestEmailWithConfigBody(BaseModel):
    """测试邮件请求体（使用传入的配置，用于编辑时未保存的数据）"""
    api_user: str = Field(..., description="SendCloud API 用户")
    api_key: str = Field(..., description="SendCloud API 密钥")
    from_email: str = Field(..., description="发件人邮箱")
    from_name: str = Field("", description="发件人名称")
    email_to: str = Field(..., description="收件人邮箱")


@router.post(
    "/notification-config/test-email-with-config",
    summary="使用传入配置测试发送邮件",
    tags=["管理接口 > 通知中心"],
)
async def test_email_with_config(
    body: TestEmailWithConfigBody,
    current_user: UserResponse = Depends(require_notification_update_permission),
):
    """使用传入的配置发送测试邮件（用于编辑时验证当前表单数据）"""
    from app.services.email_service import EmailService

    config = {
        "api_user": body.api_user.strip(),
        "api_key": body.api_key.strip(),
        "from_email": body.from_email.strip(),
        "from_name": (body.from_name or "").strip(),
    }
    if not all([config["api_user"], config["api_key"], config["from_email"], body.email_to.strip()]):
        raise HTTPException(status_code=400, detail="请填写 API User、API Key、发件人邮箱和收件人邮箱")

    ok = await EmailService.send_email(
        config=config,
        to=body.email_to.strip(),
        subject="[LLM Chat] 测试邮件",
        content="<p>这是一封测试邮件，表示您的 SendCloud 邮件配置已正确。</p>",
        content_type="html",
    )
    if not ok:
        raise HTTPException(status_code=500, detail="邮件发送失败，请检查 SendCloud 配置或收件人地址")
    return ResponseModel.success_response(
        data={"message": "测试邮件已发送"},
        message="测试邮件已发送，请查收",
        code=status.HTTP_200_OK,
    )


@router.post("/notification-config/{config_id}/test-email", summary="测试发送邮件（使用已保存配置）", tags=["管理接口 > 通知中心"])
async def test_email_notification(
    config_id: str,
    body: TestEmailBody,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_notification_update_permission),
):
    """使用当前配置发送一封测试邮件"""
    from app.models.notification_config import NotificationConfig
    from sqlalchemy import select
    from app.services.email_service import EmailService

    team_id = current_user.team_id if not current_user.is_superuser else None
    result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    if team_id and cfg.team_id and cfg.team_id != team_id:
        raise HTTPException(status_code=403, detail="无权限访问该配置")
    if cfg.type != "email":
        raise HTTPException(status_code=400, detail="仅支持邮件类型配置的测试")

    config_dict = await NotificationConfigService.get_config_dict(cfg)
    if not config_dict or not config_dict.get("api_user") or not config_dict.get("api_key"):
        raise HTTPException(status_code=400, detail="请先完善 API User、API Key、发件人邮箱等配置")

    email_to = body.email_to.strip()
    if not email_to:
        raise HTTPException(status_code=400, detail="请提供收件人邮箱")

    ok = await EmailService.send_email(
        config=config_dict,
        to=email_to,
        subject="[LLM Chat] 测试邮件",
        content="<p>这是一封测试邮件，表示您的 SendCloud 邮件配置已正确。</p>",
        content_type="html",
    )
    if not ok:
        raise HTTPException(status_code=500, detail="邮件发送失败，请检查 SendCloud 配置或收件人地址")
    return ResponseModel.success_response(
        data={"message": "测试邮件已发送"},
        message="测试邮件已发送，请查收",
        code=status.HTTP_200_OK,
    )


@router.put("/notification-config/{config_id}", summary="更新通知配置", tags=["管理接口 > 通知中心"])
async def update_notification_config(
    config_id: str,
    body: NotificationConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(require_notification_update_permission),
):
    """更新通知配置（SendCloud 等）"""
    from sqlalchemy import select
    from app.models.notification_config import NotificationConfig

    team_id = current_user.team_id if not current_user.is_superuser else None
    result = await db.execute(select(NotificationConfig).where(NotificationConfig.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    if team_id and cfg.team_id and cfg.team_id != team_id:
        raise HTTPException(status_code=403, detail="无权限修改该配置")

    update_dict = body.model_dump(exclude_unset=True)
    updated = await NotificationConfigService.update(db, config_id, update_dict)
    await db.commit()

    config_dict = await NotificationConfigService.get_config_dict(updated)
    masked = _mask_config(config_dict, updated.type) if config_dict else None

    return ResponseModel.success_response(
        data=NotificationConfigResponse(
            id=updated.id,
            type=updated.type,
            name=updated.name,
            config=masked,
            is_active=updated.is_active,
            team_id=updated.team_id,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        ).model_dump(),
        message="更新成功",
        code=status.HTTP_200_OK,
    )
