"""
团队缴费日志模型

记录续约、赠送、购买、解约等操作：
1) 续约、合约的记录
2) 赠送、购买的记录
3) 解约的记录
"""
import enum
import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Index, Enum
from sqlalchemy.sql import func

from app.core.database import Base


class PaymentTypeEnum(str, enum.Enum):
    """缴费类型枚举"""

    GIFT = "gift"
    PURCHASE = "purchase"
    CONTRACT = "contract"
    RENEWAL = "renewal"
    CANCEL = "cancel"


class TeamPaymentLog(Base):
    """
    团队缴费日志

    - payment_type: renewal(续约), contract(签约), gift(赠送), purchase(购买), cancel(解约)
    - year_month: 关联月份 YYYY-MM
    - amount: token 数量（解约时为解约月数）
    """

    __tablename__ = "team_payment_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_type = Column(
        Enum(
            PaymentTypeEnum,
            values_callable=lambda x: [e.value for e in x],
            native_enum=False,
            create_constraint=False,
        ),
        nullable=False,
    )
    year_month = Column(String(7), nullable=True)  # YYYY-MM，解约时可为空
    amount = Column(Integer, nullable=False)  # token 数量或解约月数
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_team_payment_team_type", "team_id", "payment_type"),
        Index("idx_team_payment_team_month", "team_id", "year_month"),
    )
