# WebaiBridge SDK Quickstart

This quickstart focuses on what is committed today.

这页只写今天已经落地的 SDK / client 用法，不提前假装 future compat 已经支持。

> `SDK/client` 是建立在同一 runtime/API substrate 上的消费入口。  
> 它不是另一套独立真理源。

## What Exists Now

- BYOK-oriented SDK client
- service client for the HTTP runtime surface
- web runtime SDK helpers

Source anchors:

- `packages/sdk/src/index.ts`
- `packages/surfaces/sdk-client/src/client.ts`
- `packages/surfaces/sdk-client/src/service-client.ts`
- `packages/sdk/src/web.ts`

## Install in a Workspace

在 monorepo 内部，当前通常直接从工作区包导入。

```ts
import { createWebaiBridgeSdk } from "@webai-bridge/sdk";
import { createWebaiBridgeServiceClient } from "@webai-bridge/sdk";
```

## BYOK Example

```ts
import { createWebaiBridgeSdk } from "@webai-bridge/sdk";

const sdk = createWebaiBridgeSdk();

const result = await sdk.generateText({
  model: "gemini/gemini-2.5-flash",
  prompt: "Reply with exactly HELLO and nothing else.",
});

if (result.ok) {
  console.log(result.text);
} else {
  console.log(result.diagnostics);
}
```

## Service Client Example

```ts
import { createWebaiBridgeServiceClient } from "@webai-bridge/sdk";

const client = createWebaiBridgeServiceClient({
  baseUrl: "http://127.0.0.1:4010",
});

const providers = await client.listProviders();
const health = await client.health();
const runtimeDoctor = await client.runtimeDoctor();
const runtimePlan = await client.runtimePlan({
  policyProfile: "official-api-first",
  requiredCapabilities: ["tool-calling"],
  allowWebLogin: true,
});
const storeReadiness = await client.providerStoreReadiness("chatgpt");
const liveReadiness = await client.providerLiveReadiness("chatgpt");
const attachTarget = await client.providerAttachTarget("chatgpt");
const diagnoseLadder = await client.providerDiagnoseLadder("chatgpt");
const diagnose = await client.providerDiagnose("chatgpt");
const doctor = await client.providerDoctor("chatgpt");
const dispatchPlan = await client.dispatchPlan({
  provider: "gemini",
  model: "gemini-2.5-flash",
  input: "Reply with exactly HELLO and nothing else.",
});

const invoke = await client.invoke({
  provider: "chatgpt",
  model: "gpt-4o",
  input: "Reply with exactly HELLO and nothing else.",
});
```

如果你想看得更细一点，可以先这样理解：

- `providerStoreReadiness()` 像看“钥匙和证件有没有放进抽屉”
- `providerLiveReadiness()` 像看“人是不是已经站在正确房门前，而且门把手能转”
- `runtimeDoctor()` 像看整座 runtime 的总账本，现在它还会带一张 `controlLedger`
  - 也会带 `activePolicyPack / availablePolicyPacks`
  - 让 builder 知道当前策略包偏向哪条 lane、是否要求 official API、是否 strict fail-closed
- `runtimePlan()` 像让 runtime 先按任务要求帮你挑 provider/lane/model
  - 也会把当前 `activePolicyPack` 一起带回来
  - 如果这次请求叠加了 `requireOfficialApi / requireToolCalling / allowWebLogin`
    这类 planner flags，`activePolicyPack` 代表的是这次请求真正生效的 policy
- `dispatchPlan()` 现在也会带 `activePolicyPack`
  - 让 builder 在真正执行前先看清这次请求的 effective policy
- `providerDiagnose()` 像拿整张体检单
- `providerDoctor()` 像把“策略脑 + 体检单 + 下一步建议”压成一张 builder receipt
- `providerDiagnoseLadder()` 像医生给你的下一步处理顺序
- `invoke.receipt` 像执行回执：
  - 当前 `activePolicyPack` 到底是谁
  - 为什么这样选 lane / provider
  - 现在应该回到哪条 doctor/plan 路由
  - 如果继续排障，该走哪张 remediation workflow

如果传了未知 `policyProfile`，service client 当前会在
`runtimePlan / dispatchPlan / invoke / byok invoke` 这些入口上收到明确的 `400` 错误，
而不是被静默放宽成 `low-friction`。

这几个 helper 都是 read-only 诊断入口。  
它们帮助你看清 `store-ready != live-ready`，但不等于把 `CLI` 或 future compat 提前写成今天已支持。

## Local Control Ledger Pattern

如果你现在是在本地 workstation 上做 runtime triage，推荐顺序是：

1. `runtimeDoctor()`
2. `runtimePlan()`
3. `providerDoctor(providerId)`
4. `invoke()` 结果里的 `receipt`

也就是说，先看总账本，再看任务级推荐，再看 provider 单张账单，最后才把 invoke 当成闭环证据。

## Web Runtime SDK Example

```ts
import { createWebaiBridgeWebSdk } from "@webai-bridge/sdk";

const web = createWebaiBridgeWebSdk({
  useLocalWebAuthStore: true,
});

const auth = await web.authStatus();
const health = await web.health();
```

## Current Boundaries

### Supported now

- BYOK SDK calls
- HTTP service client
- web auth/runtime inspection helpers
- service-client diagnose/readiness projections for the current HTTP runtime surface

### Planned, not supported yet

- Codex compatibility SDK
- Claude Code compatibility SDK
- OpenClaw compatibility SDK
- committed MCP client package

## When to Choose SDK vs Service

- Choose `SDK` when you are inside the same codebase and want BYOK/runtime helpers directly.
- Choose `service client` when you want a stable `service-first` boundary.

更直白一点说：

> SDK 更像直接进机房接线。  
> service client 更像走前台标准窗口。
