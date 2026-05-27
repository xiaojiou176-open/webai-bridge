# WebaiBridge FAQ

## Is WebaiBridge a shared provider runtime?

Yes.

更具体地说：

`WebaiBridge` 当前把自己定义成：

- `shared provider runtime for AI apps`
- `BYOK + Web/Login`
- `service-first API substrate`

## Is WebaiBridge an AI app backend?

Partly yes, but only in a narrow sense.

它不是全家桶 AI 平台，也不是 assistant 产品。  
如果你把 “AI app backend” 理解成：

- 统一 provider access
- 统一 auth/session/diagnostics
- 暴露稳定的 service / SDK surface

那 `WebaiBridge` 确实是这类 backend/runtime。

## Does WebaiBridge support Codex today?

Partially, but only in a thin fail-closed sense.

Truthful status:

- `partial` publicly
- the repo now carries a thin runtime adapter
- `not full support`
- `no tool / MCP / worktree parity`

## Does WebaiBridge support Claude Code today?

Partially, but only in a thin fail-closed sense.

Truthful status:

- `partial` publicly
- the repo now carries a thin runtime adapter
- `not full support`
- `no terminal shell / approval / tool / MCP parity`

## Does WebaiBridge support OpenClaw today?

Partially, but only in a thin fail-closed sense.

Truthful status:

- `partial` publicly
- the repo now carries a delegation-first thin adapter
- `not full support`
- `no operator/control-plane/product-shell parity`

## Is WebaiBridge an MCP server today?

Partially yes, but only in a thin read-only sense.

当前最多能诚实说：

- repo 有 committed service runtime
- repo 有 committed SDK/client surfaces
- repo 现在也有 committed read-only MCP server/tool surface
- 但它还不是 execution brain
- 也不是 Codex / Claude Code / OpenClaw 的 full MCP parity

## What is the fastest truthful first success?

如果你现在只想先跑通一把最小成功，不要先把整个 docs 树全翻一遍。

先走这一条：

1. [docs/first-success.md](./first-success.md)
2. `pnpm run start:service-local`
3. `pnpm run example:mcp-inspector`
4. `pnpm run example:runtime-bridge`

如果你不想手动分三步，而是想直接进入本地前台体验：

- `pnpm run start:local-experience`

先把它理解成：

- 先证明 runtime 活着
- 再证明最小 invoke 能打通
- 跑成之后再去看 starter packs / host playbooks / compat docs

## Where do I see a short public proof pack instead of the full docs tree?

先看：

- [docs/public-proof-pack.md](./public-proof-pack.md)

这页不是完整手册，而是最短 proof 包：

- 今天能证明什么
- 最小 smoke 怎么跑
- 哪些话现在可以诚实说
- 哪些话现在还不能 overclaim

## Where should plugin or skills builders read the current truth?

优先读 machine-readable catalog，而不是手抄页面。

先把入口分成三类会更不容易迷路：

- 要看 surface / support truth：先读 `surface-catalog`
- 要是不知道第一站该去哪：先读 `builder-intent-router` 的 CLI/MCP 路由或 `starter-pack-chooser`
- 要看 keyword-claim truth：先读 `keyword-truth`
- 要选 builder path：先读 `starter-pack-chooser` 或 machine-readable `builder-journeys`

当前最稳定的入口是：

- `pnpm run webai-bridge:cli -- surface-catalog`
- `pnpm run webai-bridge:cli -- surface-catalog-schema`
- `pnpm run webai-bridge:cli -- compat-target-catalog`
- `pnpm run webai-bridge:cli -- compat-target-catalog-schema`
- `pnpm run webai-bridge:cli -- compat-targets`
- `pnpm run webai-bridge:cli -- compat-target --target codex`
- `pnpm run webai-bridge:cli -- compat-target --target claude-code`
- `pnpm run webai-bridge:cli -- compat-target --target openclaw`
- `pnpm run webai-bridge:cli -- builder-kit-catalog`
- `pnpm run webai-bridge:cli -- builder-kit-catalog-schema`
- `pnpm run webai-bridge:cli -- builder-kits`
- `pnpm run webai-bridge:cli -- builder-kit --target codex`
- `pnpm run webai-bridge:cli -- builder-kit --target claude-code`
- `pnpm run webai-bridge:cli -- builder-kit --target openclaw`
- `pnpm run webai-bridge:cli -- builder-kit --target mcp`
- `pnpm run webai-bridge:cli -- skill-pack-catalog`
- `pnpm run webai-bridge:cli -- skill-pack-catalog-schema`
- `pnpm run webai-bridge:cli -- skill-packs`
- `pnpm run webai-bridge:cli -- skill-pack --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- skill-pack --target docs-seo-sync-pack`
- `pnpm run webai-bridge:cli -- host-playbooks`
- `pnpm run webai-bridge:cli -- host-playbooks-schema`
- `pnpm run webai-bridge:cli -- host-playbook --target codex`
- `pnpm run webai-bridge:cli -- host-examples`
- `pnpm run webai-bridge:cli -- host-example --target codex`
- `pnpm run webai-bridge:cli -- builder-intent-router`
- `pnpm run webai-bridge:cli -- builder-intent-router-schema`
- `pnpm run webai-bridge:cli -- builder-intent --target support-truth`
- `pnpm run webai-bridge:cli -- starter-manifests`
- `pnpm run webai-bridge:cli -- starter-manifests-schema`
- `pnpm run webai-bridge:cli -- starter-examples`
- `pnpm run webai-bridge:cli -- starter-examples-schema`
- `pnpm run webai-bridge:cli -- starter-pack-index`
- `pnpm run webai-bridge:cli -- starter-pack-index-schema`
- `pnpm run webai-bridge:cli -- starter-pack-entry --target codex`
- `pnpm run webai-bridge:cli -- starter-pack-chooser`
- `pnpm run webai-bridge:cli -- starter-pack-chooser-schema`
- `pnpm run webai-bridge:cli -- starter-pack-scenario --target codex-builder`
- `pnpm run webai-bridge:cli -- starter-pack-comparison`
- `pnpm run webai-bridge:cli -- starter-pack-comparison-schema`
- `pnpm run webai-bridge:cli -- starter-pack-filter --target read-only-truth`
- `pnpm run webai-bridge:cli -- keyword-truth`
- `pnpm run webai-bridge:cli -- keyword-truth-schema`
- `pnpm run webai-bridge:cli -- keyword-entry --target webai-bridge-mcp`
- `pnpm run webai-bridge:cli -- builder-template --target codex`
- `pnpm run webai-bridge:cli -- builder-example --target codex`
- `pnpm run webai-bridge:cli -- skill-template --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- skill-example --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- provider-catalog`
- `pnpm run webai-bridge:cli -- provider-entry --target chatgpt`
- `pnpm run webai-bridge:cli -- mcp-status`
- `pnpm run webai-bridge:cli -- mcp-tools`
- `pnpm run webai-bridge:cli -- mcp-tool-catalog`
- `pnpm run webai-bridge:cli -- mcp-tool-catalog-schema`
- `pnpm run webai-bridge:cli -- mcp-tool --target webai-bridge.runtime.health`
- `catalogs/public-surface-catalog.json`
- `catalogs/public-surface-catalog.schema.json`
- `catalogs/compat-target-catalog.json`
- `catalogs/compat-target-catalog.schema.json`
- `catalogs/builder-kit-catalog.json`
- `catalogs/builder-kit-catalog.schema.json`
- `catalogs/skill-pack-catalog.json`
- `catalogs/skill-pack-catalog.schema.json`
- `catalogs/starter-pack-chooser.json`
- `catalogs/starter-pack-chooser.schema.json`
- `catalogs/starter-pack-comparison.json`
- `catalogs/starter-pack-comparison.schema.json`
- `catalogs/discoverability-keyword-truth.json`
- `catalogs/discoverability-keyword-truth.schema.json`
- `catalogs/builder-intent-router.json`
- `catalogs/builder-intent-router.schema.json`
- `catalogs/host-integration-playbooks.json`
- `catalogs/host-integration-playbooks.schema.json`
- `examples/hosts/index.json`
- `examples/hosts/index.schema.json`
- `catalogs/starter-manifest-templates.schema.json`
- `catalogs/starter-manifest-examples.schema.json`
- `catalogs/compat-target-catalog.json`
- `catalogs/builder-kit-catalog.json`
- `catalogs/builder-kit-catalog.schema.json`
- `catalogs/skill-pack-catalog.json`
- `catalogs/skill-pack-catalog.schema.json`
- `docs/provider-runtime-catalog.md`

这样做的好处是：

- plugin / skills tooling 能直接读现在的 status
- plugin / skills tooling 还能直接读“从哪条窄路开始接”
- 不会把 `partial` 误读成 `supported`
- 不会把 `MCP` 的 future direction 误读成 today shipping

## How do I choose the right starter pack?

先把这个问题理解成“导购问题”，不是“目录问题”。

也就是说：

- `starter-pack-index` 负责告诉你 pack 在哪里
- `starter-pack-chooser` 负责告诉你你该先拿哪一包

当前最短路径是：

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- `pnpm run webai-bridge:cli -- starter-pack-chooser`
- `pnpm run webai-bridge:cli -- starter-pack-scenario --target codex-builder`
- `pnpm run webai-bridge:cli -- starter-pack-scenario --target mcp-inspector`

如果你只想记一句人话：

- 要接别的工具进来，先看 builder pack
- 要做诊断或 docs/SEO 配方，先看 skill pack

## How do I compare starter packs or filter them by constraints?

先把这个问题理解成“比较问题”，不是“选一个答案”的问题。

也就是说：

- `starter-pack-chooser` 负责先选路
- `starter-pack-comparison` 负责把已经 landed 的 pack truth 并排放在一起
- `starter-pack-filter` 负责按硬条件把结果缩小

当前最短路径是：

- [catalogs/starter-pack-comparison.json](../catalogs/starter-pack-comparison.json)
- `pnpm run webai-bridge:cli -- starter-pack-comparison`
- `pnpm run webai-bridge:cli -- starter-pack-filter --target thin-runtime-bridges`
- `pnpm run webai-bridge:cli -- starter-pack-filter --target read-only-truth`

## Where do I start if I want one full builder journey instead of jumping across multiple docs?

先把这个问题理解成“路线总览问题”。

也就是说：

- `builder-journeys` 不是替代 chooser/comparison/playbooks/examples
- 它只是把这几步串成一张完整的路书

当前最短路径是：

- [catalogs/builder-journeys.json](../catalogs/builder-journeys.json)
- `pnpm run webai-bridge:cli -- builder-journeys`
- `pnpm run webai-bridge:cli -- builder-journey --target codex-first-success`

## How do I wire the chosen pack into a host?

先把这个问题理解成“宿主接入问题”，不是“选包问题”。

也就是说：

- `starter-pack-chooser` 负责告诉你该先选哪包
- `host-playbooks` 负责告诉你选完之后，接进宿主时第一步怎么走

当前最短路径是：

- [docs/host-integration-playbooks.md](./host-integration-playbooks.md)
- `pnpm run webai-bridge:cli -- host-playbooks`
- `pnpm run webai-bridge:cli -- host-playbook --target codex`
- `pnpm run webai-bridge:cli -- host-playbook --target mcp`

如果你不只是想读文字手册，而是想直接看一份 host-local config 长什么样：

- [docs/host-integration-examples.md](./host-integration-examples.md)
- `pnpm run webai-bridge:cli -- host-examples`
- `pnpm run webai-bridge:cli -- host-example --target codex`
- `pnpm run webai-bridge:cli -- host-example --target mcp`

## Is WebaiBridge SDK-first?

No.

当前更诚实的写法是：

- `API substrate first`
- `service-first / runtime-first` frontdoor
- `SDK/client` 是建立在同一 substrate 上的正式消费入口

换句话说：

> SDK 没被删掉。  
> 只是它不再被写成高于 runtime/API substrate 的第一真理源。

## What is the difference between BYOK and Web/Login?

### BYOK

- 你自己带官方 API Key
- 更接近标准 API provider 接入

### Web/Login

- 你用浏览器登录、OAuth、订阅会话
- 更接近“没有 API Key，但已有真实账号使用资格”的场景

## Where do WebaiBridge runtime caches live now?

先把这个问题理解成“仓库自己的可清理资产放哪里”，不是“电脑上一切缓存都归它管”。

当前正式规则是：

- repo-local runtime assets
  - `.runtime-cache/`
- repo-external dedicated cache root
  - `~/.cache/webai-bridge`
- shared tool caches
  - 不归当前 repo 自动清理

更直白一点说：

> 当前 repo 只清自己这两个根。
> `~/.npm`、`pnpm store`、`~/Library/Caches/ms-playwright`、Docker 全局缓存、`.serena/cache` 都不是它的自动清理对象。

默认治理参数是：

- `TTL = 7 days`
- `maxBytes = 8 GiB`

## Does WebaiBridge own my real Chrome profile?

No.

当前更准确的说法是：

- 本地 credentialed 开发默认可以指向你分配给当前 repo 的真实 Chrome Profile
- 通过：
  - `WEBAI_BRIDGE_CHROME_USER_DATA_DIR`
  - `WEBAI_BRIDGE_CHROME_PROFILE_NAME`
- 真实 Chrome Profile 是**用户资产**
- 它不属于 repo cache
- 它不会被自动清理

repo-local 的：

- `.runtime-cache/webai-bridge-web-auth-browser`

现在只是显式 opt-in 的 managed fallback，不再是默认日常工位。

## Does cloud CI use my real Chrome profile or login state?

No.

当前仓继续只用 GitHub Hosted Runner。

云端 CI 只跑 repo-side gate：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- security / repository code scanning

而这些属于 local credentialed only：

- `pnpm run verify:gemini-live`
- `pnpm run verify-web-login-live`
- `pnpm run verify:service-live`
- `pnpm run reality:gate`
- browser diagnose / capture scripts

如果在 CI 环境中误触发这些 live 路径，现在应该 fail-closed，明确报 `credentialed-workstation only`。

## Why does this repo talk about Codex, Claude Code, and OpenClaw if they are still only thin starters?

因为这些是 future consumer compat 目标，  
而当前 repo 里刚 landed 的也只是 very thin、builder-facing、fail-closed adapters。

但这仍然不等于今天已经完整支持。

这类关键词页面存在的目的，是为了：

- truthful discoverability
- 明确 planned vs supported
- 避免搜索者或 AI 工具误判

## Where should docs or SEO tooling read truthful keyword claims?

先把这个问题理解成“读词典”，不是“写广告”。

当前最短路径是：

- [docs/discoverability-keyword-truth.md](./discoverability-keyword-truth.md)
- [catalogs/discoverability-keyword-truth.json](../catalogs/discoverability-keyword-truth.json)
- [catalogs/discoverability-keyword-truth.schema.json](../catalogs/discoverability-keyword-truth.schema.json)
- `pnpm run webai-bridge:cli -- keyword-truth`
- `pnpm run webai-bridge:cli -- keyword-truth-schema`
- `pnpm run webai-bridge:cli -- keyword-entry --target webai-bridge-mcp`
- `webai-bridge.catalog.keyword_truth`
- `webai-bridge.catalog.keyword_truth_schema`
- `webai-bridge.catalog.keyword_entry`

## Where do I start if I do not yet know which truthful surface I need?

先把这个问题理解成“找分诊台”，不是“直接去某个专科门诊”。

当前最短路径是：

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- [catalogs/builder-intent-router.json](../catalogs/builder-intent-router.json)
- [catalogs/builder-intent-router.schema.json](../catalogs/builder-intent-router.schema.json)
- `pnpm run webai-bridge:cli -- builder-intent-router`
- `pnpm run webai-bridge:cli -- builder-intent --target support-truth`
- `webai-bridge.catalog.builder_intent_router`
- `webai-bridge.catalog.builder_intent`

## Where do I look if I only need thin compat target truth?

先把这个问题理解成“看兼容性目标目录卡”，不是“看整个 aggregate 大目录”。

当前最短路径是：

- [catalogs/compat-target-catalog.json](../catalogs/compat-target-catalog.json)
- [catalogs/compat-target-catalog.schema.json](../catalogs/compat-target-catalog.schema.json)
- `pnpm run webai-bridge:cli -- compat-target-catalog`
- `pnpm run webai-bridge:cli -- compat-target-catalog-schema`
- `pnpm run webai-bridge:cli -- compat-target --target codex`
- `pnpm run webai-bridge:cli -- compat-target --target claude-code`
- `pnpm run webai-bridge:cli -- compat-target --target openclaw`
- `webai-bridge.catalog.compat_target_catalog`
- `webai-bridge.catalog.compat_target_catalog_schema`
- `webai-bridge.catalog.compat_target`

## Where do I look if I only need builder kit truth?

先把这个问题理解成“看施工包目录卡”，不是“看更宽的 plugin + skill 说明书”。

当前最短路径是：

- [catalogs/builder-kit-catalog.json](../catalogs/builder-kit-catalog.json)
- [catalogs/builder-kit-catalog.schema.json](../catalogs/builder-kit-catalog.schema.json)
- `pnpm run webai-bridge:cli -- builder-kit-catalog`
- `pnpm run webai-bridge:cli -- builder-kit-catalog-schema`
- `pnpm run webai-bridge:cli -- builder-kit --target codex`
- `pnpm run webai-bridge:cli -- builder-kit --target claude-code`
- `pnpm run webai-bridge:cli -- builder-kit --target openclaw`
- `pnpm run webai-bridge:cli -- builder-kit --target mcp`
- `webai-bridge.catalog.builder_kit_catalog`
- `webai-bridge.catalog.builder_kit_catalog_schema`
- `webai-bridge.catalog.builder_kit`

## Where do I look if I only need skill pack truth?

先把这个问题理解成“看技能包目录卡”，不是“看更宽的 plugin + skill 说明书”。

当前最短路径是：

- [catalogs/skill-pack-catalog.json](../catalogs/skill-pack-catalog.json)
- [catalogs/skill-pack-catalog.schema.json](../catalogs/skill-pack-catalog.schema.json)
- `pnpm run webai-bridge:cli -- skill-pack-catalog`
- `pnpm run webai-bridge:cli -- skill-pack-catalog-schema`
- `pnpm run webai-bridge:cli -- skill-pack --target runtime-diagnostics-pack`
- `pnpm run webai-bridge:cli -- skill-pack --target docs-seo-sync-pack`
- `webai-bridge.catalog.skill_pack_catalog`
- `webai-bridge.catalog.skill_pack_catalog_schema`
- `webai-bridge.catalog.skill_pack`

## Where do I look if I only need provider ids, lanes, auth mode, or stability tiers?

先把这个问题理解成“看楼层总表”，不是“看 live 状态面板”。

当前最短路径是：

- [docs/provider-runtime-catalog.md](./provider-runtime-catalog.md)
- [catalogs/provider-runtime-catalog.json](../catalogs/provider-runtime-catalog.json)
- [catalogs/provider-runtime-catalog.schema.json](../catalogs/provider-runtime-catalog.schema.json)
- `pnpm run webai-bridge:cli -- provider-catalog`
- `pnpm run webai-bridge:cli -- provider-catalog-schema`
- `pnpm run webai-bridge:cli -- provider-entry --target chatgpt`
- `pnpm run webai-bridge:cli -- provider-entry --target gemini:web-login`
- `webai-bridge.catalog.provider_catalog`
- `webai-bridge.catalog.provider_catalog_schema`
- `webai-bridge.catalog.provider_entry`

## Where do I look if I only need the current read-only MCP tool inventory?

先把这个问题理解成“查按钮目录”，不是“查 MCP 角色总说明”。

当前最短路径是：

- [catalogs/mcp-tool-catalog.json](../catalogs/mcp-tool-catalog.json)
- [catalogs/mcp-tool-catalog.schema.json](../catalogs/mcp-tool-catalog.schema.json)
- `pnpm run webai-bridge:cli -- mcp-tool-catalog`
- `pnpm run webai-bridge:cli -- mcp-tool-catalog-schema`
- `pnpm run webai-bridge:cli -- mcp-tool --target webai-bridge.runtime.health`
- `webai-bridge.catalog.mcp_tool_catalog`
- `webai-bridge.catalog.mcp_tool_catalog_schema`
- `webai-bridge.catalog.mcp_tool`
