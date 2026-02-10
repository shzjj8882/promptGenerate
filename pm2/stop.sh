#!/bin/bash
# PM2 停止脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "停止 PM2 服务..."
pm2 stop ecosystem.config.js || pm2 delete ecosystem.config.js

echo "服务已停止"
