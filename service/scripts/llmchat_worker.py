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

# #region agent log
def _worker_debug_log(msg: str, data: dict, hypothesis_id: str = ""):
    try:
        import time
        p = Path(__file__).resolve().parent.parent.parent / ".cursor" / "debug.log"
        p.parent.mkdir(parents=True, exist_ok=True)
        entry = json.dumps({"message": msg, "data": data, "hypothesisId": hypothesis_id, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n"
        with open(p, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception:
        pass
# #endregion
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
                    # 兼容 content_type（llmchat API）与 email_content_type（组合 API）
                    content_type = (
                        notification_config.get("content_type")
                        or notification_config.get("email_content_type")
                        or "html"
                    )
                    if content_type not in ("html", "plain", "file"):
                        content_type = "html"
                    if not email_to:
                        logger.warning("[LLMChatTask] 跳过邮件：notification_config 中无 email_to task_id=%s", task_id)
                        return
                    team_id_val = team_id.strip() if (team_id and isinstance(team_id, str)) else None
                    if not team_id_val:
                        team_id_val = None
                    email_cfg = await NotificationConfigService.get_by_type(db, "email", team_id_val)
                    if not email_cfg:
                        logger.warning(
                            "[LLMChatTask] 跳过邮件：未找到邮件配置 team_id=%s（请检查通知中心是否已配置，且 team_id 与任务的团队一致）task_id=%s",
                            team_id_val or "全局",
                            task_id,
                        )
                        return
                    send_config = await NotificationConfigService.get_config_dict(email_cfg)
                    provider = (send_config or {}).get("provider") or ""
                    if provider == "smtp":
                        if not send_config or not (send_config.get("host") or send_config.get("smtp_host")) or not (send_config.get("from_email") or send_config.get("from")):
                            logger.warning("[LLMChatTask] 跳过邮件：SMTP 配置不完整（host/from_email）task_id=%s", task_id)
                            return
                    else:
                        if not send_config or not send_config.get("api_user") or not send_config.get("api_key"):
                            logger.warning("[LLMChatTask] 跳过邮件：SendCloud 配置不完整（api_user/api_key）task_id=%s", task_id)
                            return
                    subject = f"[LLM Chat] 场景 {scene} 处理完成"
                    ok = await EmailService.send_email(
                        config=send_config,
                        to=email_to,
                        subject=subject,
                        content=content or "",
                        content_type=content_type,
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
    # #region agent log
    _worker_debug_log("Worker started, Redis connected", {"stream": STREAM_NAME, "consumer_group": CONSUMER_GROUP}, "H1")
    # #endregion

    # 创建 consumer group（若不存在）
    try:
        await redis_client.xgroup_create(STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
    except Exception:
        pass  # 已存在则忽略

    _last_log = 0.0
    _pending_start = "0-0"
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
                # 尝试认领超时未 ack 的 pending 消息（idle > 60 秒）
                try:
                    claimed = await redis_client.xautoclaim(
                        STREAM_NAME, CONSUMER_GROUP, CONSUMER_NAME, min_idle_time=60000, start_id=_pending_start, count=5
                    )
                    if claimed and len(claimed) >= 2 and claimed[1]:
                        msgs = claimed[1]
                        _pending_start = claimed[0] or "0-0"
                        logger.info("[LLMChatTask] 认领 %d 条 pending 消息", len(msgs))
                        streams = [(STREAM_NAME, msgs)]
                    else:
                        _pending_start = "0-0"
                except Exception as claim_err:
                    _pending_start = "0-0"
                    logger.debug("[LLMChatTask] XAUTOCLAIM 无待认领消息或失败: %s", claim_err)
                if not streams:
                    import time
                    if time.time() - _last_log > 60:
                        logger.info("[LLMChatTask] Worker 空闲等待中 stream=%s", STREAM_NAME)
                        _last_log = time.time()
                    continue
            else:
                _pending_start = "0-0"

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
                    # #region agent log
                    _worker_debug_log("worker_consumed", {"task_id": task_id, "scene": scene, "msg_id": str(msg_id)}, "H1")
                    # #endregion

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
