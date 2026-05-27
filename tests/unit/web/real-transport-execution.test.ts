import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Web real transport execution", () => {
  it("executes the ChatGPT real transport path with browser session materials", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-token-123",
            oaiDeviceId: "device-123",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"message":{"content":{"parts":["WebaiBridge ChatGPT real transport ok."]}}}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createChatgptWebRuntime } = await import(
      "../../../packages/providers/web/chatgpt/src/index.js"
    );
    const runtime = createChatgptWebRuntime();
    const result = await runtime.invoke(
      {
        provider: "chatgpt",
        model: "gpt-4o",
        input: "hello from webai-bridge",
      },
      {
        sessions: {
          chatgpt: {
            state: "ready",
            accountLabel: "chatgpt:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://chatgpt.com/api/auth/session",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://chatgpt.com/backend-api/conversation/init",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "https://chatgpt.com/backend-api/conversation",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.outputText).toContain("WebaiBridge ChatGPT real transport ok.");
    expect(result.invoke.kind).toBe("real-transport");
  });

  it("falls back to ChatGPT browser DOM transport when the upstream auth token is invalidated", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-token-123",
            oaiDeviceId: "device-123",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Your authentication token has been invalidated. Please try signing in again.",
              type: "invalid_request_error",
              code: "token_invalidated",
            },
            status: 401,
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const invokeChatgptBrowserDomTransport = vi
      .fn()
      .mockResolvedValue("CHATGPT_OK_FROM_DOM");

    vi.doMock(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js",
      () => ({
        invokeChatgptBrowserDomTransport,
      }),
    );

    const { createChatgptWebRuntime } = await import(
      "../../../packages/providers/web/chatgpt/src/index.js"
    );
    const runtime = createChatgptWebRuntime();
    const result = await runtime.invoke(
      {
        provider: "chatgpt",
        model: "gpt-4o",
        input: "Reply with exactly CHATGPT_OK_FROM_DOM and nothing else.",
      },
      {
        sessions: {
          chatgpt: {
            state: "ready",
            accountLabel: "chatgpt:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(invokeChatgptBrowserDomTransport).toHaveBeenCalledWith(
      {
        message: "Reply with exactly CHATGPT_OK_FROM_DOM and nothing else.",
      },
      expect.any(Object),
    );
    expect(result.outputText).toBe("CHATGPT_OK_FROM_DOM");
    expect(result.invoke.kind).toBe("real-transport");
  });

  it("normalizes ChatGPT SSE output down to the requested sentinel token", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-token-123",
            oaiDeviceId: "device-123",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"message":{"content":{"parts":["CHATGPT_SERVICE_TOKEN\\n\\n语音"]}}}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createChatgptWebRuntime } = await import(
      "../../../packages/providers/web/chatgpt/src/index.js"
    );
    const runtime = createChatgptWebRuntime();
    const result = await runtime.invoke(
      {
        provider: "chatgpt",
        model: "gpt-4o",
        input: "Reply with exactly CHATGPT_SERVICE_TOKEN and nothing else.",
      },
      {
        sessions: {
          chatgpt: {
            state: "ready",
            accountLabel: "chatgpt:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.outputText).toBe("CHATGPT_SERVICE_TOKEN");
  });

  it("falls back to ChatGPT browser DOM transport when the HTTP transport stalls", async () => {
    vi.useFakeTimers();
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal("fetch", fetchMock);

    const invokeChatgptBrowserDomTransport = vi
      .fn()
      .mockResolvedValue("CHATGPT_OK_TIMEOUT");

    vi.doMock(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js",
      () => ({
        invokeChatgptBrowserDomTransport,
      }),
    );

    try {
      const { createChatgptWebRuntime } = await import(
        "../../../packages/providers/web/chatgpt/src/index.js"
      );
      const runtime = createChatgptWebRuntime();
      const invokePromise = runtime.invoke(
        {
          provider: "chatgpt",
          model: "gpt-4o",
          input: "Reply with exactly CHATGPT_OK_TIMEOUT and nothing else.",
        },
        {
          sessions: {
            chatgpt: {
              state: "ready",
              accountLabel: "chatgpt:real",
            },
          },
        },
      );

      await vi.advanceTimersByTimeAsync(20_000);
      const result = await invokePromise;

      expect(result.ok).toBe(true);

      if (!result.ok) {
        return;
      }

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.outputText).toBe("CHATGPT_OK_TIMEOUT");
      expect(result.invoke.kind).toBe("real-transport");
      expect(invokeChatgptBrowserDomTransport).toHaveBeenCalledWith(
        {
          message: "Reply with exactly CHATGPT_OK_TIMEOUT and nothing else.",
        },
        expect.objectContaining({
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_session=abc",
          WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: "WebaiBridgeTest/1.0",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("executes the Claude real transport path with browser session materials", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE", "sessionKey=abc; anthropic-device-id=device-1");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ uuid: "org_123" }]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ uuid: "conv_123" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"completion":"WebaiBridge Claude real transport ok."}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createClaudeWebRuntime } = await import(
      "../../../packages/providers/web/claude/src/index.js"
    );
    const runtime = createClaudeWebRuntime();
    const result = await runtime.invoke(
      {
        provider: "claude",
        model: "claude-sonnet-4-6",
        input: "hello from webai-bridge",
      },
      {
        sessions: {
          claude: {
            state: "ready",
            accountLabel: "claude:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://claude.ai/api/organizations",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(result.outputText).toContain("WebaiBridge Claude real transport ok.");
    expect(result.invoke.kind).toBe("real-transport");
  });

  it("executes the Grok and Qwen real transport paths with browser session materials", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ conversations: [{ conversationId: "grok-conv-1" }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"text":"WebaiBridge Grok real transport ok."}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { id: "qwen-chat-1" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"text":"WebaiBridge Qwen real transport ok."}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createGrokWebRuntime } = await import(
      "../../../packages/providers/web/grok/src/index.js"
    );
    const { createQwenWebRuntime } = await import(
      "../../../packages/providers/web/qwen/src/index.js"
    );

    const grokResult = await createGrokWebRuntime().invoke(
      {
        provider: "grok",
        model: "grok-3",
        input: "hello from grok",
      },
      {
        sessions: {
          grok: {
            state: "ready",
            accountLabel: "grok:real",
          },
        },
      },
    );
    const qwenResult = await createQwenWebRuntime().invoke(
      {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "hello from qwen",
      },
      {
        sessions: {
          qwen: {
            state: "ready",
            accountLabel: "qwen:real",
          },
        },
      },
    );

    expect(grokResult.ok).toBe(true);
    expect(qwenResult.ok).toBe(true);

    if (grokResult.ok) {
      expect(grokResult.outputText).toContain("WebaiBridge Grok real transport ok.");
      expect(grokResult.invoke.kind).toBe("real-transport");
    }

    if (qwenResult.ok) {
      expect(qwenResult.outputText).toContain("WebaiBridge Qwen real transport ok.");
      expect(qwenResult.invoke.kind).toBe("real-transport");
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://grok.com/rest/app-chat/conversations?limit=1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          origin: "https://grok.com",
          referer: "https://grok.com/",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
        }),
      }),
    );
  });

  it("falls back to the Grok browser DOM transport when the HTTP transport stalls", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const invokeGrokTransport = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Grok transport timed out after 20000ms while requesting https://grok.com/rest/app-chat/conversations/grok-conv-1/responses.",
        ),
      );
    const invokeGrokBrowserSessionTransport = vi
      .fn()
      .mockRejectedValue(new Error("browser-session fallback failed"));
    const invokeGrokBrowserDomTransport = vi
      .fn()
      .mockResolvedValue("GROK_OK_FALLBACK");

    vi.doMock("../../../packages/providers/web/grok/src/transport.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/grok/src/transport.js")
      >("../../../packages/providers/web/grok/src/transport.js");

      return {
        ...actual,
        invokeGrokTransport,
      };
    });
    vi.doMock("../../../packages/providers/web/grok/src/browser-dom-transport.js", () => ({
      invokeGrokBrowserDomTransport,
    }));
    vi.doMock("../../../packages/providers/web/grok/src/browser-session-transport.js", () => ({
      invokeGrokBrowserSessionTransport,
    }));

    const { createGrokWebRuntime } = await import(
      "../../../packages/providers/web/grok/src/index.js"
    );
    const result = await createGrokWebRuntime().invoke(
      {
        provider: "grok",
        model: "grok-3",
        input: "Reply with exactly GROK_OK_FALLBACK and nothing else.",
      },
      {
        sessions: {
          grok: {
            state: "ready",
            accountLabel: "grok:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.outputText).toBe("GROK_OK_FALLBACK");
    expect(result.invoke.kind).toBe("real-transport");
    expect(invokeGrokTransport).toHaveBeenCalledTimes(1);
    expect(invokeGrokBrowserSessionTransport).toHaveBeenCalledTimes(1);
    expect(invokeGrokBrowserDomTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Reply with exactly GROK_OK_FALLBACK and nothing else.",
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
      }),
    );
  });

  it("uses the Grok browser-session transport before falling back to DOM polling", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const invokeGrokTransport = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Grok transport timed out after 20000ms while requesting https://grok.com/rest/app-chat/conversations/grok-conv-1/responses.",
        ),
      );
    const invokeGrokBrowserSessionTransport = vi
      .fn()
      .mockResolvedValue({
        outputText: "GROK_OK_BROWSER_SESSION",
        providerMessageId: "grok-browser-session-msg",
      });
    const invokeGrokBrowserDomTransport = vi.fn();

    vi.doMock("../../../packages/providers/web/grok/src/transport.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/grok/src/transport.js")
      >("../../../packages/providers/web/grok/src/transport.js");

      return {
        ...actual,
        invokeGrokTransport,
      };
    });
    vi.doMock("../../../packages/providers/web/grok/src/browser-session-transport.js", () => ({
      invokeGrokBrowserSessionTransport,
    }));
    vi.doMock("../../../packages/providers/web/grok/src/browser-dom-transport.js", () => ({
      invokeGrokBrowserDomTransport,
    }));

    const { createGrokWebRuntime } = await import(
      "../../../packages/providers/web/grok/src/index.js"
    );
    const result = await createGrokWebRuntime().invoke(
      {
        provider: "grok",
        model: "grok-3",
        input: "Reply with exactly GROK_OK_BROWSER_SESSION and nothing else.",
      },
      {
        sessions: {
          grok: {
            state: "ready",
            accountLabel: "grok:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.outputText).toBe("GROK_OK_BROWSER_SESSION");
    expect(invokeGrokBrowserSessionTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Reply with exactly GROK_OK_BROWSER_SESSION and nothing else.",
        model: "grok-3",
      }),
    );
    expect(invokeGrokBrowserDomTransport).not.toHaveBeenCalled();
  });

  it("uses the Grok browser-session transport when the HTTP transport is rejected as unauthorized", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

    const invokeGrokTransport = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Grok response request failed with HTTP 401: Unauthorized",
        ),
      );
    const invokeGrokBrowserSessionTransport = vi
      .fn()
      .mockResolvedValue({
        outputText: "GROK_OK_BROWSER_SESSION",
        providerMessageId: "grok-browser-session-msg",
      });
    const invokeGrokBrowserDomTransport = vi.fn();

    vi.doMock("../../../packages/providers/web/grok/src/transport.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/grok/src/transport.js")
      >("../../../packages/providers/web/grok/src/transport.js");

      return {
        ...actual,
        invokeGrokTransport,
      };
    });
    vi.doMock("../../../packages/providers/web/grok/src/browser-session-transport.js", () => ({
      invokeGrokBrowserSessionTransport,
    }));
    vi.doMock("../../../packages/providers/web/grok/src/browser-dom-transport.js", () => ({
      invokeGrokBrowserDomTransport,
    }));

    const { createGrokWebRuntime } = await import(
      "../../../packages/providers/web/grok/src/index.js"
    );
    const result = await createGrokWebRuntime().invoke(
      {
        provider: "grok",
        model: "grok-3",
        input: "Reply with exactly GROK_OK_UNAUTHORIZED_FALLBACK and nothing else.",
      },
      {
        sessions: {
          grok: {
            state: "ready",
            accountLabel: "grok:real",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.outputText).toBe("GROK_OK_BROWSER_SESSION");
    expect(invokeGrokBrowserSessionTransport).toHaveBeenCalled();
    expect(invokeGrokBrowserDomTransport).not.toHaveBeenCalled();
  });

  it("fails closed when the Grok browser DOM fallback exceeds its timeout budget", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
      vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");

      const invokeGrokTransport = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Grok transport timed out after 20000ms while requesting https://grok.com/rest/app-chat/conversations/grok-conv-1/responses.",
          ),
        );
      const invokeGrokBrowserSessionTransport = vi
        .fn()
        .mockRejectedValue(new Error("browser-session fallback failed"));
      const invokeGrokBrowserDomTransport = vi.fn(({ signal }: { signal?: AbortSignal }) => {
        return new Promise<string>((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error("Grok browser DOM transport aborted."));
            return;
          }

          signal?.addEventListener(
            "abort",
            () => reject(new Error("Grok browser DOM transport aborted.")),
            { once: true },
          );
        });
      });

      vi.doMock("../../../packages/providers/web/grok/src/transport.js", async () => {
        const actual = await vi.importActual<
          typeof import("../../../packages/providers/web/grok/src/transport.js")
        >("../../../packages/providers/web/grok/src/transport.js");

        return {
          ...actual,
          invokeGrokTransport,
        };
      });
      vi.doMock("../../../packages/providers/web/grok/src/browser-session-transport.js", () => ({
        invokeGrokBrowserSessionTransport,
      }));
      vi.doMock("../../../packages/providers/web/grok/src/browser-dom-transport.js", () => ({
        invokeGrokBrowserDomTransport,
      }));

      const { createGrokWebRuntime } = await import(
        "../../../packages/providers/web/grok/src/index.js"
      );
      const resultPromise = createGrokWebRuntime().invoke(
        {
          provider: "grok",
          model: "grok-3",
          input: "Reply with exactly GROK_OK_TIMEOUT and nothing else.",
        },
        {
          sessions: {
            grok: {
              state: "ready",
              accountLabel: "grok:real",
            },
          },
        },
      );

      await vi.advanceTimersByTimeAsync(60_000);
      const result = await resultPromise;

      expect(result.ok).toBe(false);

      if (result.ok) {
        return;
      }

      expect(result.message).toContain("Grok browser DOM fallback timed out after 60000ms.");
      expect(result.errorCategory).toBe("provider-unavailable");
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables Qwen thinking mode for exact-response verification prompts", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { id: "qwen-chat-proof" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"text":"QWEN_OK_PROOF"}',
            "data: [DONE]",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createQwenWebRuntime } = await import(
      "../../../packages/providers/web/qwen/src/index.js"
    );
    const result = await createQwenWebRuntime().invoke(
      {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "Reply with exactly QWEN_OK_PROOF and nothing else.",
      },
      {
        sessions: {
          qwen: {
            state: "ready",
            accountLabel: "qwen:proof",
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://chat.qwen.ai/api/v2/chat/completions?chat_id=qwen-chat-proof",
    );

    const qwenCompletionInit = fetchMock.mock.calls[1]?.[1];

    expect(qwenCompletionInit).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "text/event-stream",
          "content-type": "application/json",
        }),
      }),
    );

    const qwenCompletionPayload = JSON.parse(`${qwenCompletionInit?.body ?? "{}"}`) as {
      messages?: Array<{
        role?: string;
        content?: string;
        chat_type?: string;
        feature_config?: {
          thinking_enabled?: boolean;
        };
      }>;
    };

    expect(qwenCompletionPayload.messages?.[0]).toEqual(
      expect.objectContaining({
        role: "user",
        content: "Reply with exactly QWEN_OK_PROOF and nothing else.",
        chat_type: "t2t",
        feature_config: {
          thinking_enabled: false,
        },
      }),
    );
  });

  it("falls back to the Qwen browser session transport when bootstrap is unauthorized", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");

    const invokeQwenTransport = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Qwen chat creation reported Unauthorized. You do not have permission to access this resource. Please contact your administrator for assistance.",
        ),
      );
    const invokeQwenBrowserSessionTransport = vi
      .fn()
      .mockResolvedValue({
        outputText: "QWEN_OK_BROWSER_FALLBACK",
        providerMessageId: "qwen-browser-msg",
      });

    vi.doMock("../../../packages/providers/web/qwen/src/transport.js", async () => {
      const actual = await vi.importActual<
        typeof import("../../../packages/providers/web/qwen/src/transport.js")
      >("../../../packages/providers/web/qwen/src/transport.js");

      return {
        ...actual,
        invokeQwenTransport,
      };
    });
    vi.doMock("../../../packages/providers/web/qwen/src/browser-session-transport.js", () => ({
      invokeQwenBrowserSessionTransport,
    }));

    const { createQwenWebRuntime } = await import(
      "../../../packages/providers/web/qwen/src/index.js"
    );
    const result = await createQwenWebRuntime().invoke(
      {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "Reply with exactly QWEN_OK_BROWSER_FALLBACK and nothing else.",
      },
      {
        sessions: {
          qwen: {
            state: "ready",
            accountLabel: "qwen:proof",
          },
        },
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.outputText).toBe("QWEN_OK_BROWSER_FALLBACK");
    expect(result.invoke.kind).toBe("real-transport");
    expect(invokeQwenBrowserSessionTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Reply with exactly QWEN_OK_BROWSER_FALLBACK and nothing else.",
        model: "qwen3.5-plus",
      }),
    );
  });

});
