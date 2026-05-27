# Runtime Bridge Starter

这个样板间解决的是最常见的第一堵墙：

> “我知道 `WebaiBridge` 是个 shared provider runtime，  
> 但我第一条 invoke 到底怎么发？”

更直白一点说，这个 starter 就像一把已经插好电的延长线。  
你不用自己先焊接口，只要把它接到当前 runtime 上，就能跑通第一条最小请求。

## 运行

```bash
pnpm run example:runtime-bridge
```

前提：

- 本机已有可访问的 `WebaiBridge` runtime
- 目标 provider 有你自己的合法凭证
- 如果你走 `byok`，就需要对应 API key；如果你换成 `web`，就需要对应网页登录态

## 可选环境变量

- `WEBAI_BRIDGE_RUNTIME_BASE_URL`
- `WEBAI_BRIDGE_SERVICE_PORT`
- `WEBAI_BRIDGE_RUNTIME_PROVIDER`
- `WEBAI_BRIDGE_RUNTIME_MODEL`
- `WEBAI_BRIDGE_RUNTIME_INPUT`
- `WEBAI_BRIDGE_RUNTIME_LANE`

默认值会从：

- `catalogs/starter-manifest-examples.json`
  - `builderExamples[target=codex]`

里拿 seed payload，然后补上：

- `provider = openai`
- `lane = byok`

## 它证明什么

- 你可以用一个最小 JSON body 打通 `/v1/runtime/invoke`
- 你不需要先造一整套 Codex / Claude Code / OpenClaw 外壳
- thin runtime bridge 这条路今天确实有一个可执行的 starter

## 它不证明什么

- 不证明 full Codex parity
- 不证明 terminal/tool approval parity
- 不证明 consumer shell 已经 landed
