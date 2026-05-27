# WebaiBridge Builder Integration Hub

This page is the thin public handoff once you already know the route.

In plain English:

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md) helps you choose
  the first pack
- this page tells you the honest next move after that choice
- [examples/hosts/README.md](../examples/hosts/README.md) is the runnable
  host-local shelf when you need concrete config or a smoke path

This page does **not** upgrade compatibility claims. It only keeps the public
builder handoff narrow and coordinated.

## Machine-Readable Source

- [catalogs/host-integration-playbooks.json](../catalogs/host-integration-playbooks.json)
- [catalogs/host-integration-playbooks.schema.json](../catalogs/host-integration-playbooks.schema.json)
- [catalogs/skill-pack-routes.json](../catalogs/skill-pack-routes.json)
- [catalogs/skill-pack-routes.schema.json](../catalogs/skill-pack-routes.schema.json)

## Read-Only Access

```bash
pnpm run webai-bridge:cli -- host-playbooks
pnpm run webai-bridge:cli -- host-playbooks-schema
pnpm run webai-bridge:cli -- host-playbook --target codex
pnpm run webai-bridge:cli -- host-playbook --target mcp
pnpm run webai-bridge:cli -- skill-pack-routes
pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack
```

- `webai-bridge.catalog.host_playbooks`
- `webai-bridge.catalog.host_playbooks_schema`
- `webai-bridge.catalog.host_playbook`
- `webai-bridge.catalog.skill_packs`
- `webai-bridge.catalog.skill_pack`

## If You Picked A Builder Pack

Use this hub as the handoff map, then move into the runnable host-local shelf:

| Route | Best next move | Smallest honest success | Do not claim |
| --- | --- | --- | --- |
| `codex` | [examples/hosts/codex/README.md](../examples/hosts/codex/README.md) | one text-only request reaches `/v1/runtime/invoke` | tool/worktree/MCP parity |
| `claude-code` | [examples/hosts/claude-code/README.md](../examples/hosts/claude-code/README.md) | one message-shaped payload reaches the runtime | terminal/tool/approval parity |
| `openclaw` | [examples/hosts/openclaw/README.md](../examples/hosts/openclaw/README.md) | one delegation-shaped request reaches the runtime after the preflight read | operator/product-shell parity |
| `mcp` | [examples/hosts/mcp/README.md](../examples/hosts/mcp/README.md) | one MCP client lists tools and reads health | execution brain / write plane |

If you want the whole runnable host shelf first, open
[examples/hosts/README.md](../examples/hosts/README.md).

## If You Picked A Skill Pack

If the chooser already landed on a skill pack, this is the honest next step:

| Skill pack | CLI handoff | MCP handoff | Use this when... |
| --- | --- | --- | --- |
| `runtime-diagnostics-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack` | `webai-bridge.catalog.skill_pack --target runtime-diagnostics-pack` | you need the exact read-only provider triage surfaces first |
| `docs-seo-sync-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target docs-seo-sync-pack` | `webai-bridge.catalog.skill_pack --target docs-seo-sync-pack` | you need surface-catalog plus keyword-truth handoff first |
| `chat-app-runtime-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target chat-app-runtime-pack` | `webai-bridge.catalog.skill_pack --target chat-app-runtime-pack` | you want a service-first chat runtime bridge starter without promoting a full chat shell |
| `research-copilot-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target research-copilot-pack` | `webai-bridge.catalog.skill_pack --target research-copilot-pack` | you want truth-surface grounding before any research synthesis or outward claim |
| `compare-runtime-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target compare-runtime-pack` | `webai-bridge.catalog.skill_pack --target compare-runtime-pack` | you need compare-first route selection without auto-picking a winner |
| `byok-first-safe-pack` | `pnpm run webai-bridge:cli -- skill-pack-route --target byok-first-safe-pack` | `webai-bridge.catalog.skill_pack --target byok-first-safe-pack` | you want BYOK-first invoke planning before widening into Web/Login reality work |

These route cards do **not** upgrade support claims. They only keep the pack,
CLI, and MCP entrypoints aligned.

## If You Need Truth Before Wiring

If your real question is still "what is actually public and supported," stop
here and open the catalog hub first:

- [docs/public-surface-catalog.md](./public-surface-catalog.md)
- [catalogs/public-surface-catalog.json](../catalogs/public-surface-catalog.json)
- [catalogs/provider-runtime-catalog.json](../catalogs/provider-runtime-catalog.json)

## Related Pages

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- [docs/public-surface-catalog.md](./public-surface-catalog.md)
- [docs/mcp.md](./mcp.md)
- [starter-packs/README.md](../starter-packs/README.md)
- [examples/README.md](../examples/README.md)
- [examples/hosts/README.md](../examples/hosts/README.md)
