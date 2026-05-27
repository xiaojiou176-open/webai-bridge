# WebaiBridge Host Example: Claude Code

这个 example 的目标是：

> 给 `Claude Code` 风格 host 一个最小 message/runtime bridge 配置样例。

它适合：

- 想把 message-style payload 接到 `WebaiBridge` runtime
- 想快速拿到 host-local gateway config 形状

它不适合：

- terminal shell parity
- approval parity
- tool parity

## Files

- [config.example.json](./config.example.json)
- [smoke.mjs](./smoke.mjs)

## Run

```bash
pnpm run example:host-claude-code
```

## Related Surfaces

- [docs/compat/claude-code.md](../../../docs/compat/claude-code.md)
- [starter-packs/builders/claude-code/README.md](../../../starter-packs/builders/claude-code/README.md)
