import { describe, expect, it, vi } from "vitest";

import {
  OPENCLAW_THIN_COMPAT_MANIFEST,
  createOpenclawThinCompatAdapter,
} from "../../../packages/consumers/openclaw/src/index.ts";

describe("OpenClaw thin compat adapter", () => {
  it("exposes runtime delegation metadata without product-shell inheritance", () => {
    const adapter = createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as typeof fetch,
    });

    expect(adapter.manifest).toEqual(
      expect.objectContaining({
        target: "openclaw",
        transport: "delegated-runtime",
        failClosed: true,
      }),
    );
    expect(OPENCLAW_THIN_COMPAT_MANIFEST.notes).toContain(
      "provider/runtime delegation without product-shell inheritance",
    );
  });

  it("exposes preview, dispatch-plan, and preflight builder wedges without widening parity claims", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/bootstrap")) {
        return new Response(
          JSON.stringify({
            surface: {
              runtimeShape: "runtime-first",
            },
            bootstrap: {
              serviceName: "webai-bridge-service",
              lane: "web",
              consumption: "service-first",
              routeCatalog: {
                bootstrap: "/v1/runtime/bootstrap",
                health: "/v1/runtime/health",
                invoke: "/v1/runtime/invoke",
                dispatchPlan: "/v1/runtime/dispatch-plan",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            lane: "web",
            generatedAt: "2026-04-21T17:00:00.000Z",
            totals: {
              total: 5,
              ready: 4,
              degraded: 1,
              userActionRequired: 0,
              unavailable: 0,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/dispatch-plan")) {
        const body = JSON.parse(`${init?.body ?? "{}"}`);

        expect(body).toMatchObject({
          provider: "chatgpt",
          model: "chatgpt/gpt-4o",
          lane: "web",
          input: "hello from openclaw",
        });

        return new Response(
          JSON.stringify({
            dispatchPlan: {
              providerId: "chatgpt",
              requestedModel: "chatgpt/gpt-4o",
              selectedLane: "web",
              candidateLanes: ["web-login"],
              dispatchReason: "single-lane-provider",
              credentialStates: {
                "web-login": "ready",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/doctor")) {
        return new Response(
          JSON.stringify({
            doctor: {
              providerId: "chatgpt",
              alignment: {
                story: "dispatchable",
              },
              receipt: {
                recommendedCliCommands: [
                  "pnpm run webai-bridge:cli -- provider-doctor --provider chatgpt --json",
                ],
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected request ${url}`);
    });

    const adapter = createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as typeof fetch,
    });

    const preview = adapter.previewDelegation({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });
    const dispatchPlan = await adapter.readDispatchPlan({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });
    const doctor = await adapter.readProviderDoctor({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });
    const preflight = await adapter.preflightDelegation({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });

    expect(preview).toEqual(
      expect.objectContaining({
        mode: "copilot-brain",
        requestBody: expect.objectContaining({
          provider: "chatgpt",
          lane: "web",
        }),
        runtimeRoutes: expect.objectContaining({
          dispatchPlan: "http://webai-bridge.test/v1/runtime/dispatch-plan",
        }),
      }),
    );
    expect(dispatchPlan).toEqual(
      expect.objectContaining({
        dispatchPlan: expect.objectContaining({
          providerId: "chatgpt",
          selectedLane: "web",
        }),
      }),
    );
    expect(doctor).toEqual(
      expect.objectContaining({
        doctor: expect.objectContaining({
          providerId: "chatgpt",
          alignment: expect.objectContaining({
            story: "dispatchable",
          }),
        }),
      }),
    );
    expect(preflight).toEqual(
      expect.objectContaining({
        dispatchPlan: expect.objectContaining({
          dispatchReason: "single-lane-provider",
        }),
        doctor: expect.objectContaining({
          providerId: "chatgpt",
          alignment: expect.objectContaining({
            story: "dispatchable",
          }),
        }),
        runtime: expect.objectContaining({
          health: expect.objectContaining({
            totals: expect.objectContaining({
              ready: 4,
            }),
          }),
        }),
      }),
    );
    expect(preflight.advisories).toEqual(
      expect.arrayContaining([
        expect.stringContaining("product shell"),
        expect.stringContaining("Web lane"),
      ]),
    );
  });

  it("delegates invoke calls through the shared runtime and normalizes web responses", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(`${init?.body ?? "{}"}`);

      expect(body).toMatchObject({
        provider: "chatgpt",
        model: "chatgpt/gpt-4o",
        input: "hello from openclaw",
        lane: "web",
      });

      return new Response(
        JSON.stringify({
          provider: "chatgpt",
          model: "chatgpt/gpt-4o",
          lane: "web",
          outputText: "openclaw-ok",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const adapter = createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as typeof fetch,
    });
    const result = await adapter.delegateTurn({
      provider: "chatgpt",
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });

    expect(result).toEqual(
      expect.objectContaining({
        target: "openclaw",
        mode: "copilot-brain",
        ok: true,
        lane: "web",
        outputText: "openclaw-ok",
      }),
    );
  });

  it("stays fail-closed when a dual-lane provider omits the lane in the builder preview", () => {
    const adapter = createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as typeof fetch,
    });

    expect(() =>
      adapter.previewDelegation({
        provider: "gemini",
        model: "gemini/gemini-2.5-pro",
        input: "hello from openclaw",
      }),
    ).toThrow(/supports multiple lanes/i);
  });
});
