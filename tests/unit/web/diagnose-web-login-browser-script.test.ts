import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function createRepoTempWorkspace(prefix: string) {
  const baseDir = join(process.cwd(), ".runtime-cache", "temp");
  mkdirSync(baseDir, {
    recursive: true,
  });
  return mkdtempSync(join(baseDir, prefix));
}

describe("diagnose-web-login-browser script", () => {
  it("parses provider, reload, and bundle arguments", async () => {
    const { buildDefaultBundlePath, parseArgs } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      parseArgs([
        "--",
        "--provider",
        "chatgpt",
        "--reload",
        "--json",
        "--bundle-path",
        "/tmp/bundle.json",
      ]),
    ).toEqual(
      expect.objectContaining({
        provider: "chatgpt",
        reload: true,
        json: true,
        bundlePath: "/tmp/bundle.json",
      }),
    );
    expect(buildDefaultBundlePath("chatgpt")).toContain(
      "chatgpt-support-bundle.json",
    );
    expect(() => parseArgs(["--provider", "chatgpt", "--nope"])).toThrow(
      /Unknown argument/,
    );
  });

  it("resolves the canonical attach target from stored acquisition mode and env", async () => {
    const { resolveCanonicalAttachTarget } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const target = resolveCanonicalAttachTarget(
      "gemini",
      {
        WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
        WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL: "http://127.0.0.1:9555",
      },
      {
        acquisitionMode: "existing-browser-session",
      },
    );

    expect(target).toEqual(
      expect.objectContaining({
        mode: "existing-browser-session",
        cdpUrl: "http://127.0.0.1:9223",
        sessionUrl: "http://127.0.0.1:9555",
      }),
    );
  });

  it("builds a readable page snippet from visible placeholder and aria hints when body text stays thin", async () => {
    const { summarizeCurrentPageTextEvidence } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      summarizeCurrentPageTextEvidence({
        bodyText: "",
        rootText: "",
        visibleHintParts: [
          "Imagine",
          "登录",
          "注册",
          "你在想什么？",
          "Auto",
          "条款",
          "隐私政策",
          "登录",
        ],
      }),
    ).toBe("Imagine 登录 注册 你在想什么？ Auto 条款 隐私政策");
  });

  it("prefers concrete body text over hint-only fallback when the page already exposes readable text", async () => {
    const { summarizeCurrentPageTextEvidence } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      summarizeCurrentPageTextEvidence({
        bodyText: "Grok 工作区已经加载完成",
        rootText: "登录 注册 条款 隐私政策",
        visibleHintParts: ["你在想什么？", "Auto"],
      }),
    ).toBe("Grok 工作区已经加载完成");
  });

  it("marks login pages as store-ready but not live-ready", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace("chatgpt", {
        url: "https://chatgpt.com/",
        title: "ChatGPT",
        bodySnippet: "登录 免费注册 获取为你量身定制的回复",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        reason: expect.stringContaining("store-ready, not live-ready"),
      }),
    );

    expect(
      classifyLiveWorkspace("gemini", {
        url: "https://gemini.google.com/app",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: true,
      }),
    );

    expect(
      classifyLiveWorkspace("qwen", {
        url: "https://chat.qwen.ai/",
        title: "Qwen Chat",
        bodySnippet: "",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "provider-adjacent",
      }),
    );

    expect(
      classifyLiveWorkspace("grok", {
        url: "https://grok.com/",
        title: "Grok",
        bodySnippet: "",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "provider-adjacent",
      }),
    );
  });

  it("detects Qwen permission gates from network evidence once session material is already present", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "qwen",
        {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
          bodySnippet: "",
        },
        {
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
          currentNetwork: [
            {
              outcome: "finished",
              url: "https://chat.qwen.ai/api/v1/auths/",
              status: 401,
            },
          ],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "permission-gated",
        reason: expect.stringContaining("Unauthorized"),
      }),
    );
  });

  it("preserves Qwen permission-gated classification from fresh store truth even when network evidence is sparse", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "qwen",
        {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
          bodySnippet: "",
        },
        {
          storeStatus: {
            state: "user-action-required",
            reason:
              "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated.",
          },
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
          currentNetwork: [],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "permission-gated",
      }),
    );
  });

  it("prefers fresh Qwen workspace markers over a stale permission-gated store reason", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "qwen",
        {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
          bodySnippet: "新建对话 社区 Coder 项目 新项目 所有对话 Qwen3.6-Plus 你想从哪里开始？ 自动",
        },
        {
          storeStatus: {
            state: "user-action-required",
            reason:
              "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated.",
          },
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
          currentNetwork: [],
          currentConsole: [],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: true,
        classification: "workspace-ready",
      }),
    );
  });

  it("treats Qwen as workspace-ready when the current page still exposes a live composer surface", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "qwen",
        {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
          bodySnippet: "",
          hasComposerSurface: true,
        },
        {
          storeStatus: {
            state: "user-action-required",
            reason:
              "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated.",
          },
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
          currentNetwork: [],
          currentConsole: [],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: true,
        classification: "workspace-ready",
      }),
    );
  });

  it("treats Qwen Chat title plus present session artifacts as workspace-ready when the page text stays thin", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "qwen",
        {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
          bodySnippet: "",
          hasComposerSurface: false,
        },
        {
          storeStatus: {
            state: "user-action-required",
            reason:
              "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated.",
          },
          artifactStates: {
            "session-cookie": "present",
            "session-token": "present",
          },
          currentNetwork: [
            {
              outcome: "finished",
              url: "https://chat.qwen.ai/",
              status: 200,
            },
          ],
          currentConsole: [],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: true,
        classification: "workspace-ready",
      }),
    );
  });

  it("detects Grok account-action pages before collapsing them into generic session-incomplete", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace("grok", {
        url: "https://grok.com/",
        title: "Grok",
        bodySnippet: "Connect your X account to unlock early features in Grok.",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "account-action-required",
      }),
    );
  });

  it("detects Grok account-action gates from network evidence when session material still exists", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "grok",
        {
          url: "https://grok.com/",
          title: "Grok",
          bodySnippet: "",
        },
        {
          artifactStates: {
            "session-cookie": "present",
            "oauth-browser-session": "present",
          },
          currentNetwork: [
            {
              outcome: "finished",
              url: "https://grok.com/rest/user-skills",
              status: 403,
            },
          ],
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "account-action-required",
      }),
    );
  });

  it("promotes Grok empty root pages to session-incomplete when store truth already says the composer is still missing", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "grok",
        {
          url: "https://grok.com/",
          title: "Grok",
          bodySnippet: "",
        },
        {
          storeStatus: {
            state: "user-action-required",
            reason:
              "Grok cookie material is present, but the attached browser is not landing on the authenticated composer surface.",
          },
          artifactStates: {
            "session-cookie": "missing",
            "oauth-browser-session": "missing",
          },
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "session-incomplete",
      }),
    );
  });

  it("treats Grok conversation URLs as workspace-ready evidence even when body extraction is thin", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace(
        "grok",
        {
          url: "https://grok.com/c/abc123?rid=xyz",
          title: "Grok",
          bodySnippet: "",
        },
        {
          artifactStates: {
            "session-cookie": "present",
            "oauth-browser-session": "present",
          },
        },
      ),
    ).toEqual(
      expect.objectContaining({
        liveReady: true,
        classification: "workspace-ready",
      }),
    );
  });

  it("builds attach helpers and diagnose ladders for existing browser sessions", async () => {
    const {
      buildAttachHelper,
      buildDiagnoseLadder,
      summarizeStoreReadiness,
    } = await import("../../../scripts/diagnose-web-login-browser.mjs");

    const target = {
      mode: "existing-browser-session",
      cdpUrl: "http://127.0.0.1:9222",
      sessionUrl: "http://127.0.0.1:9555",
    };
    const storeStatus = summarizeStoreReadiness({
      state: "refreshable-but-degraded",
      acquisitionMode: "existing-browser-session",
      degradedReason: "Needs a refresh.",
    });
    const workspaceStatus = {
      liveReady: false,
      reason: "Attached browser is still on an account chooser.",
    };

    const helper = buildAttachHelper("gemini", target);
    const ladder = buildDiagnoseLadder(
      "gemini",
      target,
      storeStatus,
      workspaceStatus,
    );

    expect(helper.canonicalTargetHint).toContain("http://127.0.0.1:9555");
    expect(helper.recommendedSequence[1]).toContain(
      "diagnose-web-login-browser.mjs",
    );
    expect(ladder[0]?.detail).toContain("refreshable-but-degraded");
    expect(ladder[1]?.detail).toContain("http://127.0.0.1:9555");
    expect(ladder[4]?.detail).toContain("verify-web-login-live.mjs");
  });

  it("adds required artifact gaps to the diagnose ladder when browser-side contract is incomplete", async () => {
    const { buildDiagnoseLadder } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const ladder = buildDiagnoseLadder(
      "qwen",
      {
        mode: "isolated-chrome-root",
        existingProfileDir: "/tmp/profile",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      {
        ready: true,
        state: "user-action-required",
        artifactStates: {
          "session-cookie": "present",
          "session-token": "missing",
        },
      },
      {
        liveReady: false,
        reason: "Workspace is still not proven.",
      },
      {
        "session-cookie": "present",
        "session-token": "missing",
      },
    );

    expect(ladder[0]?.detail).toContain("session-token=missing");
  });

  it("explains when Qwen session material is already present but a permission gate still remains", async () => {
    const { buildDiagnoseLadder } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const ladder = buildDiagnoseLadder(
      "qwen",
      {
        mode: "isolated-chrome-root",
        existingProfileDir: "/tmp/profile",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      {
        ready: true,
        state: "user-action-required",
        artifactStates: {
          "session-cookie": "present",
          "session-token": "present",
        },
      },
      {
        liveReady: false,
        reason: "Workspace is still not proven.",
      },
      {
        "session-cookie": "present",
        "session-token": "present",
      },
    );

    expect(ladder[0]?.detail).toContain("permission gate");
    expect(ladder[2]?.detail).toContain("same repo-owned browser");
    expect(ladder[4]?.detail).toContain("After the remaining browser-side gate clears");
  });

  it("treats missing stored sessions and missing current pages as not live-ready", async () => {
    const {
      classifyLiveWorkspace,
      summarizeStoreReadiness,
    } = await import("../../../scripts/diagnose-web-login-browser.mjs");

    expect(summarizeStoreReadiness(undefined)).toEqual(
      expect.objectContaining({
        ready: false,
        state: "missing",
      }),
    );

    expect(classifyLiveWorkspace("claude", undefined)).toEqual(
      expect.objectContaining({
        liveReady: false,
        reason: expect.stringContaining("could not resolve a provider page"),
      }),
    );
  });

  it("summarizes missing store sessions and produces a canonical helper sequence", async () => {
    const {
      buildAttachHelper,
      buildDiagnoseLadder,
      resolveCanonicalAttachTarget,
      summarizeStoreReadiness,
    } = await import("../../../scripts/diagnose-web-login-browser.mjs");

    const storeStatus = summarizeStoreReadiness(undefined);
    const target = resolveCanonicalAttachTarget("chatgpt", {});
    const ladder = buildDiagnoseLadder(
      "chatgpt",
      target,
      storeStatus,
      {
        liveReady: false,
        reason: "Browser page is still on sign-in.",
      },
    );
    const helper = buildAttachHelper("chatgpt", target);

    expect(storeStatus).toEqual(
      expect.objectContaining({
        ready: false,
        state: "missing",
      }),
    );
    expect(ladder[0]).toEqual(
      expect.objectContaining({
        step: 1,
        label: "Check stored session truth",
      }),
    );
    expect(helper.recommendedSequence).toHaveLength(3);
    expect(helper.diagnoseCommand).toContain(
      "diagnose-web-login-browser.mjs --provider chatgpt",
    );
  });

  it("formats attach helpers for existing browser sessions and profile reuse", async () => {
    const { buildAttachHelper } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      buildAttachHelper("gemini", {
        mode: "existing-browser-session",
        sessionUrl: "http://127.0.0.1:9555",
        cdpUrl: "http://127.0.0.1:9555",
      }).canonicalTargetHint,
    ).toContain("Attach to http://127.0.0.1:9555");

    expect(
      buildAttachHelper("chatgpt", {
        mode: "isolated-chrome-root",
        existingProfileDir: "/tmp/profile",
        existingProfileName: "webai-bridge",
        cdpUrl: "http://127.0.0.1:9338",
      }).canonicalTargetHint,
    ).toContain("isolated repo Chrome root");
  });

  it("does not keep a stale existing-browser session URL on isolated-root targets", async () => {
    const { resolveCanonicalAttachTarget } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const target = resolveCanonicalAttachTarget("qwen", {
      WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
      WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
    });

    expect(target.mode).toBe("isolated-chrome-root");
    expect(target.sessionUrl).toBeUndefined();
    expect(target.existingProfileCdpUrl).toBe("http://127.0.0.1:9338");
  });

  it("adds provider-gate guidance to the diagnose ladder", async () => {
    const { buildDiagnoseLadder, resolveCanonicalAttachTarget } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const ladder = buildDiagnoseLadder(
      "gemini",
      resolveCanonicalAttachTarget("gemini", {
        WEBAI_BRIDGE_BROWSER_MODE: "managed-browser",
        WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
      }),
      {
        ready: true,
        state: "ready",
        artifactStates: {},
      },
      {
        liveReady: false,
        reason: "Provider gate still visible.",
      },
    );

    expect(ladder.map((step) => step.detail).join(" ")).toContain(
      "over http://127.0.0.1:9223",
    );
  });

  it("treats provider-adjacent pages as not live-ready yet", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace("qwen", {
        url: "https://www.aliyun.com/product",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        reason: expect.stringContaining("provider-adjacent"),
      }),
    );
  });

  it("reports attach failures as not live-ready and still writes a support bundle", async () => {
    const workspace = createRepoTempWorkspace("webai-bridge-browser-diagnose-fail-");
    const bundlePath = join(workspace, "gemini-support-bundle.json");

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP: vi.fn(async () => {
          throw new Error("connectOverCDP ECONNREFUSED 127.0.0.1:39222");
        }),
      },
    }));

    try {
      const { runWebLoginBrowserDiagnosis } = await import(
        "../../../scripts/diagnose-web-login-browser.mjs"
      );

      const result = await runWebLoginBrowserDiagnosis({
        provider: "gemini",
        json: true,
        reload: false,
        consoleLimit: 4,
        networkLimit: 4,
        bundlePath,
      });

      expect(result.browserEvidence).toEqual(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("ECONNREFUSED"),
        }),
      );
      expect(result.workspaceStatus).toEqual(
        expect.objectContaining({
          liveReady: false,
        }),
      );
      expect(JSON.parse(readFileSync(bundlePath, "utf8")).browserEvidence.ok).toBe(false);
    } finally {
      rmSync(workspace, {
        recursive: true,
        force: true,
      });
    }
  });

  it("writes a support bundle with current page evidence and diagnose ladder", async () => {
    const workspace = createRepoTempWorkspace("webai-bridge-browser-diagnose-");
    const storePath = join(workspace, "local-web-auth-store.json");
    const bundlePath = join(workspace, "chatgpt-support-bundle.json");

    writeFileSync(
      storePath,
      JSON.stringify(
        {
          version: 1,
          providers: {
            chatgpt: {
              providerId: "chatgpt",
              state: "ready",
              acquisitionMode: "managed-browser",
              artifactStates: {
                "browser-profile": "present",
                "cookie-bundle": "present",
                "user-agent": "present",
              },
              runtimeEnv: {},
              updatedAt: "2026-04-03T12:00:00.000Z",
              source: "local-auth-portal",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const fakePage = {
      url: () => "https://chatgpt.com/auth/login",
      title: vi.fn(async () => "Log in | ChatGPT"),
      evaluate: vi.fn(async () => "Log in to continue"),
      reload: vi.fn(async () => undefined),
      waitForLoadState: vi.fn(async () => undefined),
      on: vi.fn(),
    };
    const fakeBrowser = {
      contexts: () => [
        {
          pages: () => [fakePage],
        },
      ],
      close: vi.fn(async () => undefined),
    };

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP: vi.fn(async () => fakeBrowser),
      },
    }));
    try {
      const { runWebLoginBrowserDiagnosis } = await import(
        "../../../scripts/diagnose-web-login-browser.mjs"
      );

      const result = await runWebLoginBrowserDiagnosis({
        provider: "chatgpt",
        env: {
          ...process.env,
          WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: storePath,
        },
        json: true,
        reload: true,
        consoleLimit: 4,
        networkLimit: 4,
        bundlePath,
      });

      expect(result.storeStatus).toEqual(
        expect.objectContaining({
          ready: true,
          state: "ready",
        }),
      );
      expect(result.browserEvidence).toEqual(
        expect.objectContaining({
          ok: true,
          currentPage: expect.objectContaining({
            url: "https://chatgpt.com/auth/login",
            title: "Log in | ChatGPT",
          }),
        }),
      );
      expect(result.workspaceStatus).toEqual(
        expect.objectContaining({
          liveReady: false,
          reason: expect.stringContaining("store-ready, not live-ready"),
        }),
      );
      expect(result.diagnoseLadder).toHaveLength(5);
      expect(result.supportBundle.path).toBe(bundlePath);

      const written = JSON.parse(readFileSync(bundlePath, "utf8"));
      expect(written.attachHelper.diagnoseCommand).toContain(
        "diagnose-web-login-browser.mjs --provider chatgpt",
      );
      expect(written.browserEvidence.currentPage.url).toBe(
        "https://chatgpt.com/auth/login",
      );
    } finally {
      rmSync(workspace, {
        recursive: true,
        force: true,
      });
    }
  });

  it("selects the provider page from attached browser contexts", async () => {
    const { selectCanonicalPage } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const otherPage = { url: () => "https://example.com" };
    const providerPage = { url: () => "https://grok.com/home" };

    const selected = await selectCanonicalPage(
      {
        contexts: () => [
          {
            pages: () => [otherPage, providerPage],
          },
        ],
      } as any,
      "grok",
    );

    expect(selected).toBe(providerPage);
  });

  it("collects browser evidence and keeps failed requests bounded", async () => {
    const failedRequest = {
      method: () => "GET",
      resourceType: () => "document",
      url: () => "https://gemini.google.com/app?token=secret",
      failure: () => ({ errorText: "ERR_ABORTED" }),
      response: async () => undefined,
    };
    const finishedRequest = {
      method: () => "POST",
      resourceType: () => "fetch",
      url: () => "https://gemini.google.com/app",
      failure: () => undefined,
      response: async () => ({ status: () => 200 }),
    };
    const listeners = new Map<string, (value: any) => void>();
    const page = {
      url: () => "https://gemini.google.com/app",
      title: vi.fn(async () => "Gemini Workspace"),
      evaluate: vi.fn(async () => "Gemini composer ready"),
      reload: vi.fn(async () => undefined),
      waitForLoadState: vi.fn(async () => undefined),
      on: vi.fn((event: string, handler: (value: any) => void) => {
        listeners.set(event, handler);
        if (event === "console") {
          handler({
            type: () => "info",
            text: () => "composer ready",
            location: () => ({ url: "https://gemini.google.com/app" }),
          });
        }
        if (event === "requestfinished") {
          handler(finishedRequest);
        }
        if (event === "requestfailed") {
          handler(failedRequest);
        }
      }),
    };
    const browser = {
      contexts: () => [
        {
          pages: () => [page],
        },
      ],
      close: vi.fn(async () => undefined),
    };

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP: vi.fn(async () => browser),
      },
    }));

    const { collectBrowserEvidence, resolveCanonicalAttachTarget } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    const target = resolveCanonicalAttachTarget("gemini", {
      WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9223",
    });
    const result = await collectBrowserEvidence("gemini", target, {
      reload: true,
      consoleLimit: 4,
      networkLimit: 4,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        currentPage: expect.objectContaining({
          url: "https://gemini.google.com/app",
          title: "Gemini Workspace",
        }),
        currentConsole: expect.arrayContaining([
          expect.objectContaining({
            text: "composer ready",
          }),
        ]),
        currentNetwork: expect.arrayContaining([
          expect.objectContaining({
            method: "POST",
            outcome: "finished",
          }),
          expect.objectContaining({
            method: "GET",
            outcome: "failed",
            failureText: "ERR_ABORTED",
          }),
        ]),
      }),
    );
  });
});
