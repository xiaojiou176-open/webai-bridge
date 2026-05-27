import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

import { runChatgptWebLiveProof } from "../../../packages/providers/web/chatgpt/src/live-proof.js";
import { runClaudeWebLiveProof } from "../../../packages/providers/web/claude/src/live-proof.js";
import {
  isGeminiHumanVerificationSnapshot,
  isGeminiRateLimitedSnapshot,
  runGeminiBrowserWorkspaceProof,
  runGeminiWebLiveProof,
  validateGeminiBrowserWorkspaceSnapshot,
} from "../../../packages/providers/web/gemini/src/live-proof.js";
import {
  runGrokBrowserWorkspaceProof,
  runGrokWebLiveProof,
} from "../../../packages/providers/web/grok/src/live-proof.js";
import {
  runQwenBrowserWorkspaceProof,
  runQwenWebLiveProof,
  validateQwenBrowserWorkspaceSnapshot,
} from "../../../packages/providers/web/qwen/src/live-proof.js";

describe("Web/Login live proof harness", () => {
  it("classifies ChatGPT logged-out and email-verification browser workspaces as user action blockers", async () => {
    const { validateChatgptBrowserWorkspaceSnapshot } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );

    const loginGate = validateChatgptBrowserWorkspaceSnapshot({
      finalUrl: "https://chatgpt.com/",
      bodyText:
        "登录以获取基于已保存聊天的回答 登录 免费注册 ChatGPT 你说 Reply with exactly CHATGPT_OK_1234 and nothing else.",
      hasComposerSurface: false,
    });
    const emailVerification = validateChatgptBrowserWorkspaceSnapshot({
      finalUrl: "https://auth.openai.com/email-verification",
      bodyText: "检查您的收件箱 验证码 继续 使用密码继续",
      hasComposerSurface: false,
    });

    expect(loginGate).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.stringContaining("logged-out landing page"),
      }),
    );
    expect(emailVerification).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.stringContaining("email verification"),
      }),
    );
  });

  it("still blocks ChatGPT login landing pages even when a fake composer surface is visible", async () => {
    const { validateChatgptBrowserWorkspaceSnapshot } = await import(
      "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js"
    );

    const loginLandingWithComposer = validateChatgptBrowserWorkspaceSnapshot({
      finalUrl: "https://chatgpt.com/",
      bodyText:
        "登录以获取基于已保存聊天的回答 登录 免费注册 ChatGPT 你在忙什么？ 语音 向 AI 聊天机器人 ChatGPT 发送消息",
      hasComposerSurface: true,
    });

    expect(loginLandingWithComposer).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.stringContaining("logged-out landing page"),
      }),
    );
  });

  it("returns external-blocker for all five providers when required session env is missing", async () => {
    const cases = [
      ["chatgpt", runChatgptWebLiveProof],
      ["gemini", runGeminiWebLiveProof],
      ["claude", runClaudeWebLiveProof],
      ["grok", runGrokWebLiveProof],
      ["qwen", runQwenWebLiveProof],
    ] as const;

    for (const [provider, runProof] of cases) {
      const result = await runProof({});

      expect(result.status).toBe("external-blocker");

      if (result.status !== "external-blocker") {
        continue;
      }

      expect(result.provider).toBe(provider);
      expect(result.blocker).toBe("missing-web-session-material");
      expect(result.missingEnvNames.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses the ChatGPT auth session endpoint when browser cookie and user-agent are present", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          user: {
            email: "terry@example.com",
          },
          expires: "2026-03-30T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runChatgptWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "session=abc",
        WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://chatgpt.com/api/auth/session",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          cookie: "session=abc",
          "user-agent": "WebaiBridgeTest/1.0",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "chatgpt",
        responseKind: "json",
        signal: "terry@example.com",
      }),
    );
  });

  it("uses the Claude organizations endpoint when browser cookie and user-agent are present", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify([
          {
            uuid: "org_123",
          },
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runClaudeWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: "sessionKey=abc",
        WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://claude.ai/api/organizations",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "claude",
        responseKind: "json",
        signal: "claude-organizations",
      }),
    );
  });

  it("retries a transient Claude live-proof fetch failure once before classifying the probe", async () => {
    let attempt = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      attempt += 1;

      if (attempt === 1) {
        throw new Error("fetch failed");
      }

      return new Response(
        JSON.stringify([
          {
            uuid: "org_retry",
          },
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runClaudeWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: "sessionKey=retry",
        WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "claude",
        signal: "claude-organizations",
      }),
    );
  });

  it("accepts Claude organization metadata objects without an organizations array", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          organizationId: "org_metadata",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runClaudeWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: "sessionKey=abc",
        WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "claude",
        signal: "claude-organizations",
        summary: expect.stringContaining("organization metadata"),
      }),
    );
  });

  it("marks Claude organization probes as failures when no organization markers are returned", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          organizations: [],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runClaudeWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: "sessionKey=abc",
        WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "claude",
        reason: "probe-unexpected-body",
        diagnostic: expect.stringContaining("did not return organizations"),
      }),
    );
  });

  it("accepts authenticated-looking Gemini and Grok page probes", async () => {
    const cases = [
      [
        "gemini",
        runGeminiWebLiveProof,
        {
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "SID=abc; __Secure-1PSID=def",
          WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "WebaiBridgeTest/1.0",
        },
        "https://gemini.google.com/app",
        "<html><body><title>Gemini</title><div>Composer ready</div></body></html>",
        "gemini-app-page",
      ],
      [
        "grok",
        runGrokWebLiveProof,
        {
          WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
          WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        },
        "https://grok.com",
        "<html><body><h1>Grok</h1><div>Composer bootstrap ready</div></body></html>",
        "grok-home-composer",
      ],
    ] as const;

    for (const [provider, runProof, env, finalUrl, html, signal] of cases) {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      });

      const result = await runProof(env, fetchMock);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          status: "success",
          provider,
          finalUrl,
          responseKind: "html",
          signal,
        }),
      );
    }
  });

  it("accepts an authenticated Qwen chat bootstrap probe", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "qwen-chat-1",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runQwenWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
        WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://chat.qwen.ai/api/v2/chats/new",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          cookie: "qwen_session=abc",
          "content-type": "application/json",
          "user-agent": "WebaiBridgeTest/1.0",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
        responseKind: "json",
        signal: "qwen-chat-bootstrap",
      }),
    );
  });

  it("returns the API-proof failure directly when Qwen has no shared CDP fallback configured", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {},
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const result = await runQwenWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
        WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      fetchMock,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        reason: "probe-unexpected-body",
        diagnostic: expect.stringContaining("did not return a fresh authenticated chat bootstrap id"),
      }),
    );
  });

  it("can prove Gemini and Qwen from the attached browser workspace when raw HTML stays too thin", async () => {
    const browserProofCases = [
      [
        "gemini",
        runGeminiBrowserWorkspaceProof,
        {
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "SID=abc; __Secure-1PSID=def",
          WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "WebaiBridgeTest/1.0",
          WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
        },
        "https://gemini.google.com/app",
        "Gemini Composer ready",
      ],
      [
        "qwen",
        runQwenBrowserWorkspaceProof,
        {
          WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
          WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9224",
        },
        "https://chat.qwen.ai/",
        "Qwen Workspace composer ready",
      ],
    ] as const;

    for (const [provider, runProof, env, finalUrl, text] of browserProofCases) {
      const evaluate = vi.fn().mockResolvedValue({
        finalUrl,
        text,
        hasComposerSurface: true,
      });
      const goto = vi.fn().mockResolvedValue(undefined);
      const addCookies = vi.fn().mockResolvedValue(undefined);
      const page = {
        goto,
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        bringToFront: vi.fn().mockResolvedValue(undefined),
        evaluate,
        url: () => finalUrl,
      };
      const context = {
        pages: () => [],
        addCookies,
        newPage: vi.fn().mockResolvedValue(page),
      };
      const browser = {
        contexts: () => [context],
        close: vi.fn().mockResolvedValue(undefined),
      };
      const connectOverCDP = vi.fn().mockResolvedValue(browser);

      const result = await runProof(env, connectOverCDP);

      expect(result).toEqual(
        expect.objectContaining({
          status: "success",
          provider,
          finalUrl,
          responseKind: "html",
        }),
      );
    }
  });

  it("returns a Qwen browser-proof failure when the attached page still looks unauthenticated", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://chat.qwen.ai/",
      text: "Qwen 登录 注册",
      hasComposerSurface: false,
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      evaluate,
      url: () => "https://chat.qwen.ai/",
    };
    const context = {
      pages: () => [page],
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const result = await runQwenBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
        WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9224",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        reason: "probe-unexpected-body",
        diagnostic: expect.stringContaining("unauthenticated or incomplete session"),
      }),
    );
  });

  it("returns a Qwen browser-proof failure when the attached CDP browser has no context", async () => {
    const connectOverCDP = vi.fn().mockResolvedValue({
      contexts: () => [],
      close: vi.fn().mockResolvedValue(undefined),
    });

    const result = await runQwenBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
        WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9224",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        reason: "probe-request-failed",
        diagnostic: expect.stringContaining("No Chrome context"),
      }),
    );
  });

  it("returns an external blocker when Qwen browser-proof is missing local session material", async () => {
    const result = await runQwenBrowserWorkspaceProof({
      WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_session=abc",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "qwen",
        blocker: "missing-web-session-material",
      }),
    );
  });

  it("classifies Grok browser workspace account-action pages as external user action blockers", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText:
        "关联你的 𝕏 账户 解锁早期功能。 连接 解锁扩展能力 免费试用",
      hasComposerSurface: false,
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate,
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [page],
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP as typeof import("playwright-core").chromium.connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "user-action-required",
        reason: "probe-unexpected-body",
      }),
    );
  });

  it("retries Grok browser workspace snapshots when the page navigates mid-evaluation", async () => {
    const evaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Execution context was destroyed"))
      .mockResolvedValueOnce({
        finalUrl: "https://grok.com/",
        bodyText: "Grok composer ready",
        hasComposerSurface: true,
      });
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForTimeout,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [page],
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP as typeof import("playwright-core").chromium.connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "grok",
        signal: "grok-home-composer-browser-dom",
      }),
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(waitForTimeout).toHaveBeenCalled();
  });

  it("waits for Grok workspace hydration when the first browser snapshots are blank", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        finalUrl: "https://grok.com/",
        bodyText: "",
        hasComposerSurface: false,
      })
      .mockResolvedValueOnce({
        finalUrl: "https://grok.com/",
        bodyText: "",
        hasComposerSurface: false,
      })
      .mockResolvedValueOnce({
        finalUrl: "https://grok.com/",
        bodyText: "切换侧边栏 搜索 新建聊天 项目 历史记录 今天需要我如何帮助你？",
        hasComposerSurface: true,
      });
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForTimeout,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [page],
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP as typeof import("playwright-core").chromium.connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "grok",
        signal: "grok-home-composer-browser-dom",
      }),
    );
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(waitForTimeout).toHaveBeenCalled();
  });

  it("retries Grok CDP attach when the first connectOverCDP call times out", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText: "Grok composer ready",
      hasComposerSurface: true,
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [page],
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("browserType.connectOverCDP: Timeout 30000ms exceeded."),
      )
      .mockResolvedValueOnce(browser);

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP as typeof import("playwright-core").chromium.connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "grok",
      }),
    );
    expect(connectOverCDP).toHaveBeenCalledTimes(2);
  });

  it("classifies Grok attached-browser account gates as user-action-required", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText:
        "Grok connect your X account unlock early features upgrade to SuperGrok free trial",
      hasComposerSurface: false,
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout,
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "user-action-required",
      }),
    );
    expect(result.diagnostic).toContain("end-user account action");
  });

  it("accepts a Grok workspace that has a real composer even if an optional X-link card is visible", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText:
        "Grok 关联你的 𝕏 账户 解锁早期功能。 连接 解锁扩展能力 免费试用 今天需要我如何帮助你？",
      hasComposerSurface: true,
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout,
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "grok",
        signal: "grok-home-composer-browser-dom",
      }),
    );
  });

  it("accepts a Grok workspace with authenticated history navigation even when an X-link upsell card is visible", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText:
        "切换侧边栏 搜索 新建聊天 项目 历史记录 今天 GROKOK Confirmation 关联你的 𝕏 账户 解锁早期功能 免费试用",
      hasComposerSurface: true,
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout,
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "grok",
        signal: "grok-home-composer-browser-dom",
      }),
    );
  });

  it("treats Grok X-link cards without a ready prompt as user-action-required even when the composer is mounted", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://grok.com/",
      bodyText:
        "Grok 关联你的 𝕏 账户 解锁早期功能和个性化内容。 连接 免费试用",
      hasComposerSurface: true,
    });
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto,
      evaluate,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout,
      url: () => "https://grok.com/",
    };
    const context = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const { runGrokBrowserWorkspaceProof } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );

    const result = await runGrokBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9225",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "user-action-required",
        reason: "probe-unexpected-body",
      }),
    );
  });

  it("does not treat Google's human verification redirect as a Gemini workspace success", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl:
        "https://www.google.com/sorry/index?continue=https://gemini.google.com/app&q=test",
      text: "Our systems have detected unusual traffic from your computer network",
      hasComposerSurface: false,
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate,
      url: () =>
        "https://www.google.com/sorry/index?continue=https://gemini.google.com/app&q=test",
    };
    const context = {
      pages: () => [],
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const result = await runGeminiBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "SID=abc; __Secure-1PSID=def",
        WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "gemini",
        reason: "probe-unexpected-body",
        diagnostic: expect.stringContaining("abnormal-traffic verification page"),
      }),
    );
  });

  it("does not treat Gemini usage-cap dialogs as a workspace success", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      finalUrl: "https://gemini.google.com/app",
      text: "You've reached your limit for Gemini. Try again later.",
      hasComposerSurface: true,
    });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      evaluate,
      url: () => "https://gemini.google.com/app",
    };
    const context = {
      pages: () => [],
      addCookies: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(page),
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const result = await runGeminiBrowserWorkspaceProof(
      {
        WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "SID=abc; __Secure-1PSID=def",
        WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "WebaiBridgeTest/1.0",
        WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
      },
      connectOverCDP,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "gemini",
        classification: "provider-unavailable",
        reason: "probe-unexpected-body",
        diagnostic: expect.stringContaining("rate-limit or usage-cap gate"),
      }),
    );
  });

  it("detects Gemini human-verification and rate-limit snapshots directly", () => {
    expect(
      isGeminiHumanVerificationSnapshot({
        finalUrl: "https://www.google.com/sorry/index?q=test",
        text: "Our systems have detected unusual traffic",
        hasComposerSurface: false,
      }),
    ).toBe(true);
    expect(
      isGeminiRateLimitedSnapshot({
        finalUrl: "https://gemini.google.com/app",
        text: "You've reached your limit for Gemini. Try again later.",
        hasComposerSurface: true,
      }),
    ).toBe(true);
  });

  it("marks Gemini snapshots as incomplete when redirected away or still on login markers", () => {
    expect(
      validateGeminiBrowserWorkspaceSnapshot({
        finalUrl: "https://accounts.google.com/signin",
        text: "Choose an account to continue to Gemini",
        hasComposerSurface: false,
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        summary: "https://accounts.google.com/signin",
      }),
    );

    expect(
      validateGeminiBrowserWorkspaceSnapshot({
        finalUrl: "https://gemini.google.com/app",
        text: "Sign in to continue to Gemini",
        hasComposerSurface: false,
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.stringContaining("unauthenticated or incomplete session"),
      }),
    );
  });

  it("treats Grok HTML redirects and human-verification pages as failures", async () => {
    const redirectResult = await runGrokWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      vi.fn<typeof fetch>(async () => {
        return new Response("<html>redirect</html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }),
    );

    const verificationResult = await runGrokWebLiveProof(
      {
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_session=abc",
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "WebaiBridgeTest/1.0",
      },
      vi.fn<typeof fetch>(async () => {
        return new Response("<html>Verify you are human captcha</html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }),
    );

    expect(redirectResult).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "session-incomplete",
        reason: "probe-unexpected-body",
      }),
    );
    expect(verificationResult).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "human-verification-required",
        reason: "probe-unexpected-body",
      }),
    );
  });

  it("marks Qwen snapshots as incomplete when redirected or still showing login markers", () => {
    expect(
      validateQwenBrowserWorkspaceSnapshot({
        finalUrl: "https://example.com/not-qwen",
        text: "redirected away",
        hasComposerSurface: false,
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        summary: "https://example.com/not-qwen",
      }),
    );

    expect(
      validateQwenBrowserWorkspaceSnapshot({
        finalUrl: "https://chat.qwen.ai/",
        text: "Qwen 登录 注册",
        hasComposerSurface: false,
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.stringContaining("unauthenticated or incomplete session"),
      }),
    );
  });
});
