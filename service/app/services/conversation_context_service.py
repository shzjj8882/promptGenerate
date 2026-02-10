# -*- coding: utf-8 -*-
"""
对话上下文管理服务：优先使用 Redis 持久化，Redis 不可用时回退到内存存储。
多实例部署时 Redis 可保证同一 conversation_id 的上下文一致。
"""
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

# 配置日志
logger = logging.getLogger(__name__)

# Redis key 前缀与默认 TTL（秒，24 小时）
REDIS_KEY_PREFIX = "conversation:ctx:"
REDIS_TTL_SECONDS = 86400

# 内存回退：最大对话数量
MAX_CONTEXTS = 1000


class ConversationContext:
    """对话上下文（内存形态，用于回退或兼容）"""
    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self.messages: List[Dict[str, str]] = []
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def add_message(self, role: str, content: str):
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        self.updated_at = datetime.now()

    def get_messages(self) -> List[Dict[str, str]]:
        return [{"role": msg["role"], "content": msg["content"]} for msg in self.messages]

    def get_recent_messages(self, limit: int = 10) -> List[Dict[str, str]]:
        recent = self.messages[-limit:] if len(self.messages) > limit else self.messages
        return [{"role": msg["role"], "content": msg["content"]} for msg in recent]


class ConversationContextService:
    """
    对话上下文服务：优先 Redis，不可用时使用内存。
    所有涉及读写的方法均为 async，调用方需 await。
    """

    _contexts: Dict[str, ConversationContext] = {}

    @classmethod
    async def _get_redis(cls):
        from app.core.database import get_redis_optional
        return await get_redis_optional()

    @classmethod
    def _redis_key(cls, conversation_id: str) -> str:
        return f"{REDIS_KEY_PREFIX}{conversation_id}"

    @classmethod
    async def _add_message_redis(cls, conversation_id: str, role: str, content: str) -> None:
        redis = await cls._get_redis()
        if not redis:
            return
        key = cls._redis_key(conversation_id)
        item = json.dumps({"role": role, "content": content, "ts": datetime.now().isoformat()}, ensure_ascii=False)
        await redis.rpush(key, item)
        await redis.expire(key, REDIS_TTL_SECONDS)

    @classmethod
    async def _get_messages_redis(cls, conversation_id: str, max_count: Optional[int]) -> List[Dict[str, str]]:
        redis = await cls._get_redis()
        if not redis:
            return []
        key = cls._redis_key(conversation_id)
        if max_count:
            # 取最后 max_count 条（Redis list 从左到右，新消息在右边）
            raw = await redis.lrange(key, -max_count, -1)
        else:
            raw = await redis.lrange(key, 0, -1)
        out = []
        for s in raw:
            try:
                obj = json.loads(s)
                out.append({"role": obj.get("role", "user"), "content": obj.get("content", "")})
            except Exception:
                continue
        return out

    @classmethod
    async def _clear_redis(cls, conversation_id: str) -> None:
        redis = await cls._get_redis()
        if redis:
            await redis.delete(cls._redis_key(conversation_id))

    @classmethod
    def _get_or_create_memory(cls, conversation_id: str) -> ConversationContext:
        if conversation_id not in cls._contexts:
            if len(cls._contexts) >= MAX_CONTEXTS:
                oldest_id = min(cls._contexts.keys(), key=lambda k: cls._contexts[k].updated_at)
                del cls._contexts[oldest_id]
            cls._contexts[conversation_id] = ConversationContext(conversation_id)
        return cls._contexts[conversation_id]

    @classmethod
    async def add_user_message(cls, conversation_id: str, content: str) -> None:
        redis = await cls._get_redis()
        if redis:
            await cls._add_message_redis(conversation_id, "user", content)
        else:
            ctx = cls._get_or_create_memory(conversation_id)
            ctx.add_message("user", content)

    @classmethod
    async def add_assistant_message(cls, conversation_id: str, content: str) -> None:
        redis = await cls._get_redis()
        if redis:
            await cls._add_message_redis(conversation_id, "assistant", content)
        else:
            ctx = cls._get_or_create_memory(conversation_id)
            ctx.add_message("assistant", content)
        logger.debug("添加助手回复到对话上下文 [conversation_id=%s]: %s...", conversation_id, (content[:100] if content else ""))

    @classmethod
    async def get_conversation_messages(
        cls,
        conversation_id: str,
        include_system: bool = True,
        system_prompt: Optional[str] = None,
        max_history: Optional[int] = None,
    ) -> List[Dict[str, str]]:
        redis = await cls._get_redis()
        if redis:
            history = await cls._get_messages_redis(conversation_id, max_history)
        else:
            ctx = cls._get_or_create_memory(conversation_id)
            if max_history:
                history = ctx.get_recent_messages(max_history)
            else:
                history = ctx.get_messages()

        messages = []
        if include_system and system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(history)

        logger.info(
            "对话历史查询 [conversation_id=%s] 消息数=%d include_system=%s",
            conversation_id, len(history), include_system
        )
        return messages

    @classmethod
    async def clear_conversation(cls, conversation_id: str) -> None:
        await cls._clear_redis(conversation_id)
        if conversation_id in cls._contexts:
            del cls._contexts[conversation_id]

    @classmethod
    def get_conversation_count(cls) -> int:
        return len(cls._contexts)

    @classmethod
    def clear_all(cls) -> None:
        cls._contexts.clear()
