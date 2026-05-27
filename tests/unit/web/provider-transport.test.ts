import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractGrokTransportText,
  invokeGrokTransport,
} from "../../../packages/providers/web/grok/src/transport.ts";
import { invokeQwenTransport } from "../../../packages/providers/web/qwen/src/transport.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createReadyStatus(label: string) {
  return {
    authMode: "web-login",
    sessionPresence: "present",
    runtimeReadiness: "ready",
    session: {
      accountLabel: label,
      sessionSource: `${label}-browser-profile`,
      artifactDetails: [],
    },
  } as never;
}

describe("provider transport helpers", () => {
  it("extracts Grok transport text from NDJSON chunks", () => {
    const text = extractGrokTransportText(
      [
        'data: {"contentDelta":"Hello"}',
        'data: {"textDelta":" world"}',
        "data: [DONE]",
      ].join("\n"),
    );

    expect(text).toBe("Hello world");
  });

  it("reuses an existing Grok conversation and returns streamed response text", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversations: [{ conversationId: "conv-1" }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('data: {"contentDelta":"GROK_OK"}\n\ndata: [DONE]\n', {
          status: 200,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeGrokTransport({
      request: {
        provider: "grok",
        model: "grok-3",
        input: "Reply with exactly GROK_OK and nothing else.",
      },
      status: createReadyStatus("grok"),
      context: {
        env: {
          WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
          WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        },
      },
    });

    expect(result.outputText).toBe("GROK_OK");
    expect(result.providerMessageId).toMatch(/^grok-msg-/);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://grok.com/rest/app-chat/conversations?limit=1",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://grok.com/rest/app-chat/conversations/conv-1/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("creates a new Grok conversation when none exists yet", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversationId: "conv-new",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('data: {"contentDelta":"GROK_NEW"}\n\ndata: [DONE]\n', {
          status: 200,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeGrokTransport({
      request: {
        provider: "grok",
        model: "grok-3",
        input: "Reply with exactly GROK_NEW and nothing else.",
      },
      status: createReadyStatus("grok"),
      context: {
        env: {
          WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
          WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        },
      },
    });

    expect(result.outputText).toBe("GROK_NEW");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://grok.com/rest/app-chat/conversations",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("runs the Qwen transport happy path and surfaces creation failures", async () => {
    const successFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "chat-1",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('data: {"text":"QWEN_OK"}\n\ndata: [DONE]\n', {
          status: 200,
        }),
      );

    vi.stubGlobal("fetch", successFetch);

    const success = await invokeQwenTransport({
      request: {
        provider: "qwen",
        model: "qwen3.5-plus",
        input: "Reply with exactly QWEN_OK and nothing else.",
      },
      status: createReadyStatus("qwen"),
      context: {
        env: {
          WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
          WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
        },
      },
    });

    expect(success.outputText).toContain("QWEN_OK");
    expect(success.providerMessageId).toMatch(/^qwen-msg-/);

    const failingFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("chat creation failed", {
        status: 500,
      }),
    );
    vi.stubGlobal("fetch", failingFetch);

    await expect(
      invokeQwenTransport({
        request: {
          provider: "qwen",
          model: "qwen3.5-plus",
          input: "Hello",
        },
        status: createReadyStatus("qwen"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
            WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/chat creation failed/i);
  });

  it("fails fast when Grok or Qwen transport session material is missing", async () => {
    await expect(
      invokeGrokTransport({
        request: {
          provider: "grok",
          model: "grok-3",
          input: "Hello",
        },
        status: createReadyStatus("grok"),
        context: {
          env: {},
        },
      }),
    ).rejects.toThrow(/Missing Grok browser session material/i);

    await expect(
      invokeQwenTransport({
        request: {
          provider: "qwen",
          model: "qwen3.5-plus",
          input: "Hello",
        },
        status: createReadyStatus("qwen"),
        context: {
          env: {},
        },
      }),
    ).rejects.toThrow(/Missing Qwen browser session material/i);
  });

  it("surfaces Grok transport failures when creation or response endpoints return non-200", async () => {
    const creationFail = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("grok create failed", { status: 500 }));
    vi.stubGlobal("fetch", creationFail);

    await expect(
      invokeGrokTransport({
        request: {
          provider: "grok",
          model: "grok-3",
          input: "Hello",
        },
        status: createReadyStatus("grok"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
            WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/Grok conversation creation failed/i);

    const responseFail = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversations: [{ conversationId: "conv-1" }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("grok response failed", { status: 502 }));
    vi.stubGlobal("fetch", responseFail);

    await expect(
      invokeGrokTransport({
        request: {
          provider: "grok",
          model: "grok-3",
          input: "Hello",
        },
        status: createReadyStatus("grok"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
            WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/Grok response request failed/i);
  });

  it("times out Grok transport fetches when upstream aborts the request", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValueOnce(abortError),
    );

    await expect(
      invokeGrokTransport({
        request: {
          provider: "grok",
          model: "grok-3",
          input: "Hello",
        },
        status: createReadyStatus("grok"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
            WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/timed out after 20000ms/i);
  });

  it("requires a Grok conversation id after the creation endpoint succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeGrokTransport({
        request: {
          provider: "grok",
          model: "grok-3",
          input: "Hello",
        },
        status: createReadyStatus("grok"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
            WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/could not resolve a conversation id/i);
  });

  it("surfaces Qwen transport failures when chat id is missing or payload reports success=false", async () => {
    const noChatId = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          data: {
            code: "Unauthorized",
            details:
              "You do not have permission to access this resource. Please contact your administrator for assistance.",
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", noChatId);

    await expect(
      invokeQwenTransport({
        request: {
          provider: "qwen",
          model: "qwen3.5-plus",
          input: "Hello",
        },
        status: createReadyStatus("qwen"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
            WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/permission to access this resource/i);

    const payloadFail = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "chat-1",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            data: {
              message: "upstream rejected request",
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", payloadFail);

    await expect(
      invokeQwenTransport({
        request: {
          provider: "qwen",
          model: "qwen3.5-plus",
          input: "Hello",
        },
        status: createReadyStatus("qwen"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
            WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/payload reported failure/i);
  });

  it("uses the phase feature config for non-exact Qwen prompts and surfaces completion HTTP failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            chatId: "chat-phase",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("upstream qwen failure", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeQwenTransport({
        request: {
          provider: "qwen",
          model: "qwen3.5-plus",
          input: "Tell me something useful about the workspace",
        },
        status: createReadyStatus("qwen"),
        context: {
          env: {
            WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
            WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
          },
        },
      }),
    ).rejects.toThrow(/HTTP 500/i);

    const completionBody = JSON.parse(`${fetchMock.mock.calls[1]?.[1]?.body ?? "{}"}`);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("chat_id=chat-phase");
    expect(completionBody.messages[0]?.feature_config).toEqual({
      thinking_enabled: true,
      output_schema: "phase",
    });
  });
});
