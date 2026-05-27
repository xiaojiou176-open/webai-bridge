# BYOK First Safe Pack

这个 pack 适合的是先走 BYOK lane、先把最小安全边界讲清，再决定要不要碰更重的 Web/Login 现实约束的宿主。

## 当前诚实边界

- `planned`
- pack-local scaffold
- BYOK-first safe invoke planning

## 协同入口

- current pack-local smoke:
  `pnpm exec node starter-packs/skills/byok-first-safe-pack/smoke.mjs`
- planned CLI route:
  `pnpm run webai-bridge:cli -- skill-pack-route --target byok-first-safe-pack`
- planned MCP:
  `webai-bridge.catalog.skill_pack_route`
- 当前这轮只落 pack-local scaffold，尚未把 route/catalog/index 接进共享面。

## 当前不该吹的东西

- key storage workflow
- web-login session recovery
- automatic provider failover

## 运行

```bash
pnpm exec node starter-packs/skills/byok-first-safe-pack/smoke.mjs
```
