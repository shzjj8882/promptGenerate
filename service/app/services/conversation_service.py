"""
会话记录服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.models.conversation import Conversation, ConversationMessage
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationMessageCreate
import json


class ConversationService:
    """会话记录服务类"""
    
    @staticmethod
    async def create_conversation(
        db: AsyncSession,
        conversation_data: ConversationCreate,
        team_id: Optional[str] = None,
    ) -> Conversation:
        """创建会话"""
        conv_dict = conversation_data.model_dump()
        
        # 处理 meta_data 字段（数据库字段名为 metadata）
        if "meta_data" in conv_dict and isinstance(conv_dict["meta_data"], dict):
            conv_dict["meta_data"] = json.dumps(conv_dict["meta_data"])
        elif "metadata" in conv_dict and isinstance(conv_dict["metadata"], dict):
            # 兼容旧字段名
            conv_dict["meta_data"] = json.dumps(conv_dict["metadata"])
            del conv_dict["metadata"]
        
        conversation = Conversation(**conv_dict, team_id=team_id)
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
        return conversation
    
    @staticmethod
    async def get_conversation_by_id(db: AsyncSession, conversation_id: str, include_messages: bool = True) -> Optional[Conversation]:
        """根据 ID 获取会话（可选包含消息）"""
        q = select(Conversation).where(Conversation.id == conversation_id)
        if include_messages:
            q = q.options(selectinload(Conversation.messages))
        result = await db.execute(q)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_conversations(
        db: AsyncSession,
        team_id: Optional[str] = None,
        scene: Optional[str] = None,
        tenant_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Conversation]:
        """获取会话列表"""
        q = select(Conversation)
        
        if team_id is not None:
            q = q.where(Conversation.team_id == team_id)
        
        if scene:
            q = q.where(Conversation.scene == scene)
        
        if tenant_id:
            q = q.where(Conversation.tenant_id == tenant_id)
        
        q = q.order_by(desc(Conversation.updated_at)).offset(skip).limit(limit)
        result = await db.execute(q)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_conversation(db: AsyncSession, conversation_id: str, conversation_data: ConversationUpdate) -> Optional[Conversation]:
        """更新会话"""
        conversation = await ConversationService.get_conversation_by_id(db, conversation_id, include_messages=False)
        if not conversation:
            return None
        
        update_dict = conversation_data.model_dump(exclude_unset=True)
        
        # 处理 meta_data 字段（数据库字段名为 metadata）
        if "meta_data" in update_dict and isinstance(update_dict["meta_data"], dict):
            update_dict["meta_data"] = json.dumps(update_dict["meta_data"])
        elif "metadata" in update_dict and isinstance(update_dict["metadata"], dict):
            # 兼容旧字段名
            update_dict["meta_data"] = json.dumps(update_dict["metadata"])
            del update_dict["metadata"]
        
        for key, value in update_dict.items():
            setattr(conversation, key, value)
        
        await db.commit()
        await db.refresh(conversation)
        return conversation
    
    @staticmethod
    async def delete_conversation(db: AsyncSession, conversation_id: str) -> bool:
        """删除会话（级联删除消息）"""
        conversation = await ConversationService.get_conversation_by_id(db, conversation_id, include_messages=False)
        if not conversation:
            return False
        
        await db.delete(conversation)
        await db.commit()
        return True
    
    @staticmethod
    async def add_message(
        db: AsyncSession,
        conversation_id: str,
        message_data: ConversationMessageCreate,
    ) -> Optional[ConversationMessage]:
        """添加消息到会话"""
        conversation = await ConversationService.get_conversation_by_id(db, conversation_id, include_messages=False)
        if not conversation:
            return None
        
        msg_dict = message_data.model_dump()
        
        # 处理 meta_data 字段（数据库字段名为 metadata）
        if "meta_data" in msg_dict and isinstance(msg_dict["meta_data"], dict):
            msg_dict["meta_data"] = json.dumps(msg_dict["meta_data"])
        elif "metadata" in msg_dict and isinstance(msg_dict["metadata"], dict):
            # 兼容旧字段名
            msg_dict["meta_data"] = json.dumps(msg_dict["metadata"])
            del msg_dict["metadata"]
        
        message = ConversationMessage(**msg_dict, conversation_id=conversation_id)
        db.add(message)
        await db.commit()
        await db.refresh(message)
        
        # 更新会话的 updated_at（通过刷新会话）
        await db.refresh(conversation)
        
        return message
    
    @staticmethod
    async def get_messages(
        db: AsyncSession,
        conversation_id: str,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[ConversationMessage]:
        """获取会话的消息列表"""
        q = select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id
        ).order_by(ConversationMessage.created_at).offset(skip)
        
        if limit:
            q = q.limit(limit)
        
        result = await db.execute(q)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_conversation_history_for_context(
        db: AsyncSession,
        conversation_id: str,
        max_messages: int = 10,
    ) -> List[dict]:
        """获取会话历史用于上下文（返回格式化的消息列表）"""
        messages = await ConversationService.get_messages(db, conversation_id, limit=max_messages)
        
        result = []
        for msg in messages:
            # 解析 meta_data（如果是 JSON 字符串）
            metadata = None
            if msg.meta_data:
                try:
                    metadata = json.loads(msg.meta_data) if isinstance(msg.meta_data, str) else msg.meta_data
                except:
                    pass
            
            result.append({
                "role": msg.role,
                "content": msg.content,
                "metadata": metadata,
            })
        
        return result
