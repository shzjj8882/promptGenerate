"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-03-06

从 SQLAlchemy 模型创建所有表，并向前兼容已有库的增量字段。
- 空库：create_all 创建全部表
- 已有库：create_all 跳过已存在表；ADD COLUMN IF NOT EXISTS 补齐缺失字段
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # 1. 从模型创建所有表（空库时创建，已有表则跳过）
    from app.core.database import Base
    import app.models  # noqa: F401
    import app.models.rbac  # noqa: F401
    from app.models.composition import Composition  # noqa: F401
    from app.models.system_dashboard_config import SystemDashboardConfig  # noqa: F401

    Base.metadata.create_all(bind=conn)

    # 2. 向前兼容：已有库可能缺少以下字段，ADD COLUMN IF NOT EXISTS
    op.execute(
        text(
            """
            ALTER TABLE teams
            ADD COLUMN IF NOT EXISTS plan_expire_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS monthly_token_limit INTEGER NULL
            """
        )
    )
    op.execute(
        text(
            """
            ALTER TABLE team_monthly_token_usage
            ADD COLUMN IF NOT EXISTS calls_used INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS rollover_from_prev_tokens INTEGER NOT NULL DEFAULT 0
            """
        )
    )
    op.execute(
        text(
            """
            ALTER TABLE team_monthly_token_usage
            ADD COLUMN IF NOT EXISTS gift_tokens_used INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS rollover_tokens_used INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS base_tokens_used INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS extra_tokens_used INTEGER NOT NULL DEFAULT 0
            """
        )
    )
    op.execute(
        text(
            """
            ALTER TABLE team_monthly_plans
            ADD COLUMN IF NOT EXISTS base_token_limit INTEGER NULL,
            ADD COLUMN IF NOT EXISTS gift_tokens INTEGER NULL,
            ADD COLUMN IF NOT EXISTS extra_tokens INTEGER NULL
            """
        )
    )
    op.execute(
        text(
            """
            ALTER TABLE team_usage_logs
            ADD COLUMN IF NOT EXISTS business_name VARCHAR NULL
            """
        )
    )
    op.execute(
        text(
            """
            ALTER TABLE llmchat_tasks
            ADD COLUMN IF NOT EXISTS quota_refunded_at TIMESTAMPTZ NULL
            """
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    # 初始迁移：downgrade 不执行破坏性操作，生产环境慎用
    pass
