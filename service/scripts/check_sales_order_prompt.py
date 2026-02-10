# -*- coding: utf-8 -*-
"""
检查销售打单提示词内容
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db
from app.models.prompt import Prompt
from sqlalchemy import select
import re

async def check_prompts():
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Prompt).where(Prompt.scene == 'sales_order'))
        prompts = result.scalars().all()
        for p in prompts:
            print(f'ID: {p.id}')
            print(f'Scene: {p.scene}')
            print(f'Content: {p.content}')
            print(f'Placeholders array: {p.placeholders}')
            
            # 从内容中提取占位符
            placeholder_pattern = r"\{([^{}]+)\}"
            placeholder_keys = list(set(re.findall(placeholder_pattern, p.content)))
            print(f'Placeholders in content: {placeholder_keys}')
            
            # 检查是否包含 conversationId
            has_conversation_id = any('conversationId' in key or 'conversation_id' in key for key in placeholder_keys)
            print(f'Has conversation_id: {has_conversation_id}')
            print('---')

asyncio.run(check_prompts())
