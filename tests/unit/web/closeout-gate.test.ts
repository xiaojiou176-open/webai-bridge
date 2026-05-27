import { describe, expect, it } from "vitest";
import { join } from "node:path";

function createRepoScopedStorePath(fileName: string) {
  return join(process.cwd(), ".runtime-cache", "temp", fileName);
}

describe("Reality closeout script helpers", () => {
  it("matches invoke proof tokens even when upstream inserts layout whitespace", async () => {
    const { normalizeInvokeProofText } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(
      normalizeInvokeProofText("CLAUDE_\n1774903150508_bb316b445d_ONLY"),
    ).toBe("claude_1774903150508_bb316b445d_only");
  });

  it("accepts an exact sentinel line while rejecting inline explanation text", async () => {
    const { resolveVerifiedInvokeOutputText } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(
      resolveVerifiedInvokeOutputText(
        'The user is asking me to reply exactly.\nQWEN_OK\n',
        "QWEN_OK",
      ),
    ).toBe("QWEN_OK");
    expect(
      resolveVerifiedInvokeOutputText(
        "The answer is QWEN_OK because that is what you asked for.",
        "QWEN_OK",
      ),
    ).toBeUndefined();
  });

  it("supports concurrent web live verification runs without temp-dir collisions", async () => {
    const { runWebLoginLiveVerification } = await import("../../../scripts/verify-web-login-live.mjs");
    const isolatedEnv = {
      WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: createRepoScopedStorePath(
        "webai-bridge-closeout-gate-missing-store.json",
      ),
    };
    const providers = ["chatgpt"] as const;

    const first = runWebLoginLiveVerification({
      env: isolatedEnv,
      providers: [...providers],
      fetchFn: (() => {
        throw new Error("fetch should not run when session material is missing");
      }) as typeof fetch,
    });
    const second = runWebLoginLiveVerification({
      env: isolatedEnv,
      providers: [...providers],
      fetchFn: (() => {
        throw new Error("fetch should not run when session material is missing");
      }) as typeof fetch,
    });

    const [firstResults, secondResults] = await Promise.all([first, second]);
    const collectDiagnostics = (
      results: Awaited<ReturnType<typeof runWebLoginLiveVerification>>,
    ) =>
      results
        .flatMap((result) => [
          "diagnostic" in result ? result.diagnostic : "",
          "summary" in result && typeof result.summary === "string" ? result.summary : "",
        ])
        .filter((value) => value.length > 0)
        .join("\n");

    expect(firstResults).toHaveLength(providers.length);
    expect(secondResults).toHaveLength(providers.length);
    expect(firstResults.map((result) => result.provider).sort()).toEqual(
      secondResults.map((result) => result.provider).sort(),
    );
    expect(collectDiagnostics(firstResults)).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(collectDiagnostics(firstResults)).not.toContain("Cannot find module");
    expect(collectDiagnostics(secondResults)).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(collectDiagnostics(secondResults)).not.toContain("Cannot find module");
  }, 120_000);

  it("supports provider-scoped web live verification reruns", async () => {
    const { runWebLoginLiveVerification } = await import("../../../scripts/verify-web-login-live.mjs");

    const results = await runWebLoginLiveVerification({
      env: {
        WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: createRepoScopedStorePath(
          "webai-bridge-closeout-gate-provider-filter.json",
        ),
      },
      providers: ["chatgpt"],
      fetchFn: (() => {
        throw new Error("fetch should not run when session material is missing");
      }) as typeof fetch,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        provider: "chatgpt",
        rerunCommand: expect.stringContaining(
          "pnpm exec node scripts/verify-web-login-live.mjs --provider chatgpt",
        ),
      }),
    );
  }, 60_000);

  it("accepts pnpm-style provider filters that include the `--` separator", async () => {
    const { parseProviderArgs } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(parseProviderArgs(["--", "--provider", "grok,chatgpt"])).toEqual([
      "grok",
      "chatgpt",
    ]);
  }, 60_000);

  it("classifies Gemini CDP connectivity as an external blocker", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "gemini",
      },
      liveProofResult: {
        status: "success",
        provider: "gemini",
        probeUrl: "https://gemini.google.com/app",
        finalUrl: "https://gemini.google.com/app",
        responseStatus: 200,
        envStatus: [
          {
            name: "WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE",
            present: true,
          },
          {
            name: "WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT",
            present: true,
          },
        ],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "connectOverCDP failed: connect ECONNREFUSED 127.0.0.1:9338 while starting the Gemini browser DOM transport.",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "gemini",
        blocker: "gemini-cdp-unavailable",
        classification: "transport-instability",
        cdpUrl: "http://127.0.0.1:9338",
      }),
    );
  });

  it("classifies ChatGPT unusual-activity and Grok anti-bot responses as external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const chatgpt = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "HTTP 403 unusual activity detected from your device.",
      },
      env: {},
    });

    const grok = mapInvokeFailureResult({
      proof: {
        provider: "grok",
      },
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "HTTP 403 request rejected by anti-bot rules.",
      },
      env: {},
    });

    expect(chatgpt).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-risk-check-required",
        classification: "user-action-required",
      }),
    );
    expect(grok).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-anti-bot-check-required",
        classification: "human-verification-required",
      }),
    );
  });

  it("classifies Grok invoke timeouts with a still-authenticated browser workspace as provider-unavailable external blockers", async () => {
    const { buildGrokInvokeTimeoutExternalBlocker } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );

    const mapped = buildGrokInvokeTimeoutExternalBlocker({
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
        signal: "grok-home-composer-browser-dom",
        summary: "Grok workspace/composer page looked authenticated in the attached local browser session.",
      },
      diagnostic: "grok invoke proof timed out after 240000ms.",
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-provider-unavailable",
        classification: "provider-unavailable",
        rerunCommand:
          "pnpm run bootstrap:web-login-browser -- --provider grok && pnpm exec node scripts/verify-web-login-live.mjs --provider grok",
      }),
    );
  });

  it("maps Grok browser DOM fallback timeouts into external blockers instead of generic failures", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "grok",
      },
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
        signal: "grok-home-composer-browser-dom",
        summary: "Grok workspace/composer page looked authenticated in the attached local browser session.",
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "Grok browser DOM fallback timed out after 60000ms.",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-provider-unavailable",
        classification: "provider-unavailable",
      }),
    );
  });

  it("maps Grok target-crash submit failures into provider-unavailable external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "grok",
      },
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
        signal: "grok-home-composer-browser-dom",
        summary: "Grok workspace/composer page looked authenticated in the attached local browser session.",
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "keyboard.press: Target crashed",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-provider-unavailable",
        classification: "provider-unavailable",
      }),
    );
  });

  it("classifies ChatGPT and Gemini visible rate-limit gates as provider-unavailable external blockers", async () => {
    const {
      mapGeminiLiveProofFailureResult,
      mapInvokeFailureResult,
    } = await import("../../../scripts/verify-web-login-live.mjs");

    const chatgpt = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "ChatGPT browser DOM transport hit a visible rate-limit gate in the attached browser (you've reached our limit).",
      },
      env: {},
    });

    const gemini = mapGeminiLiveProofFailureResult({
      status: "failure",
      provider: "gemini",
      classification: "provider-unavailable",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://gemini.google.com/app",
      responseStatus: 200,
      reason: "probe-unexpected-body",
      diagnostic:
        "Gemini browser workspace is currently showing a visible rate-limit or usage-cap gate, so live invocation must wait for provider capacity or a plan upgrade before continuing.",
      summary: "https://gemini.google.com/app",
      envStatus: [],
    });

    expect(chatgpt).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-provider-rate-limited",
        classification: "provider-unavailable",
      }),
    );
    expect(gemini).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "gemini",
        blocker: "gemini-provider-rate-limited",
        classification: "provider-unavailable",
      }),
    );
  });

  it("classifies ChatGPT CDP or closed-context attach failures as transport-instability external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "page.evaluate: Target page, context or browser has been closed",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
      }),
    );
  });

  it("classifies Claude 429 rate limits as provider-unavailable external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "claude",
      },
      liveProofResult: {
        status: "success",
        provider: "claude",
        probeUrl: "https://claude.ai/api/organizations",
        finalUrl: "https://claude.ai/api/organizations",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "Claude completion request failed with HTTP 429: {\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"exceeded_limit\"}}",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "claude",
        blocker: "claude-provider-rate-limited",
        classification: "provider-unavailable",
      }),
    );
  });

  it("classifies Claude overdue subscription gates as account-action-required external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "claude",
      },
      liveProofResult: {
        status: "success",
        provider: "claude",
        probeUrl: "https://claude.ai/api/organizations",
        finalUrl: "https://claude.ai/api/organizations",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "Claude completion request failed with HTTP 403: {\"type\":\"error\",\"error\":{\"type\":\"permission_error\",\"message\":\"Your subscription payment is past due. Please pay your overdue invoice to restore access.\",\"details\":{\"error_code\":\"subscription_past_due\"}}}",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "claude",
        blocker: "claude-account-action-required",
        classification: "account-action-required",
      }),
    );
  });

  it("classifies Grok browser account gates as user-action-required external blockers", async () => {
    const { mapGrokLiveProofFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapGrokLiveProofFailureResult({
      status: "failure",
      provider: "grok",
      classification: "user-action-required",
      probeUrl: "https://grok.com",
      finalUrl: "https://grok.com/",
      responseStatus: 200,
      reason: "probe-unexpected-body",
      diagnostic:
        "Grok browser workspace proof reached grok.com, but the attached browser still requires an end-user account action such as linking an X account or unlocking the required plan before the live composer is usable.",
      summary: "https://grok.com/",
      envStatus: [],
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-account-action-required",
        classification: "user-action-required",
      }),
    );
  });

  it("keeps ChatGPT DOM fallback failures as internal verification failures", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "ChatGPT browser DOM fallback failed after API 403 risk gate: ChatGPT input box could not be focused in the attached browser.",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "chatgpt",
        reason: "invoke-failed",
      }),
    );
  });

  it("accepts Grok invoke proofs once the browser fallback output still contains the sentinel token", async () => {
    const {
      detectSoftInvokeFailure,
      getInvokeProofExpectation,
    } = await import("../../../scripts/verify-web-login-live.mjs");
    const expectation = getInvokeProofExpectation("grok");

    const result = detectSoftInvokeFailure({
      proof: {
        provider: "grok",
      },
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        outputText: `Sure.\n${expectation.token}\n`,
      },
    });

    expect(result).toBeUndefined();
  });

  it("keeps ChatGPT DOM transport instrumentation failures as internal failures", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "ChatGPT DOM transport did not observe a completed assistant response in the attached browser.",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "chatgpt",
        reason: "invoke-failed",
      }),
    );
  });

  it("maps ChatGPT browser login and email-verification gates to external blockers", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const loginGate = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "ChatGPT attached browser is still showing the logged-out landing page or login/signup controls, so the browser workspace is not ready for live invocation.",
      },
      env: {},
    });

    const emailVerification = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message:
          "ChatGPT attached browser is currently blocked on OpenAI email verification (verification code), so the end user must finish that verification before WebaiBridge can invoke ChatGPT.",
      },
      env: {},
    });

    expect(loginGate).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-browser-session-incomplete",
        classification: "session-incomplete",
      }),
    );
    expect(emailVerification).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-email-verification-required",
        classification: "user-action-required",
      }),
    );
  });

  it("keeps ChatGPT browser-attached transport failures internal until a real risk signal appears", async () => {
    const { mapInvokeFailureResult } = await import("../../../scripts/verify-web-login-live.mjs");

    const mapped = mapInvokeFailureResult({
      proof: {
        provider: "chatgpt",
      },
      liveProofResult: {
        status: "success",
        provider: "chatgpt",
        probeUrl: "https://chatgpt.com/api/auth/session",
        finalUrl: "https://chatgpt.com/api/auth/session",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        errorCategory: "provider-unavailable",
        failureStage: "invoke",
        message: "ChatGPT DOM transport did not observe a completed assistant response in the attached browser.",
      },
      env: {},
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "chatgpt",
        reason: "invoke-failed",
        invokeErrorCategory: "provider-unavailable",
      }),
    );
  });

  it("builds a single aggregated report for internal gates and live reality results", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 0 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "external-blocker",
        provider: "gemini",
        blocker: "missing-gemini-api-key",
        classification: "session-material-missing",
        missingEnvNames: ["WEBAI_BRIDGE_GEMINI_API_KEY"],
      },
      webLogin: [
        {
          status: "success",
          provider: "chatgpt",
        },
        {
          status: "external-blocker",
          provider: "gemini",
          blocker: "gemini-cdp-unavailable",
          classification: "transport-instability",
          persistenceAudit: {
            workspaceClassification: "attach-failed",
          },
          rerunCommand:
            "pnpm run bootstrap:web-login-browser -- --provider gemini && pnpm exec node scripts/verify-web-login-live.mjs --provider gemini",
          cdpUrl: "http://127.0.0.1:39222",
        },
      ],
    });

    expect(report.overallStatus).toBe("external-blocker");
    expect(report.exitCode).toBe(2);
    expect(report.repoOwnedGate).toEqual({
      passed: true,
      verdict: "pass",
      status: "pass-with-external-blockers",
    });
    expect(report.m1KernelAlphaRealityGate).toBe("pass");
    expect(report.internalGate.passed).toBe(true);
    expect(report.liveGate.summary).toEqual({
      successCount: 1,
      externalBlockerCount: 2,
      failureCount: 0,
      classificationCounts: {
        "session-material-missing": 1,
        "transport-instability": 1,
      },
      workspaceClassificationCounts: {
        "attach-failed": 1,
      },
    });
    expect(report.externalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "gemini",
          blocker: "missing-gemini-api-key",
          classification: "session-material-missing",
        }),
        expect.objectContaining({
          provider: "gemini",
          blocker: "gemini-cdp-unavailable",
          classification: "transport-instability",
          workspaceClassification: "attach-failed",
        }),
      ]),
    );
  });

  it("rejects malformed provider filter arguments", async () => {
    const { parseProviderArgs } = await import("../../../scripts/verify-web-login-live.mjs");

    expect(() => parseProviderArgs(["--provider"])).toThrow(/Missing value/);
    expect(() => parseProviderArgs(["--unknown"])).toThrow(/Unknown argument/);
  });

  it("maps Gemini live-proof failures for CDP, rate-limit, and human verification branches", async () => {
    const { mapGeminiLiveProofFailureResult } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );

    const cdp = mapGeminiLiveProofFailureResult(
      {
        provider: "gemini",
        status: "failure",
        probeUrl: "https://gemini.google.com/app",
        finalUrl: "https://gemini.google.com/app",
        responseStatus: 200,
        envStatus: [],
        diagnostic: "connectOverCDP failed with ECONNREFUSED",
        summary: "cdp unavailable",
      },
      {
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9222",
      },
    );

    const rateLimited = mapGeminiLiveProofFailureResult({
      provider: "gemini",
      status: "failure",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://gemini.google.com/app",
      responseStatus: 429,
      envStatus: [],
      diagnostic: "usage cap reached",
      summary: "rate limit gate",
    });

    const humanVerification = mapGeminiLiveProofFailureResult({
      provider: "gemini",
      status: "failure",
      probeUrl: "https://gemini.google.com/app",
      finalUrl: "https://google.com/sorry/index",
      responseStatus: 403,
      envStatus: [],
      diagnostic: "abnormal traffic verification page",
      summary: "human verification required",
    });

    expect(cdp).toEqual(
      expect.objectContaining({
        blocker: "gemini-cdp-unavailable",
        classification: "transport-instability",
        cdpUrl: "http://127.0.0.1:9222",
      }),
    );
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
  });

  it("maps Grok live-proof failures for account-action and session-incomplete branches", async () => {
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
      summary: "needs plan unlock",
    });

    const incomplete = mapGrokLiveProofFailureResult({
      provider: "grok",
      status: "failure",
      reason: "probe-unexpected-body",
      probeUrl: "https://grok.com",
      finalUrl: "https://grok.com/",
      responseStatus: 200,
      envStatus: [],
      diagnostic: "unauthenticated and missing the live composer surface",
      summary: "grok.com/",
    });

    expect(accountAction).toEqual(
      expect.objectContaining({
        blocker: "grok-account-action-required",
        classification: "user-action-required",
      }),
    );
    expect(incomplete).toEqual(
      expect.objectContaining({
        blocker: "grok-browser-session-incomplete",
        classification: "session-incomplete",
      }),
    );
  });

  it("detects soft invoke failures for qwen model mismatches while ignoring grok token echoes", async () => {
    const { detectSoftInvokeFailure, getInvokeProofExpectation } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );

    const qwen = detectSoftInvokeFailure({
      proof: { provider: "qwen" },
      liveProofResult: {
        status: "success",
        provider: "qwen",
        probeUrl: "https://chat.qwen.ai",
        finalUrl: "https://chat.qwen.ai",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        outputText: "model not found",
      },
    });

    const grokExpectation = getInvokeProofExpectation("grok");
    const grok = detectSoftInvokeFailure({
      proof: { provider: "grok" },
      liveProofResult: {
        status: "success",
        provider: "grok",
        probeUrl: "https://grok.com",
        finalUrl: "https://grok.com/",
        responseStatus: 200,
        envStatus: [],
      },
      invokeResult: {
        outputText: `I saw ${grokExpectation.token} in a longer line`,
      },
    });

    expect(qwen).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        classification: "probe-misclassification",
      }),
    );
    expect(grok).toBeUndefined();
  });

  it("marks the whole report as failure when an internal gate step fails", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 1 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "success",
      },
      webLogin: [],
    });

    expect(report.overallStatus).toBe("failure");
    expect(report.exitCode).toBe(1);
    expect(report.repoOwnedGate).toEqual({
      passed: false,
      verdict: "fail",
      status: "failure",
    });
    expect(report.internalGate.passed).toBe(false);
  });

  it("marks the whole report as failure when live verification reports a real failure", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 0 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "failure",
        provider: "gemini",
        reason: "invoke-failed",
      },
      webLogin: [],
    });

    expect(report.overallStatus).toBe("failure");
    expect(report.exitCode).toBe(1);
    expect(report.repoOwnedGate).toEqual({
      passed: false,
      verdict: "fail",
      status: "failure",
    });
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "gemini",
          reason: "invoke-failed",
        }),
      ]),
    );
  });

  it("counts permission-gated external blockers as workspace-scoped blockers without flipping repo-owned failure", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 0 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "success",
      },
      webLogin: [
        {
          status: "external-blocker",
          provider: "claude",
          blocker: "claude-account-action-required",
          classification: "permission-gated",
        },
      ],
    });

    expect(report.overallStatus).toBe("external-blocker");
    expect(report.repoOwnedGate).toEqual({
      passed: true,
      verdict: "pass",
      status: "pass-with-external-blockers",
    });
    expect(report.liveGate.summary.workspaceClassificationCounts).toEqual({
      "permission-gated": 1,
    });
    expect(report.externalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "claude",
          workspaceClassification: "permission-gated",
        }),
      ]),
    );
  });

  it("uses unique provider-scoped invoke proof tokens to avoid stale lucky passes", async () => {
    const { createInvokeProofExpectation } = await import("../../../scripts/verify-web-login-live.mjs");

    const first = createInvokeProofExpectation("chatgpt");
    const second = createInvokeProofExpectation("chatgpt");

    expect(first.token).toMatch(/^CHATGPT_OK_[A-Z0-9]+$/);
    expect(second.token).toMatch(/^CHATGPT_OK_[A-Z0-9]+$/);
    expect(first.token).not.toBe(second.token);
    expect(first.prompt).toContain(first.token);
    expect(second.prompt).toContain(second.token);
  });
});
