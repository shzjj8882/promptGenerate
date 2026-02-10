#!/bin/bash
# PM2 部署脚本
# 用于一键部署前端和后端服务

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装 $1"
        exit 1
    fi
}

# 检查必要的命令
log_info "检查必要的命令..."
check_command "pm2"
check_command "python3"
check_command "node"
check_command "pnpm"

# 检查环境变量文件
log_info "检查环境变量配置..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    log_warn ".env 文件不存在，从 .env.example 复制..."
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    log_warn "请编辑 $SCRIPT_DIR/.env 文件，配置正确的环境变量"
fi

if [ ! -f "$PROJECT_ROOT/service/.env" ]; then
    log_warn "service/.env 文件不存在，从 env.template 复制..."
    if [ -f "$PROJECT_ROOT/service/env.template" ]; then
        cp "$PROJECT_ROOT/service/env.template" "$PROJECT_ROOT/service/.env"
        log_warn "请编辑 $PROJECT_ROOT/service/.env 文件，配置数据库和 Redis 连接信息"
    else
        log_error "service/env.template 文件不存在"
        exit 1
    fi
fi

# 创建日志目录
log_info "创建日志目录..."
mkdir -p "$SCRIPT_DIR/logs"

# 构建前端
log_info "构建前端应用..."
cd "$PROJECT_ROOT/app"
if [ ! -d "node_modules" ]; then
    log_info "安装前端依赖..."
    pnpm install
fi

log_info "执行类型检查..."
pnpm type-check

log_info "构建生产版本..."
# 加载 PM2 环境变量到构建过程
export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
# 确保 DEPLOYMENT_MODE 被设置
export DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-pm2}
pnpm build

# 检查构建结果
if [ ! -d ".next/standalone" ]; then
    log_error "前端构建失败，.next/standalone 目录不存在"
    exit 1
fi

log_info "前端构建完成"

# 检查后端依赖
log_info "检查后端依赖..."
cd "$PROJECT_ROOT/service"
if [ ! -d "venv" ]; then
    log_info "创建 Python 虚拟环境..."
    python3 -m venv venv
fi

log_info "安装/更新后端依赖..."
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

# 初始化数据库（如果需要）
log_info "检查数据库..."
if ! python3 -c "from app.core.database import engine; import asyncio; asyncio.run(engine.connect())" 2>/dev/null; then
    log_warn "数据库连接失败，请检查 service/.env 中的数据库配置"
    log_info "运行数据库初始化脚本..."
    python3 scripts/init_db.py || log_warn "数据库初始化失败，请手动检查"
fi

# 停止现有服务
log_info "停止现有 PM2 服务..."
pm2 delete ecosystem.config.js 2>/dev/null || true

# 启动服务
log_info "启动 PM2 服务..."
cd "$SCRIPT_DIR"
pm2 start ecosystem.config.js

# 保存 PM2 配置
log_info "保存 PM2 配置..."
pm2 save

# 显示状态
log_info "服务状态："
pm2 status

log_info ""
log_info "部署完成！"
log_info ""
log_info "常用命令："
log_info "  pm2 status              # 查看服务状态"
log_info "  pm2 logs                # 查看所有日志"
log_info "  pm2 logs aily-service   # 查看后端日志"
log_info "  pm2 logs aily-app       # 查看前端日志"
log_info "  pm2 monit               # 监控面板"
log_info "  pm2 restart all         # 重启所有服务"
log_info "  pm2 stop all            # 停止所有服务"
log_info ""
