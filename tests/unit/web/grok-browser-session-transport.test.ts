import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Grok browser-session transport", () => {
  it("reuses an existing Grok tab, injects cookies, and extracts browser-session text", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_cookie=1; x-signature=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_BROWSER_MODE", "isolated-chrome-root");

    const evaluate = vi.fn(async (callback, payload) => {
      const originalFetch = global.fetch;
      const originalCrypto = global.crypto;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              conversations: [{ conversationId: "conv-1" }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            'data: {"contentDelta":"GROK_BROWSER_SESSION_OK"}\n\ndata: [DONE]\n',
        });

      vi.stubGlobal("fetch", fetchMock as typeof fetch);
      vi.stubGlobal("crypto", {
        randomUUID: () => "uuid-1",
      } as Crypto);

      try {
        return await callback(payload);
      } finally {
        if (originalFetch) {
          vi.stubGlobal("fetch", originalFetch);
        } else {
          vi.unstubAllGlobals();
        }

        if (originalCrypto) {
          vi.stubGlobal("crypto", originalCrypto);
        }
      }
    });
    const existingPage = {
      url: () => "https://grok.com/",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      evaluate,
    };
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const context = {
      pages: () => [existingPage],
      newPage: vi.fn(),
      addCookies,
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const playwright = await import("playwright-core");
    const connectOverCDP = vi
      .spyOn(playwright.chromium, "connectOverCDP")
      .mockResolvedValue(browser as never);

    const { invokeGrokBrowserSessionTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-session-transport.js"
    );
    const result = await invokeGrokBrowserSessionTransport({
      message: "Reply with exactly GROK_BROWSER_SESSION_OK and nothing else.",
      model: "grok-3-mini",
      env: process.env,
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9338");
    expect(addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "grok_cookie",
        value: "1",
        domain: ".grok.com",
      }),
      expect.objectContaining({
        name: "x-signature",
        value: "abc",
        domain: ".grok.com",
      }),
    ]);
    expect(existingPage.bringToFront).toHaveBeenCalled();
    expect(existingPage.waitForLoadState).toHaveBeenCalledWith("domcontentloaded", {
      timeout: 5_000,
    });
    expect(result.outputText).toContain("GROK_BROWSER_SESSION_OK");
    expect(result.providerMessageId).toContain("grok-msg-");
    expect(browser.close).toHaveBeenCalled();
  });

  it("opens a fresh Grok page and creates a conversation when no reusable tab exists yet", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_cookie=1");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:9338");

    const newPage = {
      url: () => "about:blank",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(async (callback, payload) => {
        const originalFetch = global.fetch;
        const originalCrypto = global.crypto;
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ conversations: [] }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ conversationId: "conv-2" }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
              'data: {"contentDelta":"GROK_NEW_PAGE_OK"}\n\ndata: [DONE]\n',
          });

        vi.stubGlobal("fetch", fetchMock as typeof fetch);
        vi.stubGlobal("crypto", {
          randomUUID: () => "uuid-2",
        } as Crypto);

        try {
          return await callback(payload);
        } finally {
          if (originalFetch) {
            vi.stubGlobal("fetch", originalFetch);
          } else {
            vi.unstubAllGlobals();
          }

          if (originalCrypto) {
            vi.stubGlobal("crypto", originalCrypto);
          }
        }
      }),
    };
    const context = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(newPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const playwright = await import("playwright-core");
    vi.spyOn(playwright.chromium, "connectOverCDP").mockResolvedValue(browser as never);

    const { invokeGrokBrowserSessionTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-session-transport.js"
    );
    const result = await invokeGrokBrowserSessionTransport({
      message: "Reply with exactly GROK_NEW_PAGE_OK and nothing else.",
      model: "grok-3-mini",
      env: process.env,
    });

    expect(context.newPage).toHaveBeenCalled();
    expect(newPage.goto).toHaveBeenCalledWith("https://grok.com", {
      waitUntil: "domcontentloaded",
    });
    expect(newPage.waitForTimeout).toHaveBeenCalledWith(1_000);
    expect(result.outputText).toContain("GROK_NEW_PAGE_OK");
    expect(browser.close).toHaveBeenCalled();
  });
});
