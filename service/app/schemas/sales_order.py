"""
销售打单相关Schema
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class DecisionUnit(BaseModel):
    """决策单元"""
    identity: str = Field(..., description="身份")
    role: List[str] = Field(default_factory=list, description="角色列表")
    org_needs: str = Field(default="", description="组织诉求")
    personal_needs: str = Field(default="", description="个人诉求")
    influence: int = Field(default=0, description="影响力")
    support: int = Field(default=0, description="支持度")
    familiarity: int = Field(default=0, description="熟悉度")
    concern: str = Field(default="", description="顾虑")


class OpportunityScore(BaseModel):
    """商机天平分数"""
    calculation: str = Field(..., description="公式/表达式")
    score: int = Field(..., description="总分")
    tendency: str = Field(..., description="倾向描述")
    full_content: Optional[str] = Field(None, description="完整内容")


class DMUAnalysis(BaseModel):
    """DMU分析数据"""
    decision_units: List[DecisionUnit] = Field(default_factory=list, description="决策单元列表")
    opportunity_score: Optional[Dict[str, Any]] = Field(None, description="商机天平分数")
    opportunity_decision: Optional[Dict[str, Any]] = Field(None, description="商机推进建议")
    fabe_spi: List[Any] = Field(default_factory=list, description="FABE/SPI数据")


class SalesOrderChatRequest(BaseModel):
    """销售对话请求"""
    query: str = Field(..., description="用户查询", example="我想了解客户A的情况")
    conversation_id: str = Field(..., description="聊天上下文ID", example="conv_123456")
    tenant_code_id: str = Field(..., description="租户编号", example="T001")
    user_id: str = Field(..., description="用户ID", example="user_456")
    user_name: str = Field(..., description="用户名称", example="张三")
    prompt_code: str = Field(..., description="提示词code（场景代码，如：sales_order）", example="sales_order")
    current_message: Optional[str] = Field(None, description="当前聊天的内容语句（可选，用于记录到上下文）", example="我想了解客户A的情况")
    # 以下字段已废弃，将通过占位符处理自动获取
    company_rag: Optional[str] = Field(None, description="公司RAG（已废弃，将通过占位符处理）")
    company_rag_abbr: Optional[str] = Field(None, description="公司RAG简称（已废弃，将通过占位符处理）")
    sale_phase_rag: Optional[str] = Field(None, description="销售阶段RAG（已废弃，将通过占位符处理）")
    custom_rag_infos: Optional[str] = Field(None, description="客户历史数据（已废弃，将通过占位符处理）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "我想了解客户A的情况",
                "conversation_id": "conv_123456",
                "tenant_code_id": "T001",
                "user_id": "user_456",
                "user_name": "张三",
                "prompt_code": "sales_order",
                "current_message": "我想了解客户A的情况"
            }
        }


class SalesOrderChatResponse(BaseModel):
    """销售对话响应"""
    prompt: Optional[str] = Field(None, description="处理后的提示词内容（占位符已替换）")
    response: Optional[str] = Field(None, description="LLM回复文本")
    dmu_data: Optional[DMUAnalysis] = Field(None, description="提取的DMU结构化数据")


class ExtractDMURequest(BaseModel):
    """DMU数据提取请求"""
    llm_output: str = Field(..., description="LLM输出的Markdown文本", example="### 客户名称: 玛氏中国\n### 玛氏中国商机分析表\n| 维度 | 张三 |\n|------|------|\n| 身份 | 张三 |")
    
    class Config:
        json_schema_extra = {
            "example": {
                "llm_output": "### 客户名称: 玛氏中国\n### 玛氏中国商机分析表\n| 维度 | 张三 |\n|------|------|\n| 身份 | 张三 |"
            }
        }


class ExtractDMUResponse(BaseModel):
    """DMU数据提取响应"""
    success: bool = Field(..., description="是否成功")
    extracted_data: Optional[DMUAnalysis] = Field(None, description="提取的DMU数据")
    database_payload: Optional[Dict[str, Any]] = Field(None, description="数据库payload")
    message: str = Field(..., description="消息")
    error: Optional[str] = Field(None, description="错误信息")
    error_code: Optional[str] = Field(None, description="错误代码")


class SaveDMUReportRequest(BaseModel):
    """保存DMU报告请求"""
    conversation_id: str = Field(..., description="对话ID", example="conv_123456")
    company_name: str = Field(..., description="客户名称", example="玛氏中国")
    dmu_analysis: DMUAnalysis = Field(..., description="DMU分析数据")
    
    class Config:
        json_schema_extra = {
            "example": {
                "conversation_id": "conv_123456",
                "company_name": "玛氏中国",
                "dmu_analysis": {
                    "decision_units": [
                        {
                            "identity": "张三",
                            "role": ["发起者", "EB"],
                            "org_needs": "降本增效",
                            "personal_needs": "",
                            "influence": 3,
                            "support": 3,
                            "familiarity": 2,
                            "concern": "项目风险"
                        }
                    ],
                    "opportunity_score": {
                        "calculation": "影响力×支持度",
                        "score": 9,
                        "tendency": "向赢单倾斜"
                    },
                    "fabe_spi": []
                }
            }
        }


class DMUReportResponse(BaseModel):
    """DMU报告响应"""
    id: Optional[int] = Field(None, description="报告ID")
    conversation_id: str = Field(..., description="对话ID")
    company_name: str = Field(..., description="客户名称")
    dmu_analysis: Dict[str, Any] = Field(..., description="DMU分析数据")
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")

