#!/bin/bash
# PM2 重启脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

echo "重启 PM2 服务..."
pm2 restart ecosystem.config.js

echo "服务已重启"
pm2 status
