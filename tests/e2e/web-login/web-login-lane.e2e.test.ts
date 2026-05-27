import { afterEach, describe, expect, it } from "vitest";

import { requestLocalJson } from "./local-http-client.js";
import { startWebaiBridgeE2EService } from "./service-test-harness.js";

const startedServices: Array<Awaited<ReturnType<typeof startWebaiBridgeE2EService>>> = [];

afterEach(async () => {
  await Promise.all(startedServices.splice(0).map((service) => service.close()));
});

describe("Web/Login lane end-to-end", () => {
  it("keeps all five web providers inside the runtime path with explicit stability targets", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
    });
    startedServices.push(service);

    const { status: responseStatus, body: payload } = await requestLocalJson<{
      discovery: {
        providers: Array<{
          providerId: string;
          authMode: string;
          available: boolean;
          stabilityTarget: string;
        }>;
      };
    }>(`${service.baseUrl}/v1/runtime/providers`);

    expect(responseStatus).toBe(200);
    expect(payload.discovery.providers).toEqual([
      expect.objectContaining({
        providerId: "chatgpt",
        authMode: "browser-session",
        available: false,
        stabilityTarget: "high",
      }),
      expect.objectContaining({
        providerId: "gemini",
        authMode: "oauth",
        available: false,
        stabilityTarget: "high",
      }),
      expect.objectContaining({
        providerId: "claude",
        authMode: "browser-session",
        available: false,
        stabilityTarget: "high",
      }),
      expect.objectContaining({
        providerId: "grok",
        authMode: "oauth",
        available: false,
        stabilityTarget: "baseline",
      }),
      expect.objectContaining({
        providerId: "qwen",
        authMode: "browser-session",
        available: false,
        stabilityTarget: "baseline",
      }),
    ]);
  });

  it("reports mixed session presence, degraded runtime health, and explicit recovery signals", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:e2e",
          lastValidatedAt: "2026-03-29T10:00:00.000Z",
        },
        gemini: {
          state: "expiring",
          accountLabel: "gemini:e2e",
          lastValidatedAt: "2026-03-29T10:05:00.000Z",
          expiresAt: "2026-03-29T10:45:00.000Z",
          refreshEligible: true,
        },
        claude: {
          state: "refreshable-but-degraded",
          accountLabel: "claude:e2e",
          lastValidatedAt: "2026-03-29T09:55:00.000Z",
          refreshEligible: true,
        },
        grok: {
          state: "user-action-required",
          accountLabel: "grok:e2e",
          requiredUserAction:
            "Re-run the Grok Web OAuth/browser login flow to refresh the local session.",
        },
        qwen: {
          state: "provider-unavailable",
          accountLabel: "qwen:e2e",
          lastValidatedAt: "2026-03-29T09:40:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const { status: healthStatusCode, body: healthPayload } = await requestLocalJson<{
      totals: {
        total: number;
        ready: number;
        degraded: number;
        userActionRequired: number;
        unavailable: number;
      };
    }>(`${service.baseUrl}/v1/runtime/health`);

    expect(healthStatusCode).toBe(200);
    expect(healthPayload.totals).toEqual({
      total: 5,
      ready: 1,
      degraded: 2,
      userActionRequired: 1,
      unavailable: 1,
    });

    const { status: claudeStatusCode, body: claudeStatusPayload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        transportHint?: string;
        diagnostic: { category: string; severity: string };
        session: {
          accountLabel?: string;
          validationState: string;
          runtimeReadiness: string;
          refreshEligible?: boolean;
          degradedReason?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/claude/status`);

    expect(claudeStatusCode).toBe(200);
      expect(claudeStatusPayload.provider).toEqual(
        expect.objectContaining({
          providerId: "claude",
          state: "refreshable-but-degraded",
          transportHint: expect.stringContaining("/chat_conversations"),
          diagnostic: expect.objectContaining({
            category: "refreshable-but-degraded",
            severity: "warning",
          }),
        session: expect.objectContaining({
          accountLabel: "claude:e2e",
          validationState: "recovering",
          runtimeReadiness: "degraded",
          refreshEligible: true,
          degradedReason:
            "Refresh path exists; runtime can keep serving while the session is renewed.",
        }),
      }),
    );

    const { status: grokStatusCode, body: grokStatusPayload } = await requestLocalJson<{
      provider: {
        providerId: string;
        state: string;
        transportHint?: string;
        diagnostic: { category: string };
        session: {
          runtimeReadiness: string;
          requiredUserAction?: string;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/grok/status`);

    expect(grokStatusCode).toBe(200);
    expect(grokStatusPayload.provider).toEqual(
      expect.objectContaining({
        providerId: "grok",
        state: "user-action-required",
        transportHint:
          "Re-run the Grok Web OAuth/browser login flow to refresh the local session.",
        diagnostic: expect.objectContaining({
          category: "user-action-required",
        }),
        session: expect.objectContaining({
          runtimeReadiness: "blocked",
          requiredUserAction:
            "Re-run the Grok Web OAuth/browser login flow to refresh the local session.",
        }),
      }),
    );
  });

  it("blocks synthetic Web/Login invoke paths even when provider sessions look ready", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:e2e",
          lastValidatedAt: "2026-03-29T11:00:00.000Z",
        },
        gemini: {
          state: "expiring",
          accountLabel: "gemini:e2e",
          lastValidatedAt: "2026-03-29T11:05:00.000Z",
          expiresAt: "2026-03-29T11:45:00.000Z",
          refreshEligible: true,
        },
        claude: {
          state: "ready",
          accountLabel: "claude:e2e",
          lastValidatedAt: "2026-03-29T11:10:00.000Z",
        },
        grok: {
          state: "ready",
          accountLabel: "grok:e2e",
          lastValidatedAt: "2026-03-29T11:12:00.000Z",
        },
        qwen: {
          state: "ready",
          accountLabel: "qwen:e2e",
          lastValidatedAt: "2026-03-29T11:15:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const cases = [
      {
        provider: "chatgpt",
        model: "gpt-4o",
        runtimeReadiness: "ready",
        invokeMode: "chatgpt-backend-api-conversation",
      },
      {
        provider: "gemini",
        model: "gemini-2.5-pro",
        runtimeReadiness: "degraded",
        invokeMode: "gemini-web-dom-composer",
      },
      {
        provider: "claude",
        model: "claude-sonnet-4-6",
        runtimeReadiness: "ready",
        invokeMode: "claude-chat-conversation-completion",
      },
      {
        provider: "grok",
        model: "grok-3",
        runtimeReadiness: "ready",
        invokeMode: "grok-home-composer-dispatch",
      },
      {
        provider: "qwen",
        model: "qwen3.5-plus",
        runtimeReadiness: "ready",
        invokeMode: "qwen-workspace-composer-dispatch",
      },
    ] as const;

    for (const testCase of cases) {
      const { status: responseStatus, body: payload } = await requestLocalJson<{
        error: { type: string; suggestedAction?: string };
        auth?: {
          providerId: string;
          transportHint?: string;
          session: {
            runtimeReadiness: string;
            invoke?: { kind: string; mode: string; readiness: string };
          };
        };
        remediation?: {
          runtime: { canInvoke: boolean };
        };
      }>(`${service.baseUrl}/v1/runtime/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: {
          provider: testCase.provider,
          model: testCase.model,
          input: `run ${testCase.provider}`,
        },
      });

      expect(responseStatus).toBe(400);
      expect(payload).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            type: "routing-error",
            suggestedAction: expect.any(String),
          }),
          auth: expect.objectContaining({
            providerId: testCase.provider,
            session: expect.objectContaining({
              runtimeReadiness: testCase.runtimeReadiness,
              invoke: expect.objectContaining({
                kind: "synthetic-demo",
                mode: testCase.invokeMode,
                readiness: "blocked",
              }),
            }),
          }),
        }),
      );
      expect(payload.auth?.transportHint).toBe(payload.error.suggestedAction);
      expect(payload.remediation?.runtime.canInvoke).toBe(false);
    }
  });

  it("keeps high-stability providers diagnosable in degraded mode while still blocking synthetic invoke", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        chatgpt: {
          state: "refreshable-but-degraded",
          accountLabel: "chatgpt:degraded",
          lastValidatedAt: "2026-03-29T12:00:00.000Z",
          refreshEligible: true,
        },
        gemini: {
          state: "refreshable-but-degraded",
          accountLabel: "gemini:degraded",
          lastValidatedAt: "2026-03-29T12:00:00.000Z",
          refreshEligible: true,
        },
        claude: {
          state: "refreshable-but-degraded",
          accountLabel: "claude:degraded",
          lastValidatedAt: "2026-03-29T12:00:00.000Z",
          refreshEligible: true,
        },
        grok: {
          state: "refreshable-but-degraded",
          accountLabel: "grok:degraded",
          lastValidatedAt: "2026-03-29T12:00:00.000Z",
          refreshEligible: true,
        },
        qwen: {
          state: "refreshable-but-degraded",
          accountLabel: "qwen:degraded",
          lastValidatedAt: "2026-03-29T12:00:00.000Z",
          refreshEligible: true,
        },
      },
    });
    startedServices.push(service);

    const highStabilityCases = [
      { provider: "chatgpt", model: "gpt-4o" },
      { provider: "gemini", model: "gemini-2.5-pro" },
      { provider: "claude", model: "claude-sonnet-4-6" },
    ] as const;

    for (const testCase of highStabilityCases) {
      const { status: responseStatus, body: payload } = await requestLocalJson<{
        error: { type: string; suggestedAction?: string };
        auth?: {
          providerId: string;
          session: {
            runtimeReadiness: string;
            invoke?: { kind: string; readiness: string };
          };
        };
      }>(`${service.baseUrl}/v1/runtime/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: {
          provider: testCase.provider,
          model: testCase.model,
          input: `recover ${testCase.provider}`,
        },
      });

      expect(responseStatus).toBe(400);
      expect(payload).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            type: "routing-error",
            suggestedAction: expect.any(String),
          }),
          auth: expect.objectContaining({
            providerId: testCase.provider,
            session: expect.objectContaining({
              runtimeReadiness: "degraded",
              invoke: expect.objectContaining({
                kind: "synthetic-demo",
                readiness: "blocked",
              }),
            }),
          }),
        }),
      );
    }

    const baselineCases = [
      { provider: "grok", model: "grok-3" },
      { provider: "qwen", model: "qwen3.5-plus" },
    ] as const;

    for (const testCase of baselineCases) {
      const { status: responseStatus, body: payload } = await requestLocalJson<{
        error: {
          type: string;
          message: string;
          suggestedAction?: string;
        };
        auth?: {
          session: {
            invoke?: { kind: string; readiness: string };
          };
        };
      }>(`${service.baseUrl}/v1/runtime/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: {
          provider: testCase.provider,
          model: testCase.model,
          input: `recover ${testCase.provider}`,
        },
      });

      expect(responseStatus).toBe(409);
      expect(payload.error.type).toBe("refreshable-but-degraded");
      expect(payload.error.message).toContain("blocked until the session is renewed");
      expect(payload.error.suggestedAction).toBeTruthy();
      expect(payload.auth?.session.invoke).toEqual(
        expect.objectContaining({
          kind: "synthetic-demo",
          readiness: "blocked",
        }),
      );
    }
  });
});
