# WebaiBridge Public Design Contract

## Role

This file is the public operational contract for WebaiBridge design work.

Authority order for public design assets is fixed:

1. `DESIGN.md`
2. `design-system/MASTER.md`
3. `design-system/webai-bridge-auth-portal/MASTER.md`
4. `design-system/webai-bridge-debug-cockpit/MASTER.md`

Page masters may tighten or specialize a rule. They may not reopen donor
selection or widen the borrow boundary.

## Product Truth

WebaiBridge is a builder-facing shared provider runtime for AI apps.

It is not:

- a chat product
- a hosted multi-tenant control plane
- a generic enterprise admin dashboard
- a marketing-first launch shell

The design system must reinforce:

- local-first
- service/runtime first
- builder-facing
- verdict-first
- progressive disclosure
- truthful docs

## Surface Families

| Surface family | Primary design posture | Guardrail |
| --- | --- | --- |
| Runtime shells | dense-but-calm operator shell | no docs shell takeover, no launcher-as-identity |
| Utility chrome | compact assistive controls only | must stay secondary to the governed page shell |
| Public docs/help surfaces | answer-first editorial routing | no runtime cockpit styling, no warehouse-style file inventory |

## Forbidden Inheritances

The following are frozen out even if they look polished:

- hosted SaaS theater
- consumer-chat worldview
- donor product/category inheritance
- fake KPI walls, fake observability, or decorative proof inflation

## Public Docs Contract

`README`, the docs front door, and public help/reference shelves are governed
surfaces.

Their rules are intentionally narrow:

- public docs stay answer-first and editorial
- proof cards and trust-boundary labels may appear only as restraint
- launcher chrome does not lead any docs/public shell
- the public plane should route, not enumerate every shelf

Typography and accessibility defaults:

- `Inter` is allowed only on docs/public surfaces
- runtime/operator surfaces default back to `IBM Plex Sans + JetBrains Mono`
- a visible `Skip to main content` link becomes mandatory once public docs
  navigation stops being compact

## Runtime Shell Defaults

Runtime/operator surfaces should keep:

- dark matte surfaces
- green primary action
- muted technical metadata
- monospaced runtime identifiers
- no neon glow, no fake KPI cards, no "Contact Sales" primary CTA

## Maintainer-Only Detail

If a future review packet needs more design doctrine than this public contract,
that detail belongs in a maintainer-only shelf outside the public repo plane.
