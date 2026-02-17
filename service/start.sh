#!/bin/bash
# 启动脚本（需在 service 目录下执行）

cd "$(dirname "$0")"

# 优先使用 Python 3.10+（MCP 功能需要），否则使用系统 python3
PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c "import sys; print(sys.version_info.major*100+sys.version_info.minor)" 2>/dev/null)
        if [ -n "$ver" ] && [ "$ver" -ge 309 ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "❌ 未找到 Python 3.9+"
    exit 1
fi

if [ "$("$PYTHON_CMD" -c "import sys; print(sys.version_info.major*100+sys.version_info.minor)" 2>/dev/null)" -lt 310 ]; then
    echo "⚠️  当前 Python 版本 < 3.10，MCP 功能不可用（需 pip install -r requirements-mcp.txt）"
fi

# 检查虚拟环境
VENV_JUST_CREATED=0
if [ ! -d "venv" ]; then
    echo "创建虚拟环境（使用 $PYTHON_CMD）..."
    $PYTHON_CMD -m venv venv
    VENV_JUST_CREATED=1
fi

# 使用 venv 中的 Python（兼容 uv 创建的 venv，可能无 pip 可执行文件）
VENV_PYTHON="venv/bin/python"
VENV_PIP="$VENV_PYTHON -m pip"

# 安装依赖：新建 venv 必须安装；否则由环境变量控制
# AUTO_INSTALL=1 安装 | 未设置或 SKIP_INSTALL=1 跳过
do_install=0
if [ "$VENV_JUST_CREATED" = "1" ]; then
    do_install=1
    echo "安装依赖（新建虚拟环境）..."
elif [ "$AUTO_INSTALL" = "1" ]; then
    do_install=1
    echo "安装依赖（AUTO_INSTALL=1）..."
else
    echo "跳过依赖安装（需安装时设置 AUTO_INSTALL=1）"
fi

if [ "$do_install" = "1" ]; then
    $VENV_PIP install -r requirements.txt
    venv_ver=$($VENV_PYTHON -c "import sys; print(sys.version_info.major*100+sys.version_info.minor)" 2>/dev/null)
    if [ -n "$venv_ver" ] && [ "$venv_ver" -ge 310 ]; then
        $VENV_PIP install -r requirements-mcp.txt
    fi
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "创建 .env 文件..."
    cp env.template .env
    echo "请编辑 .env 文件配置数据库连接等信息"
    exit 1
fi

# 初始化数据库（创建数据库）
echo "初始化数据库..."
$VENV_PYTHON scripts/init_db.py

# 数据库 schema 版本检查：有变更时提示确认后再启动
echo "检查数据库版本..."
PYTHONPATH=. $VENV_PYTHON scripts/check_db_version.py || exit 1

# 预检查：验证 RBAC/菜单 迁移脚本能否全部成功（避免启动时报错）
echo "预检查迁移脚本..."
PYTHONPATH=. $VENV_PYTHON scripts/verify_startup_migrations.py || exit 1

# 启动 LLMChat Worker（异步任务消费者，后台运行）
echo "启动 LLMChat Worker..."
PYTHONPATH=. $VENV_PYTHON scripts/llmchat_worker.py &
WORKER_PID=$!
echo "Worker PID: $WORKER_PID"

# 退出时清理 Worker
cleanup() { kill $WORKER_PID 2>/dev/null; }
trap cleanup EXIT

# 启动服务
echo "启动服务..."
venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

