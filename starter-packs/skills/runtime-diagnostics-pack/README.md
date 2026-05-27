# Runtime Diagnostics Pack

这个 pack 适合的是只读 provider triage。

## 当前诚实边界

- `partial`
- read-only diagnostics
- no invoke/write actions

## 协同入口

- CLI:
  `pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack`
- MCP:
  `webai-bridge.catalog.skill_pack_route`
- 这张 route card 会把 pack、CLI、MCP 的只读诊断入口对齐成同一条安全起手线。

## 当前不该吹的东西

- browser automation
- acquisition write
- execution-brain parity

## 运行

```bash
pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack
pnpm run start:service-local
pnpm run starter-pack:runtime-diagnostics-pack
```
