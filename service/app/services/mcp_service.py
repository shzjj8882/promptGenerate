"""
MCP 配置服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List, Optional, Dict, Any
import json
import logging

import httpx

from app.models.mcp import MCPConfig
from app.schemas.mcp import MCPConfigCreate, MCPConfigUpdate

logger = logging.getLogger(__name__)

# 支持的传输类型
TRANSPORT_SSE = "sse"
TRANSPORT_STREAMABLE_HTTP = "streamable_http"


def _build_auth_headers(auth_info: Optional[Dict[str, Any]]) -> dict:
    """根据 auth_info 构建请求头"""
    headers = {}
    if auth_info and isinstance(auth_info, dict):
        if "Authorization" in auth_info:
            headers["Authorization"] = auth_info["Authorization"]
        elif "headers" in auth_info and isinstance(auth_info["headers"], dict):
            headers.update(auth_info["headers"])
        elif "api_key" in auth_info:
            headers["Authorization"] = f"Bearer {auth_info['api_key']}"
    return headers


async def _fetch_mcp_tools(
    url: str,
    auth_info: Optional[Dict[str, Any]] = None,
    transport_type: str = TRANSPORT_SSE,
) -> List[Dict[str, Any]]:
    """
    连接 MCP 服务并获取工具列表
    支持 SSE 和 Streamable HTTP 两种传输协议
    """
    try:
        from mcp import ClientSession
        from mcp.client.sse import sse_client
        try:
            from mcp.client.streamable_http import streamable_http_client
        except ImportError:
            streamable_http_client = None
    except ImportError as e:
        logger.warning(f"MCP SDK 未安装，无法连接 MCP 服务: {e}")
        raise ValueError(
            "MCP SDK 未安装。MCP 需 Python 3.10+，请在项目 service 目录下执行: "
            "pip install -r requirements-mcp.txt ；或使用 Docker 部署。"
        ) from e

    if transport_type == TRANSPORT_STREAMABLE_HTTP and not streamable_http_client:
        raise ValueError(
            "Streamable HTTP 需要 MCP SDK v1.x，当前版本可能不支持。请尝试: pip install 'mcp>=1.0,<2.0'"
        )

    headers = _build_auth_headers(auth_info)
    all_tools: List[Dict[str, Any]] = []
    cursor = None

    async def _run_session(read_stream, write_stream):
        nonlocal cursor
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            while True:
                if cursor is not None:
                    result = await session.list_tools(params={"cursor": cursor})
                else:
                    result = await session.list_tools()
                for tool in result.tools:
                    tool_dict = {
                        "name": tool.name,
                        "title": getattr(tool, "title", None) or tool.name,
                        "description": getattr(tool, "description", None) or "",
                        "inputSchema": getattr(tool, "inputSchema", None),
                    }
                    all_tools.append(tool_dict)
                next_cursor = getattr(result, "nextCursor", None)
                if not next_cursor:
                    break
                cursor = next_cursor

    if transport_type == TRANSPORT_STREAMABLE_HTTP:
        async with httpx.AsyncClient(
            headers=headers or None,
            timeout=httpx.Timeout(30.0, read=60.0),
        ) as http_client:
            async with streamable_http_client(url, http_client=http_client) as streams:
                read_stream, write_stream, _ = streams
                await _run_session(read_stream, write_stream)
    else:
        # 默认 SSE
        async with sse_client(
            url,
            headers=headers or None,
            timeout=10.0,
            sse_read_timeout=30.0,
        ) as (read_stream, write_stream):
            await _run_session(read_stream, write_stream)

    return all_tools


async def call_mcp_tool(
    url: str,
    tool_name: str,
    arguments: Dict[str, Any],
    auth_info: Optional[Dict[str, Any]] = None,
    transport_type: str = TRANSPORT_SSE,
) -> str:
    """
    通过 MCP 连接调用指定工具，返回工具执行结果（文本形式）
    """
    try:
        from mcp import ClientSession
        from mcp.client.sse import sse_client
        try:
            from mcp.client.streamable_http import streamable_http_client
        except ImportError:
            streamable_http_client = None
    except ImportError as e:
        raise ValueError(
            "MCP SDK 未安装。MCP 需 Python 3.10+，请在项目 service 目录下执行: "
            "pip install -r requirements-mcp.txt ；或使用 Docker 部署。"
        ) from e

    if transport_type == TRANSPORT_STREAMABLE_HTTP and not streamable_http_client:
        raise ValueError(
            "Streamable HTTP 需要 MCP SDK v1.x，当前版本可能不支持。请尝试: pip install 'mcp>=1.0,<2.0'"
        )

    headers = _build_auth_headers(auth_info)
    result_text = ""

    async def _run_call(session: ClientSession) -> str:
        result = await session.call_tool(tool_name, arguments)
        parts = []
        if hasattr(result, "content") and result.content:
            for item in result.content:
                if hasattr(item, "text"):
                    parts.append(item.text)
                elif isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
        return "\n".join(parts) if parts else str(result)

    if transport_type == TRANSPORT_STREAMABLE_HTTP:
        async with httpx.AsyncClient(
            headers=headers or None,
            timeout=httpx.Timeout(30.0, read=60.0),
        ) as http_client:
            async with streamable_http_client(url, http_client=http_client) as streams:
                read_stream, write_stream, _ = streams
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    result_text = await _run_call(session)
    else:
        async with sse_client(
            url,
            headers=headers or None,
            timeout=10.0,
            sse_read_timeout=60.0,
        ) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result_text = await _run_call(session)

    return result_text


class MCPService:
    """MCP 配置服务类"""

    @staticmethod
    async def verify_connection(
        url: str,
        auth_info: Optional[Dict[str, Any]] = None,
        transport_type: str = TRANSPORT_SSE,
    ) -> tuple[bool, str, Optional[List[Dict[str, Any]]]]:
        """
        验证 MCP 服务联通性并获取工具列表
        返回: (success, message, tools)
        """
        try:
            tools = await _fetch_mcp_tools(url, auth_info, transport_type)
            return True, f"连接成功，获取到 {len(tools)} 个工具", tools
        except Exception as e:
            logger.exception("MCP 连接验证失败")
            return False, str(e) or "连接失败", None

    @staticmethod
    async def create_mcp(db: AsyncSession, data: MCPConfigCreate, team_id: Optional[str] = None) -> MCPConfig:
        """创建 MCP 配置（创建前需验证联通并获取工具列表）"""
        transport_type = getattr(data, "transport_type", None) or TRANSPORT_SSE
        success, message, tools = await MCPService.verify_connection(
            data.url, data.auth_info, transport_type
        )
        if not success:
            raise ValueError(f"MCP 连接验证失败: {message}")

        tools_json = json.dumps(tools, ensure_ascii=False) if tools else None
        auth_json = json.dumps(data.auth_info, ensure_ascii=False) if data.auth_info else None

        mcp = MCPConfig(
            name=data.name,
            url=data.url,
            transport_type=transport_type,
            auth_info=auth_json,
            tools_cache=tools_json,
            team_id=team_id,
            is_active=data.is_active,
        )
        db.add(mcp)
        await db.commit()
        await db.refresh(mcp)
        return mcp

    @staticmethod
    async def get_by_id(db: AsyncSession, mcp_id: str) -> Optional[MCPConfig]:
        """根据 ID 获取 MCP 配置"""
        result = await db.execute(select(MCPConfig).where(MCPConfig.id == mcp_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_mcps(
        db: AsyncSession,
        team_id: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 1000,
        include_global: bool = False,
    ) -> List[MCPConfig]:
        """
        获取 MCP 配置列表。
        - team_id 为 None 且 include_global=False：返回全局配置
        - team_id 有值且 include_global=False：返回该团队的配置
        - team_id 有值且 include_global=True：返回该团队配置 + 全局配置（用于团队管理员）
        """
        q = select(MCPConfig)
        if team_id is not None:
            if include_global:
                q = q.where(or_(MCPConfig.team_id == team_id, MCPConfig.team_id.is_(None)))
            else:
                q = q.where(MCPConfig.team_id == team_id)
        else:
            q = q.where(MCPConfig.team_id.is_(None))
        if is_active is not None:
            q = q.where(MCPConfig.is_active == is_active)
        q = q.order_by(MCPConfig.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def list_all_mcps(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[MCPConfig]:
        """获取所有 MCP 配置（不按 team 过滤，用于超管）"""
        q = select(MCPConfig)
        if is_active is not None:
            q = q.where(MCPConfig.is_active == is_active)
        q = q.order_by(MCPConfig.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def list_mcps_for_team(
        db: AsyncSession,
        team_id: Optional[str],
        is_active: bool = True,
    ) -> List[MCPConfig]:
        """获取团队可用的 MCP 配置（团队配置 + 全局配置）"""
        conditions = [MCPConfig.is_active == is_active]
        if team_id:
            conditions.append(or_(MCPConfig.team_id == team_id, MCPConfig.team_id.is_(None)))
        else:
            conditions.append(MCPConfig.team_id.is_(None))
        q = select(MCPConfig).where(and_(*conditions)).order_by(MCPConfig.created_at.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def update_mcp(db: AsyncSession, mcp_id: str, data: MCPConfigUpdate) -> Optional[MCPConfig]:
        """更新 MCP 配置"""
        mcp = await MCPService.get_by_id(db, mcp_id)
        if not mcp:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        if "auth_info" in update_dict and update_dict["auth_info"] is not None:
            update_dict["auth_info"] = json.dumps(update_dict["auth_info"], ensure_ascii=False)
        if "url" in update_dict or "auth_info" in update_dict or "transport_type" in update_dict:
            # 更新了连接信息，重新验证并获取工具
            url = update_dict.get("url") or mcp.url
            transport_type = update_dict.get("transport_type") or getattr(mcp, "transport_type", None) or TRANSPORT_SSE
            auth_info = update_dict.get("auth_info")
            if auth_info is None:
                if mcp.auth_info:
                    try:
                        auth_info = json.loads(mcp.auth_info)
                    except Exception:
                        auth_info = None
            elif isinstance(auth_info, str):
                try:
                    auth_info = json.loads(auth_info) if auth_info else None
                except Exception:
                    auth_info = None
            success, _, tools = await MCPService.verify_connection(url, auth_info, transport_type)
            if success and tools:
                update_dict["tools_cache"] = json.dumps(tools, ensure_ascii=False)
        for key, value in update_dict.items():
            if hasattr(mcp, key):
                setattr(mcp, key, value)

        await db.commit()
        await db.refresh(mcp)
        return mcp

    @staticmethod
    async def refresh_tools(db: AsyncSession, mcp_id: str) -> Optional[MCPConfig]:
        """刷新 MCP 工具列表"""
        mcp = await MCPService.get_by_id(db, mcp_id)
        if not mcp:
            return None
        auth_info = None
        if mcp.auth_info:
            try:
                auth_info = json.loads(mcp.auth_info)
            except Exception:
                pass
        transport_type = getattr(mcp, "transport_type", None) or TRANSPORT_SSE
        success, _, tools = await MCPService.verify_connection(mcp.url, auth_info, transport_type)
        if not success:
            raise ValueError("连接失败，无法刷新工具列表")
        mcp.tools_cache = json.dumps(tools, ensure_ascii=False) if tools else None
        await db.commit()
        await db.refresh(mcp)
        return mcp

    @staticmethod
    async def delete_mcp(db: AsyncSession, mcp_id: str) -> bool:
        """删除 MCP 配置"""
        mcp = await MCPService.get_by_id(db, mcp_id)
        if not mcp:
            return False
        await db.delete(mcp)
        await db.commit()
        return True
