# WebaiBridge MCP Status

## Current Status

- `partial`
- `committed read-only stdio MCP server/tool surface on main`
- `not an execution brain`

## Why This Page Exists

Many users search for:

- `WebaiBridge MCP`
- `WebaiBridge MCP server`
- `AI runtime MCP backend`

Without this page, it is easy to confuse:

- a read-only thin surface
- a full MCP backend

## What Is True Right Now

- WebaiBridge ships a committed service runtime and SDK/client surfaces
- WebaiBridge now also ships a committed **read-only stdio MCP server/tool
  surface**:
  - startup command:
    - `pnpm run webai-bridge:mcp`
  - committed package:
    - `packages/surfaces/mcp`
  - backing model:
    - service-runtime-backed
    - local-first
    - read-only
- the landed toolset is intentionally narrow:
  - `webai-bridge.runtime.bootstrap`
  - `webai-bridge.providers.list`
  - `webai-bridge.runtime.health`
  - `webai-bridge.runtime.doctor`
  - `webai-bridge.runtime.plan`
  - `webai-bridge.auth.status`
  - provider-scoped status, doctor, probe, remediation, current-page, current-console,
    and current-network
  - provider support-bundle, readiness, attach-target, and diagnose ladder
  - doc-backed catalog truth for:
    - surface catalog schema
    - compat target catalog, schema, and entries
    - builder kit catalog, schema, and entries
    - skill pack catalog, schema, and entries
    - skill pack route cards
    - provider catalog and provider entry
    - builder kits and skill packs
    - host playbooks and host examples
    - builder journeys
    - builder intent router
    - keyword truth
    - starter manifests and starter examples plus schemas
    - starter-pack index, chooser, and comparison
    - builder templates and builder examples
    - skill templates and skill examples
- this surface is **not**:
  - an execution brain
  - a write plane
  - a full Codex / Claude Code embedded backend
  - a worktree, tool, or terminal parity layer

## What Is Plausible Later

If later phase gates open further, a more reasonable direction is:

- improve adapter ergonomics on top of the current read-only surface
- avoid forcing MCP semantics back into the provider-runtime core

If plugin, skills, or builder tooling only needs current truth, the stable
entrypoints today are:

- connect directly to `pnpm run webai-bridge:mcp`
- or read:
  - `pnpm run webai-bridge:cli -- mcp-status`
  - `pnpm run webai-bridge:cli -- surface-catalog`
  - `pnpm run webai-bridge:cli -- compat-target-catalog`
  - `pnpm run webai-bridge:cli -- compat-target-catalog-schema`
  - `pnpm run webai-bridge:cli -- builder-kit-catalog`
  - `pnpm run webai-bridge:cli -- builder-kit-catalog-schema`
  - `pnpm run webai-bridge:cli -- skill-pack-catalog`
  - `pnpm run webai-bridge:cli -- skill-pack-catalog-schema`
  - `pnpm run webai-bridge:cli -- skill-pack-routes`
  - `pnpm run webai-bridge:cli -- skill-pack-routes-schema`
  - `pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack`
  - `pnpm run webai-bridge:cli -- mcp-tools`
  - `pnpm run webai-bridge:cli -- mcp-tool-catalog`
  - `pnpm run webai-bridge:cli -- mcp-tool-catalog-schema`
  - `pnpm run webai-bridge:cli -- mcp-tool --target webai-bridge.runtime.health`
  - `pnpm run webai-bridge:cli -- starter-manifests-schema`
  - `pnpm run webai-bridge:cli -- starter-examples-schema`
  - `pnpm run webai-bridge:cli -- starter-pack-index`
  - `pnpm run webai-bridge:cli -- starter-pack-index-schema`
  - `pnpm run webai-bridge:cli -- starter-pack-chooser`
  - `pnpm run webai-bridge:cli -- starter-pack-chooser-schema`
  - `pnpm run webai-bridge:cli -- starter-pack-scenario --target mcp-inspector`
  - `catalogs/mcp-tool-catalog.json`
  - `catalogs/mcp-tool-catalog.schema.json`
  - `catalogs/skill-pack-routes.json`
  - `catalogs/public-surface-catalog.json`

If you want a minimal runnable sample instead of assembling a client manually,
open:

- [examples/mcp-inspector/README.md](../examples/mcp-inspector/README.md)

If your real question is:

> **Should I start with the `mcp` starter pack or another pack?**

Do not stop at the tool inventory. Go here next:

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- `webai-bridge.catalog.starter_pack_chooser`
- `webai-bridge.catalog.starter_pack_scenario`

If you have already decided to attach WebaiBridge to a host instead of only
reading current truth, go here next:

- [docs/host-integration-playbooks.md](./host-integration-playbooks.md)
- `webai-bridge.catalog.host_playbooks`
- `webai-bridge.catalog.host_playbook`
- [examples/hosts/README.md](../examples/hosts/README.md)
- `webai-bridge.catalog.host_examples`
- `webai-bridge.catalog.host_example`

If you already picked a **skill pack** and your real question is:

> **What is the coordinated CLI + MCP route for this pack?**

go here next:

- `pnpm run webai-bridge:cli -- skill-pack-routes`
- `pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack`
- `webai-bridge.catalog.skill_packs`
- `webai-bridge.catalog.skill_pack`
- [docs/host-integration-playbooks.md](./host-integration-playbooks.md)

## Fastest Route By Question

Treat this section like a triage desk:

- if you need runtime, auth, or provider state:
  - `webai-bridge.runtime.bootstrap`
  - `webai-bridge.providers.list`
  - `webai-bridge.runtime.health`
  - `webai-bridge.runtime.doctor`
  - `webai-bridge.runtime.plan`
  - `webai-bridge.auth.status`
  - `webai-bridge.provider.status`
  - `webai-bridge.provider.doctor`
  - `webai-bridge.provider.probe`
  - `webai-bridge.provider.remediation`
  - `webai-bridge.provider.current_page`
  - `webai-bridge.provider.current_console`
  - `webai-bridge.provider.current_network`
  - `webai-bridge.provider.store_readiness`
  - `webai-bridge.provider.live_readiness`
  - `webai-bridge.provider.attach_target`
  - `webai-bridge.provider.diagnose_ladder`
  - `webai-bridge.provider.support_bundle`
  - `webai-bridge.provider.diagnose`

These runtime and provider doctor routes now also expose `activePolicyPack`,
so the read-only MCP surface can explain the current routing policy in human
terms instead of only returning a bare `policyProfile` id.
- if you need surface, compat, or provider truth:
  - `webai-bridge.catalog.surface_catalog`
  - `webai-bridge.catalog.surface_catalog_schema`
  - `webai-bridge.catalog.compat_target_catalog`
  - `webai-bridge.catalog.compat_target_catalog_schema`
  - `webai-bridge.catalog.builder_kit_catalog`
  - `webai-bridge.catalog.builder_kit_catalog_schema`
  - `webai-bridge.catalog.skill_pack_catalog`
  - `webai-bridge.catalog.skill_pack_catalog_schema`
  - `webai-bridge.catalog.provider_catalog`
  - `webai-bridge.catalog.provider_entry`
  - `webai-bridge.catalog.compat_targets`
  - `webai-bridge.catalog.compat_target`
- if you need a builder path, skill pack, or starter pack:
  - `webai-bridge.catalog.builder_kits`
  - `webai-bridge.catalog.builder_kit`
  - `webai-bridge.catalog.skill_packs`
  - `webai-bridge.catalog.skill_pack`
  - `webai-bridge.catalog.starter_manifests`
  - `webai-bridge.catalog.starter_manifests_schema`
  - `webai-bridge.catalog.starter_examples`
  - `webai-bridge.catalog.starter_examples_schema`
  - `webai-bridge.catalog.starter_pack_index`
  - `webai-bridge.catalog.starter_pack_index_schema`
  - `webai-bridge.catalog.starter_pack_entry`
  - `webai-bridge.catalog.starter_pack_chooser`
  - `webai-bridge.catalog.starter_pack_chooser_schema`
  - `webai-bridge.catalog.starter_pack_scenario`
  - `webai-bridge.catalog.starter_pack_comparison`
  - `webai-bridge.catalog.starter_pack_comparison_schema`
  - `webai-bridge.catalog.starter_pack_filter`
- if you need a full builder journey or keyword-claim truth:
  - `webai-bridge.catalog.builder_journeys`
  - `webai-bridge.catalog.builder_journeys_schema`
  - `webai-bridge.catalog.builder_journey`
  - `webai-bridge.catalog.builder_intent_router`
  - `webai-bridge.catalog.builder_intent_router_schema`
  - `webai-bridge.catalog.builder_intent`
  - `webai-bridge.catalog.keyword_truth`
  - `webai-bridge.catalog.keyword_truth_schema`
  - `webai-bridge.catalog.keyword_entry`
- if you need host integration docs or runnable examples:
  - `webai-bridge.catalog.host_playbooks`
  - `webai-bridge.catalog.host_playbooks_schema`
  - `webai-bridge.catalog.host_playbook`
  - `webai-bridge.catalog.host_examples`
  - `webai-bridge.catalog.host_examples_schema`
  - `webai-bridge.catalog.host_example`
- if you need starter templates/examples or the MCP inventory itself:
  - `webai-bridge.catalog.builder_template`
  - `webai-bridge.catalog.builder_example`
  - `webai-bridge.catalog.skill_template`
  - `webai-bridge.catalog.skill_example`
  - `webai-bridge.catalog.mcp_status`
  - `webai-bridge.catalog.mcp_tools`
  - `webai-bridge.catalog.mcp_tool_catalog`
  - `webai-bridge.catalog.mcp_tool_catalog_schema`
  - `webai-bridge.catalog.mcp_tool`

## What Would Be Fake Today

These claims are still dishonest:

- `WebaiBridge MCP has full tool parity today`
- `WebaiBridge MCP is already an execution brain`
- `WebaiBridge is already a Codex/Claude Code MCP backend`

The most truthful public wording today is:

> WebaiBridge ships a committed **read-only MCP surface** on `main`, but it is
> still only a thin partial server/tool slice.
