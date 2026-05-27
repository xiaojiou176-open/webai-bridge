# Research Copilot Pack

这个 pack 适合的是先读 truth surfaces、再把研究型 copilot 接进 WebaiBridge 的宿主，而不是直接放飞成自动研究代理。

## 当前诚实边界

- `planned`
- pack-local scaffold
- truth-surface grounding checklist

## 协同入口

- current pack-local smoke:
  `pnpm exec node starter-packs/skills/research-copilot-pack/smoke.mjs`
- planned CLI route:
  `pnpm run webai-bridge:cli -- skill-pack-route --target research-copilot-pack`
- planned MCP:
  `webai-bridge.catalog.skill_pack_route`
- 当前这轮只落 pack-local scaffold，尚未把 route/catalog/index 接进共享面。

## 当前不该吹的东西

- autonomous multi-source research loop
- citation autopilot
- browser write automation

## 运行

```bash
pnpm exec node starter-packs/skills/research-copilot-pack/smoke.mjs
```
