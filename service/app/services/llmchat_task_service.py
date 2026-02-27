"""
LLM Chat 异步任务服务
- 创建任务、推送 Redis Stream
- 查询任务状态
"""
import json
import logging
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.llmchat_task import LLMChatTask
from app.core.config import settings
from app.core.database import get_redis_optional

logger = logging.getLogger(__name__)

# #region agent log
def _debug_log(msg: str, data: dict, hypothesis_id: str = ""):
    try:
        import time
        p = Path(__file__).resolve().parent.parent.parent.parent / ".cursor" / "debug.log"
        p.parent.mkdir(parents=True, exist_ok=True)
        entry = json.dumps({"message": msg, "data": data, "hypothesisId": hypothesis_id, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n"
        with open(p, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception:
        pass
# #endregion


class LLMChatTaskService:
    """LLM Chat 异步任务服务"""

    @staticmethod
    async def create_task(
        db: AsyncSession,
        scene: str,
        request_payload: Dict[str, Any],
        team_id: Optional[str] = None,
        notification_type: Optional[str] = None,
        notification_config: Optional[Dict[str, Any]] = None,
    ) -> LLMChatTask:
        """创建任务（仅写入 DB，不推 Redis；调用方需在 commit 后调用 push_task_to_stream）"""
        task_id = str(uuid.uuid4())
        task = LLMChatTask(
            id=task_id,
            scene=scene,
            status="pending",
            request_payload=request_payload if request_payload else None,
            team_id=team_id,
            notification_type=notification_type,
            notification_config=notification_config,
        )
        db.add(task)
        await db.flush()
        await db.refresh(task)

        logger.info(
            "[LLMChatTask] 任务创建 status=pending task_id=%s scene=%s team_id=%s notification=%s",
            task_id, scene, team_id or "-", notification_type or "none",
        )
        return task

    @staticmethod
    async def push_task_to_stream(
        task_id: str,
        scene: str,
        request_payload: Dict[str, Any],
        team_id: Optional[str] = None,
        notification_type: Optional[str] = None,
        notification_config: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """将任务推入 Redis Stream（必须在 DB commit 之后调用，避免 Worker 消费时任务尚未可见）"""
        redis_client = await get_redis_optional()
        # #region agent log
        _debug_log("push_task redis check", {"task_id": task_id, "redis_available": redis_client is not None}, "H2")
        # #endregion
        if not redis_client:
            logger.warning("[LLMChatTask] Redis 不可用，任务未推入队列 task_id=%s", task_id)
            return False
        stream_name = getattr(settings, "LLMCHAT_STREAM_NAME", "llmchat:tasks") or "llmchat:tasks"
        msg = {
            "task_id": task_id,
            "scene": scene,
            "request_payload": json.dumps(request_payload, ensure_ascii=False) if request_payload else "{}",
            "team_id": team_id or "",
            "notification_type": notification_type or "",
            "notification_config": json.dumps(notification_config or {}, ensure_ascii=False),
        }
        try:
            await redis_client.xadd(stream_name, msg, maxlen=10000)
            # #region agent log
            _debug_log("push_task xadd success", {"task_id": task_id, "stream": stream_name}, "H2")
            # #endregion
            logger.info("[LLMChatTask] 任务已推入 Redis Stream task_id=%s", task_id)
            return True
        except Exception as ex:
            # #region agent log
            _debug_log("push_task xadd failed", {"task_id": task_id, "error": str(ex)}, "H2")
            # #endregion
            logger.exception("[LLMChatTask] 推入 Redis 失败 task_id=%s: %s", task_id, ex)
            return False

    @staticmethod
    async def get_by_id(db: AsyncSession, task_id: str) -> Optional[LLMChatTask]:
        """根据 ID 获取任务"""
        result = await db.execute(select(LLMChatTask).where(LLMChatTask.id == task_id))
        return result.scalar_one_or_none()
