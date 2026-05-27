# WebaiBridge for Codex

## Status

- `partial`
- `thin runtime adapter landed`
- `full Codex compatibility not supported yet`

This page exists so the keyword stays truthful and discoverable.

## What We Can Truthfully Say Today

- the current repo truth is `partial`, but only in a very thin sense
- the landed slice is intentionally narrow:
  - text-only runtime delegation
  - a Responses-style request bridge into `/v1/runtime/invoke`
  - fail-closed unsupported features for tool execution, MCP, and runner shell

## What Is Already Landed

- WebaiBridge has a durable `service-first` runtime surface
- the repo carries a thin adapter at `packages/consumers/codex/src/index.ts`
- that landed slice keeps Codex in the consumer dimension, not the V1 input
  lane

## What Is Not Landed

- no tool execution parity
- no MCP bridge
- no worktree, approval, or terminal-shell parity
- no truthful basis to claim full Codex support today

## Why This Page Exists

Developers search for:

- `WebaiBridge Codex`
- `shared provider runtime for Codex`
- `Codex Responses runtime`

This page tells them:

> the project is no longer at “zero adapter” thinking,
> but it is still only fail-closed thin compat, not full Codex support
