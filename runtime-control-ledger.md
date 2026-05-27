# Runtime Control Ledger

This page is the doctor-first local control ledger for the repo-owned
`start-local-experience` shell.

It exists to answer one practical question:

> If the local runtime is up, where should I look first before I click around?

## Status

- `supported now`
- Source anchors:
  - `scripts/start-local-experience.mjs`
  - `docs/api/service-http-reference.md`
  - `packages/surfaces/http/src/http-surface.ts`
  - `tests/integration/service-http/http-surface.integration.test.ts`

## Recommended Reading Order

1. `Runtime doctor`
   - Route: `GET /v1/runtime/doctor`
   - Job: read the aggregated runtime ledger before you inspect any one provider
2. `Runtime plan`
   - Route: `POST /v1/runtime/plan`
   - Job: ask the runtime which provider/lane/model it would recommend for the
     task you actually want to run
3. `Provider doctor`
   - Route: `GET /v1/runtime/providers/{providerId}/doctor`
   - Job: inspect one provider's policy, dispatchability, and remediation truth
4. `Auth portal`
   - Route: `GET /v1/runtime/auth-portal`
   - Job: recover local session material when the doctor surfaces
     `session-incomplete`, `user-action-required`, or similar blockers

## Why This Order Exists

`WebaiBridge` treats the auth portal as a local-first acquisition surface, not a
control-plane product.

So the healthier default is:

- read the `runtime doctor` first
- use `runtime plan` when the task is not tied to one provider yet
- drop to `provider doctor` when a single provider needs inspection
- only then use the auth portal for targeted session recovery

## Default Local Routes

When `scripts/start-local-experience.mjs` runs with its default ports, the local
entry points are:

- Runtime doctor: `http://127.0.0.1:4010/v1/runtime/doctor`
- Runtime plan: `http://127.0.0.1:4010/v1/runtime/plan`
- Auth portal: `http://127.0.0.1:4010/v1/runtime/auth-portal`
- This ledger page: `http://127.0.0.1:4185/runtime-control-ledger.md`

## Not This Page's Job

This page does not turn the docs front door into a second control plane.

It is only a routing ledger for the stronger local shell:

- what to inspect first
- what route answers which question
- when to move from aggregate doctor truth to provider-specific remediation
