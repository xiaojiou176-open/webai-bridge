import { afterEach, describe, expect, it } from "vitest";

import { requestLocalJson } from "./local-http-client.js";
import { startWebaiBridgeE2EService } from "./service-test-harness.js";

const startedServices: Array<Awaited<ReturnType<typeof startWebaiBridgeE2EService>>> = [];

afterEach(async () => {
  await Promise.all(startedServices.splice(0).map((service) => service.close()));
});

describe("High-stability trio Web/Login runtime", () => {
  it("surfaces provider-specific probe, capture, and refresh contracts in provider status", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:e2e",
          lastValidatedAt: "2026-03-29T19:00:00.000Z",
          artifactStates: {
            "next-auth-session-token": "present",
            "openai-access-token": "missing",
          },
        },
        gemini: {
          state: "ready",
          accountLabel: "gemini:e2e",
          lastValidatedAt: "2026-03-29T19:05:00.000Z",
          artifactStates: {
            "google-sid-cookie": "present",
            "google-secure-1psid": "missing",
          },
        },
        claude: {
          state: "ready",
          accountLabel: "claude:e2e",
          lastValidatedAt: "2026-03-29T19:10:00.000Z",
          artifactStates: {
            "claude-session-key": "present",
            "organization-id": "missing",
          },
        },
      },
    });
    startedServices.push(service);

    const { status: chatgptStatusCode, body: chatgptStatusPayload } = await requestLocalJson<{
      provider: {
        state: string;
        transportHint?: string;
        session: {
          capture?: { mode: string };
          probe?: { status: string; source: string };
          invoke?: { kind: string; mode: string; readiness: string };
          refresh?: { status: string; mode: string };
          artifactDetails?: Array<{ id: string; state: string }>;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/chatgpt/status`);

    expect(chatgptStatusCode).toBe(200);
      expect(chatgptStatusPayload.provider).toEqual(
        expect.objectContaining({
          state: "refreshable-but-degraded",
          transportHint: expect.stringContaining("backend-api/conversation"),
          session: expect.objectContaining({
          capture: expect.objectContaining({
            mode: "chatgpt-browser-cdp-capture",
          }),
          probe: expect.objectContaining({
            status: "refresh-recommended",
            source: "chatgpt-auth-session-probe",
          }),
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "chatgpt-backend-api-conversation",
            readiness: "blocked",
          }),
          refresh: expect.objectContaining({
            status: "available",
            mode: "chatgpt-auth-session-refresh",
          }),
          artifactDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "openai-access-token",
              state: "missing",
            }),
          ]),
        }),
      }),
    );

    const { status: geminiStatusCode, body: geminiStatusPayload } = await requestLocalJson<{
      provider: {
        state: string;
        transportHint?: string;
        session: {
          invoke?: { kind: string; mode: string; readiness: string };
          refresh?: { mode: string };
          artifactDetails?: Array<{ id: string; state: string }>;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/gemini/status`);

    expect(geminiStatusCode).toBe(200);
      expect(geminiStatusPayload.provider).toEqual(
        expect.objectContaining({
          state: "refreshable-but-degraded",
          transportHint: expect.stringContaining("Composer DOM submit path"),
          session: expect.objectContaining({
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "gemini-web-dom-composer",
            readiness: "blocked",
          }),
          refresh: expect.objectContaining({
            mode: "gemini-google-cookie-refresh",
          }),
          artifactDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "google-secure-1psid",
              state: "missing",
            }),
          ]),
        }),
      }),
    );

    const { status: claudeStatusCode, body: claudeStatusPayload } = await requestLocalJson<{
      provider: {
        state: string;
        transportHint?: string;
        session: {
          invoke?: { kind: string; mode: string; readiness: string };
          refresh?: { mode: string };
          artifactDetails?: Array<{ id: string; state: string }>;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/providers/claude/status`);

    expect(claudeStatusCode).toBe(200);
      expect(claudeStatusPayload.provider).toEqual(
        expect.objectContaining({
          state: "refreshable-but-degraded",
          transportHint: expect.stringContaining("/chat_conversations"),
          session: expect.objectContaining({
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "claude-chat-conversation-completion",
            readiness: "blocked",
          }),
          refresh: expect.objectContaining({
            mode: "claude-organization-refresh",
          }),
          artifactDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "organization-id",
              state: "missing",
            }),
          ]),
        }),
      }),
    );
  });

  it("keeps session-rich metadata while surfacing synthetic invoke as an explicit blocker", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:e2e",
          lastValidatedAt: "2026-03-29T19:20:00.000Z",
        },
        gemini: {
          state: "expiring",
          accountLabel: "gemini:e2e",
          lastValidatedAt: "2026-03-29T19:25:00.000Z",
        },
        claude: {
          state: "ready",
          accountLabel: "claude:e2e",
          lastValidatedAt: "2026-03-29T19:30:00.000Z",
        },
      },
    });
    startedServices.push(service);

    const cases = [
      {
        provider: "chatgpt",
        model: "gpt-4o",
        probeStatus: "session-valid",
        captureMode: "chatgpt-browser-cdp-capture",
        invokeMode: "chatgpt-backend-api-conversation",
      },
      {
        provider: "gemini",
        model: "gemini-2.5-pro",
        probeStatus: "refresh-recommended",
        captureMode: "gemini-google-cookie-capture",
        invokeMode: "gemini-web-dom-composer",
      },
      {
        provider: "claude",
        model: "claude-sonnet-4-6",
        probeStatus: "session-valid",
        captureMode: "claude-sessionkey-capture",
        invokeMode: "claude-chat-conversation-completion",
      },
    ] as const;

    for (const testCase of cases) {
      const { status: responseStatus, body: payload } = await requestLocalJson<{
        error: { type: string; suggestedAction?: string };
        auth?: {
          providerId: string;
          transportHint?: string;
          session: {
            capture?: { mode: string };
            probe?: { status: string };
            invoke?: { kind: string; mode: string; readiness: string };
            refresh?: { mode: string };
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
              capture: expect.objectContaining({
                mode: testCase.captureMode,
              }),
              probe: expect.objectContaining({
                status: testCase.probeStatus,
              }),
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
      expect(payload.auth?.session.refresh?.mode).toBeTruthy();
    }
  });

  it("returns provider-specific re-auth metadata when a trio session is no longer recoverable", async () => {
    const service = await startWebaiBridgeE2EService({
      useLocalWebAuthStore: false,
      providerSessions: {
        gemini: {
          state: "ready",
          accountLabel: "gemini:e2e",
          lastValidatedAt: "2026-03-29T19:35:00.000Z",
          artifactStates: {
            "google-sid-cookie": "missing",
            "google-secure-1psid": "missing",
          },
        },
      },
    });
    startedServices.push(service);

    const { status: responseStatus, body: payload } = await requestLocalJson<{
      error: {
        type: string;
        suggestedAction?: string;
      };
      auth: {
        providerId: string;
        state: string;
        transportHint?: string;
        session: {
          probe?: { status: string };
          invoke?: { kind: string; mode: string; readiness: string };
          reAuth?: { status: string; mode: string };
          artifactDetails?: Array<{ id: string; state: string }>;
        };
      };
    }>(`${service.baseUrl}/v1/runtime/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        provider: "gemini",
        model: "gemini-2.5-pro",
        input: "recover gemini",
      },
    });

    expect(responseStatus).toBe(409);
    expect(payload.error.type).toBe("user-action-required");
    expect(payload.error.suggestedAction).toContain("gemini.google.com/app");
    expect(payload.auth).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        state: "user-action-required",
        transportHint: expect.stringContaining("gemini.google.com/app"),
        session: expect.objectContaining({
          probe: expect.objectContaining({
            status: "re-auth-required",
          }),
          invoke: expect.objectContaining({
            kind: "synthetic-demo",
            mode: "gemini-web-dom-composer",
            readiness: "blocked",
          }),
          reAuth: expect.objectContaining({
            status: "required-now",
            mode: "gemini-google-oauth-reauth",
          }),
          artifactDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "google-sid-cookie",
              state: "missing",
            }),
            expect.objectContaining({
              id: "google-secure-1psid",
              state: "missing",
            }),
          ]),
        }),
      }),
    );
  });
});
