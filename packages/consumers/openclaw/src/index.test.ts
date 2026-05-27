import { describe, expect, it, vi } from "vitest";

import {
  OPENCLAW_THIN_COMPAT_MANIFEST,
  OPENCLAW_UNSUPPORTED_FEATURES,
  createOpenClawCompatAdapter,
  createOpenclawThinCompatAdapter,
} from "./index.js";

describe("openclaw thin compat adapter", () => {
  it("keeps runtime delegation metadata bounded and exposes builder preflight surfaces", async () => {
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
              ready: 3,
              degraded: 1,
              userActionRequired: 1,
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

    expect(OPENCLAW_THIN_COMPAT_MANIFEST).toEqual(
      expect.objectContaining({
        target: "openclaw",
        status: "partial",
        failClosed: true,
        transport: "delegated-runtime",
      }),
    );

    const adapter = createOpenClawCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(adapter.describeDelegation()).toEqual(
      expect.objectContaining({
        target: "openclaw",
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: OPENCLAW_UNSUPPORTED_FEATURES,
      }),
    );

    const preview = adapter.previewDelegation({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });
    const bootstrap = await adapter.bootstrapDelegation();
    const health = await adapter.healthDelegation();
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
    const thin = await createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    }).delegateTurn({
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
    });
    const legacy = await adapter.invokeText({
      provider: "chatgpt",
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
    });

    expect(bootstrap).toEqual(
      expect.objectContaining({
        bootstrap: expect.objectContaining({
          serviceName: "webai-bridge-service",
        }),
      }),
    );
    expect(preview).toEqual(
      expect.objectContaining({
        target: "openclaw",
        compat: "partial",
        delegatedTo: "service-runtime",
        mode: "copilot-brain",
        route: "/v1/runtime/invoke",
        requestBody: expect.objectContaining({
          provider: "chatgpt",
          model: "chatgpt/gpt-4o",
          lane: "web",
        }),
        runtimeRoutes: expect.objectContaining({
          bootstrap: "http://webai-bridge.test/v1/runtime/bootstrap",
          health: "http://webai-bridge.test/v1/runtime/health",
          dispatchPlan: "http://webai-bridge.test/v1/runtime/dispatch-plan",
          invoke: "http://webai-bridge.test/v1/runtime/invoke",
        }),
      }),
    );
    expect(health).toEqual(
      expect.objectContaining({
        lane: "web",
        totals: expect.objectContaining({
          ready: 3,
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
        preview: expect.objectContaining({
          requestBody: expect.objectContaining({
            provider: "chatgpt",
            lane: "web",
          }),
        }),
        dispatchPlan: expect.objectContaining({
          dispatchReason: "single-lane-provider",
          selectedLane: "web",
        }),
        doctor: expect.objectContaining({
          providerId: "chatgpt",
          alignment: expect.objectContaining({
            story: "dispatchable",
          }),
        }),
        runtime: expect.objectContaining({
          bootstrap: expect.objectContaining({
            serviceName: "webai-bridge-service",
          }),
          health: expect.objectContaining({
            totals: expect.objectContaining({
              degraded: 1,
            }),
          }),
        }),
      }),
    );
    expect(thin).toEqual(
      expect.objectContaining({
        target: "openclaw",
        ok: true,
        outputText: "openclaw-ok",
      }),
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        ok: true,
        outputText: "openclaw-ok",
      }),
    );
  });
});
