# -*- coding: utf-8 -*-
"""
LLM Chat 异步任务 Worker
从 Redis Stream 消费任务，执行 LLM 调用，更新任务状态，发送通知
"""
import asyncio
import json
import logging
import sys
from pathlib import Path
from datetime import datetime

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import init_db, AsyncSessionLocal, get_redis
from app.core.config import settings
from app.models.llmchat_task import LLMChatTask
from app.services.llmchat_api_executor import execute_api_prompt_request
from app.services.notification_config_service import NotificationConfigService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

STREAM_NAME = getattr(settings, "LLMCHAT_STREAM_NAME", "llmchat:tasks") or "llmchat:tasks"
CONSUMER_GROUP = "llmchat-workers"
CONSUMER_NAME = "worker-1"
BLOCK_MS = 5000


async def process_one(db: AsyncSession, task_id: str, scene: str, request_payload_str: str, team_id: str, notification_type: str, notification_config_str: str):
    """处理单个任务"""
    task = await db.get(LLMChatTask, task_id)
    if not task:
        logger.warning("[LLMChatTask] 任务不存在 task_id=%s", task_id)
        return
    if task.status != "pending":
        logger.info("[LLMChatTask] 任务已处理过，跳过 task_id=%s status=%s", task_id, task.status)
        return

    task.status = "running"
    await db.flush()
    logger.info("[LLMChatTask] 任务开始执行 status=running task_id=%s scene=%s", task_id, scene)

    try:
        request_payload = json.loads(request_payload_str) if request_payload_str else {}
        team_code = request_payload.get("teamCode")
        content, err = await execute_api_prompt_request(
            db=db,
            scene=scene,
            request_dict=request_payload,
            team_code=team_code,
            team_id=team_id or None,
        )

        if err:
            task.status = "failed"
            task.error_message = err
            task.completed_at = datetime.utcnow()
            logger.info("[LLMChatTask] 任务失败 status=failed task_id=%s error=%s", task_id, err[:200] if err else "-")
        else:
            task.status = "completed"
            task.result_content = content
            task.completed_at = datetime.utcnow()
            logger.info("[LLMChatTask] 任务完成 status=completed task_id=%s", task_id)

            # 发送通知
            if notification_type == "email" and content:
                try:
                    notification_config = json.loads(notification_config_str) if notification_config_str else {}
                    email_to = notification_config.get("email_to") or notification_config.get("to")
                    if not email_to:
                        return
                    team_id_val = team_id or None
                    email_cfg = await NotificationConfigService.get_by_type(db, "email", team_id_val)
                    if not email_cfg:
                        return
                    send_config = await NotificationConfigService.get_config_dict(email_cfg)
                    if not send_config or not send_config.get("api_user") or not send_config.get("api_key"):
                        return
                    subject = f"[LLM Chat] 场景 {scene} 处理完成"
                    ok = await EmailService.send_email(
                        config=send_config,
                        to=email_to,
                        subject=subject,
                        content=content or "",
                        content_type="html",
                    )
                    if ok:
                        logger.info("[LLMChatTask] 邮件通知已发送 task_id=%s to=%s", task_id, email_to)
                    else:
                        logger.warning("[LLMChatTask] 邮件通知发送失败 task_id=%s to=%s", task_id, email_to)
                except Exception as e:
                    logger.exception("发送邮件通知失败: %s", e)
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        task.completed_at = datetime.utcnow()
        logger.exception("[LLMChatTask] 任务执行异常 status=failed task_id=%s: %s", task_id, e)
    finally:
        await db.commit()


async def run_worker():
    await init_db()
    redis_client = await get_redis()

    # 创建 consumer group（若不存在）
    try:
        await redis_client.xgroup_create(STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
    except Exception:
        pass  # 已存在则忽略

    while True:
        try:
            streams = await redis_client.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                {STREAM_NAME: ">"},
                count=1,
                block=BLOCK_MS,
            )
            if not streams:
                continue

            for stream_name, messages in streams:
                for msg_id, fields in messages:
                    # Redis 可能返回 dict 或 list[k1,v1,k2,v2,...]，需兼容
                    fd = fields if isinstance(fields, dict) else dict(zip(fields[::2], fields[1::2]))
                    task_id = fd.get("task_id")
                    scene = fd.get("scene", "")
                    request_payload = fd.get("request_payload", "{}")
                    team_id = fd.get("team_id", "")
                    notification_type = fd.get("notification_type", "")
                    notification_config = fd.get("notification_config", "{}")

                    logger.info("[LLMChatTask] 从 Redis Stream 消费任务 task_id=%s scene=%s", task_id, scene)

                    async with AsyncSessionLocal() as db:
                        await process_one(db, task_id, scene, request_payload, team_id, notification_type, notification_config)
                    await redis_client.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Worker 消费异常: %s", e)
            await asyncio.sleep(5)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logger.info("LLMChat Worker 启动，监听 Stream: %s", STREAM_NAME)
    asyncio.run(run_worker())
