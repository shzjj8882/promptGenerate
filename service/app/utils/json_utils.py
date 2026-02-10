# -*- coding: utf-8 -*-
"""
JSON 工具模块：使用 orjson 优化序列化性能
"""
from typing import Union, Any

try:
    import orjson
    ORJSON_AVAILABLE = True
except ImportError:
    import json
    ORJSON_AVAILABLE = False


def dumps(obj: Any, **kwargs) -> str:
    """
    序列化对象为 JSON 字符串
    如果 orjson 可用，使用 orjson（性能提升 2-3 倍）
    否则回退到标准 json
    """
    if ORJSON_AVAILABLE:
        # orjson 返回 bytes，需要解码为字符串
        return orjson.dumps(obj, option=orjson.OPT_NON_STR_KEYS).decode('utf-8')
    else:
        return json.dumps(obj, **kwargs)


def loads(s: Union[str, bytes]) -> Any:
    """
    反序列化 JSON 字符串
    如果 orjson 可用，使用 orjson
    否则回退到标准 json
    """
    if ORJSON_AVAILABLE:
        # orjson 接受 bytes 或 str
        if isinstance(s, str):
            s = s.encode('utf-8')
        return orjson.loads(s)
    else:
        if isinstance(s, bytes):
            s = s.decode('utf-8')
        return json.loads(s)
