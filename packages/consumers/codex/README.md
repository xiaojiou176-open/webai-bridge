# @webai-bridge/consumer-codex

`@webai-bridge/consumer-codex` 是 `WebaiBridge` 给 `Codex` 形状工作流准备的 **thin compat adapter**。

最重要的一句真话是：

> 它是 **partial / fail-closed / builder-facing runtime bridge**，不是 full Codex parity。

## Current Honest Role

- `partial`
- `thin compat`
- `responses-style runtime bridge`
- `service-runtime delegated`

当前它解决的是：

- 把 Codex 风格的文本请求转成 `WebaiBridge` runtime invoke
- 保留 provider / lane 选择
- 对 tool / MCP / worktree / shell parity 继续 fail-closed

## Not This Package

这个包当前**不**承诺：

- tool execution parity
- worktree parity
- MCP parity
- Codex shell recreation

## Use It With

- [docs/compat/codex.md](../../../docs/compat/codex.md)
- [starter-packs/README.md](../../../starter-packs/README.md)
- [starter-packs/builders/codex/README.md](../../../starter-packs/builders/codex/README.md)
- [examples/hosts/codex/README.md](../../../examples/hosts/codex/README.md)

## Use Today

- 本地源码接入
  - 用下面的 local workspace usage 直接接 `http://127.0.0.1:4010`
- starter pack 路线
  - 先看 [starter-packs/builders/codex/README.md](../../../starter-packs/builders/codex/README.md)
- 当前还不能说
  - `official Codex listing` / `full Codex support`

## Local Workspace Usage

```ts
import { createCodexCompatAdapter } from "@webai-bridge/consumer-codex";

const adapter = createCodexCompatAdapter({
  baseUrl: "http://127.0.0.1:4010",
});
```

## Public Distribution Truth

- current repo status:
  - publish-ready package metadata landed
  - no npm publish claimed yet
- honest outward wording:
  - `partial Codex compatibility`
  - `thin compat adapter`
  - `builder-facing runtime bridge`

不要把这个包说成：

- `official Codex marketplace plugin`
- `full Codex support`
- `tool or MCP parity`
