# WebaiBridge Host Example: MCP

这个 example 的目标是：

> 给本地 MCP client 一个最小的 stdio 配置样例。

它适合：

- 想把 `WebaiBridge` read-only MCP surface 接进本地 client
- 想快速知道 client config 和第一条 tool call 长什么样

它不适合：

- execution brain
- write plane
- runtime invoke through MCP

## Files

- [config.example.json](./config.example.json)
- [smoke.mjs](./smoke.mjs)

## Run

```bash
pnpm run example:host-mcp
```

## Related Surfaces

- [docs/mcp.md](../../../docs/mcp.md)
- [starter-packs/builders/mcp/README.md](../../../starter-packs/builders/mcp/README.md)
