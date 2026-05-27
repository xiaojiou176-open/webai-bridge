import { describe, expect, it, vi } from "vitest";

import {
  ThinCompatUnsupportedFeatureError,
  createThinCompatAdapter,
  createThinCompatManifest,
} from "../../../packages/consumers/shared/src/index.ts";

describe("shared thin compat helpers", () => {
  it("infers single-lane providers without requiring lane", async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          provider: "openai",
          model: "openai/gpt-4.1",
          lane: "byok",
          outputText: "OK",
        };
      },
    }));
    const manifest = createThinCompatManifest({
      target: "codex",
      transport: "responses",
      notes: ["builder-facing runtime adapter only"],
    });
    const adapter = createThinCompatAdapter(manifest, {
      baseUrl: "http://127.0.0.1:4321",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const response = await adapter.invokeText({
      model: "openai/gpt-4.1",
      input: "hello",
    });

    expect(JSON.parse(`${fetchMock.mock.calls[0]?.[1]?.body ?? ""}`)).toEqual({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello",
      lane: "byok",
    });
    expect(response).toMatchObject({
      target: "codex",
      lane: "byok",
      ok: true,
    });
  });

  it("rejects unknown provider ids", async () => {
    const manifest = createThinCompatManifest({
      target: "codex",
      transport: "responses",
      notes: ["builder-facing runtime adapter only"],
    });
    const adapter = createThinCompatAdapter(manifest, {
      baseUrl: "http://127.0.0.1:4321",
      fetch: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      adapter.invokeText({
        provider: "mystery",
        model: "openai/gpt-4.1",
        input: "hello",
        lane: "byok",
      }),
    ).rejects.toMatchObject({
      name: "WebaiBridgeContractError",
      message: expect.stringContaining('Unknown provider "mystery"'),
    });
  });

  it("rejects invalid model references when provider is omitted", async () => {
    const manifest = createThinCompatManifest({
      target: "codex",
      transport: "responses",
      notes: ["builder-facing runtime adapter only"],
    });
    const adapter = createThinCompatAdapter(manifest, {
      baseUrl: "http://127.0.0.1:4321",
      fetch: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      adapter.invokeText({
        model: "not-a-provider",
        input: "hello",
        lane: "web",
      }),
    ).rejects.toMatchObject({
      name: "WebaiBridgeContractError",
    });
  });

  it("throws the shared unsupported-feature error with target context", () => {
    const error = new ThinCompatUnsupportedFeatureError("approval-ui", "openclaw");

    expect(error.name).toBe("ThinCompatUnsupportedFeatureError");
    expect(error.feature).toBe("approval-ui");
    expect(error.target).toBe("openclaw");
    expect(error.message).toContain('intentionally does not expose "approval-ui"');
  });
});
