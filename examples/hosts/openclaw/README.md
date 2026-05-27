# WebaiBridge Host Example: OpenClaw

这个 example 的目标是：

> 给 `OpenClaw` 风格 host 一个 delegation-first config 样例，而不是产品壳复制品。

它适合：

- 想保留 delegation-first 请求形状
- 想快速看到 host-local request envelope 怎么写
- 想在第一次 invoke 前先读一次 preflight truth

它不适合：

- operator parity
- product-shell parity
- channel shell parity

## Files

- [config.example.json](./config.example.json)
- [smoke.mjs](./smoke.mjs)

## Run

```bash
pnpm run example:host-openclaw
```

默认输出会先给你：

- request preview
- provider doctor receipt
- 尝试读取的 runtime preflight snapshot
- 再给一发 bounded invoke 的结果

## Related Surfaces

- [docs/compat/openclaw.md](../../../docs/compat/openclaw.md)
- [starter-packs/builders/openclaw/README.md](../../../starter-packs/builders/openclaw/README.md)
