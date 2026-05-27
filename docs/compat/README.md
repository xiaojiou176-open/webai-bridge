# WebaiBridge Compatibility Matrix

This page is the compatibility front door.

It is not the marketing page.

## Current Truth

### Public compatibility targets

| Target | Status | Truthful meaning |
| --- | --- | --- |
| `Codex` | `partial` | a thin fail-closed runtime adapter is landed; full Codex parity is still not supported |
| `Claude Code` | `partial` | a thin fail-closed runtime adapter is landed; tool/MCP/terminal parity is still not supported |
| `OpenClaw` | `partial` | a thin fail-closed runtime adapter is landed; operator/control-plane parity is still not supported |
| `MCP` | `partial` | a read-only runtime-backed MCP server/tool surface is landed, but this is still not embedded Codex / Claude Code / OpenClaw parity |

### Related first-party seam snapshots

These are **related repo seam snapshots**, not public compatibility claims.

| Repo | Current relation | Truthful meaning |
| --- | --- | --- |
| `campus-copilot` | bounded seam landed | a thin BFF bridge exists, but it is not the whole consumer contract |
| `CortexPilot` | future reselection | provider/base_url seam exists in planning, but it is not a current public compat surface |
| `multi-ai-sidepanel` | bounded seam landed | a maintainer-local runtime-backed analyst lane exists, while compare-first browser UX stays local |

## Primary Pages

- [docs/compat/codex.md](./codex.md)
- [docs/compat/claude-code.md](./claude-code.md)
- [docs/compat/openclaw.md](./openclaw.md)
- [docs/public-distribution-ledger.md](../public-distribution-ledger.md)
- [docs/public-surface-catalog.md](../public-surface-catalog.md)
- [docs/README.md](../README.md)
  - if you want the full atlas instead of the compat shelf, go back to the main docs index

## Builder / Plugin / Skills Entry

If an external tool, plugin, skills pack, or automation builder needs current
truth, do not copy it by hand.

Prefer:

- `pnpm run webai-bridge:cli -- public-distribution-ledger`
- `pnpm run webai-bridge:cli -- public-distribution-ledger-schema`
- `pnpm run webai-bridge:cli -- distribution-surfaces`
- `pnpm run webai-bridge:cli -- distribution-surface --target codex`
- `pnpm run webai-bridge:cli -- surface-catalog`
- `pnpm run webai-bridge:cli -- surface-catalog-schema`
- `pnpm run webai-bridge:cli -- compat-target-catalog`
- `pnpm run webai-bridge:cli -- compat-target-catalog-schema`
- `pnpm run webai-bridge:cli -- compat-targets`
- `pnpm run webai-bridge:cli -- compat-target --target codex`
- `pnpm run webai-bridge:cli -- compat-target --target claude-code`
- `pnpm run webai-bridge:cli -- compat-target --target openclaw`
- `webai-bridge.catalog.compat_target_catalog`
- `webai-bridge.catalog.compat_target_catalog_schema`
- `webai-bridge.catalog.compat_targets`
- `webai-bridge.catalog.compat_target`
- `pnpm run webai-bridge:cli -- builder-kit-catalog`
- `pnpm run webai-bridge:cli -- builder-kit-catalog-schema`
- `pnpm run webai-bridge:cli -- builder-kits`
- `pnpm run webai-bridge:cli -- builder-kit --target codex`
- `pnpm run webai-bridge:cli -- builder-kit --target claude-code`
- `pnpm run webai-bridge:cli -- builder-kit --target openclaw`
- `pnpm run webai-bridge:cli -- builder-kit --target mcp`
- `pnpm run webai-bridge:cli -- skill-pack-catalog`
- `pnpm run webai-bridge:cli -- skill-pack-catalog-schema`
- `pnpm run webai-bridge:cli -- skill-packs`
- `pnpm run webai-bridge:cli -- skill-pack --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- skill-pack --target docs-seo-sync-pack`
- `pnpm run webai-bridge:cli -- starter-manifests`
- `pnpm run webai-bridge:cli -- starter-manifests-schema`
- `pnpm run webai-bridge:cli -- starter-examples`
- `pnpm run webai-bridge:cli -- starter-examples-schema`
- `pnpm run webai-bridge:cli -- starter-pack-index`
- `pnpm run webai-bridge:cli -- starter-pack-index-schema`
- `pnpm run webai-bridge:cli -- starter-pack-entry --target codex`
- `pnpm run webai-bridge:cli -- starter-pack-chooser`
- `pnpm run webai-bridge:cli -- starter-pack-chooser-schema`
- `pnpm run webai-bridge:cli -- starter-pack-scenario --target codex-builder`
- `pnpm run webai-bridge:cli -- starter-pack-comparison`
- `pnpm run webai-bridge:cli -- starter-pack-comparison-schema`
- `pnpm run webai-bridge:cli -- starter-pack-filter --target read-only-truth`
- `pnpm run webai-bridge:cli -- host-playbooks`
- `pnpm run webai-bridge:cli -- host-playbooks-schema`
- `pnpm run webai-bridge:cli -- host-playbook --target codex`
- `pnpm run webai-bridge:cli -- host-examples`
- `pnpm run webai-bridge:cli -- host-examples-schema`
- `pnpm run webai-bridge:cli -- host-example --target codex`
- `pnpm run webai-bridge:cli -- provider-catalog`
- `pnpm run webai-bridge:cli -- provider-catalog-schema`
- `pnpm run webai-bridge:cli -- provider-entry --target chatgpt`
- `pnpm run webai-bridge:cli -- provider-entry --target gemini:web-login`
- `pnpm run webai-bridge:cli -- builder-template --target codex`
- `pnpm run webai-bridge:cli -- builder-example --target codex`
- `pnpm run webai-bridge:cli -- skill-template --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- skill-example --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- mcp-status`
- `pnpm run webai-bridge:cli -- mcp-tools`

Or read these machine-readable files directly:

- [catalogs/public-distribution-ledger.json](../../catalogs/public-distribution-ledger.json)
- [catalogs/public-distribution-ledger.schema.json](../../catalogs/public-distribution-ledger.schema.json)
- [catalogs/compat-target-catalog.json](../../catalogs/compat-target-catalog.json)
- [catalogs/compat-target-catalog.schema.json](../../catalogs/compat-target-catalog.schema.json)
- [catalogs/public-surface-catalog.json](../../catalogs/public-surface-catalog.json)
- [catalogs/public-surface-catalog.schema.json](../../catalogs/public-surface-catalog.schema.json)

## Important Rule

`partial`, `planned`, and `research only` never mean `supported`.

That is the whole point of this page.

In plain English:

- public compatibility targets only use front-door truth labels such as
  `partial / planned / research only`
- first-party seam snapshots must not pretend to be the public support matrix
- whenever the landed slice is narrow, `thin / bounded / fail-closed` must be
  stated directly
