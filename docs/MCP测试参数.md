# MCP 配置验证 - 填写参数说明

## 方式一：本地测试服务（推荐）

### 1. 启动本地 MCP 测试服务

```bash
cd service
pip install mcp httpx-sse starlette uvicorn
python scripts/mcp_test_server.py
```

启动成功后终端会显示：`MCP 测试服务已启动: http://localhost:8765/sse`

### 2. 在 MCP 配置页面填写以下参数

| 字段 | 填写值 |
|------|--------|
| **MCP 名称** | `本地测试 MCP` |
| **MCP 地址** | `http://localhost:8765/sse` |
| **授权信息** | 留空（或删除文本框内容） |
| **激活** | 勾选 |

### 3. 验证连接

点击「验证连接并获取工具」按钮，成功后应显示 3 个工具：`add`、`get_weather`、`echo`。

### 4. 创建

验证通过后点击「创建」即可。

---

## 方式二：使用第三方 MCP 服务（如有）

若使用需要认证的 MCP 服务，授权信息可填写 JSON，例如：

```json
{
  "Authorization": "Bearer YOUR_TOKEN"
}
```

或使用 API Key：

```json
{
  "api_key": "YOUR_API_KEY"
}
```

---

## 常见 MCP 地址格式

- SSE 传输：`http(s)://主机:端口/sse` 或 `http(s)://主机:端口/sse?token=xxx`
- 示例：`https://mcp.example.com/sse`

---

## 故障排查

1. **连接失败**：确认 MCP 测试服务已启动，且地址为 `http://localhost:8765/sse`
2. **CORS 问题**：本地测试时，前后端需同源或正确配置 CORS
3. **依赖缺失**：确保已安装 `mcp` 和 `httpx-sse`（`pip install mcp httpx-sse`）
