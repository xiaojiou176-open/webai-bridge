# Install And Attach WebaiBridge MCP

Use the current repo-native MCP path first.

## Quickest local setup

1. Clone the public repository:

```bash
git clone https://github.com/xiaojiou176-open/webai-bridge.git
cd WebaiBridge
pnpm install
```

2. Start the read-only MCP surface:

```bash
pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010
```

Before loading the host config snippets in this folder, replace
`/ABSOLUTE/PATH/TO/WEBAI_BRIDGE` with the real path to your local clone.

3. Verify the surface:

```bash
pnpm run test:mcp:smoke
pnpm run webai-bridge:cli -- mcp-tools --json
```

## Current truthful install mode

- protocol: `stdio`
- transport: `stdio`
- package publication: not claimed
- registry listing: not claimed

## What to hand back to the agent

- whether the local runtime at `http://127.0.0.1:4010` is reachable
- whether the MCP server launches
- whether the first tool call succeeds
