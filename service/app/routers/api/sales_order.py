"""
销售打单API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.services.sales_order_service import SalesOrderService
from app.schemas.sales_order import (
    SalesOrderChatRequest,
    SalesOrderChatResponse,
    ExtractDMURequest,
    ExtractDMUResponse,
    SaveDMUReportRequest,
    DMUReportResponse,
)

router = APIRouter()


@router.post("/chat", response_model=ResponseModel[SalesOrderChatResponse], summary="销售对话接口", tags=["应用接口 > 销售打单"])
async def sales_order_chat(
    request: SalesOrderChatRequest,
    call_llm: bool = Query(True, description="是否调用LLM生成回复（默认True，调用LLM并返回回复和DMU数据）"),
    db: AsyncSession = Depends(get_db),
):
    """
    销售对话接口
    
    根据用户传入的租户编号和提示词code查询对应的提示词内容，如果当前租户没有对应提示词则采用默认提示词。
    获取提示词后会对提示词的占位符进行处理，然后调用LLM生成回复并提取DMU数据。
    
    **对话上下文管理：**
    - 系统会在内存中存储每个conversation_id的对话历史
    - 每次调用时，会将current_message（或query）记录到对话历史中
    - LLM调用时会包含完整的对话历史，实现上下文理解
    - 每个对话最多保留20条历史消息
    
    **处理流程：**
    1. 根据租户编号查找租户ID
    2. 根据租户ID和提示词code查询提示词（优先租户自定义，否则使用默认）
    3. 处理提示词中的占位符（{公司产品资料}、{销售阶段数据}、{销售姓名}等）
    4. 将当前消息记录到对话上下文（如果提供了current_message，使用它；否则使用query）
    5. 调用LLM生成回复（包含完整的对话历史）
    6. 将LLM回复记录到对话上下文
    7. 提取DMU数据（如果存在）
    8. 返回LLM回复和DMU数据
    
    **占位符处理规则：**
    - {销售姓名}：通过接口传入的参数获取
    - {客户历史数据}：通过user_id和tenant_id查询客户历史数据
    - {系统对话ID}：通过传入的参数获取
    
    **参数说明：**
    - `query`: 用户查询（用于LLM调用）
    - `current_message`: 当前聊天的内容语句（可选，用于记录到上下文，如果不提供则使用query）
    - `conversation_id`: 对话ID，相同ID的对话会共享上下文
    """
    try:
        response = await SalesOrderService.chat(db, request, call_llm=call_llm)
        return ResponseModel.success_response(
            data=response,
            message="对话成功" if call_llm else "获取提示词成功",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("销售对话处理失败")
        raise HTTPException(status_code=500, detail="处理失败，请稍后重试")


@router.post("/extract-dmu", response_model=ResponseModel[ExtractDMUResponse], summary="DMU数据提取接口", tags=["应用接口 > 销售打单"])
async def extract_dmu(
    request: ExtractDMURequest,
):
    """
    DMU数据提取接口
    
    从LLM输出的Markdown文本中提取DMU结构化数据，包括：
    - 决策单元列表（身份、角色、组织诉求、影响力、支持度等）
    - 商机天平分数
    - 商机推进建议
    """
    try:
        response = await SalesOrderService.extract_dmu(request)
        return ResponseModel.success_response(
            data=response,
            message="提取成功" if response.success else "提取失败",
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("DMU数据提取失败")
        raise HTTPException(status_code=500, detail="提取失败，请稍后重试")


@router.post("/dmu-report", response_model=ResponseModel[DMUReportResponse], summary="保存DMU报告", tags=["应用接口 > 销售打单"])
async def save_dmu_report(
    request: SaveDMUReportRequest,
    tenant_id: Optional[str] = Query(None, description="租户ID（可选）"),
    db: AsyncSession = Depends(get_db),
):
    """
    保存或更新DMU报告
    
    将DMU分析数据保存到数据库。如果该对话ID和客户名称的报告已存在，则更新；否则创建新报告。
    """
    try:
        response = await SalesOrderService.save_dmu_report(db, request, tenant_id)
        return ResponseModel.success_response(
            data=response,
            message="保存成功",
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("DMU报告保存失败")
        raise HTTPException(status_code=500, detail="保存失败，请稍后重试")


@router.get("/dmu-report", response_model=ResponseModel[DMUReportResponse], summary="获取DMU报告", tags=["应用接口 > 销售打单"])
async def get_dmu_report(
    conversation_id: str = Query(..., description="对话ID", examples=["conv_123"]),
    company_name: Optional[str] = Query(None, description="客户名称（可选）", examples=["玛氏中国"]),
    db: AsyncSession = Depends(get_db),
):
    """
    获取DMU报告
    
    根据对话ID和客户名称获取DMU报告。如果指定了客户名称，则返回匹配的报告；否则返回该对话ID的最新报告。
    """
    try:
        response = await SalesOrderService.get_dmu_report(db, conversation_id, company_name)
        if not response:
            raise HTTPException(status_code=404, detail="未找到DMU报告")
        return ResponseModel.success_response(
            data=response,
            message="获取成功",
        )
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception("获取DMU报告失败")
        raise HTTPException(status_code=500, detail="获取失败，请稍后重试")

