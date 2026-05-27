# WebaiBridge Dev Bootstrap

## 文档目的

这份 runbook 面向的是：

- 第一次进入 `WebaiBridge` 的实现 Agent
- 需要把当前 docs-first 仓真正推进到代码实现的人

它不回答“产品为什么存在”，而回答：

> **今天在这台机器上，怎样把开发环境、参考运行时、验证前提和第一步实现准备到位。**

---

## 适用边界

本 runbook 只服务当前 V1 主线：

- `BYOK`
- `Web/Login`

它不服务：

- `consumer compat` 正式实现
- `Gemini CLI`
- 多账户池化
- control-plane 主线

---

## 成功定义

完成本 runbook 后，应该达到以下状态：

1. `WebaiBridge` 仓本地开发环境已准备好
2. 关键参考运行时可被本地研究
3. V1 固定 5 家网页登录 provider 的账户/测试前提明确
4. `LiteLLM` 与 `openclaw-zero-token` 能以 `lab sidecar` 身份被使用
5. 实现者知道下一步应该进入 `Kernel Alpha`，而不是继续想 abstract strategy

---

## 当前验证分层（5 layers）

这份 runbook 现在只负责第五层，也就是 `manual / credentialed workstation`。

更直白一点说：

- `pre-commit`
  - 本地最早拦截 secrets 与 frontdoor hygiene
- `pre-push`
  - 本地 coverage / test / build 总闸
- `hosted`
  - GitHub Actions 负责 repo-side 代码与合同
- `nightly`
  - hosted-safe 的定时重检查
- `manual`
  - 真实 provider / browser / session realism，只能在 credentialed workstation 上验

如果你要看完整 5-layer 总图，先看：

- private maintainer-only testing/governance notes when they exist locally
- [README.md](../../README.md)

---

## 当前 live reality（truth-first checkpoint）

这份 runbook 现在不能再按“仓库还是 docs-only、还没开工”来理解。

当前工作区现实已经是：

- docs-first 已经完成
- monorepo scaffold 已经落地
- `BYOK + Web/Login` 的最小代码主干已经存在
- `reality:gate` / `verify:web-login-live` / `verify:gemini-live` 已经存在
- 5 家 `Web/Login` provider 都已经进入 local-first acquisition 主线
- `apps/service/src/web-auth-acquisition.ts` 的 `playwright-core` 依赖接线在当前工作树里已经收口，不再单独卡住 `typecheck / test / build`

当前更保守、也更适合接手验收的写法是：

- `typecheck / test / build` 已经可以稳定通过
- `test:coverage` 也已经重新回到稳定通过，并回到 80% 线以上
- fresh `verify:service-live` 当前不该继续写成 green，而是停在 `Claude = account-action-required`
- current outward wording 要同步到 `Claude` 这一条 workspace external blocker
- 所以 runbook 现在服务的现实阶段不是“继续压内部工程债”，而是“在一个 repo-side 已过闸、front door 已把 blocker pack 写成 `Claude` 的 credentialed workstation 上继续维护 repo-local runtime hygiene，并在未来换环境时重新做 truth reset”

当前 closeout 输出里的 `external-blocker` 还会再带一个 `classification` 字段，用来说明“为什么它仍然是外部尾巴”：

- `session-material-missing`: 缺 cookie / user-agent / key 这类材料，先补材料
- `session-incomplete`: 材料在，但浏览器会话还没真正落到可用 composer
- `user-action-required`: 需要终端用户亲自完成账号动作，例如重新登录、补 OAuth、关联账号或解锁所需 plan
- `human-verification-required`: 命中了 CAPTCHA / anti-bot / 风控验证
- `account-action-required`: 当前账号还差一层显式账户动作，例如关联 X、补 workspace unlock、或通过所需 plan gate
- `permission-gated`: session material 已经在，但 browser-side bootstrap 仍被 `Unauthorized / permission gate` 挡住
- `transport-instability`: 不是用户材料问题，而是 CDP / attached-browser / provider transport 本身不稳定
- `probe-misclassification`: 探针或 proof 语言可能把真实状态看错了，需要回到脚本与 provider runtime 继续核实
- `provider-unavailable`: 上游 provider 当下不可用，不应误报成凭证损坏

所以这份 runbook 现在服务的现实阶段，不再是：

> “所有 gate 都重新回到全绿的固定工作站”

而更接近：

> **“在 repo-side gate 已过、但 current workspace live truth 仍停在一组 workstation-bound external blockers 的 credentialed workstation 上，继续维护 repo-local runtime hygiene，并在未来环境变化时重新做 truth reset”**

同时保留一个很重要的护栏：

> **这类 live checkpoint 天生会过期。**
>
> runbook 里的 checkpoint 不是永久真理；每次接手都应 fresh 运行：
> - `pnpm run verify:gemini-live`
> - `pnpm run verify-web-login-live`
> - `pnpm run verify:service-live`
> - `pnpm run reality:gate`
>
> **它也不覆盖更高优先级的 ADR / blueprint / task board。**
>
> 这份 runbook 记录的是“当前这台机器最近一次怎么跑通”，不是正式改写阶段裁决的地方。

当前还多了一个很实用的 `M2` 证据脚本：

- `pnpm run verify:service-live`

这条脚本会直接启动本地 `WebaiBridge` service，并通过统一的 `service-first` invoke 入口验证高稳定 trio：

- `chatgpt`
- `gemini`
- `claude`

它的作用不是替代 `reality:gate`，而是补一张更面向 `M2 / service-first readiness` 的成绩单：

- `reality:gate` 回答的是：当前 `M1` 有没有关门
- `verify:service-live` 回答的是：当前 trio 能不能通过统一 service surface 真正跑通

当前还多了一条很实用的 browser diagnosis 工具：

```bash
pnpm run diagnose:web-login-browser -- --provider chatgpt --reload --json
```

它不是另一个 aggregate gate。  
它更像一把手电筒，专门照这件事：

> **为什么 auth store 已经显示 `ready`，**
> **但 live verifier 还是说 browser session 不完整。**

这条命令会输出：

- canonical attach target
- diagnose ladder
- `current-page`
- `current-console`
- `current-network`
- support bundle path

如果你本地已经把 service 跑起来了，现在还有一组更细的只读 CLI 读法：

```bash
pnpm run webai-bridge:cli -- provider-store-readiness --provider chatgpt
pnpm run webai-bridge:cli -- provider-live-readiness --provider chatgpt
pnpm run webai-bridge:cli -- provider-attach-target --provider chatgpt
pnpm run webai-bridge:cli -- provider-diagnose-ladder --provider chatgpt
pnpm run webai-bridge:cli -- provider-diagnose --provider chatgpt
pnpm run webai-bridge:cli -- surface-catalog
pnpm run webai-bridge:cli -- compat-targets
pnpm run webai-bridge:cli -- compat-target --target codex
pnpm run webai-bridge:cli -- mcp-status
pnpm run webai-bridge:cli -- mcp-tools
```

可以先这样理解：

- `provider-store-readiness` = 看抽屉里的钥匙和证件在不在
- `provider-live-readiness` = 看人是不是已经站到正确的门前
- `provider-attach-target` = 看你到底连的是哪一个浏览器
- `provider-diagnose-ladder` = 看下一步先修什么
- `provider-diagnose` = 一次把整张体检单拿出来
- `surface-catalog` = 看当前 outward surface / compat / MCP 的机器可读真值表
- `compat-targets` = 看所有 thin compat 目标的机器可读目录
- `compat-target --target codex` = 定点看某一个 consumer target 的 truth
- `mcp-status` = 看当前 MCP surface 的真实级别
- `mcp-tools` = 看当前 read-only MCP server/tool surface 已经公开了哪些工具名

这些命令现在只属于本地排障手册。  
它们不等于 public `CLI` 已经升格成 today supported surface。

更直白一点说：

- `store-ready` = 本地材料在仓里
- `live-ready` = 当前附着浏览器真的落在能发请求的工作区

## 本地运行时磁盘治理

这条 runbook 现在还多了一个 repo-local 的磁盘治理入口：

```bash
pnpm run audit:runtime-footprint
pnpm run cleanup:runtime -- --dry-run
```

先把它理解成：

- `audit:runtime-footprint` = 体检单
- `cleanup:runtime -- --dry-run` = 预演
- `cleanup:runtime -- --apply --include-managed-browser` = 高风险动作

当前 `.runtime-cache/` 里的东西要分 4 类看：

- `managed-browser-profile`
  - `.runtime-cache/webai-bridge-web-auth-browser`
  - 这是 managed browser 的本地工位，默认保护，不常规删除
- `debug-evidence`
  - `.runtime-cache/browser-debug/bundles`
  - 这是截图和 `summary.json` 这类调试证据，默认只修剪旧 bundle
- `support-bundles`
  - `.runtime-cache/browser-support`
  - 这是 provider support bundle，默认参与 TTL / 容量治理，但不应漂到 repo 外的任意目录
- `disposable-generated`
  - `.runtime-cache/temp`
  - 再加上 `.runtime-cache/webai-bridge-verify-web-login-test-*`、`.runtime-cache/webai-bridge-chatgpt-ready-writeback-*`、`.runtime-cache/webai-bridge-store-preserve-*`
  - 以及 `.runtime-cache/app-service*.log`、`.runtime-cache/reality-gate*.{out,exit}`
  - 这些都是 live proof / verifier writeback 产生的可重建临时产物和 repo-local 调试日志，清理时默认可以删除

repo 外如果还需要当前仓专属的临时缓存，也只能进：

- `~/.cache/webai-bridge`

默认治理规则现在是：

- `TTL = 7 days`
- `maxBytes = 8 GiB`
- repo-native cleanup 会同时审计：
  - repo-local `.runtime-cache/`
  - repo-external `~/.cache/webai-bridge`
- shared tool caches 明确不归当前仓自动清理：
  - `pnpm store`
  - `~/.npm`
  - `~/.cache/pnpm`
  - `~/Library/Caches/pnpm`
  - `~/Library/Caches/ms-playwright`
  - `uv` / `pre-commit` / Docker 全局缓存
  - `.serena/cache`

护栏也要说清楚：

- 这条 cleanup 只管当前 repo 的 `.runtime-cache/` 和专属的 `~/.cache/webai-bridge`
- 它不碰 `<macos-temp-root>/...`
- 它不碰 `~/.cache` 里的其他共享工具目录、Docker 全局缓存、Chrome 全局目录
- 默认不删 `managed-browser-profile`
- 只有显式传 `--include-managed-browser`，并且脚本确认当前没有活跃监听或活跃 Chrome/Chromium profile 占用时，才允许删除 managed browser 工位

在执行 live / browser / cleanup 类命令前，先跑：

```bash
pnpm run scan:host-process-risks
```

## 本地 credentialed 浏览器默认模式

现在这仓更推荐的本地 credentialed 工作方式不是 repo-local managed browser 常开，而是：

- 默认本地入口 = `isolated-chrome-root`
- repo 专属真实 Chrome 根目录固定在 `~/.cache/webai-bridge/browser/chrome-user-data`
- steady-state 只保留一个 repo-owned 实例：缺席则启动，存在则 attach，不 second-launch
- 默认 Chrome 根目录只在显式 seed / reseed 时读取
- repo-local `webai-bridge-web-auth-browser` 只保留为显式隔离 fallback

推荐环境变量：

```bash
export WEBAI_BRIDGE_BROWSER_MODE=isolated-chrome-root
export WEBAI_BRIDGE_CHROME_USER_DATA_DIR="$HOME/.cache/webai-bridge/browser/chrome-user-data"
export WEBAI_BRIDGE_CHROME_PROFILE_NAME="webai-bridge"
export WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT="$HOME/.cache/webai-bridge"
export WEBAI_BRIDGE_CACHE_TTL_DAYS=7
export WEBAI_BRIDGE_CACHE_MAX_BYTES=8589934592
export WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL="http://127.0.0.1:9338"
```

这里要记住一个边界：

> `~/.cache/webai-bridge/browser/chrome-user-data` 是当前 repo 的永久浏览器工位。
> 它属于 repo 专属 steady-state browser root，不参与 TTL / cap 自动裁剪。

第一次把默认 Chrome 根目录里的 `webai-bridge` profile 搬进来，要显式跑：

```bash
pnpm run seed:isolated-chrome-root -- --json
```

只有你明确要重建独立根目录时，才允许：

```bash
pnpm run reseed:isolated-chrome-root -- --json
```

现在也明确一条 fail-closed 规则：

- steady-state 不再默认猜测任意全局 Chrome profile 根目录
- 默认 Chrome 根目录只用于显式 seed / reseed
- 本地 credentialed DOM / Console / Network / live proof 默认走独立 Chrome 根目录
- 当前 repo 的 canonical isolated-root CDP 端口 = `9338`
- 只有隔离 fallback 或无状态路径才走 repo-local managed browser

这轮还补了一条宿主机安全边界：

> `bootstrap-web-auth-browser` 现在不能再通过 `detached: true` + `.unref()` 偷留一个 Chrome child handle。
> 新实例启动必须走宿主机 launcher handoff；已在线的 repo-owned 浏览器若需要补开登录页，走 CDP `/json/new`。
> 如果宿主机不能证明这条 handoff 是安全成立的，脚本必须 fail-closed，让你改走 `existing-browser-session` / 手工启动，而不是偷偷回退到 detached launch。

这轮还新增了一条很关键的 coherence 纪律：

> `ready` 不再只由 `.runtime-cache/local-web-auth-store.json` 单独决定。  
> 后续 live verify 会同时核对：
> - 当前 attached browser 页面
> - 当前 browser root / profile
> - 当前 root 上关键持久 cookie 是否真的落盘

如果 store 还说 `ready`，但当前浏览器页已经掉到登录页，或者当前 root 上关键 cookie 不在，系统会把它降级成：

- `user-action-required`
  - 硬缺口，例如 ChatGPT 缺 `__Secure-next-auth.session-token*`
- `refreshable-but-degraded`
  - 还能修，但当前状态已经不够稳

## CI 边界

当前仓继续只使用 GitHub Hosted Runner，不引入 `self-hosted`。

云端 CI 只跑：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- security / repository code scanning

下面这些仍然是 **local credentialed only**：

- `pnpm run verify:gemini-live`
- `pnpm run verify-web-login-live`
- `pnpm run verify:service-live`
- `pnpm run reality:gate`
- `pnpm run diagnose:web-login-browser`
- `pnpm run capture:web-debug-bundle`

如果这些 live 路径在 CI 环境中被误触发，现在应该直接 fail-closed，报出 `credentialed-workstation only`，而不是偷偷依赖云端没有的本地登录态或真实 Chrome Profile。

## 共享机器资源预算

这台机器是共享实验室，不是当前 repo 一个人的桌子。

当前 repo 的默认预算是：

- 当前机器浏览器实例总数超过 **6** 时，当前 repo 不再新开实例
- 当前 repo 自己默认只允许：
  - **1 个主浏览器实例**
  - 必要时额外 **1 个短时诊断实例**
- 当前 repo 自己的标签页上限是 **3 个**
- 对同一 provider 的登录态检查 / 恢复，只允许 **1-2 次定点尝试**

如果两次检查都已经说明当前 repo 自己的 canonical browser/profile 里没有有效登录态，就把它记成 blocker。不要继续靠多开浏览器、重复 clone profile、反复 attach session 碰运气。

## Docker 边界

当前 `WebaiBridge` 没有 repo-owned Docker runtime。

- 这份 runbook 不要求你本轮再开 Docker
- 也不要把 `cleanup:runtime` 误当成 Docker 清盘命令
- 如果未来引入 Docker sidecar / volume / network
  - 必须同步补 repo-native cleanup policy
  - 只能清理明确带 `webai-bridge` 归属的资源
  - 禁止 machine-wide destructive prune

---

## 一、先读完这些文档

在跑任何命令前，先读：

1. `README.md`
2. `docs/media/30-second-overview.md`
3. `docs/first-success.md`
4. `docs/public-proof-pack.md`
5. `docs/public-distribution-ledger.md`
6. `docs/api/service-http-reference.md`
7. `docs/api/openapi.yaml`
8. `docs/api/web-login-acquisition.md`
9. `docs/api/error-diagnostics-reference.md`
10. `docs/public-surface-support-matrix.md`

如果你在私有维护者工作区里还有一份本地 `.agents/` 棚架，可以再读那份本地私有合同；但这份 public runbook 不再把它当成公开仓的硬前置。

如果这些没读够，就不要开工写代码。

---

## 二、宿主环境准备

### 必需工具

- Node.js 22+
- `pnpm`
- `python3`
- Chrome / Chromium
- `git`

### 最小检查

```bash
node -v
pnpm -v
python3 --version
git --version
```

当前阶段，只要这些工具存在并能工作，就已经够开始实现 `WebaiBridge` 的 Day 1 范围。

---

## 三、参考仓就位检查

当前主线只看这 3 个主参考：

- `ai`
- `litellm`
- `openclaw-zero-token`

边缘/后续参考只在需要时看：

- `ChatALL`
- `codex`
- `claude-code`
- `openclaw`
- `gemini-cli`

### 检查参考仓是否存在

```bash
ls '<local-reference-root>'
```

### 当前明确排除

不要再把已经被正式移出主线的历史小样本仓拉回当前研究主线。

即使本地未来又重新出现，也只允许作为备查，不允许进入当前主线合同。

---

## 四、`Vercel AI SDK` 准备方式

### 当前定位

- SDK/contracts/byok abstraction 骨架
- 适合 `pnpm` 直接依赖

### 对实现者的含义

`Vercel AI SDK` 不需要先独立跑成一个 sidecar。  
它更像是 `WebaiBridge` 自己将来会直接依赖的核心包。

### 当前要做的不是

- 不需要在这个阶段先把所有 provider 包都装进来
- 不需要先写代码验证所有 API

### 当前要做的是

- 确认 `ai` 的 provider-agnostic 抽象存在
- 确认 `@ai-sdk/open-responses`、`@ai-sdk/openai`、`@ai-sdk/google-vertex` 这些包的存在和语义
- 把它们作为 `Kernel Alpha` 阶段的 contract/SDK 主骨架来源

---

## 五、`LiteLLM` 准备方式

### 当前定位

- BYOK gateway / sidecar / routing study target

### 启动方式

根据本地 README，当前最小实验方式可以是：

```bash
pip install 'litellm[proxy]'
litellm --model gpt-4o
```

### 你为什么要跑它

不是因为 `WebaiBridge` 要依赖它做核心内核，而是为了：

- 看 unified gateway 是怎么组织的
- 看 OpenAI-compatible surface
- 看 proxy / routing / gateway 思路

### 它当前在 `WebaiBridge` 里扮演什么

- `lab sidecar`
- 对照运行时
- BYOK gateway 样本

不是：

- TS 内核骨架
- repo 主语言
- consumer compat 主体

---

## 六、`openclaw-zero-token` 准备方式

### 当前定位

- Web/Login 技术母本
- `lab sidecar` first
- 再 `selective transplant`

### 当前工作区本地路径

本地技术母本路径按占位写法记为：

`<local-reference-root>/openclaw-zero-token`

其中 `<local-reference-root>` 表示你在本机存放第三方参考仓的根目录；公开 runbook 不写个人绝对路径。

### 为什么必须跑起来

因为它不是一个小库，而是一个完整运行时平台。  
如果只看 README，不把它真正当 sidecar 研究，你很难理解：

- Web/Login lane 是怎么组织的
- auth/session 是怎么贯通到 gateway 的
- OpenResponses-compatible HTTP surface 是怎么露出来的

### 最小研究式启动路径

根据本地 README，最小研究路径是：

```bash
pnpm install
pnpm build
pnpm ui:build
./start-chrome-debug.sh
./onboard.sh webauth
./server.sh
```

### 当前要观察什么

不要把精力花在它的全产品世界上。  
当前只观察这些层：

1. Web/Login provider runtime
2. auth/session/refresh 路径
3. gateway 运行形态
4. OpenResponses-compatible HTTP surface
5. diagnostics / operator-facing 状态模型

### 当前必须优先看的源码入口

如果你要继续推进 `Web/Login`、`live-proof`、`acquisition`、`browser transport`，优先看这些本地源码：

- `src/zero-token/providers/chatgpt-web-client-browser.ts`
- `src/zero-token/providers/gemini-web-client-browser.ts`
- `src/zero-token/providers/claude-web-client-browser.ts`
- `src/zero-token/providers/grok-web-client-browser.ts`
- `src/zero-token/providers/qwen-web-client-browser.ts`
- `src/zero-token/streams/chatgpt-web-stream.ts`
- `src/zero-token/streams/gemini-web-stream.ts`
- `src/zero-token/streams/claude-web-stream.ts`
- `src/zero-token/streams/grok-web-stream.ts`
- `src/zero-token/streams/qwen-web-stream.ts`

换句话说：

> **当前 Web/Login lane 最值钱的学习路径，不是继续在小样本仓里横跳，而是直接深读 `openclaw-zero-token` 本地母本。**

### 当前不要被带偏到什么

不要把注意力消耗在：

- channels
- personal assistant worldview
- mobile apps
- product shell
- consumer-facing extras

这些是它的产品世界，不是 `WebaiBridge V1` 的施工面。

---

## 七、V1 账号与测试前提准备

### 网页登录固定目标 provider

必须准备好：

1. `ChatGPT`
2. `Gemini`
3. `Claude`
4. `Grok`
5. `Qwen`

### 当前约束

- 默认单 provider 单账户
- 当前不做多账户池
- 当前不做平台共享账号
- 所有凭证必须是终端用户自己的

### BYOK 准备

当前必须确保：

- `Gemini API Key` 可真实测试

其余 provider 可以暂时停在：

- contract ready
- code path ready

而不必全部先做真实 credential 验证。

### Reality Gate proof 输入

如果要跑当前仓里的 reality-gate proof，当前约定是：

- `Gemini BYOK`：
  - 运行 `pnpm exec node scripts/verify-gemini-live.mjs`
  - 环境变量至少提供其一：`WEBAI_BRIDGE_GEMINI_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY`
- `Web/Login`：
  - 运行 `pnpm exec node scripts/verify-web-login-live.mjs`
  - 单 provider 复验可运行 `pnpm exec node scripts/verify-web-login-live.mjs --provider chatgpt`（`gemini / claude / grok / qwen` 同理）
  - 当前 live proof 默认读取：
    - `WEBAI_BRIDGE_WEB_<PROVIDER>_COOKIE_BUNDLE`
    - `WEBAI_BRIDGE_WEB_<PROVIDER>_USER_AGENT`

### 当前推荐的本地浏览器准备方式

如果你要走 `Web/Login` acquisition 主路径，默认优先让 `WebaiBridge` 自己准备浏览器，而不是手工研究某个 `9222` Chrome：

```bash
pnpm run bootstrap:web-login-browser -- --provider chatgpt
pnpm run bootstrap:web-login-browser -- --provider gemini
pnpm run bootstrap:web-login-browser -- --provider grok
```

这条脚本会尝试启动或复用 `WebaiBridge` 自己的本地 onboarding 浏览器，再打开对应 provider 登录页。  
这是默认模式，也就是：

- `managed browser`

当前还存在两条高级 acquisition 路径：

- `use existing Chrome profile`
- `attach existing browser session`

它们仍然属于同一条 local-first acquisition/store 主线，但只在你明确需要复用已有 Chrome 登录态时才启用。  
换句话说：

- 默认情况：先走 `managed browser`
- 高级情况：再切到 `existing profile / attach session`

只有当你在做 fallback/debug/proof harness 时，才需要回到 env 层面关注 `WEBAI_BRIDGE_WEB_AUTH_CDP_URL` 一类底层变量；产品主路径不应该要求用户先理解这些实现细节。

这里的 `<PROVIDER>` 当前对应：

- `CHATGPT`
- `GEMINI`
- `CLAUDE`
- `GROK`
- `QWEN`

这些变量只用于 **终端用户自己的本地 proof 输入**，不是平台共享凭证，也不是公共账号池配置。

### 当前 `.env` 自动加载行为

当前仓里的以下入口会自动加载 repo 根目录的 `.env.local` 与 `.env`：

- `scripts/verify-gemini-live.mjs`
- `scripts/verify-web-login-live.mjs`
- `scripts/run-reality-gate.mjs`
- `apps/service/src/index.ts`

加载顺序是：

1. `.env.local`
2. `.env`

同时保留一条更高优先级规则：

> **已经存在于 shell 的环境变量优先，`.env*` 只补缺，不覆盖。**

这里必须再强调一次：

> **这套 env 输入只是当前 reality gate / closeout harness 的 proof 契约。**
>
> **它不是最终产品主 UX。**
>
> 最终产品主路径应该是：
> - 用户在 `WebaiBridge` 内点击 acquisition/start，让系统启动或附着正确的本地 onboarding 浏览器
> - 用户在这份浏览器里完成登录 / OAuth / browser-session acquisition
> - acquisition 结果进入本地 credential/session store
> - `status / probe / reality gate` 优先消费这套本地产物

---

## 八、定义“环境已准备好”

当且仅当下面这些条件成立，才算“可以进入 Kernel Alpha 实现”：

### 文档面

- 第一、第二波文档全部读完
- 当前 task board 已读

### 宿主环境面

- `node`
- `pnpm`
- `python3`
- `Chrome`

都可用

### 参考运行时面

- `LiteLLM` 能按 `lab sidecar` 思路被启动或至少具备可运行路径
- `openclaw-zero-token` 能按研究路径被启动并观察

### 测试前提面

- 5 家网页登录 provider 的账户真实存在
- `Gemini API Key` 可真实测试

### 认知面

实现者已经明确知道：

- 不是 raw fork
- 不是从零拒绝借上游
- `openclaw-zero-token` 是技术母本
- `Vercel AI SDK` 是 SDK/contracts 骨架
- `LiteLLM` 是 BYOK gateway 样本

---

## 九、进入实现前的最后提醒

### 不要做的事

- 不要今天就去接你的 3 个 repo
- 不要今天就去做 `Codex / Claude Code / OpenClaw` compat
- 不要提前把 `Gemini CLI` 拉回来
- 不要为了“留空间”制造一堆空目录或僵尸代码

### 现在该做的事

进入 `Kernel Alpha`，从这些开始：

1. `contracts`
2. `kernel`
3. `credentials`
4. `diagnostics`
5. `lanes/byok`
6. `lanes/web`
7. `providers/byok/*`
8. `providers/web/*`
9. `surfaces/http`

---

## 十、Decision Summary

> 这份 runbook 的核心不是“把所有东西都跑起来”。  
> 而是：
>
> **把实现者带到一个足够确定的起跑线。**
>
> 到达这条线之后，下一步就不该继续聊抽象，而应该进入 `Kernel Alpha` 的代码实现。
