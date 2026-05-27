# WebaiBridge Copy-Ready Starter Packs

这里可以先把它理解成 `WebaiBridge` 的整包样板间。

说得更直白一点：

- `docs/starter-pack-chooser.md` 像前台导购
- `catalogs/starter-manifest-templates*.json` 像标准模板
- `catalogs/starter-manifest-examples*.json` 像可参考的样例
- `examples/` 像按场景划分的演示样板间
- `starter-packs/` 这里则是按 **目标对象** 拆好的整包 starter

这些 pack 的定位非常窄，也非常诚实：

- builder-facing
- local-first
- partial
- fail-closed

它们不是 shipped plugin packages，也不是 full parity 承诺。

如果你现在最关心的是：

> **“我先跑哪一条最短路径，才能确认 `WebaiBridge` 真的活着？”**

先看：

- [docs/first-success.md](../docs/first-success.md)
- [docs/public-proof-pack.md](../docs/public-proof-pack.md)

## Machine-readable Index

如果你不想自己扫目录，还可以直接读：

- [starter-packs/index.json](./index.json)
- [starter-packs/index.schema.json](./index.schema.json)
- [docs/starter-pack-chooser.md](../docs/starter-pack-chooser.md)

或者直接用：

```bash
pnpm run webai-bridge:cli -- starter-pack-index
pnpm run webai-bridge:cli -- starter-pack-index-schema
pnpm run webai-bridge:cli -- starter-pack-entry --target codex
pnpm run webai-bridge:cli -- starter-pack-entry --target runtime-diagnostics-pack
pnpm run webai-bridge:cli -- starter-pack-chooser
pnpm run webai-bridge:cli -- starter-pack-scenario --target codex-builder
```

## 当前 pack 一览

| Pack | 目录 | 作用 | 运行入口 |
| --- | --- | --- | --- |
| `codex` | `starter-packs/builders/codex/` | text-only thin runtime bridge | `pnpm run starter-pack:codex` |
| `claude-code` | `starter-packs/builders/claude-code/` | message/runtime bridge | `pnpm run starter-pack:claude-code` |
| `openclaw` | `starter-packs/builders/openclaw/` | delegation-first runtime bridge | `pnpm run starter-pack:openclaw` |
| `mcp` | `starter-packs/builders/mcp/` | read-only MCP inspector | `pnpm run starter-pack:mcp` |
| `runtime-diagnostics-pack` | `starter-packs/skills/runtime-diagnostics-pack/` | read-only provider triage | `pnpm run starter-pack:runtime-diagnostics-pack` |
| `docs-seo-sync-pack` | `starter-packs/skills/docs-seo-sync-pack/` | truth-safe docs / SEO sync helper | `pnpm run starter-pack:docs-seo-sync-pack` |
| `chat-app-runtime-pack` | `starter-packs/skills/chat-app-runtime-pack/` | chat host runtime bridge planning pack | `pnpm exec node starter-packs/skills/chat-app-runtime-pack/smoke.mjs` |
| `research-copilot-pack` | `starter-packs/skills/research-copilot-pack/` | truth-surface-first research copilot scaffold | `pnpm exec node starter-packs/skills/research-copilot-pack/smoke.mjs` |
| `compare-runtime-pack` | `starter-packs/skills/compare-runtime-pack/` | compare-first runtime decision worksheet | `pnpm exec node starter-packs/skills/compare-runtime-pack/smoke.mjs` |
| `byok-first-safe-pack` | `starter-packs/skills/byok-first-safe-pack/` | BYOK-first safe invoke planning pack | `pnpm exec node starter-packs/skills/byok-first-safe-pack/smoke.mjs` |

## 每个 pack 都包含什么

- `README.md`
  - 讲清楚这个 pack 适合干什么、不适合干什么
- `template.json`
  - 一个符合 starter-template schema 的最小模板文档
- `example.json`
  - 一个符合 starter-example schema 的最小样例文档
- `smoke.mjs`
  - 一个 pack-local smoke script

## 使用方式

如果你只是想看 shape，先看：

- `template.json`
- `example.json`

如果你想走到第一把可运行的成功，再看：

- `README.md`
- `smoke.mjs`

如果这些 smoke 要连当前本机 runtime，先在另一个终端启动：

```bash
pnpm run start:service-local
```

如果 runtime 不在默认 `127.0.0.1:4010`，再额外设置：

```bash
export WEBAI_BRIDGE_RUNTIME_BASE_URL=http://host:port
```

## 重要边界

这些 pack 只能诚实宣称：

- thin runtime bridge
- read-only MCP inspection
- read-only diagnostics
- truth-safe docs / SEO sync

不能诚实宣称：

- full Codex parity
- full Claude Code parity
- full OpenClaw parity
- MCP execution brain
- plugin distribution platform
- 自动化 marketing autopilot
