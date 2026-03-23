#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
启动前数据库版本检查

- Schema：由 Alembic 管理，init_db 启动时自动执行 alembic upgrade head
- RBAC/菜单：migration_version 检查，不一致时提示确认
- 一致：直接通过，继续启动
- 不一致：提示需要更新，等待用户确认 (y/n)

非交互场景（CI/Docker）：设置环境变量 AUTO_MIGRATE=1 可自动确认
"""
import os
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))


def main():
    from app.core.migration_version import needs_migration as migration_needs

    migration_need, migration_cur, migration_app = migration_needs()

    if not migration_need:
        return 0

    print()
    print("=" * 60)
    print("⚠️  检测到 RBAC/菜单 需要更新")
    print("=" * 60)
    print(f"  [迁移]   当前: {migration_cur}  已应用: {migration_app or '(无)'}")
    print()
    print("  需要执行 RBAC/菜单 迁移后才能启动。")
    print("  是否继续？启动后将自动执行更新。")
    print("=" * 60)

    if os.environ.get("AUTO_MIGRATE") == "1":
        print("  [AUTO_MIGRATE=1] 自动确认，继续启动")
        return 0

    try:
        ans = input("  请输入 y 继续 / n 取消 [y/n]: ").strip().lower()
    except EOFError:
        print("  无法读取输入（非交互模式），请设置 AUTO_MIGRATE=1 自动确认")
        return 1

    if ans in ("y", "yes"):
        return 0
    print("  已取消启动")
    return 1


if __name__ == "__main__":
    sys.exit(main())
