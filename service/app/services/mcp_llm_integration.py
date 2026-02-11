"""
MCP 与 LLM 集成：在 LLM 对话中执行 MCP 工具调用
"""
import json
import logging
from typing import List, Dict, Any, Optional

from app.services.llm_service import LLMService, mcp_tools_to_openai_format
from app.services.mcp_service import call_mcp_tool, TRANSPORT_SSE

logger = logging.getLogger(__name__)

# 工具调用循环最大迭代次数，防止无限循环
MAX_TOOL_ITERATIONS = 10


async def chat_with_mcp_tools(
    llm_service: LLMService,
    messages: List[Dict[str, Any]],
    mcp_url: str,
    mcp_tools: List[Dict[str, Any]],
    mcp_auth_info: Optional[Dict[str, Any]] = None,
    mcp_transport_type: str = TRANSPORT_SSE,
    temperature: float = 0.3,
    max_tokens: Optional[int] = None,
) -> str:
    """
    执行带 MCP 工具调用的 LLM 对话循环
    当 LLM 返回 tool_calls 时，通过 MCP 执行工具并将结果追加到 messages，继续调用直至返回最终文本
    
    Returns:
        最终助手回复文本
    """
    openai_tools = mcp_tools_to_openai_format(mcp_tools)
    current_messages = list(messages)
    iteration = 0

    while iteration < MAX_TOOL_ITERATIONS:
        iteration += 1
        response = await llm_service.chat_with_tools(
            messages=current_messages,
            tools=openai_tools,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        if "choices" not in response or not response["choices"]:
            raise ValueError("LLM API 返回格式错误")

        choice = response["choices"][0]
        message = choice.get("message", {})
        content = message.get("content") or ""
        tool_calls = message.get("tool_calls")

        # 将助手消息加入历史
        assistant_msg = {"role": "assistant", "content": content or None}
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls
        # 某些 API 要求 content 不为 null，使用空字符串
        if assistant_msg["content"] is None:
            assistant_msg["content"] = ""
        current_messages.append(assistant_msg)

        if not tool_calls:
            # 无工具调用，返回最终文本
            return content or ""

        # 执行每个 tool_call 并将结果追加到 messages
        for tc in tool_calls:
            tc_id = tc.get("id") or ""
            fn = tc.get("function", {})
            name = fn.get("name", "")
            args_str = fn.get("arguments", "{}")
            try:
                args = json.loads(args_str) if args_str else {}
            except json.JSONDecodeError:
                args = {}

            try:
                result = await call_mcp_tool(
                    url=mcp_url,
                    tool_name=name,
                    arguments=args,
                    auth_info=mcp_auth_info,
                    transport_type=mcp_transport_type,
                )
            except Exception as e:
                logger.exception("MCP 工具调用失败: %s", name)
                result = f"[工具执行错误] {str(e)}"

            current_messages.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "content": result,
            })

    raise ValueError("工具调用循环超过最大迭代次数，请检查 MCP 配置或提示词")
