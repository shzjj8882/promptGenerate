#!/bin/bash
# Docker 一键构建与启动脚本
# 用法: ./build.sh [up|down|build|logs]

set -e
cd "$(dirname "$0")"

cmd="${1:-up}"

case "$cmd" in
  up)
    echo ">>> 构建并启动所有服务（数据库、后端、前端、Nginx）..."
    if ! docker compose build; then
      echo ""
      echo ">>> 构建失败。若为拉取镜像超时，请配置 Docker 镜像加速，见 docker/README.md"
      exit 1
    fi
    docker compose up -d
    echo ""
    echo ">>> 启动完成。访问 http://localhost:3000"
    echo ">>> 查看日志: docker compose logs -f"
    ;;
  down)
    docker compose down
    ;;
  build)
    docker compose build
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "用法: $0 [up|down|build|logs]"
    echo "  up    - 构建并启动（默认）"
    echo "  down  - 停止并移除容器"
    echo "  build - 仅构建镜像"
    echo "  logs  - 查看日志"
    exit 1
    ;;
esac
