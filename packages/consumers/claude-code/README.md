# @webai-bridge/consumer-claude-code

`@webai-bridge/consumer-claude-code` 是 `WebaiBridge` 给 `Claude Code` 风格消息流准备的 **thin compat adapter**。

一句最重要的人话：

> 它像一个窄桥，只负责把 message/runtime 形状对齐，**不是**把 Claude Code 的终端壳整套搬进来。

## Current Honest Role

- `partial`
- `thin compat`
- `message/runtime bridge`
- `fail-closed`

## What It Does

- 接住 Claude Code 风格的 message payload
- 转成 `WebaiBridge` runtime invoke 请求
- 对 terminal / approval / tool plane 继续 fail-closed

## What It Does Not Claim

- terminal shell parity
- approval UI parity
- tool parity
- MCP parity
- full Claude Code compatibility

## Use It With

- [docs/compat/claude-code.md](../../../docs/compat/claude-code.md)
- [starter-packs/README.md](../../../starter-packs/README.md)
- [starter-packs/builders/claude-code/README.md](../../../starter-packs/builders/claude-code/README.md)
- [examples/hosts/claude-code/README.md](../../../examples/hosts/claude-code/README.md)

## Use Today

- 本地源码接入
  - 用下面的 local workspace usage 直接接 `http://127.0.0.1:4010`
- starter pack / marketplace-compatible bundle
  - 先看 [starter-packs/builders/claude-code/README.md](../../../starter-packs/builders/claude-code/README.md)
  - 再看 [distribution/claude-marketplace/README.md](../../../distribution/claude-marketplace/README.md)
- 当前还不能说
  - `official Claude Code listing` / `full Claude Code parity`

## Local Workspace Usage

```ts
import { createClaudeCodeCompatAdapter } from "@webai-bridge/consumer-claude-code";

const adapter = createClaudeCodeCompatAdapter({
  baseUrl: "http://127.0.0.1:4010",
});
```

## Public Distribution Truth

- current repo status:
  - publish-ready package metadata landed
  - no npm publish claimed yet
- honest outward wording:
  - `partial Claude Code compatibility`
  - `thin message/runtime adapter`
  - `fail-closed bridge`

不要把这个包说成：

- `official Claude Code marketplace plugin`
- `full Claude Code support`
- `terminal or approval parity`
