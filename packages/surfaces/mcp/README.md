# @webai-bridge/surface-mcp

`@webai-bridge/surface-mcp` 是 `WebaiBridge` 的 **read-only MCP surface**。

一句最重要的人话：

> 它像一个只读信息台，能告诉外部工具“现在真实边界是什么”，但它不是执行大脑，也不会帮你代跑 runtime invoke 或 acquisition。

## Current Honest Role

- `partial`
- `read-only MCP server`
- `stdio transport`
- `not an execution brain`

## What It Exposes

- runtime health
- runtime doctor / task-centric runtime plan
- provider doctor / status / remediation / support bundle summaries
- public surface / compat / builder-kit / skill-pack / starter-pack catalogs
- coordinated skill-pack route cards
- keyword truth / builder journey / host playbook / MCP tool inventory

## What It Does Not Claim

- runtime invoke through MCP
- acquisition write through MCP
- browser automation through MCP
- full Codex / Claude Code backend parity

## Local Usage Today

```bash
pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010
```

如果后续做 release publish，这个包会暴露：

```bash
webai-bridge-mcp --base-url http://127.0.0.1:4010
```

## Read Next

- [docs/mcp.md](../../../docs/mcp.md)
- [docs/api/mcp-readonly-server.md](../../../docs/api/mcp-readonly-server.md)
- [docs/public-surface-catalog.md](../../../docs/public-surface-catalog.md)
- [examples/hosts/mcp/README.md](../../../examples/hosts/mcp/README.md)

## Use Today

- 本地 stdio surface
  - `pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010`
- skill-pack route card
  - `webai-bridge.catalog.skill_pack`
  - read the chosen skill pack entry first, then follow its route pointers
- host example route
  - 先看 [examples/hosts/mcp/README.md](../../../examples/hosts/mcp/README.md)
- 当前还不能说
  - `official MCP Registry listed` / `full MCP backend`

## Public Distribution Truth

- current repo status:
  - publish-ready package metadata landed
  - `mcpName` metadata landed
  - `server.json` registry submission artifact landed
  - CLI bin entry landed
  - no npm publish claimed yet
- honest outward wording:
  - `partial read-only MCP surface`
  - `package-ready artifact`
  - `registry-submission materials landed`
  - `not an execution brain`

不要把这个包说成：

- `official MCP marketplace listing`
- `full MCP backend`
- `runtime invoke through MCP`
