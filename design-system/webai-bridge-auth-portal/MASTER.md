# WebaiBridge Auth Portal Override

## [Confirmed] Override Priority

Read `design-system/MASTER.md` first.

If this file conflicts with the root master, the root master wins.

## [Confirmed] Surface Contract

This page is the WebaiBridge front desk, not a product showcase.

It must answer:

- what this page is
- what it is not
- which lane needs attention next
- what the current verdict is before deeper workflow detail

## [Confirmed] Surface-to-Donor Map

| Sub-surface | Primary donor | Allowed borrowing | Frozen exclusions |
| --- | --- | --- | --- |
| Page shell | `Linear` | dark operational shell, dense-but-calm grouping, border-led structure, sustained readability | no `Mintlify` page shell, no `Raycast` launcher feel as the full page identity |
| Lane split and verdict strip | `Linear` | clear hierarchy, evidence-first framing, restrained status grouping | no marketing hero, no feature-grid framing, no fake KPI counters |
| Provider cards | `Linear` | action-first cards, calm metadata, mono runtime labels | no enterprise admin card taxonomy, no issue-tracker nouns, no card rows built around vanity metrics |
| Quick actions or command-like entrypoints | `Raycast` utility chrome only | keyboard hints, compact quick actions, transient command grammar | must stay secondary to the page shell, must not become the primary navigation model |
| Embedded help/reference copy | `Linear` shell remains primary | `Mintlify` readability only for subordinate help text or reference excerpts | help must not turn the first screen into a docs landing page |

## [Confirmed] Forbidden Inheritances

- no hosted-control-plane nouns such as `Workspace`, `Billing`, `Users`, or
  `Invite teammates`
- no consumer-chat framing such as "ask anything" hero copy or a centered chat
  composer
- no docs-site first impression, green marketing gradient, or docs-card rhythm
- no customer-logo bars, testimonials, or launch-page CTA hierarchy

## [Current Default] Drift Questions

Before changing this surface, answer all of these with `yes`:

1. Does the first screen still lead with lane status and trust boundary instead
   of product marketing?
2. Are `BYOK` and `Web/Login` still the first split instead of feature buckets
   or SaaS modules?
3. If quick actions appear, are they clearly secondary `Raycast`-style utility
   chrome rather than the page identity?
4. If help content appears, does it remain subordinate to the `Linear` shell
   rather than turning the page into a docs surface?
5. Would a builder recognize this as a local-first runtime front desk rather
   than a chat product or hosted admin console?

## [Current Default] Visual Constraints

- dark operational shell
- matte panels, quiet borders, restrained shadow
- readable technical density
- no consumer showcase blocks
- no "Contact Sales" or "Learn More" style primary CTA
