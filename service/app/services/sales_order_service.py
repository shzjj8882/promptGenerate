"""
销售打单服务层
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional, Dict, Any
from app.models.sales_order import DMUReport
from app.models.prompt import Tenant
from app.schemas.sales_order import (
    SalesOrderChatRequest,
    SalesOrderChatResponse,
    ExtractDMURequest,
    ExtractDMUResponse,
    SaveDMUReportRequest,
    DMUReportResponse,
    DMUAnalysis,
)
from app.services.prompt_service import PromptService
from app.services.placeholder_processor_service import PlaceholderProcessorService
from app.services.llm_service import llm_service
from app.services.conversation_context_service import ConversationContextService
from app.utils.dmu_extractor import extract_dmu_data

# 配置日志
logger = logging.getLogger(__name__)


class SalesOrderService:
    """销售打单服务类"""
    
    @staticmethod
    async def get_tenant_id_by_code_id(db: AsyncSession, tenant_code_id: str) -> Optional[str]:
        """
        根据租户编号获取租户ID
        
        Args:
            db: 数据库会话
            tenant_code_id: 租户编号
        
        Returns:
            租户ID或None
        """
        result = await db.execute(
            select(Tenant).where(
                and_(
                    Tenant.code_id == tenant_code_id,
                    Tenant.is_deleted == False
                )
            )
        )
        tenant = result.scalar_one_or_none()
        return tenant.id if tenant else None
    
    @staticmethod
    async def chat(
        db: AsyncSession,
        request: SalesOrderChatRequest,
        call_llm: bool = True,
    ) -> SalesOrderChatResponse:
        """
        销售对话接口
        
        Args:
            db: 数据库会话
            request: 对话请求
            call_llm: 是否调用LLM生成回复（默认True，调用LLM并返回回复和DMU数据）
        
        Returns:
            如果call_llm=False，返回处理后的提示词
            如果call_llm=True，返回LLM回复和可选的DMU数据
        """
        # 1. 根据租户编号查找租户ID
        tenant_id = await SalesOrderService.get_tenant_id_by_code_id(db, request.tenant_code_id)
        if not tenant_id:
            raise ValueError(f"未找到租户编号为 {request.tenant_code_id} 的租户")
        
        # 2. 根据租户ID和提示词code查询提示词内容
        # 先查找租户自定义的提示词
        prompts = await PromptService.get_prompts(
            db, scene=request.prompt_code, tenant_id=tenant_id, is_default=False
        )
        
        prompt = None
        if prompts:
            prompt = prompts[0]
        else:
            # 如果没有找到租户自定义的，使用默认提示词
            prompt = await PromptService.get_default_prompt(db, request.prompt_code)
            if not prompt:
                raise ValueError(f"未找到场景 {request.prompt_code} 的提示词（包括默认提示词）")
        
        # 3. 处理提示词中的占位符
        processed_prompt_content = await PlaceholderProcessorService.process_placeholders(
            db=db,
            prompt_content=prompt.content,
            tenant_code_id=request.tenant_code_id,
            user_name=request.user_name,
            conversation_id=request.conversation_id,
            user_id=request.user_id,
        )
        
        # 4. 如果不需要调用LLM，只返回处理后的提示词
        if not call_llm:
            return SalesOrderChatResponse(
                prompt=processed_prompt_content,
            )
        
        # 5. 记录当前用户消息到对话上下文
        # 使用 current_message 如果提供，否则使用 query
        user_message = request.current_message if request.current_message else request.query
        logger.info(f"记录用户消息到对话上下文 [conversation_id: {request.conversation_id}]: {user_message[:100]}...")
        await ConversationContextService.add_user_message(request.conversation_id, user_message)
        
        # 6. 获取对话历史消息（包含系统提示词）
        logger.info(f"查询对话历史 [conversation_id: {request.conversation_id}]")
        messages = await ConversationContextService.get_conversation_messages(
            conversation_id=request.conversation_id,
            include_system=True,
            system_prompt=processed_prompt_content,
            max_history=20  # 最多保留20条历史消息
        )
        logger.info(f"获取到 {len(messages)} 条消息（包含系统提示词）")
        
        # 7. 调用LLM生成回复（使用对话历史）
        logger.info(f"开始调用LLM生成回复 [conversation_id: {request.conversation_id}], 消息数量: {len(messages)}")
        response_text = await llm_service.chat_with_messages(
            messages=messages,
            temperature=0.3
        )
        logger.info(f"LLM回复生成成功 [conversation_id: {request.conversation_id}], 回复长度: {len(response_text)} 字符")
        logger.debug(f"LLM回复内容预览 [conversation_id: {request.conversation_id}]: {response_text[:200]}...")
        
        # 8. 记录助手回复到对话上下文
        await ConversationContextService.add_assistant_message(request.conversation_id, response_text)
        logger.info(f"助手回复已记录到对话上下文 [conversation_id: {request.conversation_id}]")
        
        # 9. 尝试提取DMU数据并自动保存
        dmu_data = None
        try:
            extract_result = extract_dmu_data(response_text)
            if extract_result.get("success") and extract_result.get("extracted_data"):
                # 将提取的数据转换为DMUAnalysis对象
                extracted = extract_result["extracted_data"]
                dmu_data = DMUAnalysis(
                    decision_units=extracted.get("decision_units", []),
                    opportunity_score=extracted.get("opportunity_score"),
                    opportunity_decision=extracted.get("opportunity_decision"),
                    fabe_spi=extracted.get("fabe_spi", []),
                )
                
                # 10. 自动保存/更新DMU报告
                try:
                    # 从database_payload中获取公司名称
                    database_payload = extract_result.get("database_payload", {})
                    company_name = database_payload.get("companyName", "")
                    
                    if company_name and dmu_data:
                        # 调用save_dmu_report保存或更新报告
                        save_request = SaveDMUReportRequest(
                            conversation_id=request.conversation_id,
                            company_name=company_name,
                            dmu_analysis=dmu_data,
                        )
                        saved_report = await SalesOrderService.save_dmu_report(
                            db=db,
                            request=save_request,
                            tenant_id=tenant_id,
                        )
                        logger.info(f"自动保存DMU报告成功 [conversation_id: {request.conversation_id}, company_name: {company_name}, report_id: {saved_report.id}]")
                    else:
                        logger.warning(f"无法自动保存DMU报告：缺少公司名称 [conversation_id: {request.conversation_id}]")
                except Exception as e:
                    logger.error(f"自动保存DMU报告失败 [conversation_id: {request.conversation_id}]: {e}", exc_info=True)
                    # 保存失败不影响主流程
        except Exception:
            # 如果提取失败，不影响主流程
            pass
        
        return SalesOrderChatResponse(
            prompt=processed_prompt_content,
            response=response_text,
            dmu_data=dmu_data,
        )
    
    @staticmethod
    async def extract_dmu(request: ExtractDMURequest) -> ExtractDMUResponse:
        """
        从LLM输出中提取DMU数据
        
        Args:
            request: 提取请求
        
        Returns:
            提取结果
        """
        result = extract_dmu_data(request.llm_output)
        
        dmu_analysis = None
        if result.get("success") and result.get("extracted_data"):
            extracted = result["extracted_data"]
            dmu_analysis = DMUAnalysis(
                decision_units=extracted.get("decision_units", []),
                opportunity_score=extracted.get("opportunity_score"),
                opportunity_decision=extracted.get("opportunity_decision"),
                fabe_spi=extracted.get("fabe_spi", []),
            )
        
        return ExtractDMUResponse(
            success=result.get("success", False),
            extracted_data=dmu_analysis,
            database_payload=result.get("database_payload"),
            message=result.get("message", ""),
            error=result.get("error"),
            error_code=result.get("error_code"),
        )
    
    @staticmethod
    async def save_dmu_report(
        db: AsyncSession,
        request: SaveDMUReportRequest,
        tenant_id: Optional[str] = None,
    ) -> DMUReportResponse:
        """
        保存或更新DMU报告
        
        Args:
            db: 数据库会话
            request: 保存请求
            tenant_id: 租户ID（可选）
        
        Returns:
            DMU报告响应
        """
        # 检查是否已存在该对话的报告
        existing_report = await db.execute(
            select(DMUReport).where(
                and_(
                    DMUReport.conversation_id == request.conversation_id,
                    DMUReport.company_name == request.company_name,
                )
            )
        )
        existing = existing_report.scalar_one_or_none()
        
        # 将DMU分析数据转换为JSON
        dmu_analysis_dict = request.dmu_analysis.model_dump()
        
        if existing:
            # 更新现有报告
            existing.dmu_analysis = dmu_analysis_dict
            if tenant_id:
                existing.tenant_id = tenant_id
            try:
                await db.commit()
                await db.refresh(existing)
            except Exception:
                await db.rollback()
                raise
            
            return DMUReportResponse(
                id=existing.id,
                conversation_id=existing.conversation_id,
                company_name=existing.company_name,
                dmu_analysis=existing.dmu_analysis,
                created_at=existing.created_at,
                updated_at=existing.updated_at,
            )
        else:
            # 创建新报告
            new_report = DMUReport(
                conversation_id=request.conversation_id,
                company_name=request.company_name,
                dmu_analysis=dmu_analysis_dict,
                tenant_id=tenant_id,
            )
            db.add(new_report)
            try:
                await db.commit()
                await db.refresh(new_report)
            except Exception:
                await db.rollback()
                raise
            
            return DMUReportResponse(
                id=new_report.id,
                conversation_id=new_report.conversation_id,
                company_name=new_report.company_name,
                dmu_analysis=new_report.dmu_analysis,
                created_at=new_report.created_at,
                updated_at=new_report.updated_at,
            )
    
    @staticmethod
    async def get_dmu_report(
        db: AsyncSession,
        conversation_id: str,
        company_name: Optional[str] = None,
    ) -> Optional[DMUReportResponse]:
        """
        获取DMU报告
        
        Args:
            db: 数据库会话
            conversation_id: 对话ID
            company_name: 客户名称（可选）
        
        Returns:
            DMU报告响应或None
        """
        query = select(DMUReport).where(DMUReport.conversation_id == conversation_id)
        if company_name:
            query = query.where(DMUReport.company_name == company_name)
        
        result = await db.execute(query.order_by(DMUReport.updated_at.desc()))
        report = result.scalar_one_or_none()
        
        if not report:
            return None
        
        return DMUReportResponse(
            id=report.id,
            conversation_id=report.conversation_id,
            company_name=report.company_name,
            dmu_analysis=report.dmu_analysis,
            created_at=report.created_at,
            updated_at=report.updated_at,
        )

