# WebaiBridge for OpenClaw

## Status

- `partial`
- `thin runtime adapter landed`
- `full OpenClaw compatibility not supported yet`

## What We Can Truthfully Say Today

- `openclaw-zero-token` is a technical upstream for Web/Login runtime ideas
- the current repo truth is `partial`, but only in a delegation-first thin
  sense

## What Is Already Landed

- WebaiBridge already uses OpenClaw research to shape:
  - Web/Login runtime boundaries
  - auth/session design
  - thin HTTP/runtime seams
  - a delegation-first builder wedge at `packages/consumers/openclaw/src/index.ts`

## Builder-Facing Landed Slice

The honest story today is no longer just "one invoke can pass through."

This builder wedge now also exposes four useful but still tightly bounded
surfaces:

- `previewDelegation()`
  - inspect how the request will be normalized before handing it to the runtime
- `readDispatchPlan()`
  - read the runtime's current lane and credential-state dispatch decision
- `bootstrapDelegation()` + `healthDelegation()`
  - read runtime frontdoor and health truth before the first delegation shot
- `preflightDelegation()`
  - collect preview, bootstrap, health, and dispatch-plan into one builder preflight view

The current wedge now also has one more useful read-only surface:

- `readProviderDoctor()`
  - read one provider-scoped doctor receipt that already aligns policy, dispatch, remediation, and next-step builder guidance

That means this `OpenClaw` compat route is no longer only a razor-thin
"call `/invoke` once" bridge. It is now closer to a real builder wedge while
still staying fail-closed.

## What Is Not Landed

- no operator/control-plane worldview parity
- no channels/mobile companion shell
- no truthful basis to claim full OpenClaw support today

## Boundary Reminder

OpenClaw is not a small “easy compat target.”

It carries a much larger product world:

- gateway control plane
- operator and session protocol
- plugin/backend boundaries

So this page needs to say something very specific:

> this repo is no longer pure research-only thinking,
> but it is still fail-closed builder compat, not OpenClaw product-shell parity
