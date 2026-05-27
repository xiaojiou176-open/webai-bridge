# Codex Starter Pack

这个 pack 适合的不是“复刻 Codex 产品壳”，而是：

> 给外部 builder 一份可以直接接到 `WebaiBridge` runtime 的 text-only thin bridge。

## 当前诚实边界

- `partial`
- thin runtime bridge
- fail-closed helper starter

## 当前不该吹的东西

- full Codex parity
- worktree parity
- tool-execution parity
- MCP parity

## 运行

```bash
pnpm run start:service-local
pnpm run starter-pack:codex
```

默认会把 `example.json` 里的最小请求直接打到当前 runtime。
