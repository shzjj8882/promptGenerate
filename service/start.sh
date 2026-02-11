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
if [ ! -d "venv" ]; then
    echo "创建虚拟环境（使用 $PYTHON_CMD）..."
    $PYTHON_CMD -m venv venv
fi

# 使用 venv 中的 Python（兼容 uv 创建的 venv，可能无 pip 可执行文件）
VENV_PYTHON="venv/bin/python"
VENV_PIP="$VENV_PYTHON -m pip"

# 安装依赖
echo "安装依赖..."
$VENV_PIP install -r requirements.txt
# Python 3.10+ 时自动安装 MCP
venv_ver=$($VENV_PYTHON -c "import sys; print(sys.version_info.major*100+sys.version_info.minor)" 2>/dev/null)
if [ -n "$venv_ver" ] && [ "$venv_ver" -ge 310 ]; then
    $VENV_PIP install -r requirements-mcp.txt
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

# 预检查：验证 RBAC/菜单 迁移脚本能否全部成功（避免启动时报错）
echo "预检查迁移脚本..."
PYTHONPATH=. $VENV_PYTHON scripts/verify_startup_migrations.py || exit 1

# 启动服务
echo "启动服务..."
venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

