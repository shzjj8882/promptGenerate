#!/bin/bash
# PM2 启动脚本（用于后端服务）
# 确保使用虚拟环境中的 uvicorn

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "错误: 虚拟环境不存在，请先运行部署脚本"
    exit 1
fi

# 激活虚拟环境并启动服务
source venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8000
