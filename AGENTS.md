# WebaiBridge AGENTS.md

## 文档目的

这份文件是 `WebaiBridge` 仓的 repo 宪法。  
它不是重复全局 `AGENTS.md`，而是把 **WebaiBridge 自己已经拍板的产品边界、上游关系、参考仓纪律、交付顺序** 固化下来，防止未来 Agent 再把项目做偏。

如果根目录的其他说明、口头讨论、实现尝试与本文件冲突，以本文件和 `.agents/internal-docs/adr/`、`.agents/internal-docs/contracts/` 为准。

---

## 一句话定义

> `WebaiBridge` 是一个面向 AI 产品开发者的共享 Provider Runtime。  
> 它的目标不是做另一个聊天产品或 personal assistant，而是把终端用户已有的 AI 访问资格统一转成可被 AI 产品消费的共享内核。

---

## 真理源顺序

后续任何实现、设计、修文，遵守以下真理源顺序：

1. `.agents/internal-docs/adr/*.md`
2. `.agents/internal-docs/contracts/*.md`
3. `.agents/internal-docs/blueprints/*.md`
4. `.agents/internal-docs/product/*.md`
5. `docs/runbooks/*.md`
6. `README.md`
7. 本地参考仓与历史对话记录

解释：

- `ADR` 决定边界和裁决
- `contracts` 决定语义和公开语言
- `blueprints` 决定阶段和执行顺序
- `product` 决定为什么存在、为谁服务
- 参考仓和对话记录只能提供**依据**，不能直接覆盖 `WebaiBridge` 自己的合同

---

## [已确认] V1 边界

### V1 只做两条供给 lane

- `BYOK`
- `Web/Login`

### V1 当前不做

- `Agent Input Lane`
- `Codex` 作为输入来源
- `Claude Code` 作为输入来源
- `Gemini CLI`
- 同 provider 多账户网页登录池化
- 自动轮转
- 自动换号
- 隐式 failover
- control-plane 主线
- raw fork 产品

### V1 固定网页登录 provider

1. `ChatGPT`
2. `Gemini`
3. `Claude`
4. `Grok`
5. `Qwen`

其中高稳定目标为：

- `ChatGPT`
- `Gemini`
- `Claude`

### 凭证边界

> **永远只接受终端用户自己的凭证。**

这意味着：

- 不做平台共享账号池
- 不做开发者公共凭证
- 不做平台代持型“公共 AI 资格”

---

## [已确认] 产品身份

### 长期身份

`WebaiBridge` 长期可以是 `Hybrid`：

- `Provider Runtime`
- `Agent Runtime`

### V1 实际身份

`WebaiBridge V1` 实际只聚焦：

> **共享 Provider Runtime**

### consumer compat 后置

以下对象保留为后续 consumer compat 目标，但不属于 V1 核心施工面：

- `Codex`
- `Claude Code`
- `OpenClaw`

顺序固定为：

1. 先做 `WebaiBridge` 自己的 kernel
2. 再做你的 3 个 repo 接入
3. 再做 `Codex / Claude Code / OpenClaw`

---

## [已确认] 架构纪律

### 必须分开的四个维度

后续任何设计与实现都必须把这 4 个维度拆开：

- `lane`
- `provider`
- `consumer`
- `surface`

不允许把：

- provider 写成 consumer
- consumer 写成 provider
- surface 写成另一套 runtime 语言
- future compat 提前写进当前 V1 核心

### 当前正式骨架

当前正式骨架是：

- `apps/`
- `packages/contracts`
- `packages/kernel`
- `packages/sdk`
- `packages/credentials`
- `packages/diagnostics`
- `packages/lanes/*`
- `packages/providers/*`
- `packages/consumers/*`
- `packages/surfaces/*`

具体目录与 Day 1 范围，以：

- `.agents/internal-docs/adr/0004-architecture-skeleton-monorepo.md`

为准。

---

## 上游关系纪律

### 总原则

> **技术上深借，产品上独立。**

### `openclaw-zero-token`

它的定位已经正式拍板：

> **技术母本，不是产品母本。**

这意味着：

- 可以深度研究
- 可以运行 sidecar
- 可以 selective transplant
- 可以迁移 Web/Login runtime、auth/session/refresh、gateway 逻辑

但不允许：

- 公开 raw fork
- 继承它的产品身份
- 继承 personal assistant worldview
- 继承 channels / mobile companion / operator-first product baggage

当前工作区内，它的本地研究根路径按占位写法记为：

`<local-reference-root>/openclaw-zero-token`

其中 `<local-reference-root>` 表示你在本机存放第三方参考仓的根目录；公开文档里不要写个人绝对路径。

在 `Web/Login` 这条 lane 上，后续任何实现、修补、Reality Gate 收口、acquisition 主线推进，都默认优先深读这个本地路径，而不是先去看那些更小、更旧的局部样本仓。

### `Vercel AI SDK`

定位：

- SDK/contracts/byok abstraction 骨架

形式：

- `pnpm` 直接依赖优先

### `LiteLLM`

定位：

- BYOK gateway / sidecar / routing 样本

形式：

- `lab sidecar`
- 不作为 TS 内核骨架直接吃进去

### `ChatALL`

定位：

- 产品层样板、能力矩阵样板

形式：

- `reference only`

### 当前非主线参考

以下仓当前不是 V1 内核主线：

- `codex`
- `claude-code`
- `openclaw`
- `gemini-cli`
- `aider`
- `opencode`
- `oh-my-openagent`

### 明确排除

当前已经被正式移出主线的历史小样本仓，不再进入文档叙事，也不作为当前主线参考。

如果后续有人想重新把这些历史小样本仓拉回主线，必须先改 ADR，不能静默复活。

---

## 实现纪律

### 先看什么

开始任何代码前，必须先读：

1. `.agents/internal-docs/product/v1-brief.md`
2. `.agents/internal-docs/product/scope-and-nongoals.md`
3. `.agents/internal-docs/adr/0001-v1-boundary-and-lane-model.md`
4. `.agents/internal-docs/adr/0002-external-repo-adoption-matrix.md`
5. `.agents/internal-docs/adr/0003-upstream-relationship-openclaw-zero-token.md`
6. `.agents/internal-docs/adr/0004-architecture-skeleton-monorepo.md`
7. `.agents/internal-docs/contracts/provider-runtime-contract.md`
8. `.agents/internal-docs/contracts/auth-accounts-and-credentials.md`
9. `.agents/internal-docs/contracts/service-and-sdk-surfaces.md`
10. `.agents/internal-docs/blueprints/v1-delivery-plan.md`
11. `.agents/Tasks/TASK_BOARD-*.md`

### 先做什么

后续实现顺序必须遵守：

1. `Kernel Alpha`
2. `Kernel Beta`
3. `First-party Integration`
4. `Consumer Compat`

### 当前最核心的 done signal

在没有 fresh verification 的前提下，不允许说：

- 已完成
- 已打通
- 已稳定

所有完成性结论必须绑定当前轮实际验证结果。

### 产品性格

失败策略必须优先：

1. 明确报错
2. 明确诊断
3. 把选择权交给用户

而不是：

- 偷偷切 provider
- 偷偷换账号
- 平台暗箱兜底

---

## 浏览器与运行时卫生纪律

### 资源卫生是正式约束，不是“顺手注意”

凡是触发 `Chrome / Chromium`、profile、browser bootstrap、live proof、CDP attach、support bundle、runtime cache、Docker sidecar 的任务，都必须把**资源卫生**当成正式 DoD 的一部分。

### 浏览器实例预算（硬上限）

1. 当前机器浏览器实例总数超过 **6** 时，当前 repo **禁止**再新开实例。
   - 先回收当前 repo 自己的实例。
   - 若明显属于别的 repo 或归属不明，标记 `other-repo-owned` / `owner-unknown`，不要越权清理。

2. 当前 repo 自己默认只允许：
   - **1 个主浏览器实例**
   - 必要时额外 **1 个短时诊断实例**

3. 当前 repo 自己的标签页上限是 **3 个**。
   - 超过就先关，不准靠堆 tab 排障。

4. 当前 repo 新克隆 / 新建的临时 profile，默认预算是 **0**。
   - 只有明确必要时才允许临时建。
   - 同轮任务结束前必须清理或明确留下理由。

5. 对同一 provider 的登录态检查 / 恢复预算是 **1-2 次定点尝试**。
   - 两次都证明当前 repo 自己的 canonical browser/profile 没有有效登录态后，就应收成 blocker。
   - 不准继续靠重复 clone profile 或多开浏览器碰运气。

### 必须遵守的规则

`worker-safe` 是当前 repo 的默认模式。禁止 `killall`、`pkill`、`killpg(...)`、非正 PID 信号、`loginwindow` / Force Quit API，以及 AppleScript / `System Events` 应用控制路径；清理只允许命中当前 repo 自己记录的正 PID、browser root、profile、CDP 记录或直接持有的 child handle，归属不明就 fail-closed。

1. **先盘点，再开新实例**
   - 开任何 `Chrome / Chromium` 之前，先检查当前机器上：
     - 当前 repo 自己的 browser 进程
     - 当前 repo 自己的 profile 路径
     - 当前 repo 自己的 runtime temp / support bundle
     - 当前 repo 自己相关的 Docker 容器
   - 如果已有当前 repo 自己的实例仍在运行，默认优先复用或先关干净，不要重复拉起。

2. **只使用当前 repo 自己的浏览器和 profile**
   - 默认本地 credentialed 开发入口是**显式配置的真实 Chrome Profile**。
   - 通过 `WEBAI_BRIDGE_CHROME_USER_DATA_DIR + WEBAI_BRIDGE_CHROME_PROFILE_NAME` 指向用户分配给当前 repo 的真实 Chrome Profile。
   - repo-local `managed-browser` 只保留成显式 fallback，不再是默认日常工位。
   - 不准混用其他 repo 的 L1 已经打开的浏览器、profile、CDP 端口、user-data-dir。
   - 不准因为“电脑上已经有个 Chrome 开着”就直接把它当成本 repo 的合法工作浏览器。

3. **浏览器不准越开越多**
   - 不准在电脑上同时留下多份当前 repo 自己的 Chrome / Chromium 实例。
   - 不准开一堆 tab 不关。
   - 一轮验证结束后，如果当前 repo 不再需要该浏览器实例，就应主动关闭当前 repo 自己的 tab / browser 进程。

4. **浏览器 bootstrap 不准偷留 detached child handle**
   - 不准在当前 repo 的 worker / test / live / bootstrap 路径里使用 `detached: true` + `.unref()` 去放养 Chrome / Chromium 子进程。
   - 新浏览器实例只能通过宿主机 launcher handoff 启动；当前 repo 默认做法是：
     - 新实例启动走 OS handoff
     - 已在线的 repo-owned 浏览器要打开登录页时，走 CDP `/json/new`
   - 不准保留一个稍后再拿来 `signal` / `kill` 的浏览器 child handle。
   - 如果宿主机无法证明这条 handoff 安全成立，就必须 fail-closed，改走 `existing-browser-session` / 手工启动，而不是偷偷降级回 detached launch。

5. **profile 与缓存不准堆积**
   - 不准无上限克隆 browser profile 到缓存里不清理。
   - repo 内部可清理运行时资产尽量统一进 `.runtime-cache/`。
   - repo 外专属临时缓存只允许进入 `~/.cache/webai-bridge/`。
   - 不准把 `web-login-live-proof-*`、support bundle、debug bundle、临时编译目录一直堆在 `.runtime-cache/` 或 `~/.cache/webai-bridge/` 里不管。
   - 默认治理规则固定为：
     - `TTL = 7 days`
     - `maxBytes = 8 GiB`
   - shared tool caches 不归当前 repo 自动清理：
     - `pnpm store`
     - `~/.npm`
     - `~/.cache/pnpm`
     - `~/Library/Caches/pnpm`
     - `~/Library/Caches/ms-playwright`
     - `uv` / `pre-commit` / Docker 全局缓存
     - `.serena/cache`
   - 任务结束后，默认至少要清理当前 repo 自己可安全删除的 temp / old debug bundles；高风险 profile 清理必须显式说明。

6. **Docker 只管当前 repo 自己的**
   - 不准清理、停止、复用、污染其他 repo 的 Docker 容器、volume、cache。
   - 只有当容器明确属于当前 repo，且当前任务已经结束，才允许做 repo-local 清理。

7. **显式禁止外部账户写操作**
   - 没有用户明确授权前，不准对任何外部账户做“写”操作。
   - 包括但不限于：
     - 发帖 / 发消息 / 发表评论
     - 下单 / 购买 / 付款
     - 删除 / 修改用户数据
   - 改设置 / 改资料 / 改安全项
  - 登录、会话检查、只读诊断、截图取证，不等于获得了账户写权限。

8. **多 L1 并行时先判资源归属**
   - 先判断浏览器 / profile / CDP 端口 / Docker 容器是不是当前 repo 自己的。
   - 归属不明确时，标记 `owner-unknown`，不要做 destructive 动作。
   - 不准混用其他 repo 的 L1 已打开的浏览器、profile、attach target、容器或缓存。

### 当前 repo 的默认执行方式

- 浏览器默认优先 `isolated-chrome-root`：
  - `WEBAI_BRIDGE_CHROME_USER_DATA_DIR`
  - `WEBAI_BRIDGE_CHROME_PROFILE_NAME`
  - 当前 repo 的 canonical isolated-root CDP 端口 = `9338`
- 默认 steady-state 根目录 = `~/.cache/webai-bridge/browser/chrome-user-data`
  - 这是 repo 专属独立 Chrome 根目录
  - steady-state 只保留一个 repo-owned 实例
  - 缺席则启动，存在则 attach，不 second-launch
- 浏览器启动与开页当前默认必须走安全协议：
  - 新实例启动 = OS launcher handoff
  - 已在线 repo-owned 浏览器开登录页 = CDP `/json/new`
  - 不保留 detached child handle，不做后续 host kill
- 默认 Chrome 根目录只允许在显式 `seed:isolated-chrome-root` / `reseed:isolated-chrome-root` 时读取。
- `~/.cache/webai-bridge/browser/chrome-user-data` 是永久浏览器工位：
  - 不属于 disposable cache
  - 不纳入 TTL / cap 自动清理
- `managed-browser` 默认降级为 repo-local fallback：
  - `.runtime-cache/webai-bridge-web-auth-browser`
- 当前 repo 的本地运行时状态默认只允许落在：
  - `.runtime-cache/`
  - `~/.cache/webai-bridge`
  - 受控的 repo-local support/debug bundles
- 当前 repo 的 live / credentialed 脚本在 CI 环境里必须 fail-closed：
  - 不允许依赖本地 Profile
  - 不允许依赖本地登录态
  - 当前仓继续只使用 GitHub Hosted Runner，不引入 self-hosted runner
- 任务收尾时必须回答：
  - 我开了哪些当前 repo 自己的浏览器/进程？
  - 我关掉了哪些？
  - 我留下了哪些 profile / temp / bundles？
  - 哪些是故意保留，为什么？

---

## 文档纪律

### 文档写法

所有正式工件默认写成：

- `[已确认]`
- `[当前默认]`
- `[非目标]`
- `[后续目标]`

### 禁止事项

- 不要把上游实现事实写成 `WebaiBridge` 的产品定义
- 不要把上游目录结构当成 `WebaiBridge` 宪法
- 不要把 future compat 偷渡成当前 V1 API 契约
- 不要让 README 成为比 ADR 更高的真理源

---

## 对未来 Agent 的一句话要求

> **你不是在继续做一个更大的 OpenClaw 系列产品。**
>
> **你是在做一个更纯粹、更适合被 AI 产品接入的共享 Provider Runtime。**

如果后续实现偏离这句话，先停下，回到 ADR 与 contracts。
