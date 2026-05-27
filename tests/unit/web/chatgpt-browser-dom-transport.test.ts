import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("ChatGPT browser DOM transport", () => {
  it("syncs stored cookies into the attached browser and refreshes the ChatGPT workspace", async () => {
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const page = {
      url: () => "https://chatgpt.com/",
      bringToFront: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ pageText: "" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({
          text: "CHATGPT_OK_COOKIE_SYNC",
          isStreaming: false,
          bodyText: "CHATGPT_OK_COOKIE_SYNC",
        }),
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
    };
    const browser = {
      contexts: () => [
        {
          addCookies,
          pages: () => [page],
        },
      ],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );
    const outputText = await invokeChatgptBrowserDomTransport(
      {
        message: "Reply with exactly CHATGPT_OK_COOKIE_SYNC and nothing else.",
      },
      {
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
        WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE:
          "__Secure-next-auth.session-token=abc123; cf_clearance=def456",
      },
      connectOverCDP,
    );

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:39222");
    expect(addCookies).toHaveBeenCalledWith([
      {
        name: "__Secure-next-auth.session-token",
        value: "abc123",
        url: "https://chatgpt.com/",
        path: "/",
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "cf_clearance",
        value: "def456",
        url: "https://chatgpt.com/",
        path: "/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
    expect(page.goto).toHaveBeenCalledWith("https://chatgpt.com/", {
      waitUntil: "load",
    });
    expect(outputText).toBe("CHATGPT_OK_COOKIE_SYNC");
  });
});
