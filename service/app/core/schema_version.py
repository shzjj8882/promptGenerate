# -*- coding: utf-8 -*-
"""
数据库 schema 版本管理

- 基于 SQLAlchemy metadata 计算 schema 哈希，模型变更时自动变化
- 本地版本记录存于 .db_version（gitignore），不提交
- 启动时比较版本，不一致则提示确认后再执行建表/迁移
"""
import hashlib
from pathlib import Path
from typing import Optional

# 版本文件路径（相对于 service 目录）
VERSION_FILE = ".db_version"


def _ensure_models_loaded():
    """确保所有模型已加载到 Base.metadata"""
    from app.core.database import Base
    from app.models import (
        Prompt, Tenant, Placeholder, User, PlaceholderDataSource,
        Scene, MultiDimensionTable, MultiDimensionTableRow, MultiDimensionTableCell,
        DMUReport, CustomerHistory, Team,
        LLMModel, Conversation, ConversationMessage,
        MCPConfig, NotificationConfig, LLMChatTask,
        UserDashboardConfig,
    )
    from app.models.rbac import Role, Permission
    # 仅触发导入，确保 metadata 已注册
    return Base


def compute_schema_version() -> str:
    """
    根据当前模型 metadata 计算 schema 版本（哈希）
    任意表结构新增/变更时，版本会自动变化
    """
    Base = _ensure_models_loaded()
    parts = []
    for name in sorted(Base.metadata.tables.keys()):
        t = Base.metadata.tables[name]
        cols = []
        for c in sorted(t.columns, key=lambda x: x.name):
            cols.append(f"{c.name}:{str(c.type)}")
        parts.append(f"{name}|{','.join(cols)}")
    content = "\n".join(parts)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def get_version_file_path() -> Path:
    """获取版本文件绝对路径（service 目录下的 .db_version）"""
    # 从 app/core 向上找到 service 目录
    base = Path(__file__).resolve().parent.parent.parent
    return base / VERSION_FILE


def read_applied_version() -> Optional[str]:
    """读取本地已应用的 schema 版本"""
    p = get_version_file_path()
    if not p.exists():
        return None
    try:
        return p.read_text().strip() or None
    except Exception:
        return None


def write_applied_version(version: str) -> None:
    """写入本地已应用的 schema 版本"""
    p = get_version_file_path()
    p.write_text(version + "\n")


def needs_migration() -> tuple[bool, str, Optional[str]]:
    """
    检查是否需要执行数据库迁移

    Returns:
        (need_migrate, current_version, applied_version)
    """
    current = compute_schema_version()
    applied = read_applied_version()
    need = applied is None or applied != current
    return need, current, applied
