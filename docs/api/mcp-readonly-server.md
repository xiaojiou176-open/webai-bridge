# WebaiBridge Read-only MCP Server

This page documents the committed MCP slice that exists today.

这页只写今天已经 landed 的那一小片，不把未来梦想偷写成今天支持。

## Current Status

- `partial`
- `read-only MCP server starter landed on main`
- `stdio transport only`
- `no runtime invoke / acquisition write path`
- `no bridge host / no Codex or Claude Code parity`

更直白一点说：

> 现在已经有一台“只读查询终端”接到 `WebaiBridge` runtime 上了。  
> 你可以查库存、看诊断、读状态。  
> 但你还不能把它当成全功能工具中枢，更不能把它吹成完整 MCP backend。

## Source Anchors

- `packages/surfaces/mcp/src/index.ts`
- `scripts/webai-bridge-mcp.mjs`
- `tests/unit/mcp/webai-bridge-mcp.test.ts`

## What It Exposes

当前这条 slice 只暴露 **read-only** 工具。

更适合的理解方式不是死背长清单，而是按“我要查什么”来分组：

### Runtime / provider truth

- `webai-bridge.runtime.bootstrap`
- `webai-bridge.providers.list`
- `webai-bridge.runtime.health`
- `webai-bridge.runtime.doctor`
- `webai-bridge.runtime.plan`
- `webai-bridge.auth.status`
- `webai-bridge.provider.status`
- `webai-bridge.provider.doctor`
- `webai-bridge.provider.probe`
- `webai-bridge.provider.remediation`
- `webai-bridge.provider.current_page`
- `webai-bridge.provider.current_console`
- `webai-bridge.provider.current_network`
- `webai-bridge.provider.store_readiness`
- `webai-bridge.provider.live_readiness`
- `webai-bridge.provider.attach_target`
- `webai-bridge.provider.diagnose_ladder`
- `webai-bridge.provider.support_bundle`
- `webai-bridge.provider.diagnose`

### Surface / compat / provider catalog truth

- `webai-bridge.catalog.surface_catalog`
- `webai-bridge.catalog.surface_catalog_schema`
- `webai-bridge.catalog.compat_target_catalog`
- `webai-bridge.catalog.compat_target_catalog_schema`
- `webai-bridge.catalog.provider_catalog`
- `webai-bridge.catalog.provider_catalog_schema`
- `webai-bridge.catalog.provider_entry`
- `webai-bridge.catalog.compat_targets`
- `webai-bridge.catalog.compat_target`

### Builder kits / skill packs / starter-pack routing truth

- `webai-bridge.catalog.builder_kit_catalog`
- `webai-bridge.catalog.builder_kit_catalog_schema`
- `webai-bridge.catalog.builder_kits`
- `webai-bridge.catalog.builder_kit`
- `webai-bridge.catalog.skill_pack_catalog`
- `webai-bridge.catalog.skill_pack_catalog_schema`
- `webai-bridge.catalog.skill_packs`
- `webai-bridge.catalog.skill_pack`
- `webai-bridge.catalog.skill_pack_routes`
- `webai-bridge.catalog.skill_pack_routes_schema`
- `webai-bridge.catalog.skill_pack_route`
- `webai-bridge.catalog.starter_manifests`
- `webai-bridge.catalog.starter_manifests_schema`
- `webai-bridge.catalog.starter_examples`
- `webai-bridge.catalog.starter_examples_schema`
- `webai-bridge.catalog.starter_pack_index`
- `webai-bridge.catalog.starter_pack_index_schema`
- `webai-bridge.catalog.starter_pack_entry`
- `webai-bridge.catalog.starter_pack_chooser`
- `webai-bridge.catalog.starter_pack_chooser_schema`
- `webai-bridge.catalog.starter_pack_scenario`
- `webai-bridge.catalog.starter_pack_comparison`
- `webai-bridge.catalog.starter_pack_comparison_schema`
- `webai-bridge.catalog.starter_pack_filter`

### Builder journey / keyword truth / host integration truth

- `webai-bridge.catalog.builder_journeys`
- `webai-bridge.catalog.builder_journeys_schema`
- `webai-bridge.catalog.builder_journey`
- `webai-bridge.catalog.builder_intent_router`
- `webai-bridge.catalog.builder_intent_router_schema`
- `webai-bridge.catalog.builder_intent`
- `webai-bridge.catalog.keyword_truth`
- `webai-bridge.catalog.keyword_truth_schema`
- `webai-bridge.catalog.keyword_entry`
- `webai-bridge.catalog.host_playbooks`
- `webai-bridge.catalog.host_playbooks_schema`
- `webai-bridge.catalog.host_playbook`
- `webai-bridge.catalog.host_examples`
- `webai-bridge.catalog.host_examples_schema`
- `webai-bridge.catalog.host_example`

### Template / example truth and MCP self-description

- `webai-bridge.catalog.builder_template`
- `webai-bridge.catalog.builder_example`
- `webai-bridge.catalog.skill_template`
- `webai-bridge.catalog.skill_example`
- `webai-bridge.catalog.mcp_status`
- `webai-bridge.catalog.mcp_tools`
- `webai-bridge.catalog.mcp_tool_catalog`
- `webai-bridge.catalog.mcp_tool_catalog_schema`
- `webai-bridge.catalog.mcp_tool`

这些工具都只做一件事：

> **把现有 service-runtime inspection surfaces，以及已经 landed 的 catalog / provider / template / example truth，一起通过 MCP tool shape 重新暴露出来。**

## What It Does Not Expose

当前这条 MCP slice 仍然 **fail-closed** 于下面这些方向：

- runtime invoke
- acquisition start / capture
- browser automation
- tool execution
- bridge hosting
- product-shell parity

这点很重要，因为它决定了这条能力只能诚实写成 `partial`，不能写成 `supported now`。

## How To Run It

```bash
pnpm run webai-bridge:mcp -- --base-url http://127.0.0.1:4010
```

如果你不传 `--base-url`，它会按当前 repo 的 runtime 规则回退到：

- `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- 或 `http://127.0.0.1:${WEBAI_BRIDGE_SERVICE_PORT || 4010}`

## Verification

当前最稳的本地 smoke 路径有两条：

```bash
pnpm run test:mcp:smoke
pnpm run webai-bridge:cli -- mcp-tools --json
pnpm run webai-bridge:cli -- runtime-doctor --json
pnpm run webai-bridge:cli -- runtime-plan --json
pnpm run webai-bridge:cli -- compat-target-catalog --json
pnpm run webai-bridge:cli -- builder-kit-catalog --json
pnpm run webai-bridge:cli -- skill-pack-catalog --json
pnpm run webai-bridge:cli -- skill-pack-routes --json
pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack --json
pnpm run webai-bridge:cli -- mcp-tool-catalog --json
pnpm run webai-bridge:cli -- provider-doctor --provider chatgpt --json
```

这里第一条现在不只是“工具注册单测”。

它还包含一条 **真实 stdio roundtrip smoke**：

- 本地起一个最小 HTTP mock runtime
- 启动 `pnpm run webai-bridge:mcp`
- 用真实 MCP client 连接 stdio transport
- 调一次 `webai-bridge.runtime.health`

也就是说，当前这条只读 MCP surface 已经不只是“文档里写了有工具名”，而是有一条最小真实连通证据。

## Fastest Route By Question

如果你不想在长清单里自己找按钮，先按问题分：

- 我想查某个 provider 现在能不能用：
  - 先看 `webai-bridge.provider.status`
  - 想把 `policy pack / dispatch / remediation` 一次对齐时先看 `webai-bridge.provider.doctor`
  - 再看 `webai-bridge.provider.probe`
  - 需要更细诊断时用 `webai-bridge.provider.support_bundle`
- 我想先看整座 runtime 的总账本或任务级推荐：
  - 先看 `webai-bridge.runtime.doctor`
  - 再看 `webai-bridge.runtime.plan`
  - 这两条现在也会带 `activePolicyPack`，告诉你当前策略包偏向哪条 lane、是否要求 official API、是否 strict fail-closed
  - 如果 planner request 叠加了额外约束，`activePolicyPack` 反映的是 effective policy
- 我想知道 repo 现在到底对外暴露了哪些 surface / compat target：
  - 先看 `webai-bridge.catalog.surface_catalog`
  - 再看 `webai-bridge.catalog.compat_target_catalog`
  - 再看 `webai-bridge.catalog.compat_targets`
- 我想选 starter pack / builder path：
  - 如果你只想看 builder kits 自己的目录卡，先看 `webai-bridge.catalog.builder_kit_catalog`
  - 如果你只想看 skill packs 自己的目录卡，先看 `webai-bridge.catalog.skill_pack_catalog`
  - 如果你想看一条 skill pack 到 CLI/MCP 的 route card，先看 `webai-bridge.catalog.skill_pack_route`
  - 如果第一站都还没想清楚，先看 `webai-bridge.catalog.builder_intent_router`
  - 先看 `webai-bridge.catalog.starter_pack_chooser`
  - 再看 `webai-bridge.catalog.starter_pack_comparison`
  - 想直接走一条完整路径时看 `webai-bridge.catalog.builder_journeys`
- 我想做 docs / SEO / truth-safe outward sync：
  - 先看 `webai-bridge.catalog.keyword_truth`
  - 定点查一条时用 `webai-bridge.catalog.keyword_entry`
- 我已经决定要接进某个宿主：
  - 先看 `webai-bridge.catalog.host_playbook`
  - 再看 `webai-bridge.catalog.host_example`

## Best Use Case

这条 slice 现在最适合：

- plugin builders
- skills packs
- local automation glue
- read-only runtime inspection

不适合：

- 充当 execution brain
- 冒充 full MCP backend
- 替代当前 HTTP/API substrate

## Relationship To Other Surfaces

- `HTTP/API`
  - 仍然是当前主前门
- `CLI`
  - 更像只读仪表盘
- `MCP`
  - 现在多了一台只读查询终端

所以今天最诚实的话不是：

> `WebaiBridge ships full MCP support today`

而是：

> `WebaiBridge now carries a partial read-only MCP server starter on main.`
