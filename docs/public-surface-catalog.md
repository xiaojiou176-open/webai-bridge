# WebaiBridge Public Surface Catalog

This page is the thin human-readable hub for WebaiBridge's machine-readable
public truth.

Think of it as:

- the signboard for what public surfaces are real today
- the shortest route into the JSON catalogs that tools should actually consume

It is **not** a marketing page, and it does **not** quietly rewrite future
ambition into current support.

## Current Honest Role

Today the outward catalog should still be read like this:

- `CLI` = `partial`
- `MCP` = `partial`
- `Codex / Claude Code / OpenClaw compat` = `partial`
- `Language policy` = English-first public front door with bilingual helper
  pages

In plain English:

> The catalog is the truth-first directory for current boundaries.
> It exists so humans and tools can consume the same honest support surface.

## Machine-Readable Sources

Start with these public catalogs:

- [catalogs/public-surface-catalog.json](../catalogs/public-surface-catalog.json)
- [catalogs/public-surface-catalog.schema.json](../catalogs/public-surface-catalog.schema.json)
- [catalogs/public-distribution-ledger.json](../catalogs/public-distribution-ledger.json)
- [catalogs/public-distribution-ledger.schema.json](../catalogs/public-distribution-ledger.schema.json)

If you need a narrower slice, read these directly:

- [catalogs/compat-target-catalog.json](../catalogs/compat-target-catalog.json)
- [catalogs/builder-kit-catalog.json](../catalogs/builder-kit-catalog.json)
- [catalogs/skill-pack-catalog.json](../catalogs/skill-pack-catalog.json)
- [catalogs/builder-intent-router.json](../catalogs/builder-intent-router.json)
- [catalogs/builder-journeys.json](../catalogs/builder-journeys.json)
- [catalogs/starter-pack-comparison.json](../catalogs/starter-pack-comparison.json)
- [catalogs/provider-runtime-catalog.json](../catalogs/provider-runtime-catalog.json)
- [catalogs/provider-runtime-catalog.schema.json](../catalogs/provider-runtime-catalog.schema.json)

There is no separate provider-runtime markdown wrapper required to understand
the public provider directory. The JSON catalog is the public source of truth
for provider ids, lanes, and stability targets.

## Read-Only Access

```bash
pnpm run webai-bridge:cli -- surface-catalog
pnpm run webai-bridge:cli -- surface-catalog-schema
pnpm run webai-bridge:cli -- public-distribution-ledger
pnpm run webai-bridge:cli -- public-distribution-ledger-schema
pnpm run webai-bridge:cli -- compat-target-catalog
pnpm run webai-bridge:cli -- builder-kit-catalog
pnpm run webai-bridge:cli -- skill-pack-catalog
pnpm run webai-bridge:cli -- provider-catalog
pnpm run webai-bridge:cli -- provider-entry --target gemini:web-login
pnpm run webai-bridge:cli -- builder-intent-router
pnpm run webai-bridge:cli -- keyword-truth
pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010
```

These commands exist so that plugin/build tooling can consume current truth
without hard-coding it.

## Read-Only MCP Access

The same catalog truth is readable from the read-only MCP surface:

- `webai-bridge.catalog.surface_catalog`
- `webai-bridge.catalog.public_distribution_ledger`
- `webai-bridge.catalog.compat_target_catalog`
- `webai-bridge.catalog.provider_catalog`
- `webai-bridge.catalog.provider_entry`
- `webai-bridge.catalog.builder_kit_catalog`
- `webai-bridge.catalog.skill_pack_catalog`
- `webai-bridge.catalog.builder_journeys`
- `webai-bridge.catalog.builder_intent_router`
- `webai-bridge.catalog.keyword_truth`
- `webai-bridge.catalog.mcp_status`
- `webai-bridge.catalog.mcp_tools`

## Builder Routes

If you need a human-facing route instead of raw JSON:

- choose the pack first:
  - [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- then open the builder handoff hub:
  - [docs/host-integration-playbooks.md](./host-integration-playbooks.md)
- then copy a runnable host-local shape if needed:
  - [examples/hosts/README.md](../examples/hosts/README.md)

If you need keyword or discoverability truth instead of support truth, go to
[docs/discoverability-keyword-truth.md](./discoverability-keyword-truth.md).

## Truth Rules

Use this catalog to stop four common mistakes:

- turning `partial` into `supported now`
- turning read-only into execution capability
- turning package-ready into listed-live
- turning bilingual helper surfaces into the default public-language policy

## Decision Summary

> The public surface catalog is a truth-first directory, not a hype page.
> It is intentionally thinner than the underlying JSON family so the public
> docs plane stays narrow while tools still have a full machine-readable shelf.
