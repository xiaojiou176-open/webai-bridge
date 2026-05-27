import { chromium } from "playwright-core";

import type { ProviderStatusView } from "../../../packages/lanes/web/src/index.js";
import { validateChatgptBrowserWorkspaceSnapshot } from "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js";
import {
  GEMINI_WEB_CDP_URL_ENV_NAME,
  validateGeminiBrowserWorkspaceSnapshot,
} from "../../../packages/providers/web/gemini/src/index.js";
import { validateGrokBrowserWorkspaceSnapshot } from "../../../packages/providers/web/grok/src/live-proof.js";
import { validateQwenBrowserWorkspaceSnapshot } from "../../../packages/providers/web/qwen/src/index.js";
import type {
  ServiceProviderAttachTargetView,
  ServiceProviderCurrentConsoleView,
  ServiceProviderCurrentNetworkView,
  ServiceProviderCurrentPageView,
  ServiceProviderDebugSupportView,
  ServiceProviderDiagnoseStepView,
} from "../../../packages/surfaces/http/src/service-language.js";
import {
  buildServiceProviderAuthView,
  buildServiceProviderRouteRefs,
  buildServiceProviderRuntimeView,
} from "../../../packages/surfaces/http/src/service-language.js";

import {
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME,
  WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME,
} from "./browser-bootstrap.js";

export type WebDebugSupportRunner = (
  provider: ProviderStatusView,
) => Promise<ServiceProviderDebugSupportView>;

type CurrentPageCapture = {
  finalUrl: string;
  title: string;
  snippet: string;
  hasComposerSurface: boolean;
  bodyText: string;
};

type ConsoleEntry = ServiceProviderCurrentConsoleView["entries"][number];
type NetworkEntry = ServiceProviderCurrentNetworkView["entries"][number];

type CurrentBrowserSnapshot = {
  currentPage: ServiceProviderCurrentPageView;
  currentNetwork: ServiceProviderCurrentNetworkView;
  currentConsole: ServiceProviderCurrentConsoleView;
  liveReadiness: ServiceProviderDebugSupportView["liveReadiness"];
};

const CONSOLE_FAIL_CLOSED_MESSAGE =
  "WebaiBridge could not observe current console events on the attached browser during this inspection, so current-console stays unavailable instead of inventing detached history.";
const NETWORK_FAIL_CLOSED_MESSAGE =
  "WebaiBridge did not capture fresh live request events during this inspection window, so current-network falls back to a limited resource-timing snapshot.";
const STORE_READY_NOTE =
  "Stored session materials can be present in the local auth store while the currently attached browser page is still logged out, redirected, or otherwise not live-ready.";
const DEBUG_OBSERVE_WINDOW_MS = 250;
const DEBUG_ENTRY_LIMIT = 10;

function includesAny(value: string, needles: readonly string[]) {
  return needles.some((needle) => value.includes(needle));
}

function sanitizeText(value: unknown, limit = 280) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim().slice(0, limit);
}

function sanitizeTraceUrl(value: string) {
  if (!value.trim()) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sanitizeText(value, 240);
  }
}

function urlMatchesHost(url: string, host: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

function resolveAttachTarget(
  provider: ProviderStatusView,
  env: Record<string, string | undefined>,
): ServiceProviderAttachTargetView {
  const mode =
    provider.session.acquisitionMode === "existing-chrome-profile"
      ? WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      : provider.session.acquisitionMode;
  const geminiCdpUrl = provider.provider === "gemini" ? env[GEMINI_WEB_CDP_URL_ENV_NAME] : undefined;
  const existingProfileCdpUrl = env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME];
  const existingBrowserSessionUrl = env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME];
  const sharedCdpUrl = env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME];
  const existingProfileDir =
    env[WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME] ??
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME];
  const existingProfileName = env[WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME];

  const cdpUrl =
    geminiCdpUrl?.trim() ||
    (mode === "existing-browser-session"
      ? existingBrowserSessionUrl?.trim()
      : mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? existingProfileCdpUrl?.trim()
        : sharedCdpUrl?.trim()) ||
    (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      ? WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
      : mode === "existing-browser-session"
        ? undefined
        : WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL);

  if (!cdpUrl) {
    return {
      mode,
      label: "No attach target",
      source: "missing",
      available: false,
      note:
        "WebaiBridge cannot inspect the attached browser yet because no reusable CDP/session URL is present in the runtime environment.",
    };
  }

  return {
    mode,
    label:
      mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? `Isolated Chrome root${existingProfileName ? ` (${existingProfileName})` : ""}`
        : mode === "existing-browser-session"
          ? "Existing browser session"
          : "Managed onboarding browser",
    cdpUrl,
    userDataDir: mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE ? existingProfileDir?.trim() : undefined,
    source:
      geminiCdpUrl?.trim() ||
      existingProfileCdpUrl?.trim() ||
      existingBrowserSessionUrl?.trim() ||
      sharedCdpUrl?.trim()
        ? "runtime-env"
        : "default",
    available: true,
    note:
      "This is the canonical browser attach target WebaiBridge will inspect next. It tells you where the browser session lives, not whether the page is already live-ready.",
  };
}

async function readCurrentPageCapture(
  cdpUrl: string,
  providerId: ProviderStatusView["provider"],
): Promise<{
  page: CurrentPageCapture;
  currentConsole: ServiceProviderCurrentConsoleView;
  currentNetwork: ServiceProviderCurrentNetworkView;
}> {
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages());
    const hostHint =
      providerId === "qwen"
        ? "qwen"
        : providerId === "gemini"
          ? "gemini"
          : providerId;
    const page =
      pages.find((candidate) => candidate.url().toLowerCase().includes(hostHint)) ??
      pages.find((candidate) => candidate.url() !== "about:blank") ??
      pages[0];

    if (!page) {
      throw new Error("No browser page is currently available on the attached session.");
    }

    const consoleEntries: ConsoleEntry[] = [];
    const requestEntries: NetworkEntry[] = [];

    if (typeof page.on === "function") {
      page.on("console", (message) => {
        if (consoleEntries.length >= DEBUG_ENTRY_LIMIT) {
          return;
        }

        consoleEntries.push({
          type: message.type(),
          text: sanitizeText(message.text()),
        });
      });
      page.on("pageerror", (error) => {
        if (consoleEntries.length >= DEBUG_ENTRY_LIMIT) {
          return;
        }

        consoleEntries.push({
          type: "pageerror",
          text: sanitizeText(error instanceof Error ? error.message : error),
        });
      });
      page.on("requestfinished", async (request) => {
        if (requestEntries.length >= DEBUG_ENTRY_LIMIT) {
          return;
        }

        let status: number | undefined;
        try {
          status = (await request.response())?.status();
        } catch {
          status = undefined;
        }

        const sanitizedUrl = sanitizeTraceUrl(request.url());
        requestEntries.push({
          name: sanitizedUrl,
          initiatorType: request.resourceType(),
          method: request.method(),
          outcome: "finished",
          status,
          url: sanitizedUrl,
          resourceType: request.resourceType(),
          source: "request-observer",
        });
      });
      page.on("requestfailed", (request) => {
        if (requestEntries.length >= DEBUG_ENTRY_LIMIT) {
          return;
        }

        const sanitizedUrl = sanitizeTraceUrl(request.url());
        requestEntries.push({
          name: sanitizedUrl,
          initiatorType: request.resourceType(),
          method: request.method(),
          outcome: "failed",
          errorText: sanitizeText(request.failure()?.errorText, 200),
          url: sanitizedUrl,
          resourceType: request.resourceType(),
          source: "request-observer",
        });
      });
    }

    if (typeof page.waitForLoadState === "function") {
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: 5_000,
        })
        .catch(() => undefined);
    }

    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, DEBUG_OBSERVE_WINDOW_MS);
    });

    const result = await page.evaluate(() => {
      const bodyText = document.body?.innerText ?? "";
      const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 280);
      const hasComposerSurface = Boolean(
        document.querySelector("textarea, [contenteditable='true'], [role='textbox']"),
      );
      const networkEntries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .slice(-10)
        .map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType,
          duration: Number(entry.duration.toFixed(2)),
        }));

      return {
        finalUrl: window.location.href,
        title: document.title,
        snippet,
        bodyText,
        hasComposerSurface,
        networkEntries,
      };
    });

    return {
      page: {
        finalUrl: result.finalUrl,
        title: result.title,
        snippet: result.snippet,
        bodyText: result.bodyText,
        hasComposerSurface: result.hasComposerSurface,
      },
      currentConsole:
        typeof page.on === "function"
          ? {
              status: "captured",
              entries: consoleEntries,
              diagnostic:
                consoleEntries.length > 0
                  ? "WebaiBridge captured live console/pageerror events from the attached browser during this inspection window."
                  : "WebaiBridge observed the attached browser for current console/pageerror events during this inspection window, but no new entries fired.",
            }
          : {
              status: "unavailable",
              entries: [],
              diagnostic: CONSOLE_FAIL_CLOSED_MESSAGE,
            },
      currentNetwork:
        requestEntries.length > 0
          ? {
              status: "captured",
              entries: requestEntries,
              diagnostic:
                "WebaiBridge captured live request lifecycle events from the attached browser during this inspection window.",
            }
          : result.networkEntries.length > 0
            ? {
                status: "limited",
                entries: result.networkEntries.map((entry: {
                  name: string;
                  initiatorType: string;
                  duration: number;
                }) => {
                  const sanitizedUrl = sanitizeTraceUrl(entry.name);
                  return {
                    name: sanitizedUrl,
                    initiatorType: entry.initiatorType,
                    duration: entry.duration,
                    url: sanitizedUrl,
                    source: "resource-timing" as const,
                  };
                }),
                diagnostic: NETWORK_FAIL_CLOSED_MESSAGE,
              }
            : {
                status: typeof page.on === "function" ? "captured" : "unavailable",
                entries: [],
                diagnostic:
                  typeof page.on === "function"
                    ? "WebaiBridge observed the attached browser for live request events during this inspection window, but no new requests fired."
                    : NETWORK_FAIL_CLOSED_MESSAGE,
              },
    };
  } finally {
    await browser.close();
  }
}

function buildCurrentPageView(
  provider: ProviderStatusView,
  snapshot: CurrentPageCapture,
): {
  currentPage: ServiceProviderCurrentPageView;
  liveReadiness: ServiceProviderDebugSupportView["liveReadiness"];
} {
  const lowerText = snapshot.bodyText.toLowerCase();
  const sessionArtifactStates = Object.fromEntries(
    (provider.session.artifactDetails ?? []).map((artifact) => [
      artifact.id,
      artifact.state,
    ]),
  );

  if (provider.provider === "chatgpt") {
    const verdict = validateChatgptBrowserWorkspaceSnapshot({
      finalUrl: snapshot.finalUrl,
      bodyText: snapshot.bodyText,
      hasComposerSurface: snapshot.hasComposerSurface,
    });

    if (!verdict.ok) {
      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification: "session-incomplete",
          diagnostic: verdict.diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic: verdict.diagnostic,
        },
      };
    }
  }

  if (provider.provider === "gemini") {
    const verdict = validateGeminiBrowserWorkspaceSnapshot({
      finalUrl: snapshot.finalUrl,
      text: `${snapshot.title}\n${snapshot.bodyText}`,
      hasComposerSurface: snapshot.hasComposerSurface,
    });

    if (!verdict.ok) {
      const classification =
        verdict.classification === "provider-unavailable"
          ? "provider-unavailable"
          : lowerText.includes("unusual traffic")
            ? "human-verification-required"
            : "session-incomplete";

      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification,
          diagnostic: verdict.diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic: verdict.diagnostic,
        },
      };
    }
  }

  if (provider.provider === "qwen") {
    const verdict = validateQwenBrowserWorkspaceSnapshot({
      finalUrl: snapshot.finalUrl,
      text: `${snapshot.title}\n${snapshot.bodyText}`,
      hasComposerSurface: snapshot.hasComposerSurface,
    });

    if (!verdict.ok) {
      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification: "session-incomplete",
          diagnostic: verdict.diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic: verdict.diagnostic,
        },
      };
    }

    if (
      provider.session.state === "user-action-required" &&
      sessionArtifactStates["session-cookie"] !== "missing" &&
      sessionArtifactStates["session-token"] !== "missing" &&
      !snapshot.bodyText.trim() &&
      !snapshot.hasComposerSurface
    ) {
      const diagnostic =
        "Qwen session material is already present, but the attached browser still looks blocked on a browser-side Unauthorized or permission gate.";

      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification: "permission-gated",
          diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic,
        },
      };
    }

    if (!snapshot.bodyText.trim() && !snapshot.hasComposerSurface) {
      const diagnostic =
        "Qwen attached browser reached chat.qwen.ai, but visible workspace/composer evidence is still too weak to prove the live page is ready.";

      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification: "session-incomplete",
          diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic,
        },
      };
    }
  }

  if (provider.provider === "grok") {
    const verdict = validateGrokBrowserWorkspaceSnapshot({
      finalUrl: snapshot.finalUrl,
      bodyText: snapshot.bodyText,
      hasComposerSurface: snapshot.hasComposerSurface,
    });

    if (!verdict.ok) {
      const classification =
        verdict.classification === "human-verification-required"
          ? "human-verification-required"
          : verdict.classification === "user-action-required"
            ? "account-action-required"
            : "session-incomplete";
      const diagnostic = verdict.diagnostic;
      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification,
          diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic,
        },
      };
    }
  }

  if (provider.provider === "claude") {
    if (
      !urlMatchesHost(snapshot.finalUrl, "claude.ai") ||
      includesAny(lowerText, ["sign in", "log in", "continue with google", "continue with email"]) ||
      !snapshot.hasComposerSurface
    ) {
      const diagnostic =
        "Claude attached browser is not yet showing an authenticated composer workspace, so live invocation is still blocked.";
      return {
        currentPage: {
          status: "captured",
          url: snapshot.finalUrl,
          title: snapshot.title,
          snippet: snapshot.snippet,
          hasComposerSurface: snapshot.hasComposerSurface,
          classification: "session-incomplete",
          diagnostic,
        },
        liveReadiness: {
          status: "live-blocked",
          diagnostic,
        },
      };
    }
  }

  return {
    currentPage: {
      status: "captured",
      url: snapshot.finalUrl,
      title: snapshot.title,
      snippet: snapshot.snippet,
      hasComposerSurface: snapshot.hasComposerSurface,
      classification: "workspace-ready",
      diagnostic:
        "The attached browser currently looks like an authenticated workspace. This is the live page check, not just stored artifact presence.",
    },
    liveReadiness: {
      status: "live-ready",
      diagnostic:
        "The attached browser currently looks like an authenticated workspace. Store materials and current page are aligned.",
    },
  };
}

function buildDiagnoseLadder(args: {
  provider: ProviderStatusView;
  attachTarget: ServiceProviderAttachTargetView;
  liveReadiness: ServiceProviderDebugSupportView["liveReadiness"];
  currentConsole: ServiceProviderCurrentConsoleView;
  currentNetwork: ServiceProviderCurrentNetworkView;
}): ServiceProviderDiagnoseStepView[] {
  const sessionArtifactStates =
    Object.fromEntries(
      (args.provider.session.artifactDetails ?? []).map((artifact) => [
        artifact.id,
        artifact.state,
      ]),
    ) || {};
  const qwenPermissionGateLikely =
    args.provider.provider === "qwen" &&
    args.liveReadiness.status === "live-blocked" &&
    (sessionArtifactStates["session-cookie"] === "present" ||
      sessionArtifactStates["session-cookie"] === "derived") &&
    (sessionArtifactStates["session-token"] === "present" ||
      sessionArtifactStates["session-token"] === "derived");

  return [
    {
      id: "check-store",
      status: "completed",
      summary: `${args.provider.displayName} store state = ${args.provider.session.state}; runtime readiness = ${args.provider.runtimeReadiness}.`,
    },
    {
      id: "check-attach-target",
      status: args.attachTarget.available ? "completed" : "blocked",
      summary: args.attachTarget.available
        ? `Canonical attach target is ${args.attachTarget.label} at ${args.attachTarget.cdpUrl}.`
        : args.attachTarget.note,
    },
    {
      id: "inspect-current-page",
      status: args.liveReadiness.status === "unknown" ? "blocked" : "completed",
      summary: qwenPermissionGateLikely
        ? `${args.liveReadiness.diagnostic} Qwen session material is already present, so the remaining work is likely a browser-side Unauthorized / permission gate in this same repo-owned browser.`
        : args.liveReadiness.diagnostic,
    },
    {
      id: "inspect-console-network",
      status: args.attachTarget.available ? "completed" : "blocked",
      summary: args.attachTarget.available
        ? `${args.currentConsole.diagnostic} ${args.currentNetwork.diagnostic}`
        : args.attachTarget.note,
    },
    {
      id: "rerun-provider-live-proof",
      status: "recommended",
      summary: `Run the provider-scoped live gate after the current page looks correct for ${args.provider.displayName}.`,
      command: `pnpm exec node scripts/verify-web-login-live.mjs --provider ${args.provider.provider}`,
    },
    {
      id: "repair-session",
      status: args.liveReadiness.status === "live-blocked" ? "recommended" : "completed",
      summary:
        args.liveReadiness.status === "live-blocked"
          ? qwenPermissionGateLikely
            ? `Stay in the same repo-owned browser, clear the remaining Qwen account or permission gate, then rerun the live gate.`
            : `Repair ${args.provider.displayName} in the managed browser first, then rerun the live gate.`
          : "The attached browser already looks ready; only rerun the live gate if you need fresh proof.",
      command: `pnpm run bootstrap:web-login-browser -- --provider ${args.provider.provider}`,
    },
  ];
}

function buildUnavailableSnapshots(diagnostic: string): CurrentBrowserSnapshot {
  return {
    currentPage: {
      status: "unavailable",
      diagnostic,
    },
    currentConsole: {
      status: "unavailable",
      entries: [],
      diagnostic,
    },
    currentNetwork: {
      status: "unavailable",
      entries: [],
      diagnostic,
    },
    liveReadiness: {
      status: "unknown",
      diagnostic,
    },
  };
}

async function inspectCurrentBrowserSnapshot(
  provider: ProviderStatusView,
  attachTarget: ServiceProviderAttachTargetView,
): Promise<CurrentBrowserSnapshot> {
  if (!attachTarget.available || !attachTarget.cdpUrl) {
    return buildUnavailableSnapshots(attachTarget.note);
  }

  try {
    const { page, currentConsole, currentNetwork } = await readCurrentPageCapture(
      attachTarget.cdpUrl,
      provider.provider,
    );
    const { currentPage, liveReadiness } = buildCurrentPageView(provider, page);

    return {
      currentPage,
      currentConsole,
      currentNetwork,
      liveReadiness,
    };
  } catch (error) {
    const diagnostic =
      error instanceof Error
        ? `WebaiBridge could not inspect the attached browser: ${error.message}`
        : "WebaiBridge could not inspect the attached browser.";

    return buildUnavailableSnapshots(diagnostic);
  }
}

export function createDefaultWebDebugSupportRunners(
  env: Record<string, string | undefined> = process.env,
): Partial<Record<ProviderStatusView["provider"], WebDebugSupportRunner>> {
  const createRunner = (providerId: ProviderStatusView["provider"]): WebDebugSupportRunner => {
    return async (provider) => {
      const attachTarget = resolveAttachTarget(provider, env);
      const browserSnapshot = await inspectCurrentBrowserSnapshot(provider, attachTarget);

      return {
        providerId,
        providerDisplayName: provider.displayName,
        auth: buildServiceProviderAuthView(provider),
        runtime: buildServiceProviderRuntimeView(provider),
        storeReadiness: {
          credentialState: provider.credentialState,
          runtimeReadiness: provider.runtimeReadiness,
          validationState: provider.session.validationState,
          note: STORE_READY_NOTE,
        },
        captureProvenance: provider.session.captureProvenance,
        persistenceAudit: provider.session.persistenceAudit,
        liveReadiness: browserSnapshot.liveReadiness,
        attachTarget,
        currentPage: browserSnapshot.currentPage,
        currentConsole: browserSnapshot.currentConsole,
        currentNetwork: browserSnapshot.currentNetwork,
        diagnoseLadder: buildDiagnoseLadder({
          provider,
          attachTarget,
          liveReadiness: browserSnapshot.liveReadiness,
          currentConsole: browserSnapshot.currentConsole,
          currentNetwork: browserSnapshot.currentNetwork,
        }),
        routes: buildServiceProviderRouteRefs(provider.provider),
      };
    };
  };

  return {
    chatgpt: createRunner("chatgpt"),
    gemini: createRunner("gemini"),
    claude: createRunner("claude"),
    grok: createRunner("grok"),
    qwen: createRunner("qwen"),
  };
}
