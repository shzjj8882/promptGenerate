"""
注册占位符数据获取方法
在应用启动时调用此文件来注册所有可用的数据获取方法
"""
import logging

from app.services.prompt_service import PlaceholderDataSourceService
from app.services.placeholder_methods import (
    get_conversation_id,
    get_custom_rag_infos,
)

logger = logging.getLogger(__name__)


def register_placeholder_methods():
    """注册所有占位符数据获取方法"""
    PlaceholderDataSourceService.register_method("get_conversation_id", get_conversation_id)
    PlaceholderDataSourceService.register_method("get_custom_rag_infos", get_custom_rag_infos)
    logger.info("占位符数据获取方法注册完成")

