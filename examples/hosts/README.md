# WebaiBridge Host Integration Examples

这里可以先理解成：

> **把 `WebaiBridge` 接进具体 host 的最小接线板，而且现在每块板子都能自己亮一下灯。**

和现有几个入口的关系是：

- `docs/starter-pack-chooser.md`：先决定你该走哪条路
- `starter-packs/`：拿整包 starter
- `examples/hosts/`：看具体 host-local config 该怎么写

## 当前 host examples

| Host | 目录 | 作用 |
| --- | --- | --- |
| `codex` | `examples/hosts/codex/` | Responses-style runtime bridge config |
| `claude-code` | `examples/hosts/claude-code/` | message/runtime bridge config |
| `openclaw` | `examples/hosts/openclaw/` | delegation-first host config |
| `mcp` | `examples/hosts/mcp/` | read-only stdio MCP client config |

## Runnable Glue

如果你不想只看 config 长相，而是想让 host example 真的跑一次最小 first success：

- 先在另一个终端启动本地 runtime：`pnpm run start:service-local`
- 如果 runtime 不在默认 `127.0.0.1:4010`，先设置 `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- `pnpm run example:host-codex`
- `pnpm run example:host-claude-code`
- `pnpm run example:host-openclaw`
- `pnpm run example:host-mcp`

## Machine-readable Index

- [examples/hosts/index.json](./index.json)
- [examples/hosts/index.schema.json](./index.schema.json)
- [docs/host-integration-playbooks.md](../../docs/host-integration-playbooks.md)

## Important Boundary

这些 host examples 只能诚实代表：

- host-local wiring
- partial host examples
- copy-paste config
- bounded runnable glue

不能诚实代表：

- full parity
- shipped plugin
- host-native tool execution backend
