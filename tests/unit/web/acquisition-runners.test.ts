import { describe, expect, it, vi } from "vitest";

const ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS = 20_000;
const acquisitionRunnersModulePromise = import(
  "../../../apps/service/src/web-auth-acquisition.ts"
);

describe("Default web acquisition runners", () => {
  it("starts Grok and Qwen through a managed onboarding browser instead of exposing raw CDP setup", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const bootstrapBrowser = vi.fn(async ({ provider, loginUrl }) => ({
      status: "started",
      provider,
      loginUrl,
      loginOpened: true,
      cdpUrl: "http://127.0.0.1:9333",
      summary: `WebaiBridge started a managed onboarding browser for ${provider}.`,
    }));
    const runners = createDefaultWebAcquisitionRunners({
      WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9333",
    }, {
      bootstrapBrowser,
    });

    const grokStart = await runners.grok?.start();
    const qwenStart = await runners.qwen?.start();

    expect(bootstrapBrowser).toHaveBeenCalledTimes(2);
    expect(grokStart).toEqual(
      expect.objectContaining({
        status: "ready-for-user-login",
        provider: "grok",
        supported: true,
        loginUrl: "https://grok.com",
        cdpUrl: "http://127.0.0.1:9333",
        browser: expect.objectContaining({
          status: "started",
          loginOpened: true,
        }),
      }),
    );
    expect(qwenStart).toEqual(
      expect.objectContaining({
        status: "ready-for-user-login",
        provider: "qwen",
        supported: true,
        loginUrl: "https://chat.qwen.ai",
        cdpUrl: "http://127.0.0.1:9333",
        browser: expect.objectContaining({
          status: "started",
          loginOpened: true,
        }),
      }),
    );
    expect(grokStart?.instructions).not.toContain("CDP");
    expect(qwenStart?.instructions).not.toContain("CDP");
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("turns browser bootstrap failures into explicit start blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        throw new Error("No Chrome installation was detected for the managed onboarding browser.");
      },
    });

    const result = await runners.chatgpt?.start();

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "isolated-chrome-root",
        blocker: "chatgpt-existing-profile-unavailable",
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("routes the legacy existing Chrome profile alias through the isolated chrome root bootstrap", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const bootstrapBrowser = vi.fn(async ({ provider, loginUrl, request }) => ({
      status: "started",
      provider,
      mode: "isolated-chrome-root",
      modeLabel: "Use Isolated Chrome Root",
      advanced: true,
      loginUrl,
      loginOpened: true,
      cdpUrl: "http://127.0.0.1:9338",
      userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
      browserTarget: {
        kind: "isolated-chrome-root",
        label: "Isolated Chrome root",
        summary: "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile instead of the managed onboarding browser.",
      },
      summary: "WebaiBridge attached or launched the isolated Chrome root.",
      request,
    }));
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser,
    });

    const result = await runners.chatgpt?.start({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
      },
    });

    expect(bootstrapBrowser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "chatgpt",
        request: expect.objectContaining({
          mode: "isolated-chrome-root",
          existingChromeProfile: expect.objectContaining({
            userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "ready-for-user-login",
        provider: "chatgpt",
        mode: "isolated-chrome-root",
        modeLabel: "Use Isolated Chrome Root",
        advanced: true,
        browserTarget: expect.objectContaining({
          kind: "isolated-chrome-root",
        }),
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR:
            "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
        }),
        captureRequest: expect.objectContaining({
          mode: "isolated-chrome-root",
          existingChromeProfile: expect.objectContaining({
            cdpUrl: "http://127.0.0.1:9338",
            userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
          }),
        }),
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("defaults local credentialed starts to the configured real Chrome profile when high-level env is present", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const bootstrapBrowser = vi.fn(async ({ provider, loginUrl, request }) => ({
      status: "started",
      provider,
      mode: "isolated-chrome-root",
      modeLabel: "Use Isolated Chrome Root",
      advanced: true,
      loginUrl,
      loginOpened: true,
      cdpUrl: "http://127.0.0.1:9338",
      userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
      profileName: "webai-bridge",
      profileDirectory: "Profile 1",
      browserTarget: {
        kind: "isolated-chrome-root",
        label: "Isolated Chrome root",
        summary: "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile instead of the managed onboarding browser.",
      },
      summary: "WebaiBridge attached or launched the isolated Chrome root.",
      request,
    }));

    const runners = createDefaultWebAcquisitionRunners(
      {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR:
          "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      {
        bootstrapBrowser,
      },
    );

    const result = await runners.chatgpt?.start();

    expect(bootstrapBrowser).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          mode: "isolated-chrome-root",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        mode: "isolated-chrome-root",
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_CHROME_USER_DATA_DIR:
          "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
          WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
        }),
        captureRequest: expect.objectContaining({
          existingChromeProfile: expect.objectContaining({
            profileName: "webai-bridge",
            userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
          }),
        }),
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("keeps isolated chrome root as the default mode and explains manual open when login was not auto-opened", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async ({ provider, loginUrl }) => ({
        status: "attached",
        provider,
        mode: "isolated-chrome-root",
        modeLabel: "Use Isolated Chrome Root",
        advanced: true,
        loginUrl,
        loginOpened: false,
        cdpUrl: "http://127.0.0.1:9338",
        userDataDir: "/mock-home/test/.cache/webai-bridge/browser/chrome-user-data",
        profileName: "webai-bridge",
        profileDirectory: "Profile 1",
        browserTarget: {
          kind: "isolated-chrome-root",
          label: "Isolated Chrome root",
          summary: "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile instead of the managed onboarding browser.",
        },
        summary: "WebaiBridge attached the isolated repo Chrome root.",
      }),
    });

    const result = await runners.claude?.start();

    expect(result).toEqual(
      expect.objectContaining({
        provider: "claude",
        mode: "isolated-chrome-root",
        advanced: true,
        cdpUrl: "http://127.0.0.1:9338",
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
        }),
      }),
    );
    expect(result?.instructions).toContain("same Chrome window");
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("maps existing Chrome profile lock failures to explicit start blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        const error = Object.assign(new Error("Chrome is still using the selected profile."), {
          code: "existing-profile-locked",
        });
        throw error;
      },
    });

    const result = await runners.grok?.start({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        userDataDir: "/mock-home/test/Chrome",
        cdpUrl: "http://127.0.0.1:9223",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        mode: "isolated-chrome-root",
        blocker: "grok-existing-profile-locked",
        cdpUrl: "http://127.0.0.1:9223",
      }),
    );
    expect(result?.instructions).toContain("Reattach");
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("maps existing browser session missing failures to explicit start blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        const error = Object.assign(
          new Error("WebaiBridge could not find a reusable browser session at that URL."),
          {
            code: "existing-browser-session-missing",
          },
        );
        throw error;
      },
    });

    const result = await runners.chatgpt?.start({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "existing-browser-session",
        blocker: "chatgpt-existing-browser-session-missing",
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("maps existing Chrome profile endpoint mismatches to explicit start blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        const error = Object.assign(
          new Error("WebaiBridge reached that profile endpoint, but it was not a reusable browser-debug session."),
          {
            code: "endpoint-not-devtools",
          },
        );
        throw error;
      },
    });

    const result = await runners.chatgpt?.start({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        cdpUrl: "http://127.0.0.1:9223",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "isolated-chrome-root",
        blocker: "chatgpt-existing-profile-not-devtools",
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("maps missing existing Chrome profiles to explicit start blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        const error = Object.assign(
          new Error("WebaiBridge could not find that Chrome profile on disk."),
          {
            code: "existing-profile-missing",
          },
        );
        throw error;
      },
    });

    const result = await runners.grok?.start({
      mode: "existing-chrome-profile",
      existingChromeProfile: {
        userDataDir: "/mock-home/test/MissingProfile",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        mode: "isolated-chrome-root",
        blocker: "grok-existing-profile-missing",
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("maps generic existing browser session reuse failures to the unavailable start blocker", async () => {
    const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        throw new Error("Browser session exists but cannot be reused.");
      },
    });

    const result = await runners.chatgpt?.start({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "existing-browser-session",
        blocker: "chatgpt-existing-browser-session-unavailable",
      }),
    );
  }, ACQUISITION_RUNNER_IMPORT_TIMEOUT_MS);

  it("builds stable JSON surface responses for acquisition handlers", async () => {
    const { buildAcquisitionJsonResponse } = await acquisitionRunnersModulePromise;

    expect(buildAcquisitionJsonResponse(202, { ok: true })).toEqual({
      status: 202,
      body: { ok: true },
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  });

  it("translates attach-session endpoint mismatches into product blockers", async () => {
    const { createDefaultWebAcquisitionRunners } = await import(
      "../../../apps/service/src/web-auth-acquisition.ts"
    );
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        const error = Object.assign(
          new Error(
            "WebaiBridge reached that browser session URL, but it did not respond like a reusable Chrome DevTools endpoint.",
          ),
          {
            code: "endpoint-not-devtools",
          },
        );
        throw error;
      },
    });

    const result = await runners.chatgpt?.start({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        mode: "existing-browser-session",
        blocker: "chatgpt-existing-browser-session-not-devtools",
      }),
    );
  });

  it.each([
    {
      provider: "grok",
      blocker: "grok-existing-profile-cdp-unavailable",
    },
    {
      provider: "qwen",
      blocker: "qwen-existing-profile-cdp-unavailable",
    },
  ])(
    "turns $provider capture into an explicit external blocker instead of fallback-only when CDP is unreachable",
    async ({ provider, blocker }) => {
      const { createDefaultWebAcquisitionRunners } = await acquisitionRunnersModulePromise;
      const runners = createDefaultWebAcquisitionRunners({
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:1",
      });

      const capture =
        provider === "grok"
          ? await runners.grok?.capture()
          : await runners.qwen?.capture();

      expect(capture).toEqual(
        expect.objectContaining({
          status: "external-blocker",
          provider,
          supported: true,
          blocker,
          cdpUrl: "http://127.0.0.1:1",
        }),
      );
      expect(capture?.status).not.toBe("fallback-only");
    },
  );

  it("recognizes a logged-in Qwen workspace snapshot even when browser-only markers are needed", async () => {
    const { validateQwenBrowserWorkspaceSnapshot } = await import(
      "../../../packages/providers/web/qwen/src/live-proof.ts"
    );

    const verdict = validateQwenBrowserWorkspaceSnapshot({
      finalUrl: "https://chat.qwen.ai/",
      text: "Qwen3.5-Plus 新建对话 搜索对话 社区 Coder 有什么我能帮您的吗",
      hasComposerSurface: true,
    });

    expect(verdict).toEqual(
      expect.objectContaining({
        ok: true,
        signal: "qwen-workspace-composer",
      }),
    );
  });
});
