import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("ChatGPT browser DOM transport", () => {
  it("executes through Playwright CDP when the attached browser can answer through the page UI", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        pageText: "ChatGPT workspace ready",
      })
      .mockResolvedValueOnce({
        ok: true,
        mode: "dom-button",
      })
      .mockResolvedValueOnce([])
      .mockResolvedValue({
        text: "WEBAI_BRIDGE_CHATGPT_DOM_OK",
        isStreaming: false,
        bodyText:
          "Reply with exactly WEBAI_BRIDGE_CHATGPT_DOM_OK and nothing else. WEBAI_BRIDGE_CHATGPT_DOM_OK",
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForTimeout,
      url: () => "https://chatgpt.com/",
      keyboard: {
        press,
      },
    };
    const newPage = vi.fn().mockResolvedValue(page);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const context = {
      addCookies,
      pages: () => [],
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const text = await invokeChatgptBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_CHATGPT_DOM_OK and nothing else.",
      },
      process.env,
      connectOverCDP,
    );

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:39222");
    expect(goto).toHaveBeenCalledWith("https://chatgpt.com/", {
      waitUntil: "load",
    });
    expect(evaluate).toHaveBeenCalled();
    expect(press).toHaveBeenCalledWith("Enter");
    expect(waitForTimeout).toHaveBeenCalled();
    expect(addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "chatgpt_session",
        value: "abc",
        secure: true,
        sameSite: "Lax",
        url: "https://chatgpt.com/",
      }),
    ]);
    expect(text).toContain("WEBAI_BRIDGE_CHATGPT_DOM_OK");
    expect(close).toHaveBeenCalled();
  });

  it("fails before sending when ChatGPT already shows a visible rate-limit gate", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        pageText: "You've reached our limit for messages. Please try again later.",
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForTimeout,
      url: () => "https://chatgpt.com/",
      keyboard: {
        press,
      },
    };
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [],
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    await expect(
      invokeChatgptBrowserDomTransport(
        {
          message: "Reply with exactly WEBAI_BRIDGE_CHATGPT_DOM_OK and nothing else.",
        },
        process.env,
        connectOverCDP,
      ),
    ).rejects.toThrow(/visible rate-limit gate/i);
    expect(press).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("fails before sending when ChatGPT is still on the logged-out landing page", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");

    const evaluate = vi.fn().mockResolvedValueOnce({
      pageText: "登录 ChatGPT 免费注册 使用密码继续",
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: () => "https://chatgpt.com/",
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
    };
    const browser = {
      contexts: () => [
        {
          pages: () => [],
          newPage: vi.fn().mockResolvedValue(page),
        },
      ],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );

    await expect(
      invokeChatgptBrowserDomTransport(
        {
          message: "Reply with exactly WEBAI_BRIDGE_CHATGPT_DOM_OK",
        },
        process.env,
        vi.fn().mockResolvedValue(browser),
      ),
    ).rejects.toThrow(/logged-out landing page/i);
  });

  it("reuses an existing ChatGPT tab instead of opening another one", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        pageText: "ChatGPT workspace ready",
      })
      .mockResolvedValueOnce({
        ok: true,
        mode: "dom-button",
      })
      .mockResolvedValueOnce(["Existing assistant text"])
      .mockResolvedValue({
        text: "WEBAI_BRIDGE_CHATGPT_DOM_OK",
        isStreaming: false,
        bodyText: "WEBAI_BRIDGE_CHATGPT_DOM_OK",
      });
    const click = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click,
        }),
      }),
      url: () => "https://chatgpt.com/c/existing",
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
    };
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [page],
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );

    await invokeChatgptBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_CHATGPT_DOM_OK and nothing else.",
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(page.bringToFront).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith("https://chatgpt.com/", {
      waitUntil: "load",
    });
    expect(newPage).not.toHaveBeenCalled();
  });

  it("ignores stale assistant text until the current request token appears", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        pageText: "ChatGPT workspace ready",
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(["CHATGPT_OK_OLD"])
      .mockResolvedValueOnce({
        text: "CHATGPT_OK_OLD",
        isStreaming: false,
        bodyText: "CHATGPT OK OLD",
      })
      .mockResolvedValueOnce({
        text: "CHATGPT_SERVICE_NEW",
        isStreaming: false,
        bodyText: "CHATGPT_SERVICE_NEW",
      });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      url: () => "https://chatgpt.com/c/existing",
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
    };
    const browser = {
      contexts: () => [
        {
          pages: () => [page],
          newPage: vi.fn().mockResolvedValue(page),
        },
      ],
      close: vi.fn().mockResolvedValue(undefined),
    };

    const { invokeChatgptBrowserDomTransport } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );

    const text = await invokeChatgptBrowserDomTransport(
      {
        message: "Reply with exactly CHATGPT_SERVICE_NEW and nothing else.",
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(text).toBe("CHATGPT_SERVICE_NEW");
    expect(evaluate).toHaveBeenCalledTimes(5);
  });
});
