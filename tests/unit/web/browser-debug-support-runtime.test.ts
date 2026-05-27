import { afterEach, describe, expect, it, vi } from "vitest";

function createProvider(overrides: Record<string, unknown> = {}) {
  return {
    provider: "chatgpt",
    displayName: "ChatGPT",
    lane: "web",
    authMode: "browser-session",
    stabilityTarget: "high",
    models: [],
    available: true,
    credentialState: "ready",
    runtimeReadiness: "ready",
    sessionPresence: "present",
    degradedInvocationPolicy: "allow-with-warning",
    recommendedAction: "Use the attached browser session.",
    session: {
      state: "ready",
      acquisitionMode: "managed-browser",
      validationState: "validated",
      accountLabel: "local-slot",
    },
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("browser debug support runtime", () => {
  it("marks existing-browser-session providers as blocked when no attach target is available", async () => {
    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({}).chatgpt!(
      createProvider({
        session: {
          state: "ready",
          acquisitionMode: "existing-browser-session",
          validationState: "validated",
        },
      }),
    );

    expect(debug.attachTarget.available).toBe(false);
    expect(debug.currentPage.status).toBe("unavailable");
    expect(debug.liveReadiness.status).toBe("unknown");
    expect(debug.diagnoseLadder.find((step) => step.id === "check-attach-target"))
      .toMatchObject({ status: "blocked" });
  });

  it("classifies ChatGPT login pages as store-ready but live-blocked", async () => {
    const close = vi.fn(async () => undefined);
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://chatgpt.com/",
              on: () => undefined,
              waitForLoadState: async () => undefined,
              evaluate: async () => ({
                finalUrl: "https://chatgpt.com/",
                title: "ChatGPT",
                snippet: "Log in to get personalized responses",
                bodyText: "Log in to get personalized responses",
                hasComposerSurface: false,
                networkEntries: [
                  {
                    name: "https://chatgpt.com/api/auth/session",
                    initiatorType: "fetch",
                    duration: 12.5,
                  },
                ],
              }),
            },
          ],
        },
      ],
      close,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).chatgpt!(createProvider());

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:39222");
    expect(debug.currentPage).toMatchObject({
      status: "captured",
      classification: "session-incomplete",
    });
    expect(debug.liveReadiness).toMatchObject({
      status: "live-blocked",
    });
    expect(debug.currentNetwork).toMatchObject({
      status: "limited",
      entries: [
        expect.objectContaining({
          name: "https://chatgpt.com/api/auth/session",
        }),
      ],
    });
    expect(debug.currentConsole).toMatchObject({
      status: "captured",
      entries: [],
    });
    expect(close).toHaveBeenCalled();
  });

  it("captures live console and request events when the attached page exposes browser listeners", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://chatgpt.com/c/abc123?token=secret",
              on: (event: string, handler: (value: any) => void) => {
                if (event === "console") {
                  handler({
                    type: () => "warning",
                    text: () => "live gate still visible",
                  });
                }
                if (event === "requestfinished") {
                  handler({
                    method: () => "POST",
                    resourceType: () => "fetch",
                    url: () => "https://chatgpt.com/backend-api/conversation?token=secret",
                    response: async () => ({
                      status: () => 200,
                    }),
                  });
                }
              },
              waitForLoadState: async () => undefined,
              evaluate: async () => ({
                finalUrl: "https://chatgpt.com/c/abc123?token=secret",
                title: "ChatGPT Workspace",
                snippet: "workspace ready",
                bodyText: "workspace ready",
                hasComposerSurface: true,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).chatgpt!(createProvider());

    expect(debug.currentConsole).toMatchObject({
      status: "captured",
      entries: [
        expect.objectContaining({
          type: "warning",
          text: "live gate still visible",
        }),
      ],
    });
    expect(debug.currentNetwork).toMatchObject({
      status: "captured",
      entries: [
        expect.objectContaining({
          name: "https://chatgpt.com/backend-api/conversation",
          method: "POST",
          status: 200,
          source: "request-observer",
        }),
      ],
    });
  });

  it("keeps ChatGPT login landing pages blocked even when the page exposes a fake composer surface", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://chatgpt.com/",
              evaluate: async () => ({
                finalUrl: "https://chatgpt.com/",
                title: "ChatGPT",
                snippet: "登录 免费注册 ChatGPT 你在忙什么？",
                bodyText:
                  "登录以获取基于已保存聊天的回答 登录 免费注册 ChatGPT 你在忙什么？ 语音 向 AI 聊天机器人 ChatGPT 发送消息",
                hasComposerSurface: true,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).chatgpt!(createProvider());

    expect(debug.currentPage.classification).toBe("session-incomplete");
    expect(debug.liveReadiness.status).toBe("live-blocked");
  });

  it("detects Gemini abnormal-traffic pages as human verification blockers", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://gemini.google.com/app",
              evaluate: async () => ({
                finalUrl: "https://gemini.google.com/app",
                title: "Gemini",
                snippet: "Our systems have detected unusual traffic",
                bodyText: "Our systems have detected unusual traffic from your computer network",
                hasComposerSurface: true,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
    }).gemini!(
      createProvider({
        provider: "gemini",
        displayName: "Gemini",
        authMode: "oauth",
        session: {
          state: "ready",
          acquisitionMode: "managed-browser",
          validationState: "validated",
        },
      }),
    );

    expect(debug.attachTarget.cdpUrl).toBe("http://127.0.0.1:9223");
    expect(debug.currentPage.classification).toBe("human-verification-required");
    expect(debug.liveReadiness.status).toBe("live-blocked");
  });

  it("does not treat redirected non-Grok hosts as authenticated Grok workspaces", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://evil.example/?next=https://grok.com/",
              evaluate: async () => ({
                finalUrl: "https://evil.example/?next=https://grok.com/",
                title: "Redirect Trap",
                snippet: "Continue to Grok",
                bodyText: "Continue to Grok and sign in to keep going",
                hasComposerSurface: true,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).grok!(
      createProvider({
        provider: "grok",
        displayName: "Grok",
      }),
    );

    expect(debug.currentPage.classification).toBe("session-incomplete");
    expect(debug.liveReadiness.status).toBe("live-blocked");
  });

  it("recognizes a ready Qwen workspace as live-ready", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://chat.qwen.ai/",
              evaluate: async () => ({
                finalUrl: "https://chat.qwen.ai/",
                title: "Qwen Workspace",
                snippet: "Qwen workspace composer ready",
                bodyText: "Qwen workspace composer ready",
                hasComposerSurface: true,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).qwen!(
      createProvider({
        provider: "qwen",
        displayName: "Qwen",
        session: {
          state: "ready",
          acquisitionMode: "managed-browser",
          validationState: "validated",
        },
      }),
    );

    expect(debug.currentPage.classification).toBe("workspace-ready");
    expect(debug.liveReadiness.status).toBe("live-ready");
    expect(debug.diagnoseLadder.find((step) => step.id === "repair-session"))
      .toMatchObject({ status: "completed" });
  });

  it("explains Qwen permission gates when session material is already present", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://chat.qwen.ai/",
              evaluate: async () => ({
                finalUrl: "https://chat.qwen.ai/",
                title: "Qwen Chat",
                snippet: "",
                bodyText: "",
                hasComposerSurface: false,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).qwen!(
      createProvider({
        provider: "qwen",
        displayName: "Qwen",
        session: {
          state: "user-action-required",
          acquisitionMode: "isolated-chrome-root",
          validationState: "stale",
          accountLabel: "qwen:local",
          captureProvenance: {
            browserMode: "isolated-chrome-root",
            userDataDir: "/tmp/webai-bridge-browser",
            profileDirectory: "Profile 1",
            profileName: "webai-bridge",
            cdpUrl: "http://127.0.0.1:9338",
          },
          persistenceAudit: {
            source: "verify",
            checkedAt: "2026-04-05T22:00:00.000Z",
            browserMode: "isolated-chrome-root",
            workspaceClassification: "permission-gated",
            workspaceReady: false,
            artifactStates: {
              "session-cookie": "present",
              "session-token": "present",
            },
            summary: "Qwen browser-side permission gate still needs to clear.",
          },
          artifactDetails: [
            { id: "session-cookie", state: "present" },
            { id: "session-token", state: "present" },
          ],
        },
      }),
    );

    expect(debug.currentPage.classification).toBe("permission-gated");
    expect(debug.liveReadiness.status).toBe("live-blocked");
    expect(debug.captureProvenance).toMatchObject({
      browserMode: "isolated-chrome-root",
      cdpUrl: "http://127.0.0.1:9338",
    });
    expect(debug.persistenceAudit).toMatchObject({
      workspaceClassification: "permission-gated",
      workspaceReady: false,
    });
    expect(debug.diagnoseLadder.find((step) => step.id === "inspect-current-page"))
      .toMatchObject({
        summary: expect.stringContaining("permission gate"),
      });
    expect(debug.diagnoseLadder.find((step) => step.id === "repair-session"))
      .toMatchObject({
        summary: expect.stringContaining("same repo-owned browser"),
      });
  });

  it("surfaces Grok account-action pages as account-action-required", async () => {
    const connectOverCDP = vi.fn(async () => ({
      contexts: () => [
        {
          pages: () => [
            {
              url: () => "https://grok.com/",
              evaluate: async () => ({
                finalUrl: "https://grok.com/",
                title: "Grok",
                snippet: "Connect your X account to unlock early features",
                bodyText: "Connect your X account to unlock early features in Grok.",
                hasComposerSurface: false,
                networkEntries: [],
              }),
            },
          ],
        },
      ],
      close: async () => undefined,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { createDefaultWebDebugSupportRunners } = await import(
      "../../../apps/service/src/browser-debug-support.ts"
    );

    const debug = await createDefaultWebDebugSupportRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
    }).grok!(
      createProvider({
        provider: "grok",
        displayName: "Grok",
      }),
    );

    expect(debug.currentPage.classification).toBe("account-action-required");
    expect(debug.liveReadiness.status).toBe("live-blocked");
  });
});
