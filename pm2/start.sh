#!/bin/bash
# PM2 启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "错误: .env 文件不存在，请先复制 .env.example 并配置"
    exit 1
fi

# 检查 ecosystem.config.js
if [ ! -f "ecosystem.config.js" ]; then
    echo "错误: ecosystem.config.js 文件不存在"
    exit 1
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 创建日志目录
mkdir -p logs

# 启动服务
echo "启动 PM2 服务..."
pm2 start ecosystem.config.js --update-env

# 保存配置
pm2 save

echo "服务已启动"
pm2 status
