import { describe, expect, it, vi } from "vitest";

import {
  CLAUDE_CODE_THIN_COMPAT_MANIFEST,
  CLAUDE_CODE_UNSUPPORTED_FEATURES,
  createClaudeCodeCompatAdapter,
  createClaudeCodeThinCompatAdapter,
} from "./index.js";

describe("claude-code thin compat adapter", () => {
  it("publishes thin manifest and bridges message arrays into the shared runtime", async () => {
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

    const adapter = createClaudeCodeThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const thin = await adapter.messages({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Summarize this." },
      ],
      lane: "byok",
    });
    const legacy = await createClaudeCodeCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as unknown as typeof fetch,
    }).invokeMessages({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Summarize this." },
      ],
      lane: "byok",
    });

    expect(legacy).toEqual(
      expect.objectContaining({
        compat: "partial",
        delegatedTo: "service-runtime",
        unsupportedFeatures: CLAUDE_CODE_UNSUPPORTED_FEATURES,
        ok: true,
        text: "claude-ok",
      }),
    );
    expect(thin).toEqual(
      expect.objectContaining({
        target: "claude-code",
        ok: true,
        outputText: "claude-ok",
      }),
    );
  });

  it("fails closed when tool execution is requested", async () => {
    const adapter = createClaudeCodeCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      adapter.invokeMessages({
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: "hello" }],
        tools: [{}],
      }),
    ).rejects.toThrow("tool execution");
  });
});
