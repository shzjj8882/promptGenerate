#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
启动前数据库版本检查

- 比较当前 schema 版本与本地已应用版本
- 一致：直接通过，继续启动
- 不一致：提示需要更新，等待用户确认 (y/n)
  - y：通过，允许启动（main 启动时会执行更新）
  - n：退出，不启动

非交互场景（CI/Docker）：设置环境变量 AUTO_MIGRATE=1 可自动确认
"""
import asyncio
import os
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))


def main():
    from app.core.schema_version import needs_migration as schema_needs
    from app.core.migration_version import needs_migration as migration_needs

    schema_need, schema_cur, schema_app = schema_needs()
    migration_need, migration_cur, migration_app = migration_needs()
    need = schema_need or migration_need

    if not need:
        # 版本一致，无需更新
        return 0

    # 版本不一致，需要更新
    print()
    print("=" * 60)
    print("⚠️  检测到数据库需要更新")
    print("=" * 60)
    if schema_need:
        print(f"  [Schema]  当前: {schema_cur}  已应用: {schema_app or '(无)'}")
    if migration_need:
        print(f"  [迁移]   当前: {migration_cur}  已应用: {migration_app or '(无)'}")
    print()
    print("  需要执行数据库更新（建表/RBAC 迁移）后才能启动。")
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
