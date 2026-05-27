# Distribution Status

This page separates **repo-ready public surfaces** from **actual marketplace or registry publication**.

Current public release truth:

- GitHub Pages storefront: `https://xiaojiou176-open.github.io/webai-bridge/`
- GitHub release / npm / official MCP Registry / marketplace publication: **not yet published**

## Current Distribution Ledger

| Surface | Materialized in repo | Publish-ready today | Published / listed today | Notes |
| --- | --- | --- | --- | --- |
| GitHub Pages storefront | yes | yes | yes | Current homepage points to GitHub Pages and should stay the primary public front door. |
| Root npm package (`webai-bridge`) | yes | no | no | Root package is `private: true`; this repo does not ship a publishable root package today. |
| MCP npm package (`@webai-bridge/surface-mcp`) | yes | yes | no | The package contract, `mcpName`, CLI bin, and `server.json` are landed, but the package is **not yet published**. |
| Thin compat packages (`@webai-bridge/consumer-codex`, `@webai-bridge/consumer-claude-code`, `@webai-bridge/consumer-openclaw`) | yes | yes | no | The repo contains package-ready adapters and starter packs, but no registry publication is claimed yet. |
| Claude marketplace-compatible bundle | yes | yes | no | `distribution/claude-marketplace/` exists, but it is still a repo materialization, not a confirmed live listing. |
| Builder starter packs | yes | yes | no dedicated registry | The public repo is the current install/discovery surface. |
| Official MCP Registry listing | partial | yes | no | Submission materials exist in repo, but there is no live registry listing proof yet. |

## Secondary Packet Host-Lane Truth

The `webai-bridge-runtime-diagnostics` folder is a **secondary packet**, not the
repo-wide distribution verdict.

- Task-supplied 2026-04-11 external read-back says a ClawHub page for this
  packet is currently reachable, but the host also shows a negative
  safety/trust warning. Treat that as packet-scoped host truth, not repo-wide
  acceptance.
- Task-supplied 2026-04-11 external read-back says
  `OpenHands/extensions#161` is open with review still pending and mergeability
  blocked. That is a submission receipt, not a live listing.
- None of those packet receipts upgrade WebaiBridge-wide npm, official MCP
  Registry, or repo-wide marketplace truth.

## What "Ready" Means Here

For WebaiBridge, `ready` currently means:

- the public front door is explicit
- the MCP and thin-compat artifacts are package-ready
- starter packs and host examples are present
- marketplace and registry submission still remain separate later actions

It does **not** mean:

- npm publication already happened
- the official MCP Registry already lists WebaiBridge
- Codex / Claude Code / OpenClaw marketplace publication is already live

## Fastest Public Surfaces

- [README.md](README.md)
- [llms-install.md](llms-install.md)
- [INTEGRATIONS.md](INTEGRATIONS.md)
- [docs/public-distribution-ledger.md](docs/public-distribution-ledger.md)
- [.agents/internal-docs/distribution/submission-packet-ledger.md](.agents/internal-docs/distribution/submission-packet-ledger.md)
- [.agents/internal-docs/mcp/mcp-listings-cockpit.md](.agents/internal-docs/mcp/mcp-listings-cockpit.md)
- [starter-packs/README.md](starter-packs/README.md)
- [docs/starter-pack-chooser.md](docs/starter-pack-chooser.md)

## Canonical Submission Packet

If you need the shortest "what exactly goes into the box" answer before an
Official MCP Registry or host-native submission pass, use
[.agents/internal-docs/distribution/submission-packet-ledger.md](.agents/internal-docs/distribution/submission-packet-ledger.md).

That page keeps three boxes separate:

- the repo-wide front door
- the read-only MCP registry packet
- the host-native runtime-diagnostics packet

This matters because a packet-scoped host receipt still does **not** upgrade
WebaiBridge-wide npm, Official MCP Registry, or hosted-runtime truth.

If you need the current registry / marketplace / owner-manual cockpit, open
[.agents/internal-docs/mcp/mcp-listings-cockpit.md](.agents/internal-docs/mcp/mcp-listings-cockpit.md).

## Minimal Human Action Packs

### MCP

- local truth
  - `packages/surfaces/mcp/package.json`
  - `packages/surfaces/mcp/server.json`
  - `examples/hosts/mcp/`
- current status
  - package-ready
  - not yet published
  - not yet listed in the official MCP Registry

### Thin compat packages

- local truth
  - `packages/consumers/codex/`
  - `packages/consumers/claude-code/`
  - `packages/consumers/openclaw/`
  - `starter-packs/builders/*`
- current status
  - package-ready starter and host materials exist
  - no npm publication claimed
  - no marketplace listing claimed

### Claude marketplace-compatible bundle

- local truth
  - `distribution/claude-marketplace/`
- current status
  - bundle materialized
  - publish-ready
  - not yet claimed as officially listed

## How To Talk About These Surfaces

### Allowed claim now

- `package-ready`
- `starter-ready`
- `builder-facing public front door`
- `marketplace-compatible bundle landed in repo`
- `official registry surface exists, but WebaiBridge is not listed yet`

### Forbidden overclaim

- `officially listed`
- `published on npm now`
- `available in the official MCP Registry now`
- `full marketplace launch complete`
