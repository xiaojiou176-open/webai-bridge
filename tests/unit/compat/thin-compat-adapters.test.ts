import { describe, expect, it, vi } from "vitest";

import {
  CODEX_THIN_COMPAT_MANIFEST,
  CODEX_UNSUPPORTED_FEATURES,
  createCodexCompatAdapter,
  createCodexThinCompatAdapter,
} from "../../../packages/consumers/codex/src/index.ts";
import {
  CLAUDE_CODE_THIN_COMPAT_MANIFEST,
  CLAUDE_CODE_UNSUPPORTED_FEATURES,
  createClaudeCodeCompatAdapter,
  createClaudeCodeThinCompatAdapter,
} from "../../../packages/consumers/claude-code/src/index.ts";
import {
  OPENCLAW_THIN_COMPAT_MANIFEST,
  OPENCLAW_UNSUPPORTED_FEATURES,
  createOpenClawCompatAdapter,
  createOpenclawThinCompatAdapter,
} from "../../../packages/consumers/openclaw/src/index.ts";

describe("WebaiBridge thin compat adapters", () => {
  it("keeps Codex as a fail-closed builder-facing starter", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(`${init?.body ?? "{}"}`)).toMatchObject({
        provider: "openai",
        model: "openai/gpt-4.1",
        input: "hello from codex",
        lane: "byok",
      });

      return new Response(
        JSON.stringify({
          provider: "openai",
          model: "openai/gpt-4.1",
          lane: "byok",
          text: "codex-ok",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    expect(CODEX_THIN_COMPAT_MANIFEST).toEqual(
      expect.objectContaining({
        target: "codex",
        status: "partial",
        failClosed: true,
        route: "/v1/runtime/invoke",
        transport: "responses",
      }),
    );

    const adapter = createCodexThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const thin = await adapter.responses({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello from codex",
      lane: "byok",
      mode: "plan",
    });
    const legacy = await createCodexCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    }).invokeText({
      provider: "openai",
      model: "openai/gpt-4.1",
      input: "hello from codex",
      lane: "byok",
    });

    expect(thin).toEqual(
      expect.objectContaining({
        target: "codex",
        mode: "plan",
        ok: true,
        outputText: "codex-ok",
      }),
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: CODEX_UNSUPPORTED_FEATURES,
        ok: true,
        outputText: "codex-ok",
      }),
    );
  });

  it("keeps Claude Code as a thin text bridge and rejects tool execution", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(`${init?.body ?? "{}"}`);
      expect(body.input).toContain("SYSTEM: You are helpful.");
      expect(body.input).toContain("USER: Summarize this.");

      return new Response(
        JSON.stringify({
          provider: "anthropic",
          model: "anthropic/claude-sonnet-4",
          lane: "byok",
          outputText: "claude-ok",
          providerMessageId: "msg-claude",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    expect(CLAUDE_CODE_THIN_COMPAT_MANIFEST).toEqual(
      expect.objectContaining({
        target: "claude-code",
        status: "partial",
        failClosed: true,
        transport: "anthropic-compatible",
      }),
    );

    const thin = await createClaudeCodeThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    }).messages({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Summarize this." },
      ],
      lane: "byok",
    });
    const legacyAdapter = createClaudeCodeCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const legacy = await legacyAdapter.invokeMessages({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Summarize this." },
      ],
      lane: "byok",
    });

    expect(thin).toEqual(
      expect.objectContaining({
        target: "claude-code",
        ok: true,
        outputText: "claude-ok",
      }),
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: CLAUDE_CODE_UNSUPPORTED_FEATURES,
        ok: true,
        text: "claude-ok",
      }),
    );
    await expect(
      legacyAdapter.invokeMessages({
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: "hello" }],
        tools: [{}],
      }),
    ).rejects.toThrow("tool execution");
  });

  it("keeps OpenClaw as delegated runtime only, with bootstrap passthrough", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/bootstrap")) {
        return new Response(
          JSON.stringify({
            bootstrap: {
              serviceName: "webai-bridge-service",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      expect(JSON.parse(`${init?.body ?? "{}"}`)).toMatchObject({
        provider: "chatgpt",
        model: "chatgpt/gpt-4o",
        input: "hello from openclaw",
        lane: "web",
      });

      return new Response(
        JSON.stringify({
          provider: "chatgpt",
          model: "chatgpt/gpt-4o",
          lane: "web",
          outputText: "openclaw-ok",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    expect(OPENCLAW_THIN_COMPAT_MANIFEST).toEqual(
      expect.objectContaining({
        target: "openclaw",
        status: "partial",
        failClosed: true,
        transport: "delegated-runtime",
      }),
    );

    const legacyAdapter = createOpenClawCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const bootstrap = await legacyAdapter.bootstrapDelegation();
    const thin = await createOpenclawThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    }).delegateTurn({
      provider: "chatgpt",
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
      mode: "copilot-brain",
    });
    const legacy = await legacyAdapter.invokeText({
      provider: "chatgpt",
      model: "chatgpt/gpt-4o",
      input: "hello from openclaw",
      lane: "web",
    });

    expect(legacyAdapter.describeDelegation()).toEqual(
      expect.objectContaining({
        target: "openclaw",
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: OPENCLAW_UNSUPPORTED_FEATURES,
      }),
    );
    expect(bootstrap).toEqual(
      expect.objectContaining({
        bootstrap: expect.objectContaining({
          serviceName: "webai-bridge-service",
        }),
      }),
    );
    expect(thin).toEqual(
      expect.objectContaining({
        target: "openclaw",
        ok: true,
        outputText: "openclaw-ok",
      }),
    );
    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        ok: true,
        outputText: "openclaw-ok",
      }),
    );
  });
});
