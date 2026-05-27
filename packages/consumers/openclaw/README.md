# @webai-bridge/consumer-openclaw

`@webai-bridge/consumer-openclaw` 是 `WebaiBridge` 给 `OpenClaw` 风格 delegation 工作流准备的 **thin compat adapter**。

最重要的一句真话：

> 它借的是 delegation 形状，**不是**复制 OpenClaw 的 product shell。

## Current Honest Role

- `partial`
- `thin compat`
- `delegation-first runtime bridge`
- `fail-closed`

## What It Does

- 接住 delegation-first request envelope
- 暴露 `previewDelegation()`，先给 builder 看实际会打到哪条 runtime 路由、请求体会被规范成什么样
- 暴露 `readDispatchPlan()`，把当前 runtime 的 lane 选择和 credential state 真相读出来
- 暴露 `readProviderDoctor()`，把 provider policy、dispatch truth、alignment、下一步 CLI/MCP 入口压成一张 builder receipt
- 暴露 `bootstrapDelegation()`、`healthDelegation()`、`preflightDelegation()`，让 host 在第一次 invoke 前先看 frontdoor / health / dispatch truth
- 把请求委托给 `WebaiBridge` service runtime

## What It Does Not Claim

- OpenClaw product-shell parity
- operator/control-plane parity
- channel shell parity
- full OpenClaw compatibility

## Use It With

- [docs/compat/openclaw.md](../../../docs/compat/openclaw.md)
- [docs/runbooks/dev-bootstrap.md](../../../docs/runbooks/dev-bootstrap.md)
- [starter-packs/builders/openclaw/README.md](../../../starter-packs/builders/openclaw/README.md)
- [examples/hosts/openclaw/README.md](../../../examples/hosts/openclaw/README.md)

## Use Today

- 本地源码接入
  - 用下面的 local workspace usage 直接接 `http://127.0.0.1:4010`
- starter pack / OpenClaw-compatible bundle
  - 先看 [starter-packs/builders/openclaw/README.md](../../../starter-packs/builders/openclaw/README.md)
  - 再看 [distribution/claude-marketplace/README.md](../../../distribution/claude-marketplace/README.md)
- 当前还不能说
  - `official OpenClaw / ClawHub listing` / `product-shell parity`

## Local Workspace Usage

```ts
import { createOpenClawCompatAdapter } from "@webai-bridge/consumer-openclaw";

const adapter = createOpenClawCompatAdapter({
  baseUrl: "http://127.0.0.1:4010",
});

const preview = adapter.previewDelegation({
  model: "chatgpt/gpt-4o",
  lane: "web",
  input: "Summarize the current provider remediation summary.",
});

const doctor = await adapter.readProviderDoctor({
  model: "chatgpt/gpt-4o",
  lane: "web",
  input: "Summarize the current provider remediation summary.",
});

const preflight = await adapter.preflightDelegation({
  model: "chatgpt/gpt-4o",
  lane: "web",
  input: "Summarize the current provider remediation summary.",
});

const result = await adapter.delegateTurn({
  model: "chatgpt/gpt-4o",
  lane: "web",
  input: "Summarize the current provider remediation summary.",
});
```

这三步的人话版本是：

- 先看 `previewDelegation()`，确认 builder 自己准备发送的请求会被怎样规范化
- 再看 `readProviderDoctor()`，确认 provider policy / dispatch / remediation 已经被压成同一张只读对账单
- 再看 `preflightDelegation()`，确认当前 runtime 的 bootstrap / health / dispatch-plan 真相
- 最后才 `delegateTurn()`，把真正的一次请求交给 `WebaiBridge`

## Public Distribution Truth

- current repo status:
  - publish-ready package metadata landed
  - no npm publish claimed yet
- honest outward wording:
  - `partial OpenClaw compatibility`
  - `delegation-first bridge`
  - `without product-shell inheritance`

不要把这个包说成：

- `official OpenClaw marketplace plugin`
- `full OpenClaw support`
- `operator/control-plane parity`
