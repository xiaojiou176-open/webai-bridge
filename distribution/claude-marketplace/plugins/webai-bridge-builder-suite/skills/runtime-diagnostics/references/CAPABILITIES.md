# WebaiBridge MCP Capabilities

WebaiBridge exposes a read-only MCP surface for runtime diagnostics and catalog
truth.

## Safe-first tools

- `webai-bridge.runtime.health`
- `webai-bridge.providers.list`
- `webai-bridge.provider.status`
- `webai-bridge.provider.probe`
- `webai-bridge.provider.support_bundle`
- `webai-bridge.catalog.surface_catalog`
- `webai-bridge.catalog.compat_target_catalog`
- `webai-bridge.catalog.builder_kit_catalog`
- `webai-bridge.catalog.skill_pack_catalog`
- `webai-bridge.catalog.host_playbook`

## Recommended first-use order

1. `webai-bridge.runtime.health`
2. `webai-bridge.providers.list`
3. `webai-bridge.provider.status`
4. `webai-bridge.provider.support_bundle`
5. `webai-bridge.catalog.host_playbook`

## Boundary

- good fit: runtime health, provider diagnostics, starter-pack routing, and
  read-only catalog inspection
- not a fit: runtime invoke, acquisition write, browser automation, or full
  host parity claims
