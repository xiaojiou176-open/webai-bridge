# WebaiBridge Host Example Foyer

This page is the thin public wrapper for runnable host-local examples.

In plain English:

- choose the route first:
  - [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- confirm the next move:
  - [docs/host-integration-playbooks.md](./host-integration-playbooks.md)
- copy or run the concrete host-local shape here:
  - [examples/hosts/README.md](../examples/hosts/README.md)

This page is **not** another front desk. It is the foyer for concrete host
example assets.

## Machine-Readable Source

- [examples/hosts/index.json](../examples/hosts/index.json)
- [examples/hosts/index.schema.json](../examples/hosts/index.schema.json)

## Read-Only Access

```bash
pnpm run webai-bridge:cli -- host-examples
pnpm run webai-bridge:cli -- host-examples-schema
pnpm run webai-bridge:cli -- host-example --target codex
pnpm run webai-bridge:cli -- host-example --target mcp
```

- `webai-bridge.catalog.host_examples`
- `webai-bridge.catalog.host_examples_schema`
- `webai-bridge.catalog.host_example`

## Quick Pick

| If your host is... | Start here | Why | Do not expect |
| --- | --- | --- | --- |
| `Codex` | [examples/hosts/codex/README.md](../examples/hosts/codex/README.md) | Responses-style runtime bridge config plus one bounded invoke smoke | tool/worktree parity |
| `Claude Code` | [examples/hosts/claude-code/README.md](../examples/hosts/claude-code/README.md) | message/runtime bridge config plus one bounded invoke smoke | terminal/tool parity |
| `OpenClaw` | [examples/hosts/openclaw/README.md](../examples/hosts/openclaw/README.md) | delegation-first host config plus preflight snapshot and one bounded invoke smoke | product-shell parity |
| `MCP client` | [examples/hosts/mcp/README.md](../examples/hosts/mcp/README.md) | read-only stdio client wiring plus one bounded MCP smoke | execution brain / write plane |

## What This Page Helps With

- host-local first-run wiring
- copy-paste config examples for builder hosts
- bounded runnable glue for one first-success check

## What This Page Does Not Mean

These examples do **not** mean:

- full host parity
- a shipped plugin marketplace
- a production-ready distro package
- an MCP execution backend

They are only the current thin, partial, fail-closed builder surfaces turned
into host-local runnable glue and config examples.
