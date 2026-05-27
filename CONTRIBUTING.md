# Contributing to WebaiBridge

`WebaiBridge` 不是“想到什么就往里塞”的 playground。

更直白一点说：

- 先说真话
- 再做最小改动
- 最后拿证据收口

## Start Here

开始前先读：

- `README.md`
- `DESIGN.md` if you are touching UI, UX, or public-facing wording/IA
- `docs/public-proof-pack.md`
- `docs/public-distribution-ledger.md`
- `docs/testing-pyramid.md`
- `docs/runbooks/dev-bootstrap.md`

如果你改的是 contract / API / outward wording，还要再读对应的 `docs/contracts/`、`docs/api/`、`docs/blueprints/`。

## 5-Layer Gate

把验证链理解成 5 道安检门：

1. `pre-commit`
   本地最早拦截 secrets 与 frontdoor hygiene drift。
2. `pre-push`
   本地 coverage / test / build 总闸。
3. `hosted`
   GitHub Actions 负责 repo-side 代码与合同。
4. `nightly`
   hosted-safe 的定时重检查。
5. `manual`
   credentialed workstation only，用于 live/provider/browser realism。

重要边界：

- `manual` 不等于普通 CI。
- 没有真人工位和用户凭证，不要把 live/provider/browser 说成“已经验证通过”。
- repo-side green 不等于 current workspace live truth 也 green。

## Before You Open a PR

请先做到：

1. 改动保持 surgical，不顺手扩 scope。
2. 跑完本地应该跑的门禁，至少不要绕开 `pre-commit` / `pre-push`。
3. 如果你改了 README、proof wording、distribution wording 或 public surface catalog，必须一起对齐相关 docs。
4. 不要把 `partial` 写成 `supported now`，也不要把 `package-ready` 写成 `officially listed`。
5. 如果改动触及 live/provider/browser/manual surface，要明确说明这是不是只属于 credentialed workstation truth。

## Truthfulness Rules

这些说法必须分开：

- `repo-side green`
- `workspace external blocker`
- `package-ready`
- `officially listed`
- `partial`
- `supported now`

像生活里的门牌一样，门牌写错了，别人就会走错门。

## Scope Rules

默认不做这些：

- Render / hosted runtime rollout
- marketplace / registry listing claim
- control-plane 扩 scope
- 隐式 failover / 换账号 / 池化

如果你只是补一个局部实现，不要把自己扩写成“整个项目完成了”。

## Need Help?

如果问题是：

- bug / regression
  先开 bug issue
- feature / front door improvement
  先开 feature issue 或 discussion
- live/provider/browser/manual question
  先看 `docs/runbooks/dev-bootstrap.md`
