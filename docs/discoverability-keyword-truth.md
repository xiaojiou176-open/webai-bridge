# WebaiBridge Keyword Truth Table

这页不是营销话术。  
它是一个“哪些关键词现在能诚实占位，哪些还不能”的总表。

## Machine-readable Source

- [catalogs/discoverability-keyword-truth.json](../catalogs/discoverability-keyword-truth.json)
- [catalogs/discoverability-keyword-truth.schema.json](../catalogs/discoverability-keyword-truth.schema.json)

## Read-only CLI Access

```bash
pnpm run webai-bridge:cli -- keyword-truth
pnpm run webai-bridge:cli -- keyword-truth-schema
pnpm run webai-bridge:cli -- keyword-entry --target webai-bridge-mcp
```

## Read-only MCP Access

- `webai-bridge.catalog.keyword_truth`
- `webai-bridge.catalog.keyword_truth_schema`
- `webai-bridge.catalog.keyword_entry`

## Claimable Now

- `WebaiBridge`
- `shared provider runtime`
- `AI app backend`
- `BYOK`
- `Web/Login`
- `service-first AI runtime`
- `API substrate first`

## Partial, Not Full Compatibility Yet

- `WebaiBridge Codex`
- `WebaiBridge Claude Code`
- `WebaiBridge OpenClaw`
- `@webai-bridge/consumer-codex`
- `@webai-bridge/consumer-claude-code`
- `@webai-bridge/consumer-openclaw`

这些词现在可以出现在 docs/compat 页面里，  
但必须伴随清楚的 `partial / thin adapter / not full compatibility yet` 标签。

## Partial, But Still Narrow

- `WebaiBridge MCP`

这个词现在可以出现，但 companion label 必须更窄：

- `partial`
- `read-only MCP server`
- `not an execution brain`
- `not full Codex / Claude Code backend parity`
- `@webai-bridge/surface-mcp`

## Not Claimable

以下说法现在不诚实：

- `WebaiBridge supports Codex today`
- `WebaiBridge supports Claude Code today`
- `WebaiBridge supports OpenClaw today`
- `WebaiBridge MCP has full parity today`
- `WebaiBridge ships a full MCP execution backend today`
- `@webai-bridge/consumer-codex available on npm now`
- `@webai-bridge/consumer-claude-code available on npm now`
- `@webai-bridge/consumer-openclaw available on npm now`
- `@webai-bridge/surface-mcp available on npm now`

## Why This Table Exists

因为 AI 工具、搜索引擎、开发者读者都会抓关键词。  
如果没有这张表，项目很容易在 `partial` 与 `supported` 之间被误读。

更直白一点说：

> Markdown 负责给人类看懂，  
> JSON/schema 负责让机器也别再靠猜。
