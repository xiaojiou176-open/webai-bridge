# WebaiBridge for Claude Code

## Status

- `partial`
- `thin runtime adapter landed`
- `full Claude Code compatibility not supported yet`

## What We Can Truthfully Say Today

- the current repo truth is `partial`, but only in a very thin sense
- the landed slice is intentionally narrow:
  - a text-only message bridge
  - shared runtime delegation through `/v1/runtime/invoke`
  - fail-closed rejection for tool execution and terminal-shell parity

## What Is Already Landed

- WebaiBridge already has:
  - a durable service runtime
  - durable auth/session contracts
  - durable service vs SDK surface contracts
  - a thin adapter at `packages/consumers/claude-code/src/index.ts`

## What Is Not Landed

- no terminal shell or worktree parity
- no approval UX parity
- no tool/MCP parity
- no truthful basis to claim full Claude Code support today

## Boundary Reminder

Do not imagine this as:

- recreating the Claude Code terminal shell
- recreating Claude Code plugin/worktree/approval UX

The more truthful reading is:

> if this grows later, it should grow from the gateway/API compatibility layer
> first, not by copying the Claude Code product shell into WebaiBridge
