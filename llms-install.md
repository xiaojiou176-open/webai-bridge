# WebaiBridge MCP Install For Agent Shells

This file is the shortest honest install path for agent shells that want the
repo-native WebaiBridge MCP surface.

## What This Installs

- a **read-only stdio MCP surface**
- backed by the local WebaiBridge checkout
- **not** a hosted endpoint
- **not** a published npm install today

## Current Working Path

1. Clone the repository.
2. Install dependencies from the repo root:

```bash
pnpm install
```

3. Start the MCP surface from the repo root:

```bash
pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010
```

## MCP Client Snippet

```json
{
  "mcpServers": {
    "webai-bridge": {
      "command": "pnpm",
      "args": ["run", "webai-bridge:mcp", "--", "--base-url", "http://127.0.0.1:4010"],
      "cwd": "/absolute/path/to/WebaiBridge"
    }
  }
}
```

## Verification

The repo-owned smoke path that works today is:

```bash
pnpm run example:host-mcp
```

## Truth Boundary

- usable today: **local checkout + stdio**
- not usable today: `npx @webai-bridge/surface-mcp`, Official MCP Registry install,
  hosted HTTP MCP runtime, Smithery listing
