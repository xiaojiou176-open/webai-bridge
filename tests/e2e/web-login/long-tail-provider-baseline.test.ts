import { afterEach, describe, expect, it } from "vitest";

import { GROK_INVOKE_HANDOFF } from "../../../packages/providers/web/grok/src/transport.js";
import { QWEN_INVOKE_HANDOFF } from "../../../packages/providers/web/qwen/src/transport.js";
import { requestLocalJson } from "./local-http-client.js";
import { startWebaiBridgeE2EService } from "./service-test-harness.js";

const startedServices: Array<Awaited<ReturnType<typeof startWebaiBridgeE2EService>>> = [];

afterEach(async () => {
  await Promise.all(startedServices.splice(0).map((service) => service.close()));
});

describe("Long-tail Web/Login baseline providers", () => {
  it("publishes Grok's artifact and probe contract through the status surface", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
    });
    startedServices.push(service);

    const { status: responseStatus, body: payload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        transportHint?: string;
        diagnostic: { contractCategoryLabel: string } | null;
        session: {
          runtimeReadiness: string;
          note?: string;
          missingArtifacts?: string[];
          requiredUserAction?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/grok/status`);

    expect(responseStatus).toBe(200);
    expect(payload.provider).toEqual(
      expect.objectContaining({
        providerId: "grok",
        state: "missing",
        transportHint:
          "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
        diagnostic: expect.objectContaining({
          contractCategoryLabel: "missing credential",
        }),
        session: expect.objectContaining({
          runtimeReadiness: "blocked",
          missingArtifacts: [
            "browser-profile",
            "session-cookie",
            "oauth-browser-session",
          ],
          requiredUserAction:
            "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
        }),
      }),
    );
    expect(payload.provider.session.note).toContain("Artifact contract:");
    expect(payload.provider.session.note).toContain("authenticated Grok home and composer");
  });

  it("keeps Grok blocked once the runtime loses a trustworthy authenticated probe", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        grok: {
          state: "refreshable-but-degraded",
          accountLabel: "grok:baseline",
          lastValidatedAt: "2026-03-29T13:00:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const { status: statusCode, body: statusPayload } = await requestLocalJson<{
      provider: {
        state: string;
        transportHint?: string;
        session: {
          runtimeReadiness: string;
          degradedReason?: string;
          refreshEligible?: boolean;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/grok/status`);

    expect(statusCode).toBe(200);
    expect(statusPayload.provider).toEqual(
      expect.objectContaining({
        state: "refreshable-but-degraded",
        transportHint:
          "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
        session: expect.objectContaining({
          runtimeReadiness: "blocked",
          refreshEligible: true,
          degradedReason:
            "Grok baseline stays blocked once the authenticated home/composer probe turns stale, even if some local browser artifacts still exist.",
        }),
      }),
    );

    const { status: invokeStatusCode, body: invokePayload } = await requestLocalJson<{
      error: {
        type: string;
        suggestedAction?: string;
      };
      auth?: {
        transportHint?: string;
        session?: {
          degradedReason?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        provider: "grok",
        model: "grok-3",
        input: "recover grok",
      },
    });

    expect(invokeStatusCode).toBe(409);
    expect(invokePayload.error.type).toBe("refreshable-but-degraded");
    expect(invokePayload.error.suggestedAction).toBe(
      "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
    );
    expect(invokePayload.auth?.transportHint).toBe(
      "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
    );
    expect(invokePayload.auth?.session?.degradedReason).toBe(
      "Grok baseline stays blocked once the authenticated home/composer probe turns stale, even if some local browser artifacts still exist.",
    );
  });

  it("blocks Grok invoke until a real baseline transport replaces the descriptive stub", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        grok: {
          state: "ready",
          accountLabel: "grok:ready",
          lastValidatedAt: "2026-03-29T13:20:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const { status: statusCode, body: statusPayload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        session: {
          runtimeReadiness: string;
          capture?: { mode: string };
          probe?: { status: string; source: string };
          invoke?: { kind: string; mode: string; readiness: string };
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/grok/status`);

    expect(statusCode).toBe(200);
    expect(statusPayload.provider).toEqual(
      expect.objectContaining({
        providerId: "grok",
        state: "ready",
        session: expect.objectContaining({
          runtimeReadiness: "ready",
          capture: expect.objectContaining({
            mode: "grok-oauth-browser-capture",
          }),
          probe: expect.objectContaining({
            status: "session-valid",
            source: "grok-home-composer-probe",
          }),
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "grok-home-composer-dispatch",
            readiness: "blocked",
          }),
        }),
      }),
    );

    const { status: invokeStatusCode, body: invokePayload } = await requestLocalJson<{
      error: { type: string; suggestedAction?: string };
      auth?: {
        providerId: string;
        transportHint?: string;
        session: {
          runtimeReadiness: string;
          capture?: { mode: string };
          probe?: { source: string };
          invoke?: { kind: string; mode: string; readiness: string };
        };
      };
    }>(`${service.baseUrl}/v1/runtime/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        provider: "grok",
        model: "grok-3",
        input: "run grok",
      },
    });

    expect(invokeStatusCode).toBe(400);
    expect(invokePayload).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "routing-error",
          suggestedAction: GROK_INVOKE_HANDOFF,
        }),
        auth: expect.objectContaining({
          providerId: "grok",
          session: expect.objectContaining({
            runtimeReadiness: "ready",
            capture: expect.objectContaining({
              mode: "grok-oauth-browser-capture",
            }),
            probe: expect.objectContaining({
              source: "grok-home-composer-probe",
            }),
            invoke: expect.objectContaining({
              kind: "synthetic-demo",
              mode: "grok-home-composer-dispatch",
              readiness: "blocked",
            }),
          }),
        }),
      }),
    );
    expect(invokePayload.auth?.transportHint).toBe(GROK_INVOKE_HANDOFF);
  });

  it("publishes Qwen's artifact and probe contract through the status surface", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
    });
    startedServices.push(service);

    const { status: responseStatus, body: payload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        transportHint?: string;
        diagnostic: { contractCategoryLabel: string } | null;
        session: {
          runtimeReadiness: string;
          note?: string;
          missingArtifacts?: string[];
          requiredUserAction?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/qwen/status`);

    expect(responseStatus).toBe(200);
    expect(payload.provider).toEqual(
      expect.objectContaining({
        providerId: "qwen",
        state: "missing",
        transportHint:
          "Refresh the Qwen browser session, recapture chat.qwen.ai cookies/session token, and re-probe the authenticated workspace plus composer before resuming traffic.",
        diagnostic: expect.objectContaining({
          contractCategoryLabel: "missing credential",
        }),
        session: expect.objectContaining({
          runtimeReadiness: "blocked",
          missingArtifacts: [
            "browser-profile",
            "session-cookie",
            "session-token",
          ],
          requiredUserAction:
            "Refresh the Qwen browser session, recapture chat.qwen.ai cookies/session token, and re-probe the authenticated workspace plus composer before resuming traffic.",
        }),
      }),
    );
    expect(payload.provider.session.note).toContain("Artifact contract:");
    expect(payload.provider.session.note).toContain("authenticated workspace and composer");
  });

  it("keeps Qwen blocked once the runtime loses a trustworthy authenticated probe", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        qwen: {
          state: "refreshable-but-degraded",
          accountLabel: "qwen:baseline",
          lastValidatedAt: "2026-03-29T13:05:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const { status: statusCode, body: statusPayload } = await requestLocalJson<{
      provider: {
        state: string;
        transportHint?: string;
        session: {
          runtimeReadiness: string;
          degradedReason?: string;
          refreshEligible?: boolean;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/qwen/status`);

    expect(statusCode).toBe(200);
    expect(statusPayload.provider).toEqual(
      expect.objectContaining({
        state: "refreshable-but-degraded",
        transportHint:
          "Refresh the Qwen browser session, recapture chat.qwen.ai cookies/session token, and re-probe the authenticated workspace plus composer before resuming traffic.",
        session: expect.objectContaining({
          runtimeReadiness: "blocked",
          refreshEligible: true,
          degradedReason:
            "Qwen baseline stays blocked when the authenticated workspace/composer probe turns stale, even if cached cookies still exist.",
        }),
      }),
    );

    const { status: invokeStatusCode, body: invokePayload } = await requestLocalJson<{
      error: {
        type: string;
        suggestedAction?: string;
      };
      auth?: {
        transportHint?: string;
        session?: {
          degradedReason?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "recover qwen",
      },
    });

    expect(invokeStatusCode).toBe(409);
    expect(invokePayload.error.type).toBe("refreshable-but-degraded");
    expect(invokePayload.error.suggestedAction).toBe(
      "Refresh the Qwen browser session, recapture chat.qwen.ai cookies/session token, and re-probe the authenticated workspace plus composer before resuming traffic.",
    );
    expect(invokePayload.auth?.transportHint).toBe(
      "Refresh the Qwen browser session, recapture chat.qwen.ai cookies/session token, and re-probe the authenticated workspace plus composer before resuming traffic.",
    );
    expect(invokePayload.auth?.session?.degradedReason).toBe(
      "Qwen baseline stays blocked when the authenticated workspace/composer probe turns stale, even if cached cookies still exist.",
    );
  });

  it("blocks Qwen invoke until a real baseline transport replaces the descriptive stub", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        qwen: {
          state: "ready",
          accountLabel: "qwen:ready",
          lastValidatedAt: "2026-03-29T13:25:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const { status: statusCode, body: statusPayload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        session: {
          runtimeReadiness: string;
          capture?: { mode: string };
          probe?: { status: string; source: string };
          invoke?: { kind: string; mode: string; readiness: string };
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/qwen/status`);

    expect(statusCode).toBe(200);
    expect(statusPayload.provider).toEqual(
      expect.objectContaining({
        providerId: "qwen",
        state: "ready",
        session: expect.objectContaining({
          runtimeReadiness: "ready",
          capture: expect.objectContaining({
            mode: "qwen-browser-workspace-capture",
          }),
          probe: expect.objectContaining({
            status: "session-valid",
            source: "qwen-workspace-composer-probe",
          }),
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "qwen-workspace-composer-dispatch",
            readiness: "blocked",
          }),
        }),
      }),
    );

    const { status: invokeStatusCode, body: invokePayload } = await requestLocalJson<{
      error: { type: string; suggestedAction?: string };
      auth?: {
        providerId: string;
        transportHint?: string;
        session: {
          runtimeReadiness: string;
          capture?: { mode: string };
          probe?: { source: string };
          invoke?: { kind: string; mode: string; readiness: string };
        };
      };
    }>(`${service.baseUrl}/v1/runtime/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "run qwen",
      },
    });

    expect(invokeStatusCode).toBe(400);
    expect(invokePayload).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "routing-error",
          suggestedAction: QWEN_INVOKE_HANDOFF,
        }),
        auth: expect.objectContaining({
          providerId: "qwen",
          session: expect.objectContaining({
            runtimeReadiness: "ready",
            capture: expect.objectContaining({
              mode: "qwen-browser-workspace-capture",
            }),
            probe: expect.objectContaining({
              source: "qwen-workspace-composer-probe",
            }),
            invoke: expect.objectContaining({
              kind: "synthetic-demo",
              mode: "qwen-workspace-composer-dispatch",
              readiness: "blocked",
            }),
          }),
        }),
      }),
    );
    expect(invokePayload.auth?.transportHint).toBe(QWEN_INVOKE_HANDOFF);
  });
});
