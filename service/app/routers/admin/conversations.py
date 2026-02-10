"""
会话记录管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.auth import get_current_user
from app.core.permissions import require_team_admin_or_superuser
from app.services.conversation_service import ConversationService
from app.schemas.conversation import (
    ConversationCreate, ConversationUpdate, ConversationResponse,
    ConversationMessageCreate, ConversationMessageResponse, ConversationWithMessagesResponse
)
from app.schemas.user import UserResponse

router = APIRouter()


@router.post("/conversations", status_code=status.HTTP_201_CREATED, summary="创建会话", tags=["管理接口 > 会话管理"])
async def create_conversation(
    conversation_data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """创建会话"""
    team_id = current_user.team_id if current_user.team_id else None
    
    conversation = await ConversationService.create_conversation(
        db, conversation_data, team_id=team_id
    )
    
    return ResponseModel.success_response(
        data=ConversationResponse.model_validate(conversation).model_dump(),
        message="创建会话成功",
        code=status.HTTP_201_CREATED
    )


@router.get("/conversations", summary="获取会话列表", tags=["管理接口 > 会话管理"])
async def get_conversations(
    scene: Optional[str] = Query(None, description="场景代码"),
    tenant_id: Optional[str] = Query(None, description="租户ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取会话列表（只能查看自己团队的会话）"""
    team_id = current_user.team_id if current_user.team_id else None
    
    conversations = await ConversationService.get_conversations(
        db, team_id=team_id, scene=scene, tenant_id=tenant_id, skip=skip, limit=limit
    )
    
    return ResponseModel.success_response(
        data={
            "items": [ConversationResponse.model_validate(c).model_dump() for c in conversations],
            "total": len(conversations),  # 简化处理
            "skip": skip,
            "limit": limit,
        },
        message="获取会话列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/conversations/{conversation_id}", summary="获取会话详情", tags=["管理接口 > 会话管理"])
async def get_conversation(
    conversation_id: str,
    include_messages: bool = Query(True, description="是否包含消息"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取会话详情"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=include_messages
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查：只能查看自己团队的会话
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的会话"
            )
    
    return ResponseModel.success_response(
        data=ConversationWithMessagesResponse.model_validate(conversation).model_dump(),
        message="获取会话成功",
        code=status.HTTP_200_OK
    )


@router.put("/conversations/{conversation_id}", summary="更新会话", tags=["管理接口 > 会话管理"])
async def update_conversation(
    conversation_id: str,
    conversation_data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """更新会话"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=False
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能更新自己团队的会话"
            )
    
    updated_conversation = await ConversationService.update_conversation(
        db, conversation_id, conversation_data
    )
    
    return ResponseModel.success_response(
        data=ConversationResponse.model_validate(updated_conversation).model_dump(),
        message="更新会话成功",
        code=status.HTTP_200_OK
    )


@router.delete("/conversations/{conversation_id}", summary="删除会话", tags=["管理接口 > 会话管理"])
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """删除会话"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=False
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能删除自己团队的会话"
            )
    
    success = await ConversationService.delete_conversation(db, conversation_id)
    
    return ResponseModel.success_response(
        data=None,
        message="删除会话成功",
        code=status.HTTP_200_OK
    )


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED, summary="添加消息", tags=["管理接口 > 会话管理"])
async def add_message(
    conversation_id: str,
    message_data: ConversationMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """添加消息到会话"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=False
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能向自己团队的会话添加消息"
            )
    
    message = await ConversationService.add_message(db, conversation_id, message_data)
    
    return ResponseModel.success_response(
        data=ConversationMessageResponse.model_validate(message).model_dump(),
        message="添加消息成功",
        code=status.HTTP_201_CREATED
    )


@router.get("/conversations/{conversation_id}/messages", summary="获取会话消息", tags=["管理接口 > 会话管理"])
async def get_messages(
    conversation_id: str,
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取会话的消息列表"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=False
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的会话消息"
            )
    
    messages = await ConversationService.get_messages(db, conversation_id, skip=skip, limit=limit)
    
    return ResponseModel.success_response(
        data=[ConversationMessageResponse.model_validate(m).model_dump() for m in messages],
        message="获取消息列表成功",
        code=status.HTTP_200_OK
    )


@router.get("/conversations/{conversation_id}/history", summary="获取会话历史（用于上下文）", tags=["管理接口 > 会话管理"])
async def get_conversation_history(
    conversation_id: str,
    max_messages: int = Query(10, ge=1, le=50, description="最大消息数"),
    db: AsyncSession = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """获取会话历史用于上下文"""
    conversation = await ConversationService.get_conversation_by_id(
        db, conversation_id, include_messages=False
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在"
        )
    
    # 权限检查
    if not current_user.is_superuser:
        if conversation.team_id != current_user.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能查看自己团队的会话历史"
            )
    
    history = await ConversationService.get_conversation_history_for_context(
        db, conversation_id, max_messages=max_messages
    )
    
    return ResponseModel.success_response(
        data=history,
        message="获取会话历史成功",
        code=status.HTTP_200_OK
    )
