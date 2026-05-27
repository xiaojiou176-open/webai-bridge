import { describe, expect, it } from "vitest";

import { renderProviderDebugWorkbench } from "../../../packages/surfaces/http/src/provider-debug-workbench.js";

describe("provider debug workbench render", () => {
  it("keeps the default runtime-ready summary when no blocker-specific truth focus applies", () => {
    const html = renderProviderDebugWorkbench({
      providerId: "chatgpt",
      providerDisplayName: "ChatGPT Web",
      auth: {
        statusSummary: "Ready to use",
        modeLabel: "Use Isolated Chrome Root",
      },
      runtime: {
        runtimeReadiness: "ready",
        degradedInvocationPolicy: "allow-with-warning",
      },
      storeReadiness: {
        credentialState: "ready",
        validationState: "validated",
        note: "Stored session materials look ready.",
      },
      liveReadiness: {
        status: "live-ready",
        diagnostic: "The attached browser currently looks like an authenticated workspace.",
      },
      attachTarget: {
        cdpUrl: "http://127.0.0.1:9338",
        source: "runtime-env",
        note: "This is the canonical browser attach target WebaiBridge will inspect next.",
      },
      currentPage: {
        classification: undefined,
        diagnostic: "Current browser evidence looks healthy.",
        url: "https://chatgpt.com/",
      },
      currentConsole: {
        diagnostic: "No fresh console entries were captured during this inspection window.",
        entries: [],
      },
      currentNetwork: {
        diagnostic: "No fresh network events were captured during this inspection window.",
        entries: [],
      },
      diagnoseLadder: [
        {
          id: "next-step",
          status: "recommended",
          summary: "Run the provider-scoped live gate after the current page looks correct.",
          command: "pnpm exec node scripts/verify-web-login-live.mjs --provider chatgpt",
        },
      ],
      routes: {
        status: "/v1/runtime/providers/chatgpt/status",
        probe: "/v1/runtime/providers/chatgpt/probe",
        remediation: "/v1/runtime/providers/chatgpt/remediation",
        debugCurrentPage: "/v1/runtime/providers/chatgpt/debug/current-page",
        debugCurrentConsole: "/v1/runtime/providers/chatgpt/debug/current-console",
        debugCurrentNetwork: "/v1/runtime/providers/chatgpt/debug/current-network",
        debugSupportBundle: "/v1/runtime/providers/chatgpt/debug/support-bundle",
      },
    } as any);

    expect(html).toContain("Runtime can invoke");
    expect(html).toContain("<strong>technical status</strong> <code>ready</code>");
    expect(html).toContain("Open trays");
    expect(html).toContain("Next repair step:");
    expect(html).toContain("Open browser evidence");
    expect(html).toContain("Back to auth portal");
    expect(html).not.toContain("Runtime still blocked");
  });

  it("maps human-verification blockers into a blocked runtime verdict without hiding the underlying runtime state", () => {
    const html = renderProviderDebugWorkbench({
      providerId: "gemini",
      providerDisplayName: "Gemini Web",
      auth: {
        statusSummary: "User action required",
        modeLabel: "Use Isolated Chrome Root",
        session: {
          requiredUserAction: "Complete the verification step before rerunning the live gate.",
        },
      },
      runtime: {
        runtimeReadiness: "ready",
        degradedInvocationPolicy: "allow-with-warning",
      },
      storeReadiness: {
        credentialState: "ready",
        validationState: "validated",
        note: "Stored session materials look ready.",
      },
      liveReadiness: {
        status: "live-ready",
        diagnostic: "The current browser still needs a human verification step before this provider can be treated as reusable.",
      },
      attachTarget: {
        cdpUrl: "http://127.0.0.1:9338",
        source: "runtime-env",
        note: "This is the canonical browser attach target WebaiBridge will inspect next.",
      },
      currentPage: {
        classification: "human-verification-required",
        diagnostic: "The current browser still needs a human verification step before this provider can be treated as reusable.",
        url: "https://gemini.google.com/app",
      },
      currentConsole: {
        diagnostic: "No fresh console entries were captured during this inspection window.",
        entries: [],
      },
      currentNetwork: {
        diagnostic: "No fresh network events were captured during this inspection window.",
        entries: [],
      },
      diagnoseLadder: [
        {
          id: "verification-step",
          status: "recommended",
          summary: "Finish the human verification step in the current browser.",
          command: "pnpm exec node scripts/verify-web-login-live.mjs --provider gemini",
        },
      ],
      routes: {
        status: "/v1/runtime/providers/gemini/status",
        probe: "/v1/runtime/providers/gemini/probe",
        remediation: "/v1/runtime/providers/gemini/remediation",
        debugCurrentPage: "/v1/runtime/providers/gemini/debug/current-page",
        debugCurrentConsole: "/v1/runtime/providers/gemini/debug/current-console",
        debugCurrentNetwork: "/v1/runtime/providers/gemini/debug/current-network",
        debugSupportBundle: "/v1/runtime/providers/gemini/debug/support-bundle",
      },
    } as any);

    expect(html).toContain("Verification first");
    expect(html).toContain("blocked on verification");
    expect(html).toContain("Current page: human-verification-required");
    expect(html).toContain("Open trays");
    expect(html).toContain("Open repair ladder");
    expect(html).toContain('href="#diagnose-ladder-tray"');
    expect(html).toContain('id="diagnose-ladder-tray"');
    expect(html).toContain("Next repair step:");
    expect(html).not.toContain("<strong>technical status</strong> <code>ready</code>");
  });
});
