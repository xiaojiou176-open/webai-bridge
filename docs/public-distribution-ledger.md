# WebaiBridge Public Distribution Ledger

This page does **not** announce that WebaiBridge is already listed in an
official marketplace or that release publication is fully complete.

It exists to answer a narrower question:

> **How far can WebaiBridge be truthfully described as publicly distributed
> today?**

Current scope for this ledger:

- package / starter-pack / docs / GitHub Pages homepage / CLI / MCP front door
  should be public-ready
- `SDK / hosted runtime / release publish / custom domain` are outside this
  current lane
- without fresh evidence, `public-ready` must never be rewritten as
  `officially listed`

## Current Verdict

Think of this page as a listing-status board:

- some surfaces are boxed, labeled, and documented
- some official counters do exist for the shape WebaiBridge fits
- but WebaiBridge still sits mainly at
  `package-ready / starter-pack-ready / docs-frontdoor-ready`, not
  `officially listed`

This page is one of the few first-row public truth pages. Packet/accounting
pages and internal Wave 1 working packs belong on deeper shelves.

Operational support shelves such as
`docs/public-surface-support-matrix.md` and
`docs/runbooks/dev-bootstrap.md` stay public, but they are not listing-status
pages and should not be used as the repo's first product sentence.

## Machine-Readable Source

- [catalogs/public-distribution-ledger.json](../catalogs/public-distribution-ledger.json)
- [catalogs/public-distribution-ledger.schema.json](../catalogs/public-distribution-ledger.schema.json)

## Read-Only CLI Access

```bash
pnpm run webai-bridge:cli -- public-distribution-ledger
pnpm run webai-bridge:cli -- public-distribution-ledger-schema
pnpm run webai-bridge:cli -- distribution-surfaces
pnpm run webai-bridge:cli -- distribution-surface --target codex
pnpm run webai-bridge:cli -- distribution-surface --target claude-code
pnpm run webai-bridge:cli -- distribution-surface --target openclaw
pnpm run webai-bridge:cli -- distribution-surface --target mcp
```

## Read-Only MCP Access

- `webai-bridge.catalog.public_distribution_ledger`
- `webai-bridge.catalog.public_distribution_ledger_schema`
- `webai-bridge.catalog.distribution_surfaces`
- `webai-bridge.catalog.distribution_surface`

## Current Surface Ledger

| Surface | Official public surface exists? | Current listing status | Strongest current public distribution surface | Current artifact | Current proof loop | Allowed claim now | Forbidden overclaim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Codex` thin compat | `yes` — official Codex plugin system and Plugin Directory docs exist | official surface exists, but `WebaiBridge` is **not** claiming official directory listing yet | package-ready adapter + starter pack + host example + compat docs | `@webai-bridge/consumer-codex`, `starter-packs/builders/codex/`, `examples/hosts/codex/`, `docs/compat/codex.md` | `pnpm run starter-pack:codex`, `pnpm run example:host-codex` | `partial / thin compat / builder-facing runtime bridge / package-ready artifact` | `official Codex marketplace listed`, `full Codex support`, `tool or MCP parity` |
| `Claude Code` thin compat | `yes` — official Claude Code plugin surface exists | official surface exists, but `WebaiBridge` is **not** claiming official directory listing yet | package-ready adapter + starter pack + host example + marketplace-compatible bundle | `@webai-bridge/consumer-claude-code`, `starter-packs/builders/claude-code/`, `examples/hosts/claude-code/`, `distribution/claude-marketplace/`, `docs/compat/claude-code.md` | `pnpm run starter-pack:claude-code`, `pnpm run example:host-claude-code` | `partial / thin compat / message-runtime bridge / package-ready artifact / marketplace-ready bundle` | `official Claude Code marketplace listed`, `full Claude Code support`, `terminal or approval parity` |
| `OpenClaw` thin compat | `yes` — official ClawHub and npm-based plugin distribution docs exist | official surfaces exist, but `WebaiBridge` is **not** claiming ClawHub/npm publication yet | package-ready adapter + starter pack + host example + OpenClaw-compatible Claude bundle | `@webai-bridge/consumer-openclaw`, `starter-packs/builders/openclaw/`, `examples/hosts/openclaw/`, `distribution/claude-marketplace/`, `docs/compat/openclaw.md` | `pnpm run starter-pack:openclaw`, `pnpm run example:host-openclaw` | `partial / thin compat / delegation-first bridge / package-ready artifact / OpenClaw-compatible bundle` | `official OpenClaw marketplace listed`, `OpenClaw product-shell parity`, `operator/control-plane parity` |
| `MCP` read-only surface | `yes` — the official MCP Registry exists | official registry exists, but `WebaiBridge` is **not** claiming registry listing yet | package-ready MCP surface + stdio CLI/bin + docs + host example | `@webai-bridge/surface-mcp`, `webai-bridge-mcp` bin, `packages/surfaces/mcp/server.json`, `examples/hosts/mcp/`, `docs/mcp.md` | `pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010`, `pnpm run example:host-mcp` | `partial / read-only MCP server / package-ready artifact / registry-submission materials landed / not an execution brain` | `official MCP registry listed`, `full MCP backend`, `runtime invoke through MCP`, `acquisition write through MCP` |
| Builder starter packs | `no` — not an official marketplace surface | public repo frontdoor only | public GitHub repo paths + machine-readable index + CLI/MCP catalogs | `starter-packs/**`, `starter-packs/index.json`, `starter-packs/README.md` | `pnpm run starter-pack:codex`, `pnpm run starter-pack:mcp` | `copy-ready starter packs`, `builder-facing public frontdoor`, `local-first first-success kits` | `official plugin marketplace listing`, `fully supported host product integration` |
| Skill packs / docs SEO packs | `no` — not an official marketplace surface | public repo frontdoor only | public docs + machine-readable catalogs + starter packs + marketplace-compatible bundle | `catalogs/skill-pack-catalog.*`, `starter-packs/skills/**`, `catalogs/discoverability-keyword-truth.*`, `distribution/claude-marketplace/` | `pnpm run starter-pack:runtime-diagnostics-pack`, `pnpm run starter-pack:docs-seo-sync-pack` | `truth-first builder automation packs`, `public docs/discoverability helpers`, `marketplace-ready bundle artifact` | `official plugin listing`, `launch automation`, `supported publication pipeline` |

## Packet-Scoped Host Read-Back

This ledger stays repo-wide on purpose.

- If a secondary packet such as `webai-bridge-runtime-diagnostics` has its own
  host-lane read-back, keep that receipt in the packet README and manifest.
- Task-supplied 2026-04-11 external read-back says the runtime-diagnostics
  packet currently has a readable ClawHub page plus a negative host-side
  safety/trust warning, and an OpenHands receipt at `PR #161` that is still
  `review-pending`.
- Those packet-scoped host receipts do **not** upgrade the repo-wide `Skill
  packs / docs SEO packs` row into an official listing, npm publication, or
  official MCP Registry listing.

## Official Surface Anchors

- `Codex`
  - [OpenAI Codex Plugins Overview](https://developers.openai.com/codex/plugins/overview)
  - [OpenAI Codex Plugins Build Guide](https://developers.openai.com/codex/plugins/build)
- `Claude Code`
  - [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- `OpenClaw`
  - [OpenClaw Plugins](https://docs.openclaw.ai/tools/plugin)
  - [OpenClaw ClawHub](https://docs.openclaw.ai/tools/clawhub)
- `MCP`
  - [Official MCP Registry](https://registry.modelcontextprotocol.io/)

## Minimal Human Action Packs

These packs are not here to help WebaiBridge overclaim. They exist to show what
the owner would still need to do next if publication continues.

### `Codex`

- exact URL
  - [OpenAI Codex Plugins Overview](https://developers.openai.com/codex/plugins/overview)
  - [OpenAI Codex Plugins Build Guide](https://developers.openai.com/codex/plugins/build)
- exact local path
  - [`packages/consumers/codex/README.md`](../packages/consumers/codex/README.md)
  - [`starter-packs/builders/codex/README.md`](../starter-packs/builders/codex/README.md)
- step 1 / 2 / 3
  - 1. Use the starter pack and host example to prove the local bridge.
  - 2. Keep outward wording at `Codex-compatible / package-ready`.
  - 3. Do not write `officially listed in Codex` before real listing proof exists.

### `Claude Code`

- exact URL
  - [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- exact local path
  - [`distribution/claude-marketplace/README.md`](../distribution/claude-marketplace/README.md)
  - [`distribution/claude-marketplace/.claude-plugin/marketplace.json`](../distribution/claude-marketplace/.claude-plugin/marketplace.json)
- step 1 / 2 / 3
  - 1. Validate the marketplace-compatible bundle and metadata.
  - 2. Test the repo or URL through the Claude Code plugin flow.
  - 3. Upgrade wording to `listed` only after public discovery proof exists.

### `OpenClaw`

- exact URL
  - [OpenClaw Plugins](https://docs.openclaw.ai/tools/plugin)
  - [OpenClaw ClawHub](https://docs.openclaw.ai/tools/clawhub)
- exact local path
  - [`packages/consumers/openclaw/README.md`](../packages/consumers/openclaw/README.md)
  - [`distribution/claude-marketplace/README.md`](../distribution/claude-marketplace/README.md)
- step 1 / 2 / 3
  - 1. Reuse the existing OpenClaw-compatible bundle and starter pack in repo.
  - 2. Submit through the official OpenClaw / ClawHub route when owner auth is ready.
  - 3. Write `listed on ClawHub` only after public discovery is real.

### `MCP`

- exact URL
  - [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- exact local path
  - [`packages/surfaces/mcp/README.md`](../packages/surfaces/mcp/README.md)
  - [`packages/surfaces/mcp/package.json`](../packages/surfaces/mcp/package.json)
  - [`packages/surfaces/mcp/server.json`](../packages/surfaces/mcp/server.json)
- step 1 / 2 / 3
  - 1. Keep package metadata, `mcpName`, `server.json`, CLI bin, and docs publish-ready.
  - 2. Complete npm publish and registry submission when owner auth is available.
  - 3. Write `listed in the official MCP Registry` only after registry search can find it.

## npm Registry Truth

This wave only proves one thing:

- `@webai-bridge/consumer-codex` currently has **no published npm version**
- `@webai-bridge/consumer-claude-code` currently has **no published npm version**
- `@webai-bridge/consumer-openclaw` currently has **no published npm version**
- `@webai-bridge/surface-mcp` currently has **no published npm version**

So the honest wording today is:

- `npm-ready package metadata landed in repo`
- `publish-ready artifact exists in repo`
- `no npm publish claimed yet`
- `no release publish claimed yet`

And **not**:

- `available on npm now`

## How To Talk About These Surfaces

### Allowed claims

- `package-ready`
- `copy-ready starter pack`
- `builder-facing public frontdoor`
- `partial thin compat`
- `read-only MCP surface`
- `docs-first discoverability surface`
- `official surface exists, but WebaiBridge is not listed yet`

### Forbidden overclaims

- `officially listed`
- `marketplace live`
- `fully supported plugin`
- `full parity`
- `production launch complete`

## First-Row Neighbors

- [README.md](../README.md)
- [docs/first-success.md](./first-success.md)
- [docs/public-proof-pack.md](./public-proof-pack.md)
- [docs/api/service-http-reference.md](./api/service-http-reference.md)
