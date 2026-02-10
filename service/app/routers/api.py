"""
应用接口路由
若配置了 API_KEY（环境变量），则需在请求头携带 X-API-Key；未配置则无需认证。
"""
import sys
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.database import get_db
from app.core.response import ResponseModel
from app.core.api_auth import verify_optional_api_key
from app.services.prompt_service import PromptService, PlaceholderService
from app.schemas.prompt import PromptResponse, PlaceholderResponse

router = APIRouter(dependencies=[Depends(verify_optional_api_key)])

# 注册销售打单相关路由
# 注意：由于 api.py 文件与 api/ 目录同名，需要确保 api/ 目录被识别为包
# 使用延迟导入避免导入冲突
def _register_routes():
    """延迟注册路由，避免导入冲突"""
    # 确保 api/ 目录在 sys.modules 中
    if "app.routers.api" not in sys.modules:
        import importlib
        importlib.import_module("app.routers.api")
    
    from app.routers.api.sales_order import router as sales_order_router
    router.include_router(sales_order_router, prefix="/sales-order")
    
    from app.routers.api.llmchat import router as llmchat_router
    router.include_router(llmchat_router)
    
    from app.routers.api.multi_dimension_tables import router as multi_dimension_tables_router
    router.include_router(multi_dimension_tables_router)

# 立即执行路由注册
_register_routes()


@router.get("/prompts/{scene}", response_model=ResponseModel[PromptResponse], summary="根据场景获取提示词", tags=["应用接口 > 提示词"])
async def get_prompt_by_scene(
    scene: str = Path(..., description="场景代码（如：sales_order, research, ppt_report）", examples=["sales_order"]),
    tenant_id: Optional[str] = Query(None, description="租户ID，不传则返回默认提示词", examples=["tenant_123"]),
    team_code: Optional[str] = Query(None, description="团队代码，用于获取团队的默认提示词", examples=["team_001"]),
    db: AsyncSession = Depends(get_db),
):
    """
    根据场景获取提示词（若配置 API_KEY 则需在请求头携带 X-API-Key）
    
    **获取逻辑：**
    1. 如果传入了 `tenant_id`，优先返回该租户的自定义提示词
    2. 如果租户没有自定义提示词，返回默认提示词
       - 如果传入了 `team_code`，优先返回该团队的默认提示词
       - 如果没有团队的默认提示词，返回全局默认提示词（team_code为None）
    3. 如果默认提示词也不存在，返回404错误
    
    **场景代码：**
    - `sales_order`: 销售打单提示词
    - `research`: 调研提示词
    - `ppt_report`: PPT报告提示词
    """
    if tenant_id:
        # 先查找租户自定义的提示词
        prompts = await PromptService.get_prompts(
            db, scene=scene, tenant_id=tenant_id, is_default=False
        )
        if prompts:
            return ResponseModel.success_response(
                data=PromptResponse.model_validate(prompts[0]).model_dump(),
                message="获取提示词成功"
            )
    
    # 如果没有找到租户自定义的，返回默认提示词（优先团队的，其次全局的）
    default_prompt = await PromptService.get_default_prompt(db, scene, team_code=team_code)
    if not default_prompt:
        raise HTTPException(status_code=404, detail=f"场景 {scene} 的默认提示词不存在")
    
    return ResponseModel.success_response(
        data=PromptResponse.model_validate(default_prompt).model_dump(),
        message="获取提示词成功"
    )


@router.get("/placeholders/{scene}", response_model=ResponseModel[List[PlaceholderResponse]], summary="根据场景获取占位符列表", tags=["应用接口 > 占位符"])
async def get_placeholders_by_scene(
    scene: str = Path(..., description="场景代码（如：sales_order, research, ppt_report）", examples=["sales_order"]),
    x_team_authcode: Optional[str] = Header(None, alias="X-Team-AuthCode"),
    db: AsyncSession = Depends(get_db),
):
    """
    根据场景获取占位符列表（若配置 API_KEY 则需在请求头携带 X-API-Key）
    
    返回指定场景下所有可用的占位符配置，包括占位符的key、label、描述等信息。
    如果提供了 X-Team-AuthCode，则只返回该团队的占位符。
    
    **场景代码：**
    - `sales_order`: 销售打单提示词
    - `research`: 调研提示词
    - `ppt_report`: PPT报告提示词
    """
    # 获取团队信息（如果提供了团队认证码）
    team_id = None
    team_code = None
    if x_team_authcode:
        from app.services.team_service import TeamService
        team = await TeamService.get_team_by_authcode(db, x_team_authcode.strip())
        if team:
            team_id = team.id
            team_code = team.code
    
    placeholders = await PlaceholderService.get_placeholders_by_scene(
        db, scene, team_id=team_id, team_code=team_code
    )
    return ResponseModel.success_response(
        data=[PlaceholderResponse.model_validate(p).model_dump() for p in placeholders],
        message="获取占位符列表成功"
    )

