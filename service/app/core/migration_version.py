# -*- coding: utf-8 -*-
"""
RBAC/菜单 迁移版本管理

- 基于迁移列表计算版本哈希，列表变更时自动变化
- 本地版本记录存于 .db_migration_version（gitignore），不提交
- 启动时版本一致则跳过迁移执行
"""
import hashlib
from pathlib import Path
from typing import Optional

from app.core.migration_config import MIGRATIONS

# 版本文件路径（相对于 service 目录）
VERSION_FILE = ".db_migration_version"


def compute_migration_version() -> str:
    """
    根据迁移列表计算版本（哈希）
    新增/调整迁移时，版本会自动变化
    """
    content = "\n".join(f"{m[0]}:{m[1]}" for m in MIGRATIONS)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def get_version_file_path() -> Path:
    """获取版本文件绝对路径（service 目录下）"""
    base = Path(__file__).resolve().parent.parent.parent
    return base / VERSION_FILE


def read_applied_version() -> Optional[str]:
    """读取本地已应用的迁移版本"""
    p = get_version_file_path()
    if not p.exists():
        return None
    try:
        return p.read_text().strip() or None
    except Exception:
        return None


def write_applied_version(version: str) -> None:
    """写入本地已应用的迁移版本"""
    p = get_version_file_path()
    p.write_text(version + "\n")


def needs_migration() -> tuple[bool, str, Optional[str]]:
    """
    检查是否需要执行 RBAC/菜单 迁移

    Returns:
        (need_migrate, current_version, applied_version)
    """
    current = compute_migration_version()
    applied = read_applied_version()
    need = applied is None or applied != current
    return need, current, applied
