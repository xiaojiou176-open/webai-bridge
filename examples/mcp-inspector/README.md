# Read-only MCP Inspector Starter

这个 starter 解决的是另一种常见卡点：

> “我知道 repo 里有 MCP，  
> 但我第一条 tool call 到底怎么跑通？”

你可以把它理解成一个已经接好电源的只读示波器。  
它不会替你执行写操作，但会先帮你确认：

- MCP server 能起
- tool inventory 能列
- `runtime.health` 真的能读
- `provider.doctor` 也能过一次真实 stdio roundtrip

## 运行

```bash
pnpm run example:mcp-inspector
```

前提：

- 本机已有可访问的 `WebaiBridge` runtime
- 你只是想做 read-only inspection，不是在找 write plane

## 可选环境变量

- `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- `WEBAI_BRIDGE_SERVICE_PORT`

## 它默认会做什么

1. 启动 `pnpm run webai-bridge:mcp`
2. 用真实 MCP client 连接 stdio
3. 列出全部 tool names
4. 调一次 `webai-bridge.runtime.health`
5. 调一次 `webai-bridge.provider.doctor`
6. 再调一次 `webai-bridge.catalog.mcp_tools`

## 它证明什么

- 这条 MCP 面今天确实是可连接、可读取、可列工具的
- `WebaiBridge` 的 read-only MCP truth 不是纯文档口号

## 它不证明什么

- 不证明 MCP write plane
- 不证明 runtime invoke through MCP
- 不证明它已经是 execution brain
