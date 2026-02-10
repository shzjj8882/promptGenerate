"""
占位符处理服务
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import Dict, Optional
import re
import json
from app.models.sales_order import DMUReport


class PlaceholderProcessorService:
    """占位符处理服务类"""
    
    # 占位符映射规则
    PLACEHOLDER_MAPPING = {
        "{销售姓名}": "user_name",
        "{客户历史数据}": "custom_rag_infos",
        "{系统对话ID}": "conversation_id",
    }
    
    @staticmethod
    async def process_placeholders(
        db: AsyncSession,
        prompt_content: str,
        tenant_code_id: str,
        user_name: str,
        conversation_id: str,
        user_id: Optional[str] = None,
    ) -> str:
        """
        处理提示词中的占位符
        
        Args:
            db: 数据库会话
            prompt_content: 提示词内容
            tenant_code_id: 租户编号
            user_name: 用户名称
            conversation_id: 对话ID
            user_id: 用户ID（可选，用于查询客户历史数据）
        
        Returns:
            处理后的提示词内容
        """
        processed_content = prompt_content
        
        # 1. 处理 {公司产品资料} 和 {销售阶段数据}
        # 通过租户编号获取RAG信息
        tenant_result = await db.execute(
            select(Tenant).where(
                Tenant.code_id == tenant_code_id,
                Tenant.is_deleted == False
            )
        )
        tenant = tenant_result.scalar_one_or_none()
        
        if tenant:
            rag = await RAGService.get_rag_by_tenant_id(db, tenant.id)
            company_rag_value = ""
            sale_phase_rag_value = ""
            company_rag_abbr_value = ""
            
            if rag:
                company_rag_value = rag.rag or ""
                sale_phase_rag_value = rag.sales_phase_rag or ""
                company_rag_abbr_value = rag.company_rag_abbr or ""
            
            # 替换 {公司产品资料} 和带空格的格式
            processed_content = processed_content.replace("{公司产品资料}", company_rag_value)
            processed_content = processed_content.replace("{ 公司产品资料 }", company_rag_value)
            
            # 替换 {销售阶段数据} 和带空格的格式
            processed_content = processed_content.replace("{销售阶段数据}", sale_phase_rag_value)
            processed_content = processed_content.replace("{ 销售阶段数据 }", sale_phase_rag_value)
            
            # 替换 {公司RAG简称} 和带空格的格式
            processed_content = processed_content.replace("{公司RAG简称}", company_rag_abbr_value)
            processed_content = processed_content.replace("{ 公司RAG简称 }", company_rag_abbr_value)
        else:
            # 如果租户不存在，替换为空字符串
            processed_content = processed_content.replace("{公司产品资料}", "")
            processed_content = processed_content.replace("{ 公司产品资料 }", "")
            processed_content = processed_content.replace("{销售阶段数据}", "")
            processed_content = processed_content.replace("{ 销售阶段数据 }", "")
            processed_content = processed_content.replace("{公司RAG简称}", "")
            processed_content = processed_content.replace("{ 公司RAG简称 }", "")
        
        # 2. 处理 {销售姓名}
        processed_content = processed_content.replace("{销售姓名}", user_name)
        processed_content = processed_content.replace("{ 销售姓名 }", user_name)
        
        # 2. 处理 {客户历史数据}
        # 通过conversation_id从DMU报告中获取客户历史数据
        customer_history_text = ""
        if conversation_id:
            try:
                # 直接查询DMU报告表，获取最新的报告
                dmu_report_result = await db.execute(
                    select(DMUReport).where(
                        DMUReport.conversation_id == conversation_id
                    ).order_by(desc(DMUReport.updated_at)).limit(1)
                )
                dmu_report = dmu_report_result.scalar_one_or_none()
                
                if dmu_report and dmu_report.dmu_analysis:
                    # 构建客户历史数据文本
                    history_parts = []
                    
                    if dmu_report.company_name:
                        history_parts.append(f"公司名称: {dmu_report.company_name}")
                    
                    dmu_analysis = dmu_report.dmu_analysis
                    
                    if dmu_analysis.get("decision_units"):
                        history_parts.append(f"DMU信息: {json.dumps(dmu_analysis['decision_units'], ensure_ascii=False)}")
                    
                    if dmu_analysis.get("fabe_spi"):
                        history_parts.append(f"FABE信息: {json.dumps(dmu_analysis['fabe_spi'], ensure_ascii=False)}")
                    
                    if dmu_analysis.get("opportunity_score"):
                        history_parts.append(f"机会评分: {json.dumps(dmu_analysis['opportunity_score'], ensure_ascii=False)}")
                    
                    if dmu_analysis.get("opportunity_decision"):
                        history_parts.append(f"商机推进建议: {json.dumps(dmu_analysis['opportunity_decision'], ensure_ascii=False)}")
                    
                    customer_history_text = "\n".join(history_parts) if history_parts else ""
            except Exception as e:
                # 错误也忽略，不影响主流程
                customer_history_text = ""
        
        processed_content = processed_content.replace("{客户历史数据}", customer_history_text)
        processed_content = processed_content.replace("{ 客户历史数据 }", customer_history_text)
        
        # 3. 处理 {系统对话ID}
        processed_content = processed_content.replace("{系统对话ID}", conversation_id)
        processed_content = processed_content.replace("{ 系统对话ID }", conversation_id)
        
        return processed_content
    
    @staticmethod
    def extract_placeholders(prompt_content: str) -> list:
        """
        从提示词内容中提取所有占位符
        
        Args:
            prompt_content: 提示词内容
        
        Returns:
            占位符列表
        """
        # 匹配 {占位符} 格式
        pattern = r'\{([^}]+)\}'
        matches = re.findall(pattern, prompt_content)
        return list(set(matches))  # 去重

