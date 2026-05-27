# Chat App Runtime Pack

这个 pack 适合的是已有 chat UI、但只想先接一层 WebaiBridge service-first runtime bridge 的宿主。

## 当前诚实边界

- `planned`
- pack-local scaffold
- host-side runtime bridge planning

## 协同入口

- current pack-local smoke:
  `pnpm exec node starter-packs/skills/chat-app-runtime-pack/smoke.mjs`
- planned CLI route:
  `pnpm run webai-bridge:cli -- skill-pack-route --target chat-app-runtime-pack`
- planned MCP:
  `webai-bridge.catalog.skill_pack_route`
- 当前这轮只落 pack-local scaffold，尚未把 route/catalog/index 接进共享面。

## 当前不该吹的东西

- full chat product scaffold
- tool-using agent shell
- browser/session write automation

## 运行

```bash
pnpm exec node starter-packs/skills/chat-app-runtime-pack/smoke.mjs
```
