import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("service env helpers", () => {
  it("loads local env files once from discovered roots", async () => {
    const existsSync = vi.fn(
      (path: string) =>
        path.endsWith(`${process.cwd()}/.env.local`) ||
        path.endsWith(`${process.cwd()}/.env`) ||
        path.endsWith("/WebaiBridge/.env.local"),
    );
    const loadEnvFile = vi.fn();

    vi.doMock("node:fs", () => ({ existsSync }));

    const original = process.loadEnvFile;
    Object.assign(process, { loadEnvFile });

    try {
      const { loadLocalEnvFiles } = await import("../../../apps/service/src/env.ts");
      loadLocalEnvFiles();
      loadLocalEnvFiles();
    } finally {
      Object.assign(process, { loadEnvFile: original });
    }

    expect(loadEnvFile).toHaveBeenCalled();
    const firstPassCount = loadEnvFile.mock.calls.length;
    expect(firstPassCount).toBeGreaterThan(0);
    expect(loadEnvFile.mock.calls.length).toBe(firstPassCount);
  });

  it("parses valid provider session state from env and falls back to the default port", async () => {
    const { loadProviderSessionsFromEnv, loadServicePort } = await import(
      "../../../apps/service/src/env.ts"
    );

    const sessions = loadProviderSessionsFromEnv({
      WEBAI_BRIDGE_WEB_CHATGPT_STATE: "ready",
      WEBAI_BRIDGE_WEB_CHATGPT_ACCOUNT_LABEL: "chatgpt:default",
      WEBAI_BRIDGE_WEB_CHATGPT_SESSION_SOURCE: "chatgpt-browser-profile",
      WEBAI_BRIDGE_WEB_CHATGPT_REFRESH_ELIGIBLE: "true",
      WEBAI_BRIDGE_WEB_GEMINI_STATE: "unknown",
      WEBAI_BRIDGE_WEB_QWEN_STATE: "expired",
      WEBAI_BRIDGE_WEB_QWEN_REFRESH_ELIGIBLE: "false",
    } as NodeJS.ProcessEnv);

    expect(sessions).toEqual({
      chatgpt: expect.objectContaining({
        state: "ready",
        accountLabel: "chatgpt:default",
        sessionSource: "chatgpt-browser-profile",
        refreshEligible: true,
      }),
      qwen: expect.objectContaining({
        state: "expired",
        refreshEligible: false,
      }),
    });
    expect(loadServicePort({ WEBAI_BRIDGE_SERVICE_PORT: "4317" } as NodeJS.ProcessEnv)).toBe(4317);
    expect(loadServicePort({ WEBAI_BRIDGE_SERVICE_PORT: "-1" } as NodeJS.ProcessEnv)).toBe(4010);
    expect(loadServicePort({} as NodeJS.ProcessEnv)).toBe(4010);
  });
});
