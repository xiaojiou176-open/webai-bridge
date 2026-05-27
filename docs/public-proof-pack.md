# WebaiBridge Public Proof Pack

This page does **not** claim that WebaiBridge has already finished every lane,
provider, compat route, or distribution surface.

It exists to answer one narrower question:

> **What can this repository honestly prove today?**

If you are choosing your first page, stay on the short public path first:

- README
- `docs/first-success.md`
- this proof pack
- `docs/api/service-http-reference.md`

Keep these public, but one shelf deeper:

- `docs/public-surface-support-matrix.md`
- `docs/runbooks/dev-bootstrap.md`

Contract shelves, blueprints, and packet/accounting pages still matter, but
they are not the first stop for a new reader. The old Wave 1 working packs also
now live outside the public docs plane in a private maintainer-only shelf.

## One-Line Verdict

Today WebaiBridge can be honestly proved as:

- a `shared provider runtime for AI apps`
- a `BYOK + Web/Login` service-first substrate
- a builder-facing runtime repo with partial thin compat, a partial read-only
  MCP surface, and copy-ready starter packs

## Four Things This Repo Can Prove Today

### 1. The repo-side gate is real

This is not just "the docs look polished." The repo has fresh repo-side
evidence:

- `pnpm typecheck` = `0`
- `pnpm exec vitest run tests/integration/docs/frontdoor-docs.test.ts tests/integration/docs/package-ready-distribution.test.ts tests/unit/mcp/webai-bridge-mcp.test.ts tests/unit/web/webai-bridge-cli.test.ts --config vitest.config.ts` = `0`
  - `5 files / 43 tests passed`
- `pnpm build` = `0`

### 2. The service-first runtime front door is real

Start here:

- [docs/api/service-http-reference.md](./api/service-http-reference.md)
- [docs/api/openapi.yaml](./api/openapi.yaml)
- [examples/runtime-bridge/README.md](../examples/runtime-bridge/README.md)

Minimal invoke proof:

```bash
pnpm run start:service-local
pnpm run example:runtime-bridge
```

### 3. The read-only MCP surface is not just marketing copy

Minimal read-only proof:

```bash
pnpm run example:mcp-inspector
```

That proves:

- the MCP server boots
- the tool inventory is readable
- `webai-bridge.runtime.health` is readable
- the same runtime truth can also be opened through a thin local browser-facing
  auth/debug shell

That does **not** prove:

- a write plane
- an execution brain
- runtime invoke through MCP

### 4. The public boundary is written down, not implied

Current public truth is intentionally layered:

- `HTTP / API` = `supported now`
- `SDK/client` = `partial`
- `CLI` = `partial`
- `MCP` = `partial / read-only`
- `Codex / Claude Code / OpenClaw compat` = `partial / thin / fail-closed`
- local auth/debug HTML pages stay thin and read-only over the same runtime
  truth; they are not a hosted control plane

Use these pages:

- [docs/public-surface-support-matrix.md](./public-surface-support-matrix.md)
- [docs/public-distribution-ledger.md](./public-distribution-ledger.md)
- [docs/runbooks/dev-bootstrap.md](./runbooks/dev-bootstrap.md)
- [docs/compat/README.md](./compat/README.md)

Do **not** treat packet/accounting pages or Wave 1 working packs as first-row
landing pages. Packet accounting is a deeper public shelf, while the Wave 1
contract/evidence packs now live in a private maintainer-only shelf.

## Current Live Truth For This Workspace

This section must stay conservative because live reality is never a repo
constant.

For the current credentialed workstation, the front door should stay at this
level of honesty instead of copying a dated scorecard:

- `repo-side gate = green` is a repo-owned verdict
- workstation-specific blockers belong to local proof or runbook receipts
- detailed provider names, current browser states, and one-machine external
  tails should not be copied into every first-row public page

In plain English:

- the repo is not blocked on internal engineering debt
- the current stop is workstation-specific browser/session/user action reality
- a different machine, cookie bundle, or browser user agent may change the
  outcome

When you read `pnpm run reality:gate`, split it into two ledgers instead of
flattening it into one score:

- `overallStatus = external-blocker` and `exitCode = 2` mean the current
  workstation still stops at an external/browser/user-action blocker
- `repoOwnedGate.verdict = pass` means the repo-owned gate still passed and this
  checkpoint should not be narrated as an internal repo or milestone failure
- only `repoOwnedGate.verdict = fail` should be read as repo-owned failure

## Minimal Proof Bundle

If you want the fastest "I believe this is real" route, run these in order:

### A. Prove the service is alive

```bash
pnpm run start:service-local
```

### B. Prove the read-only truth surface is reachable

```bash
pnpm run example:mcp-inspector
```

### C. Prove one bounded invoke path can run

```bash
pnpm run example:runtime-bridge
```

### D. If you are already on a credentialed workstation, run aggregate reality

```bash
pnpm run reality:gate
```

## Allowed Claims Now

You can honestly claim:

- `shared provider runtime`
- `BYOK + Web/Login`
- `API substrate first`
- `service-first runtime frontdoor`
- `partial thin compat`
- `partial read-only MCP surface`
- `copy-ready starter packs`
- `package-ready / starter-pack-ready / not officially listed yet`

## Forbidden Overclaims

You cannot honestly claim:

- `full Codex parity`
- `full Claude Code parity`
- `full OpenClaw parity`
- `MCP execution brain`
- `officially listed in a marketplace or registry`
- `all Web/Login providers are live-ready on every machine`

## Related Pages

- [docs/media/30-second-overview.md](./media/30-second-overview.md)
- [docs/first-success.md](./first-success.md)
- [examples/README.md](../examples/README.md)
- [starter-packs/README.md](../starter-packs/README.md)
- [docs/public-surface-support-matrix.md](./public-surface-support-matrix.md)
- [docs/public-distribution-ledger.md](./public-distribution-ledger.md)
