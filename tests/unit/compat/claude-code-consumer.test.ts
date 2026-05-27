import { describe, expect, it, vi } from "vitest";

import {
  CLAUDE_CODE_THIN_COMPAT_MANIFEST,
  createClaudeCodeThinCompatAdapter,
} from "../../../packages/consumers/claude-code/src/index.ts";

describe("Claude Code thin compat adapter", () => {
  it("bridges text-only requests into the shared runtime invoke route", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(`${init?.body ?? "{}"}`);

      expect(body.provider).toBe("anthropic");
      expect(body.model).toBe("anthropic/claude-sonnet-4");
      expect(body.lane).toBe("byok");
      expect(body.input).toBe("Summarize this.");

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

    const adapter = createClaudeCodeThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: fetchMock as typeof fetch,
    });
    const result = await adapter.messages({
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4",
      input: "Summarize this.",
      lane: "byok",
    });

    expect(result).toEqual(
      expect.objectContaining({
        target: "claude-code",
        ok: true,
        lane: "byok",
        outputText: "claude-ok",
      }),
    );
    expect(CLAUDE_CODE_THIN_COMPAT_MANIFEST.transport).toBe(
      "anthropic-compatible",
    );
  });

  it("fails closed when approval-ui is requested", () => {
    const adapter = createClaudeCodeThinCompatAdapter({
      baseUrl: "http://webai-bridge.test",
      fetch: vi.fn() as typeof fetch,
    });

    expect(() => adapter.failClosed("approval-ui")).toThrow("approval-ui");
  });
});
