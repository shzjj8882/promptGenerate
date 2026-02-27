#!/bin/bash
# PM2 启动脚本（用于 LLMChat Worker）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
[ -d "venv" ] && source venv/bin/activate
exec env PYTHONPATH=. python3 scripts/llmchat_worker.py
