#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 MCP 测试服务（SSE 传输）
用于验证 MCP 配置功能的连通性

依赖: pip install mcp httpx-sse starlette uvicorn
启动: python scripts/mcp_test_server.py

启动后，在 MCP 配置页面填写下面表格中的参数。
"""
from typing import Any

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Mount, Route
import uvicorn

PORT = 8765

app = Server("mcp-test-server")


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.ContentBlock]:
    if name == "add":
        a = arguments.get("a", 0)
        b = arguments.get("b", 0)
        return [types.TextContent(type="text", text=str(a + b))]
    if name == "get_weather":
        city = arguments.get("city", "北京")
        return [types.TextContent(type="text", text=f"{city}的天气：晴，25°C")]
    if name == "echo":
        msg = arguments.get("message", "")
        return [types.TextContent(type="text", text=msg)]
    raise ValueError(f"Unknown tool: {name}")


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="add",
            title="加法运算",
            description="计算两个整数的和",
            input_schema={
                "type": "object",
                "required": ["a", "b"],
                "properties": {
                    "a": {"type": "integer", "description": "第一个数"},
                    "b": {"type": "integer", "description": "第二个数"},
                },
            },
        ),
        types.Tool(
            name="get_weather",
            title="获取天气",
            description="获取指定城市的天气信息（模拟）",
            input_schema={
                "type": "object",
                "required": ["city"],
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                },
            },
        ),
        types.Tool(
            name="echo",
            title="回显",
            description="原样返回输入的消息",
            input_schema={
                "type": "object",
                "required": ["message"],
                "properties": {
                    "message": {"type": "string", "description": "要回显的消息"},
                },
            },
        ),
    ]


sse = SseServerTransport("/messages/")


async def handle_sse(request: Request):
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())
    return Response()


starlette_app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse, methods=["GET"]),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    print(f"MCP 测试服务已启动: http://localhost:{PORT}/sse")
    print("请在 MCP 配置页面填写: MCP 地址 = http://localhost:8765/sse")
    uvicorn.run(starlette_app, host="0.0.0.0", port=PORT)
