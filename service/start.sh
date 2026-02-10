#!/bin/bash
# 启动脚本

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "安装依赖..."
pip install -r requirements.txt

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "创建 .env 文件..."
    cp env.template .env
    echo "请编辑 .env 文件配置数据库连接等信息"
    exit 1
fi

# 初始化数据库（创建数据库）
echo "初始化数据库..."
python3 scripts/init_db.py

# 启动服务
echo "启动服务..."
uvicorn main:app --reload --host 0.0.0.0 --port 8000

