#!/bin/bash
# PM2 更新脚本（用于代码更新后重新部署）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查环境变量文件
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    log_warn ".env 文件不存在，从 .env.example 复制..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    log_warn "请编辑 $SCRIPT_DIR/.env 文件，配置正确的环境变量"
fi

# 加载环境变量
export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
export DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-pm2}

# 更新前端
log_info "更新前端应用..."
cd "$PROJECT_ROOT/app"
pnpm install
pnpm type-check
pnpm build

# 检查构建结果
if [ ! -d ".next/standalone" ]; then
    log_warn "前端构建失败，.next/standalone 目录不存在"
    exit 1
fi

# 更新后端依赖（如果需要）
log_info "检查后端依赖..."
cd "$PROJECT_ROOT/service"
if [ -d "venv" ]; then
    source venv/bin/activate
    pip install -r requirements.txt --upgrade
fi

# 重启服务
log_info "重启 PM2 服务..."
cd "$SCRIPT_DIR"
pm2 restart ecosystem.config.js --update-env

log_info "更新完成！"
pm2 status
