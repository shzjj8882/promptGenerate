"""
LLM服务 - 集成DeepSeek API（HTTP 客户端复用优化）
"""
import httpx
import json
from typing import Optional, Dict, Any, AsyncIterator
from app.core.config import settings


class LLMService:
    """LLM服务类（HTTP 客户端复用，减少连接开销）"""
    
    # 类级别的 HTTP 客户端（单例，复用连接池）
    _client: Optional[httpx.AsyncClient] = None
    _stream_client: Optional[httpx.AsyncClient] = None
    
    def __init__(self, api_key: Optional[str] = None, api_base: Optional[str] = None, model: Optional[str] = None):
        # DeepSeek API配置（优先使用传入参数，否则从环境变量读取）
        self.api_key = api_key or getattr(settings, "DEEPSEEK_API_KEY", "")
        self.api_base = api_base or getattr(settings, "DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
        self.model = model or getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat")
    
    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        """获取复用的 HTTP 客户端（普通请求）"""
        if cls._client is None:
            cls._client = httpx.AsyncClient(
                timeout=60.0,
                limits=httpx.Limits(
                    max_keepalive_connections=10,
                    max_connections=20,
                    keepalive_expiry=30.0,
                ),
            )
        return cls._client
    
    @classmethod
    async def get_stream_client(cls) -> httpx.AsyncClient:
        """获取复用的 HTTP 客户端（流式请求，超时更长）"""
        if cls._stream_client is None:
            cls._stream_client = httpx.AsyncClient(
                timeout=120.0,
                limits=httpx.Limits(
                    max_keepalive_connections=5,
                    max_connections=10,
                    keepalive_expiry=30.0,
                ),
            )
        return cls._stream_client
    
    @classmethod
    async def close_clients(cls):
        """关闭 HTTP 客户端（应用关闭时调用）"""
        if cls._client:
            await cls._client.aclose()
            cls._client = None
        if cls._stream_client:
            await cls._stream_client.aclose()
            cls._stream_client = None
    
    async def chat(
        self,
        messages: list,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        调用DeepSeek API进行对话
        
        Args:
            messages: 消息列表，格式为 [{"role": "user", "content": "..."}, ...]
            temperature: 温度参数
            max_tokens: 最大token数
        
        Returns:
            API响应结果
        """
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY未配置")
        
        url = f"{self.api_base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        client = await LLMService.get_client()
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    
    async def chat_with_messages(
        self,
        messages: list,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        使用消息列表调用LLM并返回回复文本
        
        Args:
            messages: 消息列表，格式为 [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, ...]
            temperature: 温度参数
            max_tokens: 最大token数
        
        Returns:
            LLM回复文本
        """
        response = await self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        
        # 提取回复文本
        if "choices" in response and len(response["choices"]) > 0:
            return response["choices"][0]["message"]["content"]
        else:
            raise ValueError("LLM API返回格式错误")
    
    async def chat_stream(
        self,
        messages: list,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """
        调用DeepSeek API进行流式对话
        
        Args:
            messages: 消息列表，格式为 [{"role": "user", "content": "..."}, ...]
            temperature: 温度参数
            max_tokens: 最大token数
        
        Yields:
            LLM流式返回的文本片段
        """
        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY未配置")
        
        url = f"{self.api_base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,  # 启用流式响应
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        client = await LLMService.get_stream_client()
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    # SSE格式：data: {...}
                    if line.startswith("data: "):
                        data_str = line[6:]  # 去掉 "data: " 前缀
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue


llm_service = LLMService()

