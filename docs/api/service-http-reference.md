# WebaiBridge Service HTTP Reference

This page documents the current `service-first` HTTP surface.

这页记录的是当前已经落地的 `service-first` HTTP 入口，不是未来愿景。

## Status

- `supported now`
- Source of truth:
  - `docs/api/openapi.yaml`
  - `packages/surfaces/http/src/service-language.ts`
  - `packages/surfaces/http/src/http-surface.ts`
  - `tests/integration/service-http/http-surface.integration.test.ts`

## Machine-readable Contract

如果你是人来读，先看这页就够了。  
如果你是 SDK、AI agent、MCP-adjacent tooling，优先读：

- `docs/api/openapi.yaml`

它像这层 HTTP surface 的“标准门牌”，让工具不用靠猜路由和字段名来摸门。

## Surface Role

`WebaiBridge` 当前把 HTTP surface 定义为：

- `role = first-party-integration-entry`
- `runtimeShape = runtime-first`
- `localFirst = true`
- `consumerCompatIncluded = false`

翻成人话：

> 这是一层给 first-party integration 用的统一运行时入口，  
> 不是已经完成的 `Codex / Claude Code / OpenClaw` compat façade。

## Current Routes

### Runtime bootstrap

- `GET /v1/runtime/bootstrap`
- `GET /v1/runtime/entrypoint`

用途：

- 读当前 runtime 的路线图
- discovery / auth / health / remediation 汇总入口

### Provider discovery

- `GET /v1/runtime/providers`
- `GET /v1/runtime/byok/providers`

### Auth and health

- `GET /v1/runtime/auth-portal`
- `GET /v1/runtime/auth-status`
- `GET /v1/runtime/health`
- `GET /v1/runtime/doctor`

### Task-centric planning

- `POST /v1/runtime/plan`

### Provider-specific status and remediation

- `GET /v1/runtime/providers/{providerId}/doctor`
- `GET /v1/runtime/providers/{providerId}/status`
- `GET /v1/runtime/providers/{providerId}/probe`
- `GET /v1/runtime/providers/{providerId}/remediation`
- `POST /v1/runtime/providers/{providerId}/acquisition/start`
- `POST /v1/runtime/providers/{providerId}/acquisition/capture`

### Provider debug and browser evidence

- `GET /v1/runtime/providers/{providerId}/debug/current-page`
- `GET /v1/runtime/providers/{providerId}/debug/current-console`
- `GET /v1/runtime/providers/{providerId}/debug/current-network`
- `GET /v1/runtime/providers/{providerId}/debug/support-bundle`
- `GET /v1/runtime/providers/{providerId}/debug/workbench`

`debug/workbench` is a thin local-first HTML shell over the same read-only debug
truth surfaces. It is a diagnosis bench, not a control plane.

### Invocation

- `POST /v1/runtime/invoke`
- `POST /v1/runtime/byok/invoke`
- `POST /v1/runtime/dispatch-plan`

## Example: Runtime Discovery

```bash
curl http://127.0.0.1:4010/v1/runtime/providers
```

你应该看到：

- 5 个 Web/Login providers
- provider models
- 每个 provider 的 status / probe / remediation routes

## Example: Runtime Doctor

```bash
curl http://127.0.0.1:4010/v1/runtime/doctor
```

这条路由像总账本：

- 哪些 provider 现在可 dispatch
- 哪些 provider 还 blocked
- 当前最值得先跑的下一步 CLI
- `activePolicyPack`
  - 当前 runtime 正在按哪一张策略包看世界
- `availablePolicyPacks`
  - 所有公开可选的策略包目录，不再只是几段 profile id
- `controlLedger`
  - 一张更像本地 control shell 的 ledger：
  - `runtime doctor / runtime plan / invoke / auth portal` 这些聚合入口
  - dispatchable providers
  - blocked providers
  - remediation workflows

## Example: Web/Login Invocation

```bash
curl http://127.0.0.1:4010/v1/runtime/invoke \
  -H 'content-type: application/json' \
  -d '{
    "provider": "chatgpt",
    "model": "gpt-4o",
    "input": "Reply with exactly HELLO and nothing else.",
    "lane": "web"
  }'
```

## Example: BYOK Invocation

```bash
curl http://127.0.0.1:4010/v1/runtime/byok/invoke \
  -H 'content-type: application/json' \
  -d '{
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "input": "Reply with exactly HELLO and nothing else."
  }'
```

## Example: Dispatch Plan

```bash
curl http://127.0.0.1:4010/v1/runtime/dispatch-plan \
  -H 'content-type: application/json' \
  -d '{
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "input": "Reply with exactly HELLO and nothing else."
  }'
```

这条路由的作用不是直接执行，而是先回答：

- 当前 provider 在 `BYOK / Web/Login` 两条 lane 里有哪些候选
- 现在 service-first runtime 会选哪条 lane
- 这个选择是来自 `preferred-lane` 还是当前 `credentialStates`
- `dispatchPlan.activePolicyPack`
  - 这次请求真正生效的策略包是什么
  - 它已经吸收了本次请求叠加的约束，而不只是裸 `policyProfile`

## Example: Provider Doctor

```bash
curl http://127.0.0.1:4010/v1/runtime/providers/gemini/doctor
```

这条路由更像一张 builder-facing 对账单：

- `policy`
  - 当前 provider/lane 的 capability matrix 和 dispatch policy
- `dispatchPlan`
  - 现在 runtime 会不会 dispatch，选哪条 lane，为什么
- `alignment`
  - dispatch、remediation、runtimeCanInvoke 现在是不是在说同一件事
- `receipt`
  - 下一步最值得跑的 CLI / MCP 只读入口
  - 标准化 remediation workflow

## Example: Runtime Plan

```bash
curl http://127.0.0.1:4010/v1/runtime/plan \
  -H 'content-type: application/json' \
  -d '{
    "policyProfile": "official-api-first",
    "requiredCapabilities": ["tool-calling"],
    "allowWebLogin": true,
    "requireOfficialApi": true
  }'
```

这条路由不是“给定 provider 再选 lane”，而是：

- 先给任务要求
- 再让 runtime 帮你推荐 provider / lane / model
- 同时把当前 `activePolicyPack` 一起返回，让 builder 知道：
  - 这张策略包偏向哪条 lane
  - 它是否要求 official API
  - 它会不会拒绝 degraded runtime shortcuts
  - 如果这次请求额外叠加了 `allowWebLogin / requireOfficialApi / requireToolCalling`
    这类 planner flags，`activePolicyPack` 反映的是 **effective policy**，不是只回显裸 `policyProfile`
- 如果后面要继续做本地排障或选择收敛，先回到 `runtime doctor`

## Error Model

当前最重要的错误语义是：

- `missing-credential`
- `user-action-required`
- `human-verification-required`
- `account-action-required`
- `permission-gated`
- `provider-unavailable`
- `session-incomplete`
- `refreshable-but-degraded`
- `routing-failed`

如果你传了未知的 `policyProfile`，当前 `runtime plan / dispatch-plan / invoke / byok invoke`
都会显式返回 `400 + routing-failed`，而不是静默降级成 `low-friction`。

生活化理解：

> 这套 API 不会假装“服务坏了”来掩盖“你还没登录”。
> 它会尽量把“钥匙没带”“门没开”“上游临时不可用”区分开。

## Invoke Receipt

当前 `/v1/runtime/invoke` 返回的结果，除了文本/结构化输出之外，还会带：

- `receipt`
  - `policyProfile`
  - `activePolicyPack`
  - `providerId / laneId / requestedModel`
  - `doctorRoute`
  - `lineage`
    - `runtimeDoctorRoute`
    - `runtimePlanRoute`
    - `dispatchPlanRoute`
    - `providerDoctorRoute`
  - `readinessSnapshot`
  - `remediationWorkflow`

可以把它理解成：

> 这不是“调用完就没了”的一次性响应，  
> 而是把“为什么这样调、下一步去哪看、如果失败先怎么排”一起压回来了。

## Not Included Yet

These are **not** part of the current committed HTTP surface:

- Codex-specific wire contract
- Claude Code-specific gateway contract
- OpenClaw gateway protocol compatibility
- committed MCP adapter surface

这些现在最多只能写成 `planned` 或 `research`，不能写成 `supported`.
