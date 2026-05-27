# Runtime Diagnostics Starter

这个 starter 针对的是 `WebaiBridge` 最有辨识度的一类 builder 需求：

> 不要先假装一切都能 invoke，  
> 先把 provider 现在到底卡在哪看清楚。

更像生活里的说法，它不是“代你开车”，而是先给你一份体检单。  
这样你不会把一个需要重新登录的 provider，误判成“只是模型调用慢”。

## 运行

```bash
pnpm run example:runtime-diagnostics
```

## 可选环境变量

- `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- `WEBAI_BRIDGE_SERVICE_PORT`
- `WEBAI_BRIDGE_RUNTIME_PROVIDER`

默认 provider = `chatgpt`

前提：

- 本机已有可访问的 `WebaiBridge` runtime
- 目标 provider 的状态、probe、support bundle 路由能被当前 runtime 正常读取

## 它默认会读哪些东西

- provider status
- provider probe
- provider remediation
- provider support bundle

## 它证明什么

- `WebaiBridge` 今天的性格确实是 truth-first / fail-closed
- 外部 builder 可以先做 triage，再决定要不要往 invoke 方向继续走

## 它不证明什么

- 不证明自动修复
- 不证明 acquisition write plane 已开放
- 不证明 provider session 问题会被平台偷偷兜底
