import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Web real transport env gating", () => {
  it("upgrades ChatGPT invoke contract to real-transport when live materials are present", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE", "chatgpt_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT", "WebaiBridgeTest/1.0");

    const { createChatgptWebRuntime } = await import(
      "../../../packages/providers/web/chatgpt/src/index.js"
    );
    const status = await createChatgptWebRuntime().getStatus({
      sessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:unit-real",
        },
      },
    });

    expect(status.available).toBe(true);
    expect(status.invoke).toEqual(
      expect.objectContaining({
        kind: "real-transport",
        mode: "chatgpt-backend-api-conversation",
        readiness: "ready",
      }),
    );
  });

  it("upgrades Claude, Grok, and Qwen invoke contracts to real-transport when live materials are present", async () => {
    vi.stubEnv("WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE", "sessionKey=abc; anthropic-device-id=device-1");
    vi.stubEnv("WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE", "grok_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_GROK_USER_AGENT", "WebaiBridgeTest/1.0");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE", "qwen_session=abc");
    vi.stubEnv("WEBAI_BRIDGE_WEB_QWEN_USER_AGENT", "WebaiBridgeTest/1.0");

    const { createClaudeWebRuntime } = await import(
      "../../../packages/providers/web/claude/src/index.js"
    );
    const { createGrokWebRuntime } = await import(
      "../../../packages/providers/web/grok/src/index.js"
    );
    const { createQwenWebRuntime } = await import(
      "../../../packages/providers/web/qwen/src/index.js"
    );

    const claudeStatus = await createClaudeWebRuntime().getStatus({
      sessions: {
        claude: {
          state: "ready",
        },
      },
    });
    const grokStatus = await createGrokWebRuntime().getStatus({
      sessions: {
        grok: {
          state: "ready",
        },
      },
    });
    const qwenStatus = await createQwenWebRuntime().getStatus({
      sessions: {
        qwen: {
          state: "ready",
        },
      },
    });

    expect(claudeStatus.invoke.kind).toBe("real-transport");
    expect(grokStatus.invoke.kind).toBe("real-transport");
    expect(qwenStatus.invoke.kind).toBe("real-transport");
  });
});
