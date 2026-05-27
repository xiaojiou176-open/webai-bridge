import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("verify-web-login helper branches", () => {
  it("parses provider filters in both inline and separated forms", async () => {
    const { parseProviderArgs } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(parseProviderArgs(["--provider", "chatgpt,gemini"])).toEqual([
      "chatgpt",
      "gemini",
    ]);
    expect(parseProviderArgs(["--provider=qwen,grok"])).toEqual(["qwen", "grok"]);
  });

  it("throws for missing provider values and unknown arguments", async () => {
    const { parseProviderArgs } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(() => parseProviderArgs(["--provider"])).toThrow(/Missing value/);
    expect(() => parseProviderArgs(["--wat"])).toThrow(/Unknown argument/);
  });

  it("returns stable invoke-proof expectations per provider", async () => {
    const { getInvokeProofExpectation } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(getInvokeProofExpectation("gemini")).toEqual(
      expect.objectContaining({
        token: expect.stringMatching(/^GEMINI_OK_[A-Z0-9]+$/),
        prompt: expect.stringContaining("Reply with exactly"),
      }),
    );
  });

  it("maps Gemini live-proof failures into rate-limit and human-verification blockers", async () => {
    const { mapGeminiLiveProofFailureResult } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );

    const rateLimited = mapGeminiLiveProofFailureResult({
      provider: "gemini",
      status: "failure",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://gemini.google.com/app",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "Gemini workspace says rate limit reached, please try again later.",
      summary: "usage cap reached",
    });

    const humanVerification = mapGeminiLiveProofFailureResult({
      provider: "gemini",
      status: "failure",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://google.com/sorry/index",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "Google unusual traffic challenge",
      summary: "abnormal traffic verification page",
    });

    const ignored = mapGeminiLiveProofFailureResult({
      provider: "gemini",
      status: "failure",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://gemini.google.com/app",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "some unrelated parser failure",
      summary: "plain failure",
    });

    expect(rateLimited).toEqual(
      expect.objectContaining({
        blocker: "gemini-provider-rate-limited",
        classification: "provider-unavailable",
      }),
    );
    expect(humanVerification).toEqual(
      expect.objectContaining({
        blocker: "gemini-human-verification-required",
        classification: "human-verification-required",
      }),
    );
    expect(ignored).toBeUndefined();
  });

  it("maps Grok live-proof failures into account, human, and session blockers", async () => {
    const { mapGrokLiveProofFailureResult } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );

    const accountAction = mapGrokLiveProofFailureResult({
      provider: "grok",
      status: "failure",
      reason: "probe-unexpected-body",
      classification: "user-action-required",
      probeUrl: "https://grok.com",
      finalUrl: "https://grok.com/",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "linking an X account is still required",
      summary: "end-user account action needed",
    });

    const humanVerification = mapGrokLiveProofFailureResult({
      provider: "grok",
      status: "failure",
      reason: "probe-unexpected-body",
      classification: "human-verification-required",
      probeUrl: "https://grok.com",
      finalUrl: "https://grok.com/",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "anti-bot gate",
      summary: "captcha required",
    });

    const incomplete = mapGrokLiveProofFailureResult({
      provider: "grok",
      status: "failure",
      reason: "probe-unexpected-body",
      classification: "session-incomplete",
      probeUrl: "https://grok.com",
      finalUrl: "https://grok.com/",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "missing the live composer surface",
      summary: "grok.com/",
    });

    expect(accountAction).toEqual(
      expect.objectContaining({
        blocker: "grok-account-action-required",
        classification: "user-action-required",
      }),
    );
    expect(humanVerification).toEqual(
      expect.objectContaining({
        blocker: "grok-human-verification-required",
        classification: "human-verification-required",
      }),
    );
    expect(incomplete).toEqual(
      expect.objectContaining({
        blocker: "grok-browser-session-incomplete",
        classification: "session-incomplete",
      }),
    );
  });

  it("detects soft invoke failures for weak Qwen output but ignores exact token matches", async () => {
    const {
      createInvokeProofExpectation,
      detectSoftInvokeFailure,
    } = await import("../../../scripts/verify-web-login-live.mjs");

    const qwenExpectation = createInvokeProofExpectation("qwen");
    const tokenMatch = createInvokeProofExpectation("grok");

    const qwen = detectSoftInvokeFailure({
      proof: { provider: "qwen" },
      liveProofResult: {
        probeUrl: "https://chat.qwen.ai",
        finalUrl: "https://chat.qwen.ai",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        outputText: "model not found for this qwen alias",
      },
    });

    const grok = detectSoftInvokeFailure({
      proof: { provider: "grok" },
      liveProofResult: {
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        outputText: `some prefix ${tokenMatch.token}`,
      },
    });

    expect(qwen).toEqual(
      expect.objectContaining({
        provider: "qwen",
        classification: "probe-misclassification",
      }),
    );
    expect(grok).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "probe-misclassification",
      }),
    );
    expect(qwenExpectation.prompt).toContain(qwenExpectation.token);
  });

  it("maps invoke failures for claude, gemini session issues, and generic fallback failures", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const claude = mapInvokeFailureResult({
      proof: { provider: "claude" },
      liveProofResult: {
        probeUrl: "https://claude.ai/api/organizations",
        finalUrl: "https://claude.ai/api/organizations",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        message: "HTTP 429 rate_limit_error from upstream",
      },
    });

    const gemini = mapInvokeFailureResult({
      proof: { provider: "gemini" },
      liveProofResult: {
        probeUrl: "https://gemini.google.com/app",
        finalUrl: "https://gemini.google.com/app",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        message: "CookieMismatch means the browser session must be repaired",
      },
    });

    const generic = mapInvokeFailureResult({
      proof: { provider: "chatgpt" },
      liveProofResult: {
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "transport-error",
        failureStage: "invoke",
        message: "plain transport failure",
        suggestedAction: "retry later",
      },
    });

    expect(claude).toEqual(
      expect.objectContaining({
        blocker: "claude-provider-rate-limited",
        classification: "provider-unavailable",
      }),
    );
    expect(gemini).toEqual(
      expect.objectContaining({
        blocker: "gemini-browser-session-invalid",
        classification: "session-incomplete",
      }),
    );
    expect(generic).toEqual(
      expect.objectContaining({
        status: "failure",
        classification: "probe-misclassification",
      }),
    );
  });

  it("maps generic chatgpt, qwen, and grok user-action invoke failures into external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const chatgpt = mapInvokeFailureResult({
      proof: { provider: "chatgpt" },
      liveProofResult: {
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "user-action-required",
        failureStage: "re-auth",
        message: "ChatGPT Web needs explicit user action before Web/Login traffic can continue.",
        suggestedAction:
          "Re-open https://chatgpt.com in the attached browser profile, sign in again, and recapture the session artifacts.",
      },
    });

    const qwen = mapInvokeFailureResult({
      proof: { provider: "qwen" },
      liveProofResult: {
        probeUrl: "https://chat.qwen.ai",
        finalUrl: "https://chat.qwen.ai/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "user-action-required",
        failureStage: "re-auth",
        message: "Qwen Web needs explicit user action before Web/Login traffic can continue.",
        suggestedAction:
          "Refresh the Qwen browser session in the same repo-owned browser, clear the remaining browser-side gate, and re-probe the authenticated workspace plus composer before resuming traffic.",
      },
    });

    const grok = mapInvokeFailureResult({
      proof: { provider: "grok" },
      liveProofResult: {
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "user-action-required",
        failureStage: "re-auth",
        message: "Grok Web needs explicit user action before Web/Login traffic can continue.",
        suggestedAction:
          "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
      },
    });

    expect(chatgpt).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "chatgpt-browser-session-incomplete",
        classification: "user-action-required",
      }),
    );
    expect(qwen).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "qwen-browser-session-incomplete",
        classification: "user-action-required",
        summary: expect.stringContaining("same repo-owned browser"),
      }),
    );
    expect(grok).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "grok-browser-session-incomplete",
        classification: "user-action-required",
        summary: expect.stringContaining("Grok Web OAuth/browser login flow"),
      }),
    );
  });

  it("maps qwen unauthorized chat bootstrap failures into external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const qwen = mapInvokeFailureResult({
      proof: { provider: "qwen" },
      liveProofResult: {
        probeUrl: "https://chat.qwen.ai",
        finalUrl: "https://chat.qwen.ai/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "Qwen chat creation did not return a chat id. You do not have permission to access this resource. Please contact your administrator for assistance.",
        suggestedAction:
          "Refresh the Qwen browser session in the same repo-owned browser, clear the remaining browser-side gate, and re-probe the authenticated workspace plus composer before resuming traffic.",
      },
    });

    expect(qwen).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "qwen-browser-session-incomplete",
        classification: "user-action-required",
        summary: expect.stringContaining("browser-side gate"),
      }),
    );
  });

  it("maps Grok provider probe instability into an external provider-unavailable blocker", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const grok = mapInvokeFailureResult({
      proof: { provider: "grok" },
      liveProofResult: {
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/c/abc",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "probe",
        message: "Grok Web local session looks present, but the upstream provider probe is failing.",
        suggestedAction: "Retry after the provider recovers; do not auto-fail over to another account or provider.",
      },
    });

    expect(grok).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "grok-provider-unavailable",
        classification: "provider-unavailable",
        summary: expect.stringContaining("Retry after the provider recovers"),
      }),
    );
  });

  it("maps Grok refreshable degraded sessions into an external degraded blocker", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const grok = mapInvokeFailureResult({
      proof: { provider: "grok" },
      liveProofResult: {
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "refreshable-but-degraded",
        failureStage: "refresh",
        message: "Grok Web session is degraded but refreshable; this provider stays blocked until the session is renewed.",
        suggestedAction:
          "Complete the Grok Web OAuth/browser login flow, then re-probe the authenticated Grok home and composer bootstrap from the same local profile.",
      },
    });

    expect(grok).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "grok-browser-session-degraded",
        classification: "refreshable-but-degraded",
        summary: expect.stringContaining("Grok Web OAuth/browser login flow"),
      }),
    );
  });

  it("preserves provider records when coherence helpers reload and rewrite the local auth store", async () => {
    const {
      loadStoredWebAuthInputs,
      writeStoredWebSessionRecord,
    } = await import("../../../scripts/verify-web-login-live.mjs");

    const runtimeCacheRoot = join(process.cwd(), ".runtime-cache");
    mkdirSync(runtimeCacheRoot, { recursive: true });
    const workspaceRoot = mkdtempSync(
      join(runtimeCacheRoot, "webai-bridge-store-preserve-"),
    );
    const storePath = join(workspaceRoot, "verify-web-login-live.store.json");
    const env = {
      WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: storePath,
    };

    writeFileSync(
      storePath,
      `${JSON.stringify(
        {
          version: 1,
          providers: {
            gemini: {
              providerId: "gemini",
              state: "ready",
              acquisitionMode: "isolated-chrome-root",
              accountLabel: "gemini:local-browser",
              sessionSource: "gemini-google-oauth",
              runtimeEnv: {
                WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "cookie-bundle",
                WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "ua",
                WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
              },
              captureProvenance: {
                browserMode: "isolated-chrome-root",
                userDataDir: "/tmp/webai-bridge-browser",
                profileDirectory: "Profile 1",
                profileName: "webai-bridge",
                cdpUrl: "http://127.0.0.1:9338",
                capturedAt: "2026-04-05T00:00:00.000Z",
              },
              persistenceAudit: {
                source: "capture",
                checkedAt: "2026-04-05T00:00:00.000Z",
                browserMode: "isolated-chrome-root",
                userDataDir: "/tmp/webai-bridge-browser",
                profileDirectory: "Profile 1",
                profileName: "webai-bridge",
                cdpUrl: "http://127.0.0.1:9338",
                workspaceReady: true,
                summary: "capture ok",
              },
              updatedAt: "2026-04-05T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const { storedSessions } = loadStoredWebAuthInputs(env);
    expect(storedSessions.gemini).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "cookie-bundle",
          WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "ua",
        }),
        captureProvenance: expect.objectContaining({
          browserMode: "isolated-chrome-root",
          cdpUrl: "http://127.0.0.1:9338",
        }),
      }),
    );

    writeStoredWebSessionRecord(env, "gemini", {
      state: "user-action-required",
      degradedReason: "needs fresh capture",
      updatedAt: "2026-04-05T01:00:00.000Z",
    });

    const persisted = JSON.parse(readFileSync(storePath, "utf8"));
    expect(persisted.providers.gemini).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        state: "user-action-required",
        degradedReason: "needs fresh capture",
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "cookie-bundle",
          WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: "ua",
        }),
        captureProvenance: expect.objectContaining({
          browserMode: "isolated-chrome-root",
          cdpUrl: "http://127.0.0.1:9338",
        }),
        persistenceAudit: expect.objectContaining({
          source: "capture",
          workspaceReady: true,
        }),
      }),
    );
  });

  it("treats Qwen browser proof as the fail-closed gate when API bootstrap looks green but DOM still shows login markers", async () => {
    const { reconcileQwenLiveProofResults } = await import(
      "../../../packages/providers/web/qwen/src/live-proof.ts"
    );

    const result = reconcileQwenLiveProofResults({
      apiProofResult: {
        status: "success",
        provider: "qwen",
        probeUrl: "https://chat.qwen.ai/api/v2/chats/new",
        responseStatus: 200,
        summary: "API bootstrap returned a chat id.",
        envStatus: [],
      },
      browserProofResult: {
        status: "failure",
        provider: "qwen",
        probeUrl: "https://chat.qwen.ai",
        finalUrl: "https://chat.qwen.ai/",
        reason: "probe-unexpected-body",
        diagnostic:
          "Qwen live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
        envStatus: [],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        reason: "probe-unexpected-body",
      }),
    );
  });

  it("rejects Grok pages that still show login or public landing markers", async () => {
    const { validateGrokBrowserWorkspaceSnapshot } = await import(
      "../../../packages/providers/web/grok/src/live-proof.ts"
    );

    const verdict = validateGrokBrowserWorkspaceSnapshot({
      finalUrl: "https://grok.com/",
      bodyText: "Imagine 登录 注册 通过给 Grok 发消息，即表示同意 条款 和 隐私政策。",
      hasComposerSurface: true,
    });

    expect(verdict).toEqual(
      expect.objectContaining({
        ok: false,
        classification: "session-incomplete",
      }),
    );
  });

  it("classifyLiveWorkspace respects current-page diagnostic classification before promoting a page to live-ready", async () => {
    const { classifyLiveWorkspace } = await import(
      "../../../scripts/diagnose-web-login-browser.mjs"
    );

    expect(
      classifyLiveWorkspace("qwen", {
        url: "https://chat.qwen.ai/",
        classification: "session-incomplete",
        diagnostic:
          "Qwen live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
      }),
    ).toEqual(
      expect.objectContaining({
        liveReady: false,
        classification: "login-required",
      }),
    );
  });
});
