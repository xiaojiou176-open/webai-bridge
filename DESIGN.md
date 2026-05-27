# WebaiBridge Design Front Door

This file is the single public front door for WebaiBridge design work.

It exists so future changes do not depend on chat memory or private taste before
touching a governed surface.

## Product Truth

WebaiBridge is a shared provider runtime for AI apps.

It is not:

- a chat product
- a hosted control plane
- a multi-tenant admin console
- a marketing-first showcase shell

Every UI and public surface must reinforce the same product truth:

- `BYOK + Web/Login` are the only V1 supply lanes
- the service/runtime substrate is the primary public promise
- runtime/operator surfaces stay local-first and builder-facing
- docs/public surfaces stay truthful, answer-first, and narrow

## Start Here

If you are changing any UI, public surface, or visual language, read in this
order:

1. `DESIGN.md`
2. `design-system/MASTER.md`
3. the matching page master
   - `design-system/webai-bridge-auth-portal/MASTER.md`
   - `design-system/webai-bridge-debug-cockpit/MASTER.md`

If a change does not fit this stack, update the governing contract first.

## Donor Boundary

WebaiBridge uses a fixed donor boundary:

| Surface family | Primary donor posture | Allowed secondary | What it is for |
| --- | --- | --- | --- |
| Authenticated runtime shells | `Linear` | `Raycast` utility chrome only | dense-but-calm operator surfaces, verdict-first hierarchy, long-session readability |
| Docs and public knowledge surfaces | `Mintlify` | `Linear` proof restraint only | answer-first docs routing, reading rhythm, reference clarity |
| Command palette / transient quick actions | `Raycast` | `Linear` shell tone only | keyboard-first assistive chrome, never the full app identity |

Hard freeze:

- do not inherit donor product identity
- do not inherit donor category worldview
- do not use `Mintlify` as the runtime shell
- do not use `Raycast` as the page identity

## Governed Surfaces

These are the main surfaces currently under active design contract:

- `auth-portal`
- provider debug workbench
- docs front door
- public help/reference shelves
- read-only runtime companion entrypoints

## Anti-Drift Questions

Before landing a UI or public-surface change, answer all of these with `yes`:

1. Does the page still tell the truth about what WebaiBridge is and is not?
2. Does the surface still read like the right room: runtime shell, docs router,
   or utility chrome?
3. Did the change stay inside the donor boundary already approved for that
   surface?
4. Does the first screen reduce cognitive load instead of adding decorative
   complexity?
5. Would a future contributor know which deeper contract to open next?

If any answer is `no`, stop and update the governing contract before styling
further.

## Maintainer-Only Detail

If a future review packet needs more design doctrine than this public front
door exposes, that detail belongs in a maintainer-only shelf outside the public
repo plane.
