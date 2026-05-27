import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Grok browser DOM transport", () => {
  it("executes through Playwright CDP when the attached browser can answer through the page UI", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "auth_token=abc; sso=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce(["Existing Grok assistant text"])
      .mockResolvedValue({
        text: "WEBAI_BRIDGE_GROK_DOM_OK",
        isStreaming: false,
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const sendClick = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? click : sendClick,
      }),
    }));
    const page = {
      goto,
      evaluate,
      waitForTimeout,
      url: () => "https://grok.com/",
      locator,
      keyboard: {
        type,
        press,
      },
    };
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [],
      addCookies,
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeGrokBrowserDomTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const text = await invokeGrokBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_GROK_DOM_OK",
      },
      process.env,
      connectOverCDP,
    );

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:39222");
    expect(addCookies).toHaveBeenCalled();
    expect(goto).toHaveBeenCalledWith("https://grok.com/", {
      waitUntil: "domcontentloaded",
    });
    expect(click).toHaveBeenCalled();
    expect(sendClick).toHaveBeenCalled();
    expect(type).toHaveBeenCalledWith("Reply with exactly WEBAI_BRIDGE_GROK_DOM_OK", {
      delay: 20,
    });
    expect(press).not.toHaveBeenCalled();
    expect(waitForTimeout).toHaveBeenCalled();
    expect(text).toContain("WEBAI_BRIDGE_GROK_DOM_OK");
    expect(close).toHaveBeenCalled();
  });

  it("reconnects once when the attached browser page closes during prompt submission", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "auth_token=abc; sso=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const firstEvaluate = vi.fn().mockResolvedValueOnce({
      ok: true,
    });
    const firstGoto = vi.fn().mockResolvedValue(undefined);
    const firstWaitForTimeout = vi.fn().mockResolvedValue(undefined);
    const firstClose = vi.fn().mockResolvedValue(undefined);
    const firstInputClick = vi.fn().mockResolvedValue(undefined);
    const firstSendClick = vi.fn().mockRejectedValue(new Error("Send button hidden"));
    const firstType = vi.fn().mockResolvedValue(undefined);
    const firstPress = vi
      .fn()
      .mockRejectedValue(new Error("Target page, context or browser has been closed"));
    const firstLocator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? firstInputClick : firstSendClick,
      }),
    }));
    const firstPage = {
      goto: firstGoto,
      evaluate: firstEvaluate,
      waitForTimeout: firstWaitForTimeout,
      url: () => "https://grok.com/",
      locator: firstLocator,
      keyboard: {
        type: firstType,
        press: firstPress,
      },
    };
    const firstAddCookies = vi.fn().mockResolvedValue(undefined);
    const firstContext = {
      pages: () => [],
      addCookies: firstAddCookies,
      newPage: vi.fn().mockResolvedValue(firstPage),
    };
    const firstBrowser = {
      contexts: () => [firstContext],
      close: firstClose,
    };

    const secondEvaluate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce(["Existing Grok assistant text"])
      .mockResolvedValue({
        text: "WEBAI_BRIDGE_GROK_DOM_RETRY_OK",
        isStreaming: false,
        bodyText: "WEBAI_BRIDGE_GROK_DOM_RETRY_OK",
      });
    const secondGoto = vi.fn().mockResolvedValue(undefined);
    const secondWaitForTimeout = vi.fn().mockResolvedValue(undefined);
    const secondClose = vi.fn().mockResolvedValue(undefined);
    const secondInputClick = vi.fn().mockResolvedValue(undefined);
    const secondSendClick = vi.fn().mockResolvedValue(undefined);
    const secondType = vi.fn().mockResolvedValue(undefined);
    const secondPress = vi.fn().mockResolvedValue(undefined);
    const secondLocator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? secondInputClick : secondSendClick,
      }),
    }));
    const secondPage = {
      goto: secondGoto,
      evaluate: secondEvaluate,
      waitForTimeout: secondWaitForTimeout,
      url: () => "https://grok.com/",
      locator: secondLocator,
      keyboard: {
        type: secondType,
        press: secondPress,
      },
    };
    const secondAddCookies = vi.fn().mockResolvedValue(undefined);
    const secondContext = {
      pages: () => [],
      addCookies: secondAddCookies,
      newPage: vi.fn().mockResolvedValue(secondPage),
    };
    const secondBrowser = {
      contexts: () => [secondContext],
      close: secondClose,
    };

    const { invokeGrokBrowserDomTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi
      .fn()
      .mockResolvedValueOnce(firstBrowser)
      .mockResolvedValueOnce(secondBrowser);

    const text = await invokeGrokBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_GROK_DOM_RETRY_OK and nothing else.",
      },
      process.env,
      connectOverCDP,
    );

    expect(connectOverCDP).toHaveBeenCalledTimes(2);
    expect(firstPress).toHaveBeenCalledWith("Enter");
    expect(secondSendClick).toHaveBeenCalled();
    expect(text).toBe("WEBAI_BRIDGE_GROK_DOM_RETRY_OK");
    expect(firstClose).toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalled();
  });

  it("reuses an existing Grok tab instead of forcing a reload", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "auth_token=abc; sso=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce(["Existing Grok assistant text"])
      .mockResolvedValue({
        text: "WEBAI_BRIDGE_GROK_DOM_OK",
        isStreaming: false,
        bodyText: "WEBAI_BRIDGE_GROK_DOM_OK",
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const bringToFront = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const sendClick = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? click : sendClick,
      }),
    }));
    const page = {
      goto,
      bringToFront,
      evaluate,
      waitForTimeout,
      url: () => "https://grok.com/",
      locator,
      keyboard: {
        type,
        press,
      },
    };
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [page],
      addCookies,
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeGrokBrowserDomTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-dom-transport.js"
    );

    await invokeGrokBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_GROK_DOM_OK",
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(bringToFront).toHaveBeenCalled();
    expect(goto).toHaveBeenCalledWith("https://grok.com/", {
      waitUntil: "domcontentloaded",
    });
    expect(newPage).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("waits for the exact verification token instead of returning stable non-token text", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "auth_token=abc; sso=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce(["Existing Grok assistant text"])
      .mockResolvedValueOnce({
        text: "Grok is thinking about the answer.",
        isStreaming: false,
        bodyText: "Grok is thinking about the answer.",
      })
      .mockResolvedValueOnce({
        text: "Grok is thinking about the answer.",
        isStreaming: false,
        bodyText: "Grok is thinking about the answer.",
      })
      .mockResolvedValueOnce({
        text: "WEBAI_BRIDGE_GROK_DOM_WAIT_TOKEN",
        isStreaming: false,
        bodyText: "WEBAI_BRIDGE_GROK_DOM_WAIT_TOKEN",
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const sendClick = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? click : sendClick,
      }),
    }));
    const page = {
      goto,
      evaluate,
      waitForTimeout,
      url: () => "https://grok.com/",
      locator,
      keyboard: {
        type,
        press,
      },
    };
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [],
      addCookies,
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeGrokBrowserDomTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-dom-transport.js"
    );

    const text = await invokeGrokBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_GROK_DOM_WAIT_TOKEN and nothing else.",
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(text).toBe("WEBAI_BRIDGE_GROK_DOM_WAIT_TOKEN");
    expect(waitForTimeout).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalled();
  });

  it("returns the requested token from a final DOM read-back even if the abort signal is already set", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_AUTH_CDP_URL", "http://127.0.0.1:39222");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "auth_token=abc; sso=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const controller = new AbortController();
    controller.abort();

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce(["Existing Grok assistant text"])
      .mockResolvedValueOnce({
        text: "WEBAI_BRIDGE_GROK_DOM_ABORT_OK",
        isStreaming: false,
        bodyText:
          "Reply with exactly WEBAI_BRIDGE_GROK_DOM_ABORT_OK and nothing else. WEBAI_BRIDGE_GROK_DOM_ABORT_OK",
      });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const sendClick = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn((selector: string) => ({
      first: () => ({
        click: selector.includes("contenteditable") ? click : sendClick,
      }),
    }));
    const page = {
      goto,
      evaluate,
      waitForTimeout,
      url: () => "https://grok.com/",
      locator,
      keyboard: {
        type,
        press,
      },
    };
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [],
      addCookies,
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close,
    };

    const { invokeGrokBrowserDomTransport } = await import(
      "../../../packages/providers/web/grok/src/browser-dom-transport.js"
    );

    const text = await invokeGrokBrowserDomTransport(
      {
        message: "Reply with exactly WEBAI_BRIDGE_GROK_DOM_ABORT_OK and nothing else.",
        signal: controller.signal,
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(text).toBe("WEBAI_BRIDGE_GROK_DOM_ABORT_OK");
    expect(waitForTimeout).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});
