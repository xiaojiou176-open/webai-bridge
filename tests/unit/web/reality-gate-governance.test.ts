import { describe, expect, it } from "vitest";

describe("reality gate governance helpers", () => {
  it("locks the internal gate order to typecheck, test, and build under pnpm", async () => {
    const { INTERNAL_GATE_STEPS } = await import("../../../scripts/run-reality-gate.mjs");

    expect(INTERNAL_GATE_STEPS).toEqual([
      ["typecheck", "pnpm", ["typecheck"]],
      ["test", "pnpm", ["test"]],
      ["build", "pnpm", ["build"]],
    ]);
  });

  it("maps supported workspace classifications without inventing unsupported ones", async () => {
    const { resolveWorkspaceClassification } = await import("../../../scripts/run-reality-gate.mjs");

    expect(resolveWorkspaceClassification(undefined)).toBeUndefined();
    expect(
      resolveWorkspaceClassification({
        persistenceAudit: {
          workspaceClassification: "attach-failed",
        },
        classification: "transport-instability",
      }),
    ).toBe("attach-failed");
    expect(
      resolveWorkspaceClassification({
        classification: "permission-gated",
      }),
    ).toBe("permission-gated");
    expect(
      resolveWorkspaceClassification({
        classification: "session-incomplete",
      }),
    ).toBe("session-incomplete");
    expect(
      resolveWorkspaceClassification({
        classification: "human-verification-required",
      }),
    ).toBe("human-verification-required");
    expect(
      resolveWorkspaceClassification({
        classification: "account-action-required",
      }),
    ).toBe("account-action-required");
    expect(
      resolveWorkspaceClassification({
        classification: "session-material-missing",
      }),
    ).toBeUndefined();
  });

  it("summarizes live statuses with explicit blocker and failure ledgers", async () => {
    const { summarizeLiveStatuses } = await import("../../../scripts/run-reality-gate.mjs");

    const summarized = summarizeLiveStatuses(
      {
        status: "external-blocker",
        blocker: "missing-gemini-api-key",
        classification: "session-material-missing",
        summary: "user-owned key is missing",
      },
      [
        {
          status: "success",
          provider: "chatgpt",
        },
        {
          status: "external-blocker",
          provider: "claude",
          blocker: "claude-account-action-required",
          classification: "account-action-required",
          missingEnvNames: ["WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE"],
          persistenceAudit: {
            workspaceClassification: "attach-failed",
          },
          rerunCommand: "pnpm run verify:web-login-live -- --provider claude",
          summary: "manual account action is still required",
        },
        {
          status: "failure",
          reason: "invoke-failed",
          classification: "transport-instability",
          invokeErrorCategory: "provider-unavailable",
          failureStage: "invoke",
          summary: "web invoke failed after probe success",
        },
      ],
    );

    expect(summarized.summary).toEqual({
      successCount: 1,
      externalBlockerCount: 2,
      failureCount: 1,
      classificationCounts: {
        "session-material-missing": 1,
        "account-action-required": 1,
        "transport-instability": 1,
      },
      workspaceClassificationCounts: {
        "attach-failed": 1,
      },
    });
    expect(summarized.externalBlockers).toEqual([
      {
        provider: "gemini",
        blocker: "missing-gemini-api-key",
        classification: "session-material-missing",
        workspaceClassification: undefined,
        missingEnvNames: [],
        probeUrl: undefined,
        cdpUrl: undefined,
        rerunCommand: undefined,
        summary: "user-owned key is missing",
        currentPage: undefined,
      },
      {
        provider: "claude",
        blocker: "claude-account-action-required",
        classification: "account-action-required",
        workspaceClassification: "attach-failed",
        missingEnvNames: ["WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE"],
        probeUrl: undefined,
        cdpUrl: undefined,
        rerunCommand: "pnpm run verify:web-login-live -- --provider claude",
        summary: "manual account action is still required",
        currentPage: undefined,
      },
    ]);
    expect(summarized.failures).toEqual([
      {
        provider: "gemini",
        reason: "invoke-failed",
        classification: "transport-instability",
        invokeErrorCategory: "provider-unavailable",
        failureStage: "invoke",
        summary: "web invoke failed after probe success",
      },
    ]);
  });

  it("filters falsy live results before building the summary", async () => {
    const { summarizeLiveStatuses } = await import("../../../scripts/run-reality-gate.mjs");

    const summarized = summarizeLiveStatuses(
      {
        status: "success",
        provider: "gemini",
      },
      [
        undefined,
        {
          status: "external-blocker",
          provider: "claude",
          blocker: "claude-account-action-required",
          classification: "account-action-required",
          summary: "manual account action is still required",
        },
      ],
    );

    expect(summarized.summary).toEqual({
      successCount: 1,
      externalBlockerCount: 1,
      failureCount: 0,
      classificationCounts: {
        "account-action-required": 1,
      },
      workspaceClassificationCounts: {
        "account-action-required": 1,
      },
    });
    expect(summarized.externalBlockers).toEqual([
      {
        provider: "claude",
        blocker: "claude-account-action-required",
        classification: "account-action-required",
        workspaceClassification: "account-action-required",
        missingEnvNames: [],
        probeUrl: undefined,
        cdpUrl: undefined,
        rerunCommand: undefined,
        summary: "manual account action is still required",
        currentPage: undefined,
      },
    ]);
    expect(summarized.failures).toEqual([]);
  });

  it("lifts current page evidence into the top-level external blocker ledger when debug context exists", async () => {
    const { summarizeLiveStatuses } = await import("../../../scripts/run-reality-gate.mjs");

    const summarized = summarizeLiveStatuses(
      {
        status: "success",
        provider: "gemini",
      },
      [
        {
          status: "external-blocker",
          provider: "grok",
          blocker: "grok-browser-session-incomplete",
          classification: "session-incomplete",
          summary: "browser session is still incomplete",
          debug: {
            currentPage: {
              url: "https://grok.com/",
              title: "Grok",
              snippet: "Imagine 登录 注册 Auto",
              hasComposerSurface: true,
              classification: "session-incomplete",
            },
          },
        },
      ],
    );

    expect(summarized.externalBlockers).toEqual([
      {
        provider: "grok",
        blocker: "grok-browser-session-incomplete",
        classification: "session-incomplete",
        workspaceClassification: "session-incomplete",
        missingEnvNames: [],
        probeUrl: undefined,
        cdpUrl: undefined,
        rerunCommand: undefined,
        summary: "browser session is still incomplete",
        currentPage: {
          url: "https://grok.com/",
          title: "Grok",
          snippet: "Imagine 登录 注册 Auto",
          hasComposerSurface: true,
          classification: "session-incomplete",
        },
      },
    ]);
  });

  it("reports a fully green reality gate as success", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 0 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "success",
        provider: "gemini",
      },
      webLogin: [
        {
          status: "success",
          provider: "chatgpt",
        },
      ],
      frontdoorGovernance: {
        passed: true,
        expectedSkillPackIds: [
          "runtime-diagnostics-pack",
          "docs-seo-sync-pack",
          "chat-app-runtime-pack",
          "research-copilot-pack",
          "compare-runtime-pack",
          "byok-first-safe-pack",
        ],
        missingFromChooser: [],
        missingFromComparison: [],
        missingFromRouter: [],
        missingFromChooserDoc: [],
        missingFromPlaybooksDoc: [],
      },
    });

    expect(report.overallStatus).toBe("success");
    expect(report.exitCode).toBe(0);
    expect(report.repoOwnedGate).toEqual({
      passed: true,
      verdict: "pass",
      status: "pass",
    });
    expect(report.m1KernelAlphaRealityGate).toBe("pass");
    expect(report.truthAlignment.alignedProviderCount).toBe(2);
    expect(report.truthAlignment.blockedProviderCount).toBe(0);
    expect(report.truthAlignment.frontdoorGovernance).toEqual({
      passed: true,
      expectedSkillPackIds: [
        "runtime-diagnostics-pack",
        "docs-seo-sync-pack",
        "chat-app-runtime-pack",
        "research-copilot-pack",
        "compare-runtime-pack",
        "byok-first-safe-pack",
      ],
      missingFromChooser: [],
      missingFromComparison: [],
      missingFromRouter: [],
      missingFromChooserDoc: [],
      missingFromPlaybooksDoc: [],
    });
  });

  it("builds a provider-aligned truth summary that points back to runtime doctor commands", async () => {
    const { buildTruthAlignmentSummary } = await import("../../../scripts/run-reality-gate.mjs");

    const summary = buildTruthAlignmentSummary(
      {
        status: "success",
        provider: "gemini",
      },
      [
        {
          status: "external-blocker",
          provider: "claude",
          classification: "account-action-required",
        },
      ],
    );

    expect(summary).toEqual({
      source: "reality-gate-live-results",
      alignedProviderCount: 2,
      blockedProviderCount: 1,
      providers: [
        {
          provider: "gemini",
          story: "dispatchable",
          classification: undefined,
          runtimeDoctorCommand:
            "pnpm run webai-bridge:cli -- provider-doctor --provider gemini --json",
        },
        {
          provider: "claude",
          story: "blocked",
          classification: "account-action-required",
          runtimeDoctorCommand:
            "pnpm run webai-bridge:cli -- provider-doctor --provider claude --json",
        },
      ],
    });
  });

  it("turns front-door drift into a repo-owned governance failure", async () => {
    const { buildRealityGateReport } = await import("../../../scripts/run-reality-gate.mjs");

    const report = buildRealityGateReport({
      internalGate: [
        { name: "typecheck", exitCode: 0 },
        { name: "test", exitCode: 0 },
        { name: "build", exitCode: 0 },
      ],
      geminiByok: {
        status: "success",
        provider: "gemini",
      },
      webLogin: [
        {
          status: "success",
          provider: "chatgpt",
        },
      ],
      frontdoorGovernance: {
        passed: false,
        expectedSkillPackIds: [
          "runtime-diagnostics-pack",
          "docs-seo-sync-pack",
          "chat-app-runtime-pack",
          "research-copilot-pack",
          "compare-runtime-pack",
          "byok-first-safe-pack",
        ],
        missingFromChooser: ["chat-app-runtime-pack"],
        missingFromComparison: ["research-copilot-pack"],
        missingFromRouter: ["compare-runtime-pack"],
        missingFromChooserDoc: ["byok-first-safe-pack"],
        missingFromPlaybooksDoc: ["chat-app-runtime-pack"],
      },
    });

    expect(report.overallStatus).toBe("failure");
    expect(report.exitCode).toBe(1);
    expect(report.repoOwnedGate).toEqual({
      passed: false,
      verdict: "fail",
      status: "failure",
    });
    expect(report.truthAlignment.frontdoorGovernance.passed).toBe(false);
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "frontdoor-governance",
          reason: "frontdoor-truth-drift",
          classification: "contract-drift",
        }),
      ]),
    );
  });

  it("builds a front-door governance summary from landed skill-pack routes and front-door surfaces", async () => {
    const { buildFrontdoorGovernanceSummary } = await import("../../../scripts/run-reality-gate.mjs");

    const summary = buildFrontdoorGovernanceSummary({
      skillPackRoutes: {
        routes: [
          { id: "runtime-diagnostics-pack" },
          { id: "docs-seo-sync-pack" },
          { id: "chat-app-runtime-pack" },
        ],
      },
      starterPackChooser: {
        scenarios: [
          {
            starterKind: "skill",
            recommendedPack: "runtime-diagnostics-pack",
          },
          {
            starterKind: "skill",
            recommendedPack: "chat-app-runtime-pack",
          },
        ],
      },
      starterPackComparison: {
        comparisons: [
          {
            starterKind: "skill",
            recommendedPack: "runtime-diagnostics-pack",
          },
        ],
      },
      builderIntentRouter: {
        intents: [
          {
            id: "route-runtime-diagnostics-pack",
            question: "Use runtime-diagnostics-pack",
          },
        ],
      },
      starterPackChooserDoc: "runtime-diagnostics-pack chat-app-runtime-pack",
      hostIntegrationPlaybooksDoc: "runtime-diagnostics-pack docs-seo-sync-pack",
    });

    expect(summary).toEqual({
      passed: false,
      expectedSkillPackIds: [
        "runtime-diagnostics-pack",
        "docs-seo-sync-pack",
        "chat-app-runtime-pack",
      ],
      missingFromChooser: ["docs-seo-sync-pack"],
      missingFromComparison: ["docs-seo-sync-pack", "chat-app-runtime-pack"],
      missingFromRouter: ["docs-seo-sync-pack", "chat-app-runtime-pack"],
      missingFromChooserDoc: ["docs-seo-sync-pack"],
      missingFromPlaybooksDoc: ["chat-app-runtime-pack"],
    });
  });

  it("keeps the current repo front-door skill-pack surfaces aligned", async () => {
    const {
      buildFrontdoorGovernanceSummary,
      loadFrontdoorGovernanceInputs,
    } = await import("../../../scripts/run-reality-gate.mjs");

    const summary = buildFrontdoorGovernanceSummary(
      loadFrontdoorGovernanceInputs(),
    );

    expect(summary).toEqual({
      passed: true,
      expectedSkillPackIds: [
        "runtime-diagnostics-pack",
        "docs-seo-sync-pack",
        "chat-app-runtime-pack",
        "research-copilot-pack",
        "compare-runtime-pack",
        "byok-first-safe-pack",
      ],
      missingFromChooser: [],
      missingFromComparison: [],
      missingFromRouter: [],
      missingFromChooserDoc: [],
      missingFromPlaybooksDoc: [],
    });
  });
});
