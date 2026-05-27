# Compare Runtime Pack

这个 pack 适合的是先把 starter packs / runtime options 并排对齐，再做 compare-first 决策，不是让系统替你自动宣布赢家。

## 当前诚实边界

- `planned`
- pack-local scaffold
- compare-first decision worksheet

## 协同入口

- current pack-local smoke:
  `pnpm exec node starter-packs/skills/compare-runtime-pack/smoke.mjs`
- planned CLI route:
  `pnpm run webai-bridge:cli -- skill-pack-route --target compare-runtime-pack`
- planned MCP:
  `webai-bridge.catalog.skill_pack_route`
- 当前这轮只落 pack-local scaffold，尚未把 route/catalog/index 接进共享面。

## 当前不该吹的东西

- automatic winner selection
- live benchmark automation
- consumer parity scoring

## 运行

```bash
pnpm exec node starter-packs/skills/compare-runtime-pack/smoke.mjs
```
