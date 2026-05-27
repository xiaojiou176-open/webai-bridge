import { describe, expect, it, vi } from "vitest";

import {
  CODEX_THIN_COMPAT_MANIFEST,
  CODEX_UNSUPPORTED_FEATURES,
  createCodexCompatAdapter,
  createCodexThinCompatAdapter,
} from "./index.js";

describe("codex thin compat adapter", () => {
  it("publishes a fail-closed manifest and legacy describe view", () => {
    expect(CODEX_THIN_COMPAT_MANIFEST).toEqual(
      expect.objectContaining({
        target: "codex",
        status: "partial",
        failClosed: true,
        route: "/v1/runtime/invoke",
        transport: "responses",
      }),
    );

    const adapter = createCodexCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as unknown as typeof fetch,
    });

    expect(adapter.describe()).toEqual(
      expect.objectContaining({
        target: "codex",
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: CODEX_UNSUPPORTED_FEATURES,
      }),
    );
  });

  it("routes text requests through the shared runtime invoke entrypoint", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(`${init?.body ?? "{}"}`)).toMatchObject({
        provider: "openai",
        model: "openai/gpt-4.1",
        input: "hello from codex",
        lane: "byok",
      });

      return new Response(
        JSON.stringify({
          provider: "openai",
          model: "openai/gpt-4.1",
          lane: "byok",
          text: "codex-ok",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const adapter = createCodexThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const legacy = await adapter.invokeText({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello from codex",
      lane: "byok",
    });
    const thin = await adapter.responses({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello from codex",
      lane: "byok",
    });

    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        ok: true,
        outputText: "codex-ok",
      }),
    );
    expect(thin).toEqual(
      expect.objectContaining({
        target: "codex",
        ok: true,
        outputText: "codex-ok",
        route: "/v1/runtime/invoke",
      }),
    );
  });
});
