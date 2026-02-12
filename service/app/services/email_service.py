"""
邮件服务 - SendCloud 集成
根据数据库中的通知配置发送邮件
"""
import logging
from typing import Optional, Dict, Any

import httpx

# SendCloud 邮件发送（与 curl -F multipart/form-data 一致）
SENDCLOUD_API_URL = "https://api2.sendcloud.net/api/mail/send"

logger = logging.getLogger(__name__)


class EmailService:
    """SendCloud 邮件服务"""

    @staticmethod
    async def send_email(
        config: Dict[str, Any],
        to: str,
        subject: str,
        content: str,
        *,
        content_type: str = "html",
    ) -> bool:
        """
        使用 SendCloud 发送邮件

        Args:
            config: 通知配置（api_user, api_key, from_email, from_name）
            to: 收件人邮箱（多个用分号分隔）
            subject: 邮件主题
            content: 邮件内容
            content_type: "html" 或 "plain"

        Returns:
            是否发送成功
        """
        api_user = config.get("api_user") or config.get("apiUser")
        api_key = config.get("api_key") or config.get("apiKey")
        from_email = config.get("from_email") or config.get("from")
        from_name = config.get("from_name") or config.get("fromName") or ""

        if not all([api_user, api_key, from_email, to, subject]):
            logger.warning("SendCloud 配置不完整: api_user/api_key/from_email/to/subject 必填")
            return False

        # SendCloud 需使用 multipart/form-data（与 curl -F 一致）
        fields = {
            "apiUser": (None, api_user),
            "apiKey": (None, api_key),
            "from": (None, from_email),
            "to": (None, to),
            "subject": (None, subject),
        }
        if from_name:
            fields["fromName"] = (None, from_name)
        if content_type == "html":
            fields["html"] = (None, content)
        else:
            fields["plain"] = (None, content)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(SENDCLOUD_API_URL, files=fields)
                if resp.status_code == 200:
                    result = resp.json()
                    if result.get("result") is True or result.get("statusCode") == 200:
                        logger.info("SendCloud 邮件发送成功: to=%s", to)
                        return True
                    logger.warning("SendCloud 返回失败: %s", result)
                else:
                    logger.warning("SendCloud HTTP 错误: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.exception("SendCloud 邮件发送异常: %s", e)
        return False
