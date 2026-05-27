import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function createPage(url: string, evaluateResults: unknown[]) {
  const goto = vi.fn(async () => {});
  const waitForLoadState = vi.fn(async () => {});
  const waitForTimeout = vi.fn(async () => {});
  const evaluate = vi.fn();
  const title = vi.fn(async () => "");

  for (const result of evaluateResults) {
    evaluate.mockResolvedValueOnce(result);
  }

  return {
    url: () => url,
    goto,
    waitForLoadState,
    waitForTimeout,
    evaluate,
    title,
  };
}

function createBrowserHarness(args: {
  existingPages?: Array<ReturnType<typeof createPage>>;
  newPage?: ReturnType<typeof createPage>;
  cookies: Array<{ name: string; value: string; domain?: string }>;
}) {
  const context = {
    pages: vi.fn(() => args.existingPages ?? []),
    newPage: vi.fn(async () => args.newPage),
    cookies: vi.fn(async () => args.cookies),
  };
  const browser = {
    contexts: vi.fn(() => [context]),
    close: vi.fn(async () => {}),
  };

  return { context, browser };
}

function buildStatus(sessionSource: string) {
  return {
    credentialState: "ready",
    recommendedAction: undefined,
    session: {
      state: "ready",
      accountLabel: `${sessionSource}:default`,
      sessionSource,
      lastValidatedAt: "2026-04-01T00:00:00.000Z",
      artifactStates: {},
      note: "Captured via tests.",
    },
  };
}

function buildIsolatedChromeRootEnv() {
  return {
    ...process.env,
    WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
    WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "isolated-chrome-root",
    WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
    WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
  };
}

describe("web acquisition capture", () => {
  it("captures a ready ChatGPT session from an existing browser page and persists the local-first record", async () => {
    const existingPage = createPage("https://chatgpt.com", ["WebaiBridgeTest/1.0"]);
    const { browser, context } = createBrowserHarness({
      existingPages: [existingPage],
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "session-token",
          domain: "chatgpt.com",
        },
        {
          name: "oai-did",
          value: "device-1",
          domain: "openai.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/chatgpt-store.json");
    const runChatgptWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "chatgpt",
    }));
    const getStatus = vi.fn(async () => buildStatus("chatgpt-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: { email: "test@example.com" },
          accessToken: "openai-access-token",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners(
      buildIsolatedChromeRootEnv(),
    ).chatgpt?.capture({
      mode: "isolated-chrome-root",
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9338");
    expect(context.newPage).not.toHaveBeenCalled();
    expect(existingPage.goto).toHaveBeenCalledWith("https://chatgpt.com", {
      waitUntil: "domcontentloaded",
    });
    expect(runChatgptWebLiveProof).toHaveBeenCalledWith(
      expect.objectContaining({
        WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE:
          "__Secure-next-auth.session-token=session-token; oai-did=device-1",
        WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: "WebaiBridgeTest/1.0",
      }),
      fetch,
    );
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "chatgpt",
        acquisitionMode: "isolated-chrome-root",
        accountLabel: "test@example.com",
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "refreshable-but-degraded",
        provider: "chatgpt",
        storePath: "/tmp/chatgpt-store.json",
        session: expect.objectContaining({
          state: "refreshable-but-degraded",
        }),
      }),
    );
  });

  it("falls back to the browser workspace proof for Qwen and derives a session token from storage", async () => {
    const qwenPage = createPage("https://chat.qwen.ai", [
      "WebaiBridgeTest/1.0",
      "qwen-session-token",
      {
        url: "https://chat.qwen.ai/",
        bodyText: "Qwen workspace body",
        title: "Qwen Workspace",
        hasComposerSurface: true,
      },
    ]);
    const { browser, context } = createBrowserHarness({
      newPage: qwenPage,
      cookies: [
        {
          name: "qwen_cookie",
          value: "cookie-value",
          domain: "chat.qwen.ai",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/qwen-store.json");
    const runQwenWebLiveProof = vi.fn(async () => ({
      status: "failure",
      provider: "qwen",
      summary: "HTTP proof was inconclusive.",
    }));
    const validateQwenBrowserWorkspaceSnapshot = vi.fn(() => ({
      ok: true,
      signal: "qwen-workspace-composer",
      summary: "browser workspace ready",
    }));
    const getStatus = vi.fn(async () => buildStatus("qwen-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [
        "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
        "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
      ],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof,
      validateQwenBrowserWorkspaceSnapshot,
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().qwen?.capture({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9555");
    expect(context.newPage).toHaveBeenCalled();
    expect(runQwenWebLiveProof).toHaveBeenCalled();
    expect(validateQwenBrowserWorkspaceSnapshot).toHaveBeenCalled();
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "qwen",
        acquisitionMode: "existing-browser-session",
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
        mode: "existing-browser-session",
        storePath: "/tmp/qwen-store.json",
        liveProof: expect.objectContaining({
          status: "success",
          signal: "qwen-workspace-composer-browser-dom",
        }),
      }),
    );
  });

  it("prefers exact Qwen session keys such as _bl_sid during capture", async () => {
    const qwenPage = createPage("https://chat.qwen.ai", [
      "WebaiBridgeTest/1.0",
      "_bl_sid-token",
      {
        url: "https://chat.qwen.ai/",
        bodyText: "Qwen workspace body",
        title: "Qwen Workspace",
        hasComposerSurface: true,
      },
    ]);
    const { browser, context } = createBrowserHarness({
      newPage: qwenPage,
      cookies: [
        {
          name: "qwen_cookie",
          value: "cookie-value",
          domain: "chat.qwen.ai",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/qwen-priority-store.json");
    const runQwenWebLiveProof = vi.fn(async () => ({
      status: "failure",
      provider: "qwen",
      summary: "HTTP proof was inconclusive.",
    }));
    const validateQwenBrowserWorkspaceSnapshot = vi.fn(() => ({
      ok: true,
      signal: "qwen-workspace-composer",
      summary: "browser workspace ready",
    }));
    const getStatus = vi.fn(async () => buildStatus("qwen-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn(() => true),
      };
    });
    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: "sca\n",
        })),
      };
    });
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [
        "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
        "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
      ],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof,
      validateQwenBrowserWorkspaceSnapshot,
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().qwen?.capture({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9555");
    expect(context.newPage).toHaveBeenCalled();
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "qwen",
        accountLabel: expect.stringMatching(/^qwen:/),
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
        session: expect.objectContaining({
          artifactStates: expect.objectContaining({
            "session-token": "derived",
          }),
        }),
      }),
    );
  });

  it("prefers a Qwen session token from cookies over browser storage when both exist", async () => {
    const qwenPage = createPage("https://chat.qwen.ai", [
      "WebaiBridgeTest/1.0",
      "storage-token-should-not-win",
      {
        url: "https://chat.qwen.ai/",
        bodyText: "Qwen workspace body",
        title: "Qwen Workspace",
        hasComposerSurface: true,
      },
    ]);
    const { browser } = createBrowserHarness({
      newPage: qwenPage,
      cookies: [
        {
          name: "atpsida",
          value: "cookie-token-123456",
          domain: "chat.qwen.ai",
        },
        {
          name: "qwen_cookie",
          value: "cookie-value",
          domain: "chat.qwen.ai",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/qwen-cookie-store.json");
    const runQwenWebLiveProof = vi.fn(async () => ({
      status: "failure",
      provider: "qwen",
      summary: "HTTP proof was inconclusive.",
    }));
    const validateQwenBrowserWorkspaceSnapshot = vi.fn(() => ({
      ok: true,
      signal: "qwen-workspace-composer",
      summary: "browser workspace ready",
    }));
    const getStatus = vi.fn(async ({ sessions }) => ({
      credentialState: "ready",
      recommendedAction: undefined,
      session: sessions.qwen,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn(() => true),
      };
    });
    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: "sca\natpsida\n",
        })),
      };
    });
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [
        "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
        "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
      ],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof,
      validateQwenBrowserWorkspaceSnapshot,
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().qwen?.capture();

    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "qwen",
        accountLabel: expect.stringMatching(/^qwen:/),
        note: expect.stringMatching(/session token/i),
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
        storePath: "/tmp/qwen-cookie-store.json",
        session: expect.objectContaining({
          accountLabel: expect.stringMatching(/^qwen:/),
          artifactStates: expect.objectContaining({
            "session-token": "present",
          }),
        }),
      }),
    );
  });

  it("returns a reusable Chrome profile blocker when CDP is unavailable during capture", async () => {
    const connectOverCDP = vi.fn(async () => {
      throw Object.assign(new Error("connectOverCDP ECONNREFUSED"), {
        code: "cdp-unreachable",
      });
    });
    const getStatus = vi.fn(async () => buildStatus("grok-x-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath: vi.fn(() => "/tmp/grok-store.json"),
      upsertStoredWebProviderSession: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().grok?.capture({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        cdpUrl: "http://127.0.0.1:9333",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        mode: "isolated-chrome-root",
        blocker: "grok-existing-profile-cdp-unavailable",
      }),
    );
    expect(result?.summary).toContain("Chrome profile");
  });

  it("returns an explicit attached-browser-session blocker when the requested session is missing during capture", async () => {
    const connectOverCDP = vi.fn(async () => {
      throw Object.assign(new Error("existing browser session missing"), {
        code: "existing-browser-session-missing",
      });
    });
    const getStatus = vi.fn(async () => buildStatus("chatgpt-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath: vi.fn(() => "/tmp/chatgpt-store.json"),
      upsertStoredWebProviderSession: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().chatgpt?.capture({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "existing-browser-session",
        blocker: "chatgpt-existing-browser-session-missing",
      }),
    );
    expect(result?.summary).toContain("still running and sharing a reusable session URL");
  });

  it("does not overclaim Grok oauth/browser-session artifacts when only generic cookies are present", async () => {
    const grokPage = createPage("https://grok.com/", ["WebaiBridgeTest/1.0"]);
    const { browser } = createBrowserHarness({
      existingPages: [grokPage],
      cookies: [
        {
          name: "guest_id",
          value: "guest-1",
          domain: "grok.com",
        },
        {
          name: "x-anonuserid",
          value: "anon-1",
          domain: "grok.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/grok-store.json");
    const runGrokWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "grok",
    }));
    const getStatus = vi.fn(async () => buildStatus("grok-x-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().grok?.capture();

    expect(runGrokWebLiveProof).toHaveBeenCalled();
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "grok",
        artifactStates: expect.objectContaining({
          "session-cookie": "missing",
          "oauth-browser-session": "missing",
        }),
        note: expect.stringContaining("still need to be recovered"),
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        provider: "grok",
        session: expect.objectContaining({
          artifactStates: expect.objectContaining({
            "session-cookie": "missing",
            "oauth-browser-session": "missing",
          }),
        }),
      }),
    );
  });

  it("downgrades Grok capture when the attached page is blocked on human verification", async () => {
    const grokPage = createPage("https://grok.com/", [
      "WebaiBridgeTest/1.0",
      {
        finalUrl: "https://grok.com/",
        bodyText: "Verify you are human before continuing to Grok.",
        hasComposerSurface: false,
      },
    ]);
    const { browser } = createBrowserHarness({
      existingPages: [grokPage],
      cookies: [
        {
          name: "sso",
          value: "grok-session",
          domain: "grok.com",
        },
        {
          name: "x-userid",
          value: "x-user-1",
          domain: "x.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/grok-human-store.json");
    const runGrokWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "grok",
    }));
    const getStatus = vi.fn(async () => buildStatus("grok-x-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().grok?.capture();

    expect(result).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        provider: "grok",
        summary: expect.stringContaining("human-verification"),
        session: expect.objectContaining({
          persistenceAudit: expect.objectContaining({
            workspaceClassification: "human-verification-required",
            workspaceReady: false,
          }),
        }),
      }),
    );
  });

  it("downgrades Grok capture when the attached page still requires an account action", async () => {
    const grokPage = createPage("https://grok.com/", [
      "WebaiBridgeTest/1.0",
      {
        finalUrl: "https://grok.com/",
        bodyText: "Connect your X account to unlock early features in Grok.",
        hasComposerSurface: false,
      },
    ]);
    const { browser } = createBrowserHarness({
      existingPages: [grokPage],
      cookies: [
        {
          name: "sso",
          value: "grok-session",
          domain: "grok.com",
        },
        {
          name: "x-userid",
          value: "x-user-1",
          domain: "x.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/grok-account-store.json");
    const runGrokWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "grok",
    }));
    const getStatus = vi.fn(async () => buildStatus("grok-x-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().grok?.capture();

    expect(result).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        provider: "grok",
        summary: expect.stringContaining("account action"),
        session: expect.objectContaining({
          persistenceAudit: expect.objectContaining({
            workspaceClassification: "account-action-required",
            workspaceReady: false,
          }),
        }),
      }),
    );
  });

  it("persists a blocked Qwen capture when the browser session is permission-gated", async () => {
    const qwenPage = createPage("https://chat.qwen.ai", [
      "WebaiBridgeTest/1.0",
      "_bl_sid-token",
      {
        url: "https://chat.qwen.ai/",
        bodyText: "",
        title: "Qwen Chat",
        hasComposerSurface: false,
      },
    ]);
    const { browser } = createBrowserHarness({
      newPage: qwenPage,
      cookies: [
        {
          name: "atpsida",
          value: "cookie-token-123456",
          domain: "chat.qwen.ai",
        },
        {
          name: "qwen_cookie",
          value: "cookie-value",
          domain: "chat.qwen.ai",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/qwen-blocked-store.json");
    const runQwenWebLiveProof = vi.fn(async () => ({
      status: "failure",
      provider: "qwen",
      classification: "user-action-required",
      responseStatus: 200,
      diagnostic:
        "Qwen authenticated workspace is visible, but the browser-side chat bootstrap endpoint is currently returning Unauthorized.",
      summary: "permission gate still active",
    }));
    const validateQwenBrowserWorkspaceSnapshot = vi.fn(() => ({
      ok: false,
      diagnostic: "Qwen live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
      summary: "https://chat.qwen.ai/",
    }));
    const getStatus = vi.fn(async ({ sessions }) => ({
      credentialState: "ready",
      recommendedAction: undefined,
      session: sessions.qwen,
    }));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: vi.fn(() => true),
      };
    });
    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: "sca\natpsida\n",
        })),
      };
    });
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [
        "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
        "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
      ],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof,
      validateQwenBrowserWorkspaceSnapshot,
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().qwen?.capture();

    expect(result).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        provider: "qwen",
        storePath: "/tmp/qwen-blocked-store.json",
        session: expect.objectContaining({
          persistenceAudit: expect.objectContaining({
            workspaceClassification: "permission-gated",
            artifactStates: expect.objectContaining({
              "session-token": "present",
            }),
          }),
        }),
      }),
    );
  });

  it("returns an explicit existing-profile blocker when the selected Chrome profile is not reusable during capture", async () => {
    const connectOverCDP = vi.fn(async () => {
      throw new Error("Chrome profile exists but could not be reused.");
    });
    const getStatus = vi.fn(async () => buildStatus("grok-x-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath: vi.fn(() => "/tmp/grok-store.json"),
      upsertStoredWebProviderSession: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().grok?.capture({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        cdpUrl: "http://127.0.0.1:9333",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        mode: "isolated-chrome-root",
        blocker: "grok-existing-profile-not-reusable",
      }),
    );
    expect(result?.summary).toContain("could not reuse");
  });

  it("returns an explicit attached-browser-session blocker when the session URL is not reusable during capture", async () => {
    const connectOverCDP = vi.fn(async () => {
      throw new Error("Browser session exists but could not be reused.");
    });
    const getStatus = vi.fn(async () => buildStatus("chatgpt-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath: vi.fn(() => "/tmp/chatgpt-store.json"),
      upsertStoredWebProviderSession: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().chatgpt?.capture({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "existing-browser-session",
        blocker: "chatgpt-existing-browser-session-not-reusable",
      }),
    );
    expect(result?.summary).toContain("could not reuse the attached browser session");
  });

  it("captures a ready Gemini session and stores Google auth artifacts", async () => {
    const geminiPage = createPage("https://gemini.google.com/app", [
      "WebaiBridgeTest/1.0",
      {
        finalUrl: "https://gemini.google.com/app",
        text: "Google Gemini\nGemini workspace ready",
        hasComposerSurface: true,
      },
    ]);
    const { browser } = createBrowserHarness({
      existingPages: [geminiPage],
      cookies: [
        {
          name: "SID",
          value: "sid-cookie",
          domain: "google.com",
        },
        {
          name: "__Secure-1PSID",
          value: "secure-cookie",
          domain: "google.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/gemini-store.json");
    const runGeminiWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "gemini",
    }));
    const getStatus = vi.fn(async () => buildStatus("gemini-google-oauth"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners(
      buildIsolatedChromeRootEnv(),
    ).gemini?.capture({
      mode: "isolated-chrome-root",
    });

    expect(runGeminiWebLiveProof).toHaveBeenCalledWith(
      expect.objectContaining({
        WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "SID=sid-cookie; __Secure-1PSID=secure-cookie",
        WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "WebaiBridgeTest/1.0",
      }),
      fetch,
    );
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "gemini",
        accountLabel: "gemini:local-browser",
        acquisitionMode: "isolated-chrome-root",
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "gemini",
        storePath: "/tmp/gemini-store.json",
      }),
    );
  });

  it("captures a ready Claude session and records the organization id when available", async () => {
    const claudePage = createPage("https://claude.ai/new", ["WebaiBridgeTest/1.0"]);
    const { browser } = createBrowserHarness({
      existingPages: [claudePage],
      cookies: [
        {
          name: "sessionKey",
          value: "claude-session",
          domain: "claude.ai",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const upsertStoredWebProviderSession = vi.fn();
    const resolveLocalWebAuthStorePath = vi.fn(() => "/tmp/claude-store.json");
    const runClaudeWebLiveProof = vi.fn(async () => ({
      status: "success",
      provider: "claude",
    }));
    const getStatus = vi.fn(async () => buildStatus("claude-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath,
      upsertStoredWebProviderSession,
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify([{ uuid: "org-1234567890" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners(
      buildIsolatedChromeRootEnv(),
    ).claude?.capture({
      mode: "isolated-chrome-root",
    });

    expect(runClaudeWebLiveProof).toHaveBeenCalled();
    expect(upsertStoredWebProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "claude",
        acquisitionMode: "isolated-chrome-root",
      }),
      expect.any(Object),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "refreshable-but-degraded",
        provider: "claude",
        storePath: "/tmp/claude-store.json",
        session: expect.objectContaining({
          acquisitionMode: "isolated-chrome-root",
          state: "refreshable-but-degraded",
        }),
      }),
    );
  });

  it("returns user-action-required when ChatGPT live proof still indicates a login step is unfinished", async () => {
    const existingPage = createPage("https://chatgpt.com", ["WebaiBridgeTest/1.0"]);
    const { browser } = createBrowserHarness({
      existingPages: [existingPage],
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "session-token",
          domain: "chatgpt.com",
        },
      ],
    });
    const connectOverCDP = vi.fn(async () => browser);
    const getStatus = vi.fn(async () => buildStatus("chatgpt-browser-profile"));

    vi.doMock("playwright-core", () => ({
      chromium: { connectOverCDP },
    }));
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      resolveLocalWebAuthStorePath: vi.fn(() => "/tmp/chatgpt-store.json"),
      upsertStoredWebProviderSession: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      createChatgptWebRuntime: () => ({ getStatus }),
      runChatgptWebLiveProof: vi.fn(async () => ({
        status: "failure",
        provider: "chatgpt",
        responseStatus: 401,
        summary: "Finish the ChatGPT login flow before capturing the session.",
      })),
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      GEMINI_WEB_CDP_URL_ENV_NAME: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      createGeminiWebRuntime: () => ({ getStatus }),
      runGeminiWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      createClaudeWebRuntime: () => ({ getStatus }),
      runClaudeWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      createGrokWebRuntime: () => ({ getStatus }),
      runGrokWebLiveProof: vi.fn(),
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      QWEN_WEB_LIVE_PROOF_ENV_NAMES: [],
      QWEN_WEB_LIVE_PROOF_URL: "https://chat.qwen.ai",
      createQwenWebRuntime: () => ({ getStatus }),
      runQwenWebLiveProof: vi.fn(),
      validateQwenBrowserWorkspaceSnapshot: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn());

    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const result = await createDefaultWebAcquisitionRunners().chatgpt?.capture();

    expect(result).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        provider: "chatgpt",
        blocker: "finish-chatgpt-login",
        summary: "Finish the ChatGPT login flow before capturing the session.",
      }),
    );
  });
});
