# WebaiBridge Glossary / 术语表

## Shared Provider Runtime

English:
A reusable runtime layer that normalizes provider access for AI apps.

中文：
给 AI 产品复用的一层 provider 运行时，把不同来源的能力统一成同一种语言。

## BYOK

English:
Bring Your Own Key. The end user or developer supplies an official API key.

中文：
用户或开发者自己带官方 API Key。

## Web/Login

English:
A provider access path backed by browser login, OAuth, or subscription session material.

中文：
通过网页登录、OAuth 或 subscription 会话材料驱动的 provider 接入路径。

## Service-first

English:
Consume the runtime through a service boundary first.

中文：
先通过服务边界接入运行时，而不是先深耦合 SDK。

## API substrate first

English:
Treat the runtime/service API as the first public substrate that current contracts and verification lock against.

中文：
先把运行时/API 这层公共地基锁死，再让其他消费面建立在这层 substrate 上。

## SDK/client surface

English:
A formal consumer surface that shares the same runtime semantics, but does not redefine the current substrate.

中文：
建立在同一运行时语义上的正式消费面，但它不反过来定义当前主 substrate。

## First-party Integration

English:
The initial service-first integrations into the owner’s own repos.

中文：
先把 WebaiBridge 接进自己的三个仓，作为第一批 service-first 集成。

## Consumer Compat

English:
Future compatibility work for external consumer products like Codex, Claude Code, or OpenClaw.

中文：
面向 Codex、Claude Code、OpenClaw 这类外部消费层产品的未来兼容工作。

## MCP

English:
Model Context Protocol or an MCP-style tooling adapter.

中文：
Model Context Protocol，或者围绕它的一层 AI tooling adapter。

## Truthful Claim

English:
A statement that is backed by current committed code or docs that clearly mark something as planned.

中文：
有当前已提交代码支撑，或文档明确标注为 planned 的诚实说法。
