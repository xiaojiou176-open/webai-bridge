# Integration Boundaries

WebaiBridge is a **shared provider runtime for AI apps**.

It can sit behind coding-agent or builder workflows, but this repository does
**not** currently claim:

- an official Codex integration
- an official Claude Code integration
- an official OpenClaw integration
- an official marketplace listing
- a browser plugin
- a hosted control plane

## Current Repo-Native Integration Surfaces

| Surface | Exists in repo | Current status | Notes |
| --- | --- | --- | --- |
| HTTP / service runtime | yes | repo-native | `apps/service/` remains the canonical service-first runtime surface. |
| Read-only MCP surface | yes | repo-native | `packages/surfaces/mcp/` is the governed MCP truth/catalog surface. |
| Thin compat packages | yes | repo-native | Codex / Claude Code / OpenClaw adapters exist as package-ready repo materials, not live marketplace listings. |
| Starter packs | yes | repo-native guidance | `starter-packs/` is the copy-ready builder surface today. |
| GitHub Pages storefront | yes | public-facing | Pages explains category fit and routes visitors into docs, but it is not a registry listing by itself. |

## Ecosystem Fit, Truthfully

| Ecosystem | Current truthful fit | Best first path | Official plugin or listing today |
| --- | --- | --- | --- |
| Codex | thin compat runtime bridge | `docs/compat/codex.md` -> `starter-packs/builders/codex/README.md` | no |
| Claude Code | thin compat plus marketplace-compatible bundle | `docs/compat/claude-code.md` -> `distribution/claude-marketplace/README.md` | no |
| OpenClaw | thin compat runtime bridge | `docs/compat/openclaw.md` -> `starter-packs/builders/openclaw/README.md` | no |
| MCP clients | governed read-only catalog/runtime bridge | `docs/mcp.md` -> `packages/surfaces/mcp/README.md` | no |

## What Is Materialized Here Today

- `apps/service/` for the runtime
- `packages/surfaces/mcp/` for the governed MCP surface
- `packages/consumers/*` for thin compat adapters
- `starter-packs/` for builder-facing quickstarts
- `distribution/claude-marketplace/` for the marketplace-compatible Claude bundle

## What Is Still Deferred

- official marketplace submissions
- official MCP Registry listing proof
- npm publication read-back
- browser-plugin distribution
- hosted multi-tenant runtime rollout

## How To Read The Repo

If you are evaluating WebaiBridge for an external toolchain, the truthful order is:

1. decide whether you need service-first or MCP-first access
2. use the existing repo-native runtime, MCP surface, or starter pack
3. treat registry publication and marketplace packaging as later actions

That keeps current capability and future distribution clearly separated.
