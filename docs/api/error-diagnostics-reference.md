# WebaiBridge Error and Diagnostics Reference

## What This Page Covers

这页不是完整 wire schema。  
它只做一件事：

> 把当前最重要的错误语义和 diagnostics 语言讲成人话。

## Core Error Families

### `missing-credential`

意思：

- 你还没有带钥匙进门

常见场景：

- 没有 API key
- 没有 cookie bundle
- 没有 user agent

### `user-action-required`

意思：

- 系统知道问题在哪，但必须用户自己完成下一步

常见场景：

- 重新登录
- 重新授权
- 账号自己去点确认

### `human-verification-required`

意思：

- 不是材料没了，而是 provider 正在要求真人验证 / anti-bot 通过

### `account-action-required`

意思：

- 会话材料可能还在，但账号本身还差一个显式动作才算真正放行

常见场景：

- 关联 X 账号
- 解锁所需套餐 / plan
- 补一次 provider 自己的账户确认

### `permission-gated`

意思：

- 材料已经在，但 browser-side bootstrap 仍被 `Unauthorized` 或权限门挡住

常见场景：

- token / cookie 已存在
- 当前 workspace 也能打开
- 但站内 bootstrap endpoint 仍返回 `401` 或权限不足

### `session-incomplete`

意思：

- 材料在，但浏览器会话还没真正回到可用工作面

典型例子：

- 仍停在 Google sign-in / CookieMismatch 页面

### `provider-unavailable`

意思：

- 上游服务现在不通，或者 provider 当前不给过

### `refreshable-but-degraded`

意思：

- 还能救，但已经在退化，需要尽快修

## Why Diagnostics Matter

`WebaiBridge` 的目标不是“出错时糊成一句 failed”。

它要尽量把这些区别讲清楚：

- 是你没带钥匙
- 还是门没开
- 还是上游今天不开门

## Truthfulness Rule

当前这套 reference 只覆盖 **已经在代码和 tests 里落地的错误语言**。  
不覆盖未来 compat 的幻想错误码。
