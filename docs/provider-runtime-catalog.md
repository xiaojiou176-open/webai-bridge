# WebaiBridge Provider Runtime Directory

This page is the thin public wrapper for the static provider directory.

In plain English:

- this page explains what the provider directory is for
- the actual machine-readable truth lives in the JSON catalog
- this page does **not** report live auth state, browser state, or invoke health

## Machine-Readable Source

- [catalogs/provider-runtime-catalog.json](../catalogs/provider-runtime-catalog.json)
- [catalogs/provider-runtime-catalog.schema.json](../catalogs/provider-runtime-catalog.schema.json)

## Read-Only Access

```bash
pnpm run webai-bridge:cli -- provider-catalog
pnpm run webai-bridge:cli -- provider-catalog-schema
pnpm run webai-bridge:cli -- provider-entry --target chatgpt
pnpm run webai-bridge:cli -- provider-entry --target openai:byok
pnpm run webai-bridge:cli -- provider-entry --target gemini:web-login
```

- `webai-bridge.catalog.provider_catalog`
- `webai-bridge.catalog.provider_catalog_schema`
- `webai-bridge.catalog.provider_entry`

## What The Directory Tells You

Each entry answers the same bounded questions:

- `providerId`
- `lane`
- `providerId + lane` public addressing
- `authMode`
- `stabilityTarget`

If the same `providerId` appears on multiple lanes, use `providerId:lane` to
disambiguate. For example:

- `openai:byok`
- `gemini:web-login`

## What It Does Not Tell You

This directory does **not** replace:

- live auth status
- browser session state
- provider probe or remediation
- invoke success on the current machine

For those questions, go back to:

- [docs/public-surface-catalog.md](./public-surface-catalog.md)
- [docs/mcp.md](./mcp.md)
- [docs/host-integration-playbooks.md](./host-integration-playbooks.md)

## Decision Summary

> The provider runtime directory is a static truth wrapper around the provider
> catalog JSON. It exists to keep provider ids and lanes readable without
> turning this page into a live status surface.
