# WebaiBridge Default First Success

The easiest mistake for a first-time WebaiBridge visitor is opening twenty docs
tabs before proving even one bounded path.

This page only does one job:

> **Compress the shortest, most honest, most valuable first-success route into
> one line.**

If this route works, then open the deeper shelves.

If it does not work yet, do **not** jump straight into packet/accounting pages,
contracts, or program blueprints. Fix the bounded first success first.

The public front row is intentionally small:

- `README.md`
- `docs/media/30-second-overview.md`
- this page
- `docs/public-proof-pack.md`
- `docs/public-distribution-ledger.md`
- `docs/api/service-http-reference.md`

The bootstrap runbook stays public, but demoted:

- `docs/runbooks/dev-bootstrap.md`

The old Wave 1 working packs now live in a private maintainer-only shelf and
are not part of this route.

In plain English:

- start the WebaiBridge service runtime
- prove the runtime is alive
- prove it can accept one minimal invoke
- only then move into builder packs, starter packs, or compat lanes

## Default Route

If you prefer a click-first local experience instead of a manual step ladder,
run this first:

```bash
pnpm run start:local-experience
```

That one command starts the local runtime, serves the docs front door, and
prints the ready-to-open URLs for the local `auth-portal`, a provider
workbench, and the docs front door.

### Step 1. Start the local service runtime

```bash
pnpm run start:service-local
```

Think of this as turning the power on for the runtime.

Default port:

- `http://127.0.0.1:4010`

### Step 2. Prove the read-only runtime surface is alive

```bash
pnpm run example:mcp-inspector
```

This proves:

- the service runtime is reachable
- the read-only MCP surface can boot
- the tool inventory is readable
- `runtime.health` is actually reachable

If you only need to prove that the runtime on this machine is alive, stopping
here is already a useful first success.

### Step 3. Prove one minimal invoke path

```bash
pnpm run example:runtime-bridge
```

This is the closest minimal proof of the WebaiBridge value proposition:

- it sends one bounded JSON body through `/v1/runtime/invoke`
- it proves the shared runtime can do more than list tools and print catalogs

This step needs your own valid access material:

- for `BYOK`
  - the target provider API key
- for `Web/Login`
  - a valid web-login session, cookie bundle, and user agent

## If You Get Stuck

### You cannot get past Step 2

Start here:

- [docs/runbooks/dev-bootstrap.md](./runbooks/dev-bootstrap.md)
- [docs/api/service-http-reference.md](./api/service-http-reference.md)
- [docs/mcp.md](./mcp.md)

### Step 2 works, but Step 3 fails

That usually does **not** mean "the repo is broken." It usually means:

- the target provider credentials are not ready
- the current workstation is missing session material
- the browser session, cookie bundle, or user agent is incomplete

Start here:

- [docs/public-proof-pack.md](./public-proof-pack.md)
- [docs/api/error-diagnostics-reference.md](./api/error-diagnostics-reference.md)
- [docs/api/web-login-acquisition.md](./api/web-login-acquisition.md)

## What To Open Next

### I want the builder path next

Open:

- [docs/starter-pack-chooser.md](./starter-pack-chooser.md)
- [starter-packs/README.md](../starter-packs/README.md)

### I want to wire this into a host next

Open:

- [docs/host-integration-playbooks.md](./host-integration-playbooks.md)
- [examples/hosts/README.md](../examples/hosts/README.md)

## What This Path Proves

- WebaiBridge really has a service-first runtime front door
- the repo really has a runnable read-only MCP surface
- the repo really has an executable minimal invoke starter
- you do **not** need to pretend you already have full Codex, Claude Code, or
  OpenClaw parity

## What This Path Does Not Prove

- full consumer parity
- an MCP execution brain
- any marketplace is already listed
- every Web/Login provider on every machine is already live-ready

## Closing Sentence

> **Run one bounded success first.**
>
> **Open builder lanes second.**
>
> That is the most honest front door WebaiBridge can offer today.
