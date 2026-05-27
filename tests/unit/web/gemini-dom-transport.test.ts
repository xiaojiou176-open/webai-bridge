import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Gemini browser DOM transport", () => {
  it("only accepts sentinel tokens from assistant-side evidence", async () => {
    const { selectGeminiAssistantReply } = await import(
      "../../../packages/providers/web/gemini/src/browser-dom-transport.js"
    );

    expect(
      selectGeminiAssistantReply({
        requestedToken: "GEMINI_OK",
        assistantCandidates: [],
        structuredReply: "",
        fallbackCandidates: [],
      }),
    ).toBe("");

    expect(
      selectGeminiAssistantReply({
        requestedToken: "GEMINI_OK",
        assistantCandidates: ["显示思路 Gemini 说 GEMINI_OK"],
        structuredReply: "",
        fallbackCandidates: [
          "Reply with exactly GEMINI_OK and nothing else.",
        ],
      }),
    ).toBe("GEMINI_OK");
  });

  it("executes through Playwright CDP when browser session materials are present", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE", "SID=abc; __Secure-1PSID=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT", "WebaiBridgeTest/1.0");

    let evaluateCall = 0;
    const evaluate = vi.fn().mockImplementation(async () => {
      evaluateCall += 1;

      if (evaluateCall <= 2) {
        return {
          ok: true,
          finalUrl: "https://gemini.google.com/app",
          text: "Gemini Composer ready",
          hasComposerSurface: true,
        };
      }

      if (evaluateCall === 3) {
        return ["Gemini Composer ready"];
      }

      return {
        assistantCandidates: ["WebaiBridge Gemini DOM transport ok."],
        fallbackCandidates: [],
        structuredReply: "",
        isStreaming: false,
      };
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      url: () => "about:blank",
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click,
        }),
      }),
      keyboard: {
        type,
        press,
      },
    };
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
    vi.doMock("../../../packages/providers/web/gemini/src/live-proof.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/gemini/src/live-proof.js")
      >("../../../packages/providers/web/gemini/src/live-proof.js");

      return {
        ...actual,
        validateGeminiBrowserWorkspaceSnapshot: () => ({
          ok: true,
          signal: "gemini-app-page",
          summary: "Gemini workspace is ready.",
        }),
      };
    });
    const { invokeGeminiBrowserDomTransport } = await import(
      "../../../packages/providers/web/gemini/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const text = await invokeGeminiBrowserDomTransport({
      message: "hello gemini",
    }, process.env, connectOverCDP);

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9338");
    expect(evaluate).toHaveBeenCalled();
    expect(text).toContain("WebaiBridge Gemini DOM transport ok.");
    expect(close).toHaveBeenCalled();
  });

  it("keeps the default Playwright chromium binding intact", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE", "SID=abc; __Secure-1PSID=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT", "WebaiBridgeTest/1.0");

    let evaluateCall = 0;
    const evaluate = vi.fn().mockImplementation(async () => {
      evaluateCall += 1;

      if (evaluateCall <= 2) {
        return {
          ok: true,
          finalUrl: "https://gemini.google.com/app",
          text: "Gemini Composer ready",
          hasComposerSurface: true,
        };
      }

      if (evaluateCall === 3) {
        return ["Gemini Composer ready"];
      }

      return {
        assistantCandidates: ["WebaiBridge Gemini DOM transport ok."],
        fallbackCandidates: [],
        structuredReply: "",
        isStreaming: false,
      };
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      url: () => "about:blank",
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click,
        }),
      }),
      keyboard: {
        type,
        press,
      },
    };
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
    vi.doMock("../../../packages/providers/web/gemini/src/live-proof.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/gemini/src/live-proof.js")
      >("../../../packages/providers/web/gemini/src/live-proof.js");

      return {
        ...actual,
        validateGeminiBrowserWorkspaceSnapshot: () => ({
          ok: true,
          signal: "gemini-app-page",
          summary: "Gemini workspace is ready.",
        }),
      };
    });
    const playwright = await import("playwright-core");
    const connectOverCDP = vi
      .spyOn(playwright.chromium, "connectOverCDP")
      .mockResolvedValue(browser as never);
    const { invokeGeminiBrowserDomTransport } = await import(
      "../../../packages/providers/web/gemini/src/browser-dom-transport.js"
    );

    const text = await invokeGeminiBrowserDomTransport({
      message: "hello gemini",
    });

    expect(connectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9338");
    expect(evaluate).toHaveBeenCalled();
    expect(text).toContain("WebaiBridge Gemini DOM transport ok.");
    expect(close).toHaveBeenCalled();
  });

  it("fails before sending when Gemini already shows a visible rate-limit gate", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE", "SID=abc; __Secure-1PSID=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT", "WebaiBridgeTest/1.0");

    let evaluateCall = 0;
    const evaluate = vi.fn().mockImplementation(async () => {
      evaluateCall += 1;

      if (evaluateCall === 1) {
        return {
          finalUrl: "https://gemini.google.com/app",
          text: "Gemini Composer ready",
          hasComposerSurface: true,
        };
      }

      return {
        ok: false,
        error:
          "Gemini attached browser is showing a visible rate-limit gate, so WebaiBridge must stop before sending another prompt.",
      };
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const click = vi.fn().mockResolvedValue(undefined);
    const type = vi.fn().mockResolvedValue(undefined);
    const press = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      url: () => "about:blank",
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click,
        }),
      }),
      keyboard: {
        type,
        press,
      },
      close,
    };
    const newPage = vi.fn().mockResolvedValue(page);
    const context = {
      pages: () => [],
      newPage,
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.doMock("../../../packages/providers/web/gemini/src/live-proof.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/gemini/src/live-proof.js")
      >("../../../packages/providers/web/gemini/src/live-proof.js");

      return {
        ...actual,
        validateGeminiBrowserWorkspaceSnapshot: () => ({
          ok: true,
          signal: "gemini-app-page",
          summary: "Gemini workspace is ready.",
        }),
      };
    });
    const { invokeGeminiBrowserDomTransport } = await import(
      "../../../packages/providers/web/gemini/src/browser-dom-transport.js"
    );
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    await expect(
      invokeGeminiBrowserDomTransport({
        message: "hello gemini",
      }, process.env, connectOverCDP),
    ).rejects.toThrow(/visible rate-limit gate/i);
    expect(type).not.toHaveBeenCalled();
    expect(press).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("reuses an existing Gemini tab and does not close the user's page", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE", "SID=abc; __Secure-1PSID=def");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT", "WebaiBridgeTest/1.0");

    let evaluateCall = 0;
    const pageClose = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockImplementation(async () => {
      evaluateCall += 1;

      if (evaluateCall === 1) {
        return {
          finalUrl: "https://gemini.google.com/app",
          text: "Gemini Composer ready",
          hasComposerSurface: true,
        };
      }

      if (evaluateCall === 2) {
        return {
          ok: true,
          selector: "textbox",
        };
      }

      if (evaluateCall === 3) {
        return ["Gemini Composer ready"];
      }

      return {
        assistantCandidates: ["WebaiBridge Gemini DOM transport ok."],
        fallbackCandidates: [],
        structuredReply: "",
        isStreaming: false,
      };
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: () => "https://gemini.google.com/app",
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({
          click: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      keyboard: {
        type: vi.fn().mockResolvedValue(undefined),
        press: vi.fn().mockResolvedValue(undefined),
      },
      close: pageClose,
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
    vi.doMock("../../../packages/providers/web/gemini/src/live-proof.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/gemini/src/live-proof.js")
      >("../../../packages/providers/web/gemini/src/live-proof.js");

      return {
        ...actual,
        validateGeminiBrowserWorkspaceSnapshot: () => ({
          ok: true,
          signal: "gemini-app-page",
          summary: "Gemini workspace is ready.",
        }),
      };
    });
    const { invokeGeminiBrowserDomTransport } = await import(
      "../../../packages/providers/web/gemini/src/browser-dom-transport.js"
    );

    const text = await invokeGeminiBrowserDomTransport(
      {
        message: "hello gemini",
      },
      process.env,
      vi.fn().mockResolvedValue(browser),
    );

    expect(text).toContain("WebaiBridge Gemini DOM transport ok.");
    expect(page.bringToFront).toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(newPage).not.toHaveBeenCalled();
    expect(pageClose).not.toHaveBeenCalled();
  });
});
