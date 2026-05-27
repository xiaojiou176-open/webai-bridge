import { describe, expect, it, vi } from "vitest";

import {
  CODEX_THIN_COMPAT_MANIFEST,
  createCodexThinCompatAdapter,
} from "../../../packages/consumers/codex/src/index.ts";

describe("Codex thin compat adapter", () => {
  it("delegates text requests to the shared runtime invoke route", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(`${init?.body ?? "{}"}`);

      expect(body).toMatchObject({
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
          outputText: "codex-ok",
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
      fetch: fetchMock as typeof fetch,
    });
    const result = await adapter.responses({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello from codex",
      lane: "byok",
      mode: "plan",
    });

    expect(result).toEqual(
      expect.objectContaining({
        target: "codex",
        mode: "plan",
        ok: true,
        lane: "byok",
        outputText: "codex-ok",
        route: "/v1/runtime/invoke",
      }),
    );
    expect(CODEX_THIN_COMPAT_MANIFEST.transport).toBe("responses");
  });

  it("fails closed for dual-lane providers without an explicit lane", async () => {
    const adapter = createCodexThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as typeof fetch,
    });

    await expect(
      adapter.responses({
        model: "gemini/gemini-2.5-pro",
        input: "hello",
      }),
    ).rejects.toThrow('must set "lane" explicitly');
  });
});
