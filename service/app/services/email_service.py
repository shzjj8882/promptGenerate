"""
邮件服务 - 支持多种 API 类型
- SendCloud：API 方式
- SMTP：标准 SMTP 协议
"""
import asyncio
import io
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Any, Dict

import httpx

# SendCloud 邮件发送（与 curl -F multipart/form-data 一致）
SENDCLOUD_API_URL = "https://api2.sendcloud.net/api/mail/send"

logger = logging.getLogger(__name__)

EMAIL_PROVIDERS = ("sendcloud", "smtp")


def _send_smtp_sync(
    host: str,
    port: int,
    username: str,
    password: str,
    from_email: str,
    from_name: str,
    to: str,
    subject: str,
    content: str,
    content_type: str = "html",
    use_tls: bool = True,
) -> bool:
    """同步 SMTP 发送（在线程池中执行）。465 端口使用 SSL，587 使用 STARTTLS"""
    try:
        msg = MIMEMultipart()
        msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
        msg["To"] = to
        msg["Subject"] = subject
        if content_type == "file":
            msg.attach(MIMEText("任务处理完成，详见附件。", "plain", "utf-8"))
            part = MIMEBase("application", "octet-stream")
            part.set_payload(content.encode("utf-8"))
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=("utf-8", "", "result.txt"))
            msg.attach(part)
        elif content_type == "html":
            msg.attach(MIMEText(content, "html", "utf-8"))
        else:
            msg.attach(MIMEText(content, "plain", "utf-8"))

        to_list = [addr.strip() for addr in to.split(";") if addr.strip()]
        if port == 465:
            with smtplib.SMTP_SSL(host, port) as server:
                if username and password:
                    server.login(username, password)
                server.sendmail(from_email, to_list, msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                if use_tls:
                    server.starttls()
                if username and password:
                    server.login(username, password)
                server.sendmail(from_email, to_list, msg.as_string())
        logger.info("SMTP 邮件发送成功: to=%s", to)
        return True
    except Exception as e:
        logger.exception("SMTP 邮件发送失败: %s", e)
        return False


class EmailService:
    """邮件服务，支持 SendCloud 与 SMTP"""

    @staticmethod
    def _get_provider(config: Dict[str, Any]) -> str:
        """从 config 推断 provider，默认 sendcloud 以兼容旧数据"""
        p = (config.get("provider") or config.get("email_provider") or "").strip().lower()
        if p in EMAIL_PROVIDERS:
            return p
        # 有 SMTP 特征字段则视为 smtp
        if config.get("host") or config.get("smtp_host"):
            return "smtp"
        return "sendcloud"

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
        根据 config.provider 选择发送方式

        Args:
            config: 通知配置
                - provider: "sendcloud" | "smtp"
                - SendCloud: api_user, api_key, from_email, from_name
                - SMTP: host, port, username, password, from_email, from_name, use_tls
            to: 收件人邮箱（多个用分号分隔）
            subject: 邮件主题
            content: 邮件内容
            content_type: "html" | "plain" | "file"（file 为附件）

        Returns:
            是否发送成功
        """
        provider = EmailService._get_provider(config)
        if provider == "smtp":
            return await EmailService._send_smtp(config, to, subject, content, content_type)
        return await EmailService._send_sendcloud(config, to, subject, content, content_type)

    @staticmethod
    async def _send_sendcloud(
        config: Dict[str, Any],
        to: str,
        subject: str,
        content: str,
        content_type: str,
    ) -> bool:
        """SendCloud 发送"""
        api_user = config.get("api_user") or config.get("apiUser")
        api_key = config.get("api_key") or config.get("apiKey")
        from_email = config.get("from_email") or config.get("from")
        from_name = config.get("from_name") or config.get("fromName") or ""

        if not all([api_user, api_key, from_email, to, subject]):
            logger.warning("SendCloud 配置不完整: api_user/api_key/from_email/to/subject 必填")
            return False

        fields = {
            "apiUser": (None, api_user),
            "apiKey": (None, api_key),
            "from": (None, from_email),
            "to": (None, to),
            "subject": (None, subject),
        }
        if from_name:
            fields["fromName"] = (None, from_name)
        if content_type == "file":
            fields["plain"] = (None, "任务处理完成，详见附件。")
            fields["attachments"] = ("result.txt", io.BytesIO(content.encode("utf-8")), "text/plain")
        elif content_type == "html":
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

    @staticmethod
    async def _send_smtp(
        config: Dict[str, Any],
        to: str,
        subject: str,
        content: str,
        content_type: str,
    ) -> bool:
        """SMTP 发送（在线程池中执行）"""
        host = config.get("host") or config.get("smtp_host") or ""
        port = int(config.get("port") or config.get("smtp_port") or 587)
        username = config.get("username") or config.get("user") or ""
        password = config.get("password") or config.get("pass") or ""
        from_email = config.get("from_email") or config.get("from") or ""
        from_name = config.get("from_name") or config.get("fromName") or ""
        use_tls = config.get("use_tls", True)
        if isinstance(use_tls, str):
            use_tls = use_tls.lower() in ("true", "1", "yes")

        if not host or not from_email or not to or not subject:
            logger.warning("SMTP 配置不完整: host/from_email/to/subject 必填")
            return False

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: _send_smtp_sync(
                host=host,
                port=port,
                username=username,
                password=password,
                from_email=from_email,
                from_name=from_name,
                to=to,
                subject=subject,
                content=content,
                content_type=content_type,
                use_tls=use_tls,
            ),
        )
