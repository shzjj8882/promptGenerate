# -*- coding: utf-8 -*-
"""
应用接口 /api 可选鉴权：
1. 若配置了 API_KEY，则校验请求头 X-API-Key 与其一致（优先级最高，业务场景）
2. 若未配置 API_KEY，支持 Bearer Token（用于后台调试场景）
3. 若未配置 API_KEY 且无 Bearer Token，则校验请求头 X-Team-AuthCode（团队认证码）
4. 如果三者都未配置/提供，则无需鉴权（开发环境）
"""
from fastapi import Header, HTTPException, status, Depends, Request
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db
from app.services.team_service import TeamService


async def verify_optional_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    x_team_authcode: Optional[str] = Header(None, alias="X-Team-AuthCode"),
    db: AsyncSession = Depends(get_db),
):
    """
    应用接口认证逻辑（支持多种认证方式）：
    1. 若环境变量中设置了 API_KEY，则校验请求头 X-API-Key 与其一致（优先级最高，业务场景）
    2. 若未配置 API_KEY，支持 Bearer Token 认证（用于后台调试场景）
    3. 若未配置 API_KEY 且无 Bearer Token，则校验请求头 X-Team-AuthCode（团队认证码）
    4. 如果三者都未配置/提供，则无需鉴权，放行所有请求（开发环境）
    
    认证优先级：API Key > Bearer Token > 团队认证码 > 无需认证
    """
    # 1. 优先检查全局 API_KEY（业务场景，优先级最高）
    if settings.API_KEY:
        if not x_api_key or x_api_key.strip() != settings.API_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="缺少或无效的 X-API-Key",
                headers={"WWW-Authenticate": "ApiKey"},
            )
        return
    
    # 2. 如果没有配置 API_KEY，检查 Bearer Token（调试场景）
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        if token:
            from app.core.security import verify_token
            from app.services.user_service import UserService
            
            payload = verify_token(token)
            if payload is not None:
                username: str = payload.get("sub")
                if username:
                    user = await UserService.get_user_by_username(db, username)
                    if user:
                        # Bearer Token 验证成功，允许访问
                        return
    
    # 3. 如果没有 Bearer Token 或验证失败，检查团队认证码
    if x_team_authcode:
        team = await TeamService.get_team_by_authcode(db, x_team_authcode.strip())
        if team:
            # 团队认证码验证成功，允许访问
            return
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的团队认证码",
                headers={"WWW-Authenticate": "TeamAuthCode"},
            )
    
    # 4. 如果都没有提供，且没有配置 API_KEY，则无需鉴权（开发环境）
    # 注意：如果配置了 API_KEY，必须提供有效的 API Key，不会走到这里
    return


async def get_team_id_from_auth(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    x_team_authcode: Optional[str] = Header(None, alias="X-Team-AuthCode"),
    db: AsyncSession = Depends(get_db),
) -> Optional[str]:
    """
    从认证信息中获取 team_id：
    1. 如果使用 X-Team-AuthCode，返回对应的 team_id（优先级最高，即使配置了 API_KEY）
    2. 如果使用 Bearer Token，返回用户的 team_id
    3. 如果使用 X-API-Key（全局 API Key），返回 None（无法确定团队）
    4. 如果无需认证，返回 None
    
    返回: team_id 或 None
    """
    # 1. 优先检查团队认证码（即使配置了 API_KEY，X-Team-AuthCode 也能提供团队信息）
    if x_team_authcode:
        team = await TeamService.get_team_by_authcode(db, x_team_authcode.strip())
        if team:
            return team.id
    
    # 2. 如果配置了全局 API_KEY，且提供了 X-API-Key，无法确定团队
    if settings.API_KEY and x_api_key and x_api_key.strip() == settings.API_KEY:
        return None
    
    # 3. 检查 Bearer Token（调试场景）
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        if token:
            from app.core.security import verify_token
            from app.services.user_service import UserService
            
            payload = verify_token(token)
            if payload is not None:
                username: str = payload.get("sub")
                if username:
                    user = await UserService.get_user_by_username(db, username)
                    if user and user.team_id:
                        return user.team_id
    
    # 4. 如果都没有，返回 None
    return None
