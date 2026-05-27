import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("default web live proof runners", () => {
  it("wires every provider runner to the shared env and fetch inputs", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const env = {
      WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen-cookie",
    };
    const runChatgptWebLiveProof = vi.fn(async () => ({ status: "success", provider: "chatgpt" }));
    const runGeminiWebLiveProof = vi.fn(async () => ({ status: "success", provider: "gemini" }));
    const runClaudeWebLiveProof = vi.fn(async () => ({ status: "success", provider: "claude" }));
    const runGrokWebLiveProof = vi.fn(async () => ({ status: "success", provider: "grok" }));
    const runQwenWebLiveProof = vi.fn(async () => ({ status: "success", provider: "qwen" }));

    vi.doMock("../../../packages/providers/web/chatgpt/src/index.js", () => ({
      runChatgptWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/gemini/src/index.js", () => ({
      runGeminiWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/claude/src/index.js", () => ({
      runClaudeWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/grok/src/index.js", () => ({
      runGrokWebLiveProof,
    }));
    vi.doMock("../../../packages/providers/web/qwen/src/index.js", () => ({
      runQwenWebLiveProof,
    }));

    const { createDefaultWebLiveProofRunners } = await import(
      "../../../apps/service/src/default-web-live-proofs.ts"
    );
    const runners = createDefaultWebLiveProofRunners({
      env,
      fetchFn,
    });

    const results = await Promise.all([
      runners.chatgpt(),
      runners.gemini(),
      runners.claude(),
      runners.grok(),
      runners.qwen(),
    ]);

    expect(results.map((result) => result.provider)).toEqual([
      "chatgpt",
      "gemini",
      "claude",
      "grok",
      "qwen",
    ]);
    expect(runChatgptWebLiveProof).toHaveBeenCalledWith(env, fetchFn);
    expect(runGeminiWebLiveProof).toHaveBeenCalledWith(env, fetchFn);
    expect(runClaudeWebLiveProof).toHaveBeenCalledWith(env, fetchFn);
    expect(runGrokWebLiveProof).toHaveBeenCalledWith(env, fetchFn);
    expect(runQwenWebLiveProof).toHaveBeenCalledWith(env, fetchFn);
  });
});
