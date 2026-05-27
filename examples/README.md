# WebaiBridge Runnable Starter Mini-projects

这页可以先当成 `WebaiBridge` 的样板间入口。

说人话：

- `docs/starter-pack-chooser.md` 像前台导购
- `catalogs/starter-manifest-templates.json` / `catalogs/starter-manifest-examples.json` 像摆在桌上的样板配置
- `examples/` 这里则像真的把厨房、插座、开关都接好了的样板间
- `starter-packs/` 则像已经按目标打包好的搬运箱

如果你是外部 builder，最容易卡住的通常不是“JSON 长什么样”，而是：

> 第一把到底怎么跑通。

所以这里给的是 **可直接执行的最小 starter mini-projects**。

如果你还没决定第一步到底该先跑哪一个，
先别从这里直接盲选，先看：

- [docs/first-success.md](../docs/first-success.md)
- [docs/public-proof-pack.md](../docs/public-proof-pack.md)

## 当前 runnable starters

- [examples/runtime-bridge/README.md](./runtime-bridge/README.md)
  - 最小 thin runtime bridge
  - 目标：直接打一次 `/v1/runtime/invoke`
- [examples/mcp-inspector/README.md](./mcp-inspector/README.md)
  - 最小 read-only MCP inspector
  - 目标：连上 `pnpm run webai-bridge:mcp`，列出工具，再读一次 health
- [examples/runtime-diagnostics/README.md](./runtime-diagnostics/README.md)
  - 最小 read-only diagnostics triage
  - 目标：一次性把 provider status / probe / remediation / support bundle 拉回来
- [examples/hosts/README.md](./hosts/README.md)
  - 最小 host-local runnable glue
  - 目标：把 `Codex / Claude Code / OpenClaw / MCP` 的 host examples 跑到第一把 bounded first success

## 快速运行

```bash
pnpm run example:runtime-bridge
pnpm run example:mcp-inspector
pnpm run example:runtime-diagnostics
pnpm run example:host-codex
pnpm run example:host-claude-code
pnpm run example:host-openclaw
pnpm run example:host-mcp
```

默认会读：

- `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- 或 `http://127.0.0.1:${WEBAI_BRIDGE_SERVICE_PORT || 4010}`

这些 starter 的共同前提也必须说清楚：

- 你本机已经有一个可访问的 `WebaiBridge` runtime
- 你为目标 lane/provider 准备了自己合法拥有的凭证或登录态
- 它们证明的是 **starter 能跑**，不是“平台会替你解决所有凭证问题”

## 它们解决什么问题

- 外部 builder 不用从空白文件开始猜请求形状
- MCP client 不用自己先手搓第一条 stdio smoke
- diagnostics tooling 不用先在 CLI / HTTP / docs 三处来回拼接 triage 路径

## 它们不代表什么

- 不代表 shipped plugin packages
- 不代表 full Codex / Claude Code / OpenClaw parity
- 不代表 MCP execution brain
- 不代表 acquisition write plane 已开放

最诚实的理解是：

> 这是帮助 builder 更快跑到 **first success** 的样板间，  
> 不是把当前 repo 吹成已经交付完整产品壳。

如果你更想“复制一整套 starter 目录”而不是直接运行 demo：

- [starter-packs/README.md](../starter-packs/README.md)

如果你已经选好了 starter pack，下一句问题变成：

> **“那我接进 Codex / Claude Code / OpenClaw / MCP 宿主时，第一步怎么写？”**

那继续看：

- [docs/host-integration-playbooks.md](../docs/host-integration-playbooks.md)
- [examples/hosts/README.md](./hosts/README.md)
