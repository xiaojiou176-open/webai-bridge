# WebaiBridge Remotion Promo

This is a standalone Remotion package for a short WebaiBridge promo video.

It stays outside the main workspace on purpose:

- no impact on `apps/*` / `packages/*`
- no accidental pull into the main `pnpm-workspace.yaml`
- public-media iteration can move fast without polluting the runtime repo surface

## Story

The current cut is a short product-facing promo:

1. WebaiBridge is a shared provider runtime for AI apps.
2. It unifies `BYOK + Web/Login` into one service-first runtime.
3. It ships truth-first docs, partial read-only MCP, and thin compat bridges.
4. It stays fail-closed on claims: package-ready is not listed-live.

## Local Usage

Install dependencies inside this folder:

```bash
pnpm install
```

Start Remotion Studio:

```bash
pnpm run studio
```

Render a verification still:

```bash
pnpm run still
```

Render the full video:

```bash
pnpm run render
```

Outputs are written to `out/`.
