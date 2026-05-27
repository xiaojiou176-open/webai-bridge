# Docs SEO Sync Pack

这个 pack 适合的是 truth-safe docs / SEO sync，不是营销自动机。

## 当前诚实边界

- `partial`
- truth-sync helper
- discoverability helper

## 协同入口

- CLI:
  `pnpm run webai-bridge:cli -- skill-pack-route --target docs-seo-sync-pack`
- MCP:
  `webai-bridge.catalog.skill_pack_route`
- 这张 route card 会把 pack、本地 catalog 和 MCP 只读入口对齐，避免手工拼接 truth surfaces。

## 当前不该吹的东西

- launch automation
- marketing autopilot
- claim escalation without review

## 运行

```bash
pnpm run webai-bridge:cli -- skill-pack-route --target docs-seo-sync-pack
pnpm run starter-pack:docs-seo-sync-pack
```
