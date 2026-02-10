#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
DMU表格数据提取器 - 全功能版本
从Dify工作流中提取的DMU数据提取逻辑
"""
import re
import json
import datetime
from typing import Dict, Any, List, Optional


class BusinessException(Exception):
    """
    业务异常类，用于处理业务逻辑错误
    """
    def __init__(self, message: str, error_code: str = "BUSINESS_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


def clean_markdown_format(markdown_text: str) -> str:
    """
    清理Markdown格式，保留纯文本内容
    """
    # 移除代码块
    markdown_text = re.sub(r'```[\s\S]*?```', '', markdown_text)
    
    # 移除行内代码
    markdown_text = re.sub(r'`([^`]+)`', r'\1', markdown_text)
    
    # 移除粗体标记
    markdown_text = re.sub(r'\*\*([^*]+)\*\*', r'\1', markdown_text)
    markdown_text = re.sub(r'__([^_]+)__', r'\1', markdown_text)
    
    # 移除斜体标记
    markdown_text = re.sub(r'\*([^*]+)\*', r'\1', markdown_text)
    markdown_text = re.sub(r'_([^_]+)_', r'\1', markdown_text)
    
    # 移除删除线
    markdown_text = re.sub(r'~~([^~]+)~~', r'\1', markdown_text)
    
    # 移除链接，保留链接文本
    markdown_text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', markdown_text)
    
    # 移除图片标记
    markdown_text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', markdown_text)
    
    # 移除引用标记
    markdown_text = re.sub(r'^>\s*', '', markdown_text, flags=re.MULTILINE)
    
    # 移除列表标记
    markdown_text = re.sub(r'^[\s]*[-*+]\s+', '', markdown_text, flags=re.MULTILINE)
    markdown_text = re.sub(r'^[\s]*\d+\.\s+', '', markdown_text, flags=re.MULTILINE)
    
    # 移除标题标记
    markdown_text = re.sub(r'^#{1,6}\s+', '', markdown_text, flags=re.MULTILINE)
    
    # 移除水平分割线
    markdown_text = re.sub(r'^[-*_]{3,}$', '', markdown_text, flags=re.MULTILINE)
    
    # 移除表格格式，但保留表格内容
    markdown_text = clean_table_format(markdown_text)
    
    # 移除HTML标签
    markdown_text = re.sub(r'<[^>]+>', '', markdown_text)
    
    # 移除多余的空白行
    markdown_text = re.sub(r'\n\s*\n\s*\n', '\n\n', markdown_text)
    
    # 移除行首行尾空白
    markdown_text = '\n'.join(line.strip() for line in markdown_text.split('\n'))
    
    return markdown_text.strip()


def clean_table_format(text: str) -> str:
    """
    清理表格格式，但保留表格内容结构
    """
    lines = text.split('\n')
    cleaned_lines = []
    
    # 定义评分字段的关键词
    rating_fields = ['影响力', '熟悉度', '支持度', 'influence', 'familiarity', 'support']
    
    # 先扫描所有行，找到表头并确定评分列
    rating_columns = set()
    for line in lines:
        if '|' in line and not re.match(r'^\|.*[-=]{2,}.*\|$', line.strip()):
            # 移除首尾的|
            line = line.strip()
            if line.startswith('|'):
                line = line[1:]
            if line.endswith('|'):
                line = line[:-1]
            
            cells = [cell.strip() for cell in line.split('|')]
            
            # 检查是否为表头（包含评分字段关键词）
            if any(field in cell for cell in cells for field in rating_fields):
                for i, cell in enumerate(cells):
                    if any(field in cell for field in rating_fields):
                        rating_columns.add(i)
                break
    
    # 如果没有找到标准表头，检查是否为转置表格（第一列包含评分字段）
    if not rating_columns:
        # 转置表格：第一列是维度，其他列是数据
        # 如果第一列包含评分字段关键词，则第二列是评分数据
        rating_columns.add(1)  # 第二列是评分数据
    
    for line in lines:
        # 跳过分隔行（包含---或===的行）
        if re.match(r'^\|.*[-=]{2,}.*\|$', line.strip()):
            continue
        
        # 处理表格行
        if '|' in line:
            # 移除首尾的|
            line = line.strip()
            if line.startswith('|'):
                line = line[1:]
            if line.endswith('|'):
                line = line[:-1]
            
            # 分割单元格并清理每个单元格
            cells = [cell.strip() for cell in line.split('|')]
            cleaned_cells = []
            
            # 检查是否为表头（转置表格：只有第一行是表头）
            is_header = len(cleaned_lines) == 0
            
            for i, cell in enumerate(cells):
                # 判断是否为评分字段
                if is_header:
                    # 表头：不是评分字段
                    is_rating_field = False
                elif i == 1 and len(cells) > 0:
                    # 转置表格：检查第一列是否包含评分字段关键词
                    first_cell = cells[0].strip()
                    is_rating_field = any(field in first_cell for field in rating_fields)
                else:
                    # 其他情况：不是评分字段
                    is_rating_field = False
                
                # 清理单元格内的Markdown格式
                cleaned_cell = clean_cell_content(cell, is_rating_field)
                cleaned_cells.append(cleaned_cell)
            
            # 重新组合为表格行
            cleaned_line = ' | '.join(cleaned_cells)
            cleaned_lines.append(cleaned_line)
        else:
            cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)


def count_rating_emojis(text: str) -> int:
    """
    计算评分emoji的数量，用于影响力、熟悉度、支持度字段
    支持的emoji: ⭐️👍(正数), 👎(负数)
    """
    if not text:
        return 0
    
    # 计算正数emoji数量 (⭐️👍)
    positive_emojis = r'⭐️|⭐|👍'
    positive_count = len(re.findall(positive_emojis, text))
    
    # 计算负数emoji数量 (👎)
    negative_emojis = r'👎'
    negative_count = len(re.findall(negative_emojis, text))
    
    # 计算最终评分：正数 - 负数
    emoji_count = positive_count - negative_count
    
    # 如果没有emoji，尝试提取数字（包括负数）
    if emoji_count == 0 and positive_count == 0 and negative_count == 0:
        # 提取数字（包括负数）
        numbers = re.findall(r'-?\d+', text)
        if numbers:
            return int(numbers[0])
    
    return emoji_count


def clean_cell_content(cell: str, is_rating_field: bool = False) -> str:
    """
    清理单元格内容
    is_rating_field: 是否为评分字段（影响力、熟悉度、支持度）
    """
    if not cell:
        return ""
    
    # 如果是评分字段，先计算emoji数量
    if is_rating_field:
        emoji_count = count_rating_emojis(cell)
        # 返回计算后的评分（可能是正数、负数或0）
        return str(emoji_count)
    
    # 对于非评分字段，只清理必要的格式，保留文本内容
    # 移除星号标记
    cell = re.sub(r'\*\*([^*]+)\*\*', r'\1', cell)
    cell = re.sub(r'\*([^*]+)\*', r'\1', cell)
    
    # 移除多余的空格和换行
    cell = re.sub(r'\s+', ' ', cell)
    cell = re.sub(r'\n+', ' ', cell)
    
    # 移除首尾空白
    cell = cell.strip()
    
    return cell


def extract_dmu_table_section(markdown_text: str) -> str:
    """
    提取"商机分析表"标题下，连续的"|"表格行（第一行和第二行都是表头）
    """
    # 1. 找到"商机分析表"标题行
    m = re.search(r'^\s*###\s*.*商机分析表.*$', markdown_text, re.MULTILINE)
    if not m:
        return ""
    start = m.end()
    # 2. 从标题下方开始，收集连续的"|"行（表格行）
    lines = markdown_text[start:].splitlines()
    table_lines = []
    for line in lines:
        if "|" in line:
            table_lines.append(line)
        elif table_lines:  # 已经开始收集，遇到非表格行就停止
            break
    return "\n".join(table_lines)


def extract_table_as_matrix(text: str) -> List[List[str]]:
    """
    从清理后的文本中提取表格为二维数组
    """
    lines = [line for line in text.split('\n') if '|' in line]
    table = []
    for line in lines:
        cells = [cell.strip() for cell in line.split('|')]
        table.append(cells)
    # 过滤掉长度不一致的行
    max_len = max(len(row) for row in table) if table else 0
    table = [row for row in table if len(row) == max_len]
    return table


def match_dim(cell: str, dmu_dims: List[str], dim_alias: dict) -> Optional[str]:
    for std_dim in dmu_dims:
        for alias in dim_alias[std_dim]:
            if alias in cell:
                return std_dim
    return None


def extract_opportunity_score_from_cleaned(markdown_text: str) -> Dict[str, Any]:
    """提取商机天平分数"""
    import re
    
    # 1. 尝试提取 ### 商机天平 格式
    section = extract_section_by_title(markdown_text, "商机天平")
    if section:
        calculation = score = tendency = None
        for line in section.splitlines():
            line = line.strip().lstrip("*#- ").strip()
            if line.startswith("公式/表达式"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                calculation = val.strip()
            elif line.startswith("总分"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                score_str = val.replace("分", "").strip()
                if score_str.isdigit():
                    score = int(score_str.strip())
            elif line.startswith("倾向描述"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                tendency = val.strip("（）() ").strip()
        if calculation and score is not None and tendency:
            full_content = extract_content_between_sections(markdown_text, "商机天平", "商机推进建议", "商机决策")
            result = {
                "calculation": calculation.strip(),
                "score": score,
                "tendency": tendency.strip()
            }
            if full_content:
                result["full_content"] = full_content
            return result
    
    # 2. 尝试提取 **商机天平** 格式
    pattern = r'\*\*商机天平\*\*([\s\S]*?)(?=\*\*|###|\Z)'
    match = re.search(pattern, markdown_text)
    if match:
        section = match.group(1)
        calculation = score = tendency = None
        for line in section.splitlines():
            line = line.strip().lstrip("*#- ").strip()
            if line.startswith("公式/表达式"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                calculation = val.strip()
            elif line.startswith("总分"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                score_str = val.replace("分", "").strip()
                if score_str.isdigit():
                    score = int(score_str.strip())
            elif line.startswith("倾向描述"):
                val = line.split(":", 1)[-1] if ":" in line else line.split("：", 1)[-1]
                tendency = val.strip("（）() ").strip()
        if calculation and score is not None and tendency:
            full_content = extract_content_between_sections(markdown_text, "商机天平", "商机推进建议", "商机决策")
            result = {
                "calculation": calculation.strip(),
                "score": score,
                "tendency": tendency.strip()
            }
            if full_content:
                result["full_content"] = full_content
            return result
    
    return {"error": "未找到商机天平分数"}


def extract_section_by_title(text: str, title: str) -> str:
    """
    提取指定大标题（如 '### 商机天平'）下的内容，直到下一个同级标题或文本结尾
    """
    import re
    m = re.search(rf'^###\s*{re.escape(title)}.*$', text, re.MULTILINE)
    if not m:
        return ""
    start = m.end()
    m2 = re.search(r'^###\s', text[start:], re.MULTILINE)
    if m2:
        section = text[start:start + m2.start()]
    else:
        section = text[start:]
    return section


def extract_content_between_sections(markdown_text: str, start_section: str, *end_sections) -> str:
    """
    提取两个部分之间的内容，支持多个结束部分名称
    """
    import re
    
    # 查找开始部分的位置
    start_pattern = rf'\*\*{re.escape(start_section)}\*\*'
    start_match = re.search(start_pattern, markdown_text)
    if not start_match:
        return ""
    
    # 从开始部分结束位置开始查找
    start_pos = start_match.end()
    
    # 查找结束部分的位置（支持多个结束部分名称）
    earliest_end_pos = len(markdown_text)
    for end_section in end_sections:
        end_pattern = rf'\*\*{re.escape(end_section)}\*\*'
        end_match = re.search(end_pattern, markdown_text[start_pos:])
        if end_match:
            end_pos = start_pos + end_match.start()
            if end_pos < earliest_end_pos:
                earliest_end_pos = end_pos
    
    # 如果没有找到任何结束部分，返回空字符串
    if earliest_end_pos == len(markdown_text):
        return ""
    
    # 提取中间的内容
    between_content = markdown_text[start_pos:earliest_end_pos].strip()
    
    return between_content


def clean_unit_fields(unit: Dict[str, Any]) -> Dict[str, Any]:
    """
    清理决策单元的所有字段，确保没有None值，所有字段都有合适的默认值
    """
    # 定义所有可能的字段及其默认值
    field_defaults = {
        "identity": "",
        "role": [],
        "org_needs": "",
        "personal_needs": "",
        "influence": 0,
        "support": 0,
        "familiarity": 0,
        "concern": "",
        "source": ""
    }
    
    cleaned_unit = {}
    
    # 处理每个字段
    for field, default_value in field_defaults.items():
        if field in unit:
            value = unit[field]
            
            # 处理None值
            if value is None:
                cleaned_unit[field] = default_value
                continue
            
            # 处理字符串字段
            if field in ["identity", "org_needs", "personal_needs", "concern", "source"]:
                if isinstance(value, str):
                    cleaned_value = value.strip()
                    # 如果值是'null'字符串，设置为空字符串
                    if cleaned_value.lower() == 'null':
                        cleaned_unit[field] = default_value
                    else:
                        cleaned_unit[field] = cleaned_value if cleaned_value else default_value
                else:
                    cleaned_unit[field] = str(value).strip() if value else default_value
            
            # 处理role字段（特殊处理）
            elif field == "role":
                if isinstance(value, str):
                    if value.lower() == 'null' or not value.strip():
                        cleaned_unit[field] = []
                    else:
                        roles = [r.strip() for r in re.split(r'[，,\s/]+', value) if r.strip()]
                        cleaned_unit[field] = roles
                elif isinstance(value, list):
                    # 过滤掉None和空字符串
                    roles = [str(r).strip() for r in value if r and str(r).strip()]
                    cleaned_unit[field] = roles
                elif value is None:
                    cleaned_unit[field] = []
                else:
                    cleaned_unit[field] = [str(value).strip()] if str(value).strip() else []
            
            # 处理数值字段（影响力、支持度、熟悉度）
            elif field in ["influence", "support", "familiarity"]:
                try:
                    if isinstance(value, (int, float)):
                        cleaned_unit[field] = int(value)
                    elif isinstance(value, str):
                        # 先尝试计算emoji数量
                        emoji_count = count_rating_emojis(value)
                        if emoji_count != 0:  # 修复：改为 != 0，处理正数和负数
                            cleaned_unit[field] = emoji_count
                        else:
                            # 如果没有emoji，尝试提取数字
                            numeric_value = re.sub(r'[^\d\-]', '', value)
                            if numeric_value:
                                cleaned_unit[field] = int(numeric_value)
                            else:
                                cleaned_unit[field] = 0
                    else:
                        cleaned_unit[field] = 0
                except (ValueError, TypeError):
                    cleaned_unit[field] = 0
        else:
            # 字段不存在，使用默认值
            cleaned_unit[field] = default_value
    
    return cleaned_unit


def extract_dmu_table_structured(markdown_text: str) -> Dict[str, Any]:
    """
    自动识别DMU表格方向（标准/转置），并输出标准结构，确保每个决策单元有'身份'字段，且字段名为英文
    """
    # 新增：只提取DMU表格段落
    dmu_table_markdown = extract_dmu_table_section(markdown_text)
    if not dmu_table_markdown:
        return {"error": "未找到DMU表格段落"}
    cleaned_text = clean_markdown_format(dmu_table_markdown)
    table = extract_table_as_matrix(cleaned_text)
    if not table or len(table) < 2:
        return {"error": "未找到有效的DMU表格"}
    dmu_dims = [
        "身份", "角色", "组织诉求", "个人诉求", "影响力", "支持度", "熟悉度", "顾虑"
    ]
    dim_alias = {
        "组织诉求": ["组织诉求", "官方诉求", "KPI"],
        "个人诉求": ["个人诉求", "私人诉求"],
        "影响力": ["影响力"],
        "支持度": ["支持度"],
        "熟悉度": ["熟悉度"],
        "顾虑": ["顾虑", "担忧"],
        "身份": ["身份", "姓名", "决策单元"],
        "角色": ["角色"]
    }
    # 新增：中英文映射
    dim_en_map = {
        "身份": "identity",
        "角色": "role",
        "组织诉求": "org_needs",
        "个人诉求": "personal_needs",
        "影响力": "influence",
        "支持度": "support",
        "熟悉度": "familiarity",
        "顾虑": "concern"
    }
    first_row = [cell.strip() for cell in table[0]]
    first_col = [row[0].strip() for row in table]
    row_dim_count = sum(any(dim in cell for dim in dmu_dims) for cell in first_row)
    col_dim_count = sum(any(dim in cell for dim in dmu_dims) for cell in first_col)
    is_transposed = row_dim_count > col_dim_count
    decision_units = []
    if is_transposed:
        # 每一行是一个决策单元
        header = first_row
        for row in table[1:]:
            unit = {}
            for i, cell in enumerate(row):
                dim = header[i].strip()
                std_dim = match_dim(dim, dmu_dims, dim_alias)
                if std_dim:
                    en_dim = dim_en_map.get(std_dim, std_dim)
                    unit[en_dim] = cell.strip()
            # 如果没有identity字段，默认用第一个单元格
            if "identity" not in unit and len(row) > 0:
                unit["identity"] = row[0].strip()
            if unit:
                decision_units.append(unit)
    else:
        # 每一列是一个决策单元
        header = table[0]
        for col_idx in range(1, len(header)):
            unit = {"identity": header[col_idx].strip()}
            for row_idx, row in enumerate(table[1:], 1):
                dim = row[0].strip()
                std_dim = match_dim(dim, dmu_dims, dim_alias)
                if std_dim and col_idx < len(row):
                    en_dim = dim_en_map.get(std_dim, std_dim)
                    unit[en_dim] = row[col_idx].strip()
            if unit:
                decision_units.append(unit)
    
    # 使用统一的字段清理函数
    cleaned_decision_units = []
    for unit in decision_units:
        cleaned_unit = clean_unit_fields(unit)
        cleaned_decision_units.append(cleaned_unit)
    
    opportunity_score = extract_opportunity_score_from_cleaned(markdown_text)
    return {
        "decision_units": cleaned_decision_units,
        "opportunity_score": opportunity_score,
        "fabe_spi": []  # FABE/SPI字段始终为空数组，保持接口兼容性
    }


def extract_company_name(text: str) -> str:
    """
    优先从"### 客户名称: xxx"行提取公司名，否则回退到标题行"公司名商机分析表"
    """
    import re
    # 1. 优先匹配"### 客户名称: xxx"
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("### 客户名称:"):
            return line.replace("### 客户名称:", "").strip()
    # 2. 回退到原有标题行匹配
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^[#*\s]*([\u4e00-\u9fa5A-Za-z0-9（）()·]+?)\s*商机分析表", line)
        if match:
            return match.group(1).strip()
    return ""


def extract_dmu_data(llm_output: str) -> Dict[str, Any]:
    """
    主函数 - 从LLM输出中提取DMU数据
    """
    try:
        company_name = extract_company_name(llm_output)
        
        # 1. DMU表格结构化
        try:
            dmu_struct = extract_dmu_table_structured(llm_output)
            decision_units = dmu_struct.get("decision_units", [])
        except Exception as e:
            decision_units = []
        
        # 2. 商机天平
        try:
            opportunity_score = extract_opportunity_score_from_cleaned(llm_output)
            if "error" in opportunity_score:
                opportunity_score = {}
        except Exception:
            opportunity_score = {}
        
        # 3. 商机推进建议（暂时不提取）
        opportunity_decision = {}
        
        # 4. FABE/SPI - 不再提取，始终返回空数组（保持接口兼容性）
        fabe_spi = []
        
        # 5. 组装payload
        dmu_analysis = {}
        if decision_units:
            dmu_analysis["decision_units"] = decision_units
        if opportunity_score:
            dmu_analysis["opportunity_score"] = opportunity_score
        if opportunity_decision:
            dmu_analysis["opportunity_decision"] = opportunity_decision
        # FABE/SPI字段始终为空数组，保持接口兼容性
        dmu_analysis["fabe_spi"] = []
        
        # 6. 验证关键字段
        if not dmu_analysis or (isinstance(dmu_analysis, dict) and not dmu_analysis):
            raise BusinessException("关键字段提取失败", "DMU_ANALYSIS_EMPTY")
        
        if not company_name or not company_name.strip():
            raise BusinessException("关键字段提取失败", "COMPANY_NAME_EMPTY")
        
        payload = {
            "dmu_analysis": dmu_analysis,
            "companyName": company_name
        }
        
        return {
            "success": True,
            "extracted_data": dmu_analysis,
            "database_payload": payload,
            "message": "结构化提取完成"
        }
    except BusinessException as e:
        return {
            "success": False,
            "error": e.message,
            "error_code": e.error_code,
            "extracted_data": None,
            "database_payload": None,
            "message": e.message
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "extracted_data": None,
            "database_payload": None,
            "message": str(e)
        }

