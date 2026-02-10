#!/bin/bash
# PM2 日志查看脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

# 如果没有参数，显示所有日志
if [ $# -eq 0 ]; then
    echo "查看所有服务日志（按 Ctrl+C 退出）..."
    pm2 logs
else
    # 如果指定了服务名，只显示该服务的日志
    echo "查看 $1 服务日志（按 Ctrl+C 退出）..."
    pm2 logs $1
fi
