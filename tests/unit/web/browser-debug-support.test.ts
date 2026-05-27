import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("browser debug support", () => {
  it("resolves the managed-browser canonical profile and provider-specific attach target when explicitly requested", async () => {
    const {
      resolveCanonicalProfile,
      resolveProviderAttachTarget,
      sanitizeTraceUrl,
    } = await import("../../../scripts/browser-debug-support.mjs");

    const env = {
      WEBAI_BRIDGE_BROWSER_MODE: "managed-browser",
      WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR: `${process.cwd()}/.runtime-cache/test-managed-browser`,
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:49222",
      WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:49223",
    };

    expect(resolveProviderAttachTarget("chatgpt", env)).toEqual(
      expect.objectContaining({
        cdpUrl: "http://127.0.0.1:49222",
        cdpUrlSource: "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
      }),
    );
    expect(resolveProviderAttachTarget("gemini", env)).toEqual(
      expect.objectContaining({
        cdpUrl: "http://127.0.0.1:49223",
        cdpUrlSource: "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      }),
    );
    expect(resolveCanonicalProfile("chatgpt", env)).toEqual(
      expect.objectContaining({
        managedProfileDir: `${process.cwd()}/.runtime-cache/test-managed-browser`,
        managedProfileSource: "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR",
      }),
    );
    expect(
      sanitizeTraceUrl("https://chatgpt.com/c/abc?token=secret#hidden"),
    ).toBe("https://chatgpt.com/c/abc");
  });

  it("captures current page, console, network, and support bundle paths from the attached browser", async () => {
    const screenshot = vi.fn(async () => undefined);
    const title = vi.fn(async () => "ChatGPT Workspace");
    const tracingStart = vi.fn(async () => undefined);
    const tracingStop = vi.fn(async () => undefined);
    const listeners = new Map<string, (value: any) => void>();
    const failedRequest = {
      method: () => "GET",
      resourceType: () => "document",
      url: () => "https://chatgpt.com/api/auth/session?token=secret",
      failure: () => ({ errorText: "ECONNRESET" }),
    };
    const page = {
      url: () => "https://chatgpt.com/c/abc123?token=secret",
      on: (event: string, handler: (value: any) => void) => {
        listeners.set(event, handler);
        if (event === "console") {
          handler({
            type: () => "warning",
            text: () => "login gate still visible",
          });
        }
        if (event === "request") {
          handler(failedRequest);
        }
        if (event === "requestfailed") {
          handler(failedRequest);
        }
      },
      title,
      evaluate: vi.fn(async () => ({
        bodyText: "",
        rootText: "",
        visibleHintParts: [
          "ChatGPT Workspace",
          "What can I help with?",
          "Send",
        ],
        hasComposerSurface: true,
      })),
      screenshot,
    };
    const browser = {
      contexts: () => [
        {
          pages: () => [page],
          tracing: {
            start: tracingStart,
            stop: tracingStop,
          },
        },
      ],
      close: vi.fn(async () => undefined),
    };
    const connectOverCDP = vi.fn(async () => browser);

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP,
      },
    }));

    const { captureBrowserDebugContext } = await import(
      "../../../scripts/browser-debug-support.mjs"
    );

    const capturePromise = captureBrowserDebugContext(
      "chatgpt",
      {
        status: "external-blocker",
        classification: "session-incomplete",
        blocker: "chatgpt-browser-session-incomplete",
      },
      {
        WEBAI_BRIDGE_BROWSER_MODE: "managed-browser",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
      },
      {
        observeMs: 0,
      },
    );

    const debug = await capturePromise;

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:39222", {
      timeout: 5000,
    });
    expect(debug).toEqual(
      expect.objectContaining({
        attachStatus: "attached",
        currentPage: {
          url: "https://chatgpt.com/c/abc123",
          title: "ChatGPT Workspace",
          snippet: "ChatGPT Workspace What can I help with? Send",
          hasComposerSurface: true,
          classification: "session-incomplete",
        },
        currentConsole: expect.arrayContaining([
          expect.objectContaining({
            type: "warning",
            text: "login gate still visible",
          }),
        ]),
        currentNetwork: expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            url: "https://chatgpt.com/api/auth/session",
            resourceType: "document",
            errorText: "ECONNRESET",
          }),
        ]),
        supportBundle: expect.objectContaining({
          command:
            "pnpm exec node scripts/capture-web-debug-bundle.mjs --provider chatgpt",
          tracePath: expect.stringContaining("trace.zip"),
          traceMode: "playwright-core-browser-ops",
        }),
      }),
    );
    expect(debug.diagnoseLadder.join(" ")).toContain("session-incomplete");
    expect(tracingStart).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshots: true,
        snapshots: true,
        title: "WebaiBridge chatgpt browser debug support",
      }),
    );
    expect(tracingStop).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("trace.zip"),
      }),
    );
    expect(screenshot).toHaveBeenCalled();
  });

  it("upgrades the Qwen support ladder when session material is present but a permission gate remains", async () => {
    const { buildProviderDiagnoseLadder } = await import(
      "../../../scripts/browser-debug-support.mjs"
    );

    const ladder = buildProviderDiagnoseLadder(
      "qwen",
      {
        classification: "user-action-required",
        blocker: "qwen-browser-session-incomplete",
        diagnostic:
          "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated.",
        persistenceAudit: {
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
        },
      },
      {
        attachTarget: {
          cdpUrl: "http://127.0.0.1:9338",
          loginUrl: "https://chat.qwen.ai",
        },
        currentPage: {
          url: "https://chat.qwen.ai/",
        },
      },
    );

    expect(ladder.join(" ")).toContain("session-token 都已到位");
    expect(ladder.join(" ")).toContain("Unauthorized / permission gate");
  });
});
