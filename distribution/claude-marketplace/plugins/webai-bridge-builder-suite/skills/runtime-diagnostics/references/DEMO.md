# WebaiBridge MCP First-Success Demo

This is the shortest diagnostic loop that proves the packet is real.

## Demo prompt

Use WebaiBridge to diagnose whether one provider is actually ready. Start with
`webai-bridge.runtime.health`, list the available providers, then inspect one
provider with `webai-bridge.provider.status` and
`webai-bridge.provider.support_bundle`. Finish by telling me whether the next
blocker is internal or external.

## Expected tool sequence

1. `webai-bridge.runtime.health`
2. `webai-bridge.providers.list`
3. `webai-bridge.provider.status`
4. `webai-bridge.provider.support_bundle`

## Visible success criteria

- the MCP server launches from the provided config
- the runtime health call returns a real response
- the provider status and support bundle point to a concrete blocker
- the answer stays read-only and truthful
