#!/bin/bash

# 测试创建多维表格行数据的 CURL 命令

# 基础配置
BASE_URL="http://localhost:8000"
TABLE_CODE="dev"
API_KEY="lfcaQRMG45Eh8Sq5M0zIxlmVJ7tr1zQ4"

# 1. 先查询表格详情，确认表格存在和列定义
echo "=== 1. 查询表格详情 ==="
curl -X GET "${BASE_URL}/api/multi-dimension-tables/${TABLE_CODE}" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -v

echo -e "\n\n=== 2. 创建行数据 ==="
# 2. 创建行数据（请根据实际表格的列定义修改 cells 中的键值对）
curl -X POST "${BASE_URL}/api/multi-dimension-tables/${TABLE_CODE}/rows" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  --data-raw '{
    "cells": {
      "name": "value1"
    }
  }' \
  -v
