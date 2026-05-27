import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Qwen browser-session transport", () => {
  it("reuses an existing Qwen tab and extracts SSE text from the browser-session fallback", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_cookie=1");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:9338");

    const evaluate = vi.fn().mockResolvedValue({
      ok: true,
      raw: 'data: {"text":"QWEN_BROWSER_SESSION_OK"}\n\ndata: [DONE]\n',
    });
    const existingPage = {
      url: () => "https://chat.qwen.ai/",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate,
    };
    const context = {
      pages: () => [existingPage],
      newPage: vi.fn(),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const playwright = await import("playwright-core");
    const connectOverCDP = vi
      .spyOn(playwright.chromium, "connectOverCDP")
      .mockResolvedValue(browser as never);

    const { invokeQwenBrowserSessionTransport } = await import(
      "../../../packages/providers/web/qwen/src/browser-session-transport.js"
    );
    const result = await invokeQwenBrowserSessionTransport({
      message: "Reply with exactly QWEN_BROWSER_SESSION_OK and nothing else.",
      model: "qwen-plus",
      env: process.env,
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9338");
    expect(existingPage.bringToFront).toHaveBeenCalled();
    expect(existingPage.goto).toHaveBeenCalledWith("https://chat.qwen.ai/", {
      waitUntil: "domcontentloaded",
    });
    expect(result.outputText).toContain("QWEN_BROWSER_SESSION_OK");
    expect(browser.close).toHaveBeenCalled();
  });

  it("fails closed when required Qwen browser session material is missing", async () => {
    const { invokeQwenBrowserSessionTransport } = await import(
      "../../../packages/providers/web/qwen/src/browser-session-transport.js"
    );

    await expect(
      invokeQwenBrowserSessionTransport({
        message: "hello qwen",
        model: "qwen-plus",
        env: {},
      }),
    ).rejects.toThrow(/Missing Qwen browser session material/i);
  });

  it("ignores deceptive non-Qwen tabs and opens a fresh Qwen page instead", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_cookie=1");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_BROWSER_MODE", "isolated-chrome-root");

    const misleadingPage = {
      url: () => "https://evil.example/qwen.ai/session",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(),
    };
    const newPage = {
      url: () => "about:blank",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({
        ok: true,
        raw: 'data: {"text":"QWEN_NEW_PAGE_OK"}\n\ndata: [DONE]\n',
      }),
    };
    const context = {
      pages: () => [misleadingPage],
      newPage: vi.fn().mockResolvedValue(newPage),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const playwright = await import("playwright-core");
    vi.spyOn(playwright.chromium, "connectOverCDP").mockResolvedValue(browser as never);

    const { invokeQwenBrowserSessionTransport } = await import(
      "../../../packages/providers/web/qwen/src/browser-session-transport.js"
    );
    const result = await invokeQwenBrowserSessionTransport({
      message: "Reply with exactly QWEN_NEW_PAGE_OK and nothing else.",
      model: "qwen-plus",
      env: process.env,
    });

    expect(context.newPage).toHaveBeenCalled();
    expect(misleadingPage.bringToFront).not.toHaveBeenCalled();
    expect(newPage.goto).toHaveBeenCalledWith("https://chat.qwen.ai/", {
      waitUntil: "domcontentloaded",
    });
    expect(result.outputText).toContain("QWEN_NEW_PAGE_OK");
  });
});
