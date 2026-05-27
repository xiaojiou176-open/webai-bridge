# WebaiBridge Host Example: Codex

这个 example 的目标很窄：

> 给 `Codex` 风格 host 一个最小 Responses-style runtime bridge 配置样例。

它适合：

- 想把文本请求转交给 `WebaiBridge` runtime
- 想快速看到 host-local config 大概长什么样

它不适合：

- tool execution parity
- worktree parity
- MCP parity

## Files

- [config.example.json](./config.example.json)
- [smoke.mjs](./smoke.mjs)

## Run

```bash
pnpm run example:host-codex
```

## Related Surfaces

- [docs/compat/codex.md](../../../docs/compat/codex.md)
- [starter-packs/builders/codex/README.md](../../../starter-packs/builders/codex/README.md)
