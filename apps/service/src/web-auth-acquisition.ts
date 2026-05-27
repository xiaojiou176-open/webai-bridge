import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  resolveLocalWebAuthStorePath,
  type StoredBrowserCaptureProvenance,
  type StoredBrowserPersistenceAudit,
  upsertStoredWebProviderSession,
  type StoredWebArtifactState,
  type StoredWebProviderSession,
} from "../../../packages/credentials/src/index.js";
import type {
  WebLiveProofResult,
  WebProviderId,
  WebSessionSnapshot,
} from "../../../packages/lanes/web/src/index.js";
import { WEB_PROVIDER_IDS } from "../../../packages/lanes/web/src/index.js";
import {
  createChatgptWebRuntime,
  runChatgptWebLiveProof,
} from "../../../packages/providers/web/chatgpt/src/index.js";
import { validateChatgptBrowserWorkspaceSnapshot } from "../../../packages/providers/web/chatgpt/src/browser-dom-transport.js";
import {
  GEMINI_WEB_CDP_URL_ENV_NAME,
  createGeminiWebRuntime,
  runGeminiWebLiveProof,
} from "../../../packages/providers/web/gemini/src/index.js";
import { validateGeminiBrowserWorkspaceSnapshot } from "../../../packages/providers/web/gemini/src/live-proof.js";
import {
  createClaudeWebRuntime,
  runClaudeWebLiveProof,
} from "../../../packages/providers/web/claude/src/index.js";
import {
  createGrokWebRuntime,
  runGrokWebLiveProof,
} from "../../../packages/providers/web/grok/src/index.js";
import {
  createQwenWebRuntime,
  QWEN_WEB_LIVE_PROOF_ENV_NAMES,
  QWEN_WEB_LIVE_PROOF_URL,
  runQwenWebLiveProof,
  validateQwenBrowserWorkspaceSnapshot,
} from "../../../packages/providers/web/qwen/src/index.js";
import type { SurfaceResponse } from "../../../packages/surfaces/http/src/http-surface.js";
import {
  bootstrapLocalWebAuthBrowser,
  LEGACY_EXISTING_CHROME_PROFILE_MODE,
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME,
  WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME,
  WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME,
  DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL,
  WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME,
  WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME,
  type WebAuthBrowserBootstrapFailure,
  type WebAuthBrowserBootstrapMode,
  normalizeWebAuthBrowserBootstrapMode,
  type WebAuthBrowserBootstrapRequest,
  type WebAuthBrowserBootstrapResult,
  type WebAuthBrowserBootstrapRunner,
} from "./browser-bootstrap.js";

export const WEB_AUTH_CDP_URL_ENV_NAME = WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME;
export const WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE";
const WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR";
const DEFAULT_MANAGED_PROFILE_DIRECTORY = "Default";
const QWEN_SESSION_TOKEN_COOKIE_NAMES = [
  "token",
  "session-token",
  "session_token",
  "atpsida",
] as const;
const QWEN_SESSION_TOKEN_STORAGE_KEYS = [
  "_bl_sid",
  "atpsida",
  "token",
  "session-token",
  "session_token",
] as const;

const PROVIDER_COOKIE_PERSISTENCE_SPECS = {
  chatgpt: {
    cookieBackedArtifacts: [
      {
        artifactId: "next-auth-session-token",
        cookieNames: [
          "__Secure-next-auth.session-token",
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ],
      },
    ],
  },
  gemini: {
    cookieBackedArtifacts: [
      {
        artifactId: "google-sid-cookie",
        cookieNames: ["SID"],
      },
      {
        artifactId: "google-secure-1psid",
        cookieNames: ["__Secure-1PSID"],
      },
    ],
  },
  claude: {
    cookieBackedArtifacts: [
      {
        artifactId: "claude-session-key",
        cookieNames: ["sessionKey"],
      },
    ],
  },
  grok: {
    cookieBackedArtifacts: [
      {
        artifactId: "session-cookie",
        cookieNames: ["sso", "sso-rw"],
      },
      {
        artifactId: "oauth-browser-session",
        cookieNames: ["x-userid"],
      },
    ],
  },
  qwen: {
    cookieBackedArtifacts: [
      {
        artifactId: "session-cookie",
        cookieNames: ["acw_tc", "sca"],
      },
      {
        artifactId: "session-token",
        cookieNames: [...QWEN_SESSION_TOKEN_COOKIE_NAMES],
      },
    ],
  },
} as const;

export interface WebAcquisitionModeDescriptor {
  id: WebAuthBrowserBootstrapMode;
  label: string;
  description: string;
  advanced: boolean;
  default: boolean;
}

export const WEB_ACQUISITION_MODE_OPTIONS: readonly WebAcquisitionModeDescriptor[] = [
  {
    id: WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
    label: "Use Isolated Chrome Root",
    description:
      "Reuse WebaiBridge's dedicated Chrome user-data root and single repo-owned profile, attaching to the same instance whenever it is already running.",
    advanced: true,
    default: true,
  },
  {
    id: "managed-browser",
    label: "Managed Browser",
    description:
      "Let WebaiBridge launch or reattach its dedicated fallback onboarding browser for login and capture.",
    advanced: false,
    default: false,
  },
  {
    id: "existing-browser-session",
    label: "Attach Existing Browser Session",
    description:
      "Attach to an already-running browser session when a reusable browser-session URL is available.",
    advanced: true,
    default: false,
  },
] as const;

export type WebAcquisitionRequest = WebAuthBrowserBootstrapRequest;

export interface WebAcquisitionStartResult {
  status: "ready-for-user-login" | "external-blocker" | "fallback-only";
  provider: WebProviderId;
  providerDisplayName: string;
  mode: WebAuthBrowserBootstrapMode;
  modeLabel: string;
  advanced: boolean;
  supported: boolean;
  loginUrl: string;
  summary: string;
  instructions: string;
  availableModes: readonly WebAcquisitionModeDescriptor[];
  browserTarget?: WebAuthBrowserBootstrapResult["browserTarget"];
  captureRequest?: WebAcquisitionRequest;
  runtimeEnv?: Record<string, string>;
  cdpUrl?: string;
  captureUrl?: string;
  fallbackReason?: string;
  blocker?: string;
  browser?: WebAuthBrowserBootstrapResult;
}

export interface WebAcquisitionCaptureResult {
  status:
    | "success"
    | "refreshable-but-degraded"
    | "user-action-required"
    | "external-blocker"
    | "fallback-only";
  provider: WebProviderId;
  providerDisplayName: string;
  mode: WebAuthBrowserBootstrapMode;
  modeLabel: string;
  advanced: boolean;
  supported: boolean;
  summary: string;
  availableModes: readonly WebAcquisitionModeDescriptor[];
  browserTarget?: WebAuthBrowserBootstrapResult["browserTarget"];
  session?: WebSessionSnapshot;
  liveProof?: WebLiveProofResult;
  storePath?: string;
  runtimeEnv?: Record<string, string>;
  blocker?: string;
  cdpUrl?: string;
}

export interface WebAcquisitionRunner {
  start(request?: WebAcquisitionRequest): Promise<WebAcquisitionStartResult>;
  capture(request?: WebAcquisitionRequest): Promise<WebAcquisitionCaptureResult>;
}

export type WebAcquisitionRunnerMap = Partial<Record<WebProviderId, WebAcquisitionRunner>>;

type AcquisitionProviderId = "chatgpt" | "gemini" | "claude" | "grok" | "qwen";

function nowIso() {
  return new Date().toISOString();
}

function normalizeAcquisitionMode(
  mode: string | undefined,
): WebAuthBrowserBootstrapMode | undefined {
  return normalizeWebAuthBrowserBootstrapMode(mode);
}

function isCiEnvironment(env: Record<string, string | undefined>) {
  return env.CI === "true" || env.GITHUB_ACTIONS === "true";
}

function resolveAcquisitionMode(
  request: WebAcquisitionRequest | undefined,
  env: Record<string, string | undefined> = process.env,
): WebAuthBrowserBootstrapMode {
  return (
    normalizeAcquisitionMode(request?.mode) ??
    normalizeAcquisitionMode(env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]) ??
    normalizeAcquisitionMode(env[WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE_ENV_NAME]) ??
    (!isCiEnvironment(env)
      ? WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      : undefined) ??
    "managed-browser"
  );
}

function getAcquisitionModeDescriptor(
  mode: WebAuthBrowserBootstrapMode,
): WebAcquisitionModeDescriptor {
  return (
    WEB_ACQUISITION_MODE_OPTIONS.find((entry) => entry.id === mode) ??
    WEB_ACQUISITION_MODE_OPTIONS[0]
  );
}

function buildBrowserTargetFromMode(
  mode: WebAuthBrowserBootstrapMode,
): WebAuthBrowserBootstrapResult["browserTarget"] {
  switch (mode) {
    case WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE:
      return {
        kind: "isolated-chrome-root",
        label: "Isolated Chrome root",
        summary:
          "Reuse WebaiBridge's dedicated Chrome user-data root and single repo-owned profile instead of the managed onboarding browser.",
      };
    case "existing-browser-session":
      return {
        kind: "attached-browser-session",
        label: "Existing browser session",
        summary:
          "Attach to a browser session that is already exposing a reusable browser-session URL.",
      };
    default:
      return {
        kind: "managed-onboarding-browser",
        label: "WebaiBridge onboarding browser",
        summary:
          "Let WebaiBridge manage a dedicated local onboarding browser for sign-in and capture.",
      };
  }
}

function quoteSqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildCaptureProvenance(
  mode: WebAuthBrowserBootstrapMode | typeof LEGACY_EXISTING_CHROME_PROFILE_MODE,
  env: Record<string, string | undefined>,
  cdpUrl: string,
): StoredBrowserCaptureProvenance {
  const normalizedMode =
    mode === LEGACY_EXISTING_CHROME_PROFILE_MODE
      ? WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      : mode;

  if (normalizedMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return {
      browserMode: normalizedMode,
      userDataDir:
        env[WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME] ??
        env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME],
      profileDirectory: DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
      profileName:
        env[WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME] ?? "webai-bridge",
      cdpUrl,
      capturedAt: nowIso(),
    };
  }

  if (normalizedMode === "managed-browser") {
    return {
      browserMode: normalizedMode,
      userDataDir:
        env[WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME] ??
        `${process.cwd()}/.runtime-cache/webai-bridge-web-auth-browser`,
      profileDirectory: DEFAULT_MANAGED_PROFILE_DIRECTORY,
      profileName: DEFAULT_MANAGED_PROFILE_DIRECTORY,
      cdpUrl,
      capturedAt: nowIso(),
    };
  }

  return {
    browserMode: normalizedMode,
    cdpUrl,
    capturedAt: nowIso(),
  };
}

function resolveCookieDbPath(
  provenance: StoredBrowserCaptureProvenance,
): string | undefined {
  if (!provenance.userDataDir) {
    return undefined;
  }

  return join(
    provenance.userDataDir,
    provenance.profileDirectory ?? DEFAULT_MANAGED_PROFILE_DIRECTORY,
    "Cookies",
  );
}

function buildCookieAuditSql(cookieNames: string[]) {
  return `SELECT name FROM cookies WHERE name IN (${cookieNames
    .map((cookieName) => quoteSqlLiteral(cookieName))
    .join(", ")}) ORDER BY name;`;
}

function resolveStrongerArtifactState(
  left: StoredWebArtifactState | undefined,
  right: StoredWebArtifactState | undefined,
): StoredWebArtifactState | undefined {
  if (left === "present" || right === "present") {
    return "present";
  }

  if (left === "derived" || right === "derived") {
    return "derived";
  }

  if (left === "missing" || right === "missing") {
    return "missing";
  }

  return undefined;
}

function mergeArtifactStateMaps(
  ...maps: Array<Record<string, StoredWebArtifactState> | undefined>
) {
  const merged: Record<string, StoredWebArtifactState> = {};

  for (const map of maps) {
    if (!map) {
      continue;
    }

    for (const [artifactId, artifactState] of Object.entries(map)) {
      const nextState = resolveStrongerArtifactState(
        merged[artifactId],
        artifactState,
      );

      if (nextState) {
        merged[artifactId] = nextState;
      }
    }
  }

  return merged;
}

function auditPersistentCookieArtifacts(
  provider: AcquisitionProviderId,
  provenance: StoredBrowserCaptureProvenance,
): {
  available: boolean;
  cookieDbPath?: string;
  matchedCookieNames: string[];
  artifactStates: Record<string, StoredWebArtifactState>;
} {
  const spec = PROVIDER_COOKIE_PERSISTENCE_SPECS[provider];
  const cookieDbPath = resolveCookieDbPath(provenance);

  if (!spec || !cookieDbPath || !existsSync(cookieDbPath)) {
    return {
      available: false,
      cookieDbPath,
      matchedCookieNames: [],
      artifactStates: {},
    };
  }

  const allCookieNames = spec.cookieBackedArtifacts.flatMap(
    (artifact) => artifact.cookieNames,
  );
  const result = spawnSync(
    "sqlite3",
    [cookieDbPath, buildCookieAuditSql(allCookieNames)],
    {
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    return {
      available: false,
      cookieDbPath,
      matchedCookieNames: [],
      artifactStates: {},
    };
  }

  const matchedCookieNames = `${result.stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const artifactStates = Object.fromEntries(
    spec.cookieBackedArtifacts.map((artifact) => [
      artifact.artifactId,
      artifact.cookieNames.some((cookieName) =>
        matchedCookieNames.includes(cookieName),
      )
        ? "present"
        : "missing",
    ]),
  ) as Record<string, StoredWebArtifactState>;

  return {
    available: true,
    cookieDbPath,
    matchedCookieNames,
    artifactStates,
  };
}

async function buildCurrentPageAudit(
  provider: AcquisitionProviderId,
  page: Page,
  context?: {
    artifactStates?: Record<string, StoredWebArtifactState>;
    liveProof?: WebLiveProofResult;
  },
): Promise<{
  pageUrl: string;
  pageTitle: string;
  workspaceClassification:
    | "workspace-ready"
    | "login-required"
    | "session-incomplete"
    | "human-verification-required"
    | "account-action-required"
    | "permission-gated"
    | "provider-adjacent";
  workspaceReady: boolean;
  reason: string;
}> {
  const pageUrl = page.url();
  const pageTitle =
    typeof page.title === "function"
      ? await Promise.resolve(page.title()).catch(() => "")
      : "";
  let snapshot: { bodyText?: string; hasComposerSurface?: boolean } | undefined;

  if (typeof page.evaluate === "function") {
    try {
      const nextSnapshot = await Promise.resolve(
        page.evaluate(() => ({
          bodyText: document.body?.innerText ?? "",
          hasComposerSurface: Boolean(
            document.querySelector("textarea, [contenteditable='true'], [role='textbox']"),
          ),
        })),
      );

      if (nextSnapshot && typeof nextSnapshot === "object") {
        snapshot = nextSnapshot as {
          bodyText?: string;
          hasComposerSurface?: boolean;
        };
      }
    } catch {
      snapshot = undefined;
    }
  }
  const bodyText =
    snapshot && typeof snapshot === "object" && "bodyText" in snapshot
      ? `${snapshot.bodyText ?? ""}`
      : "";
  const hasComposerSurface =
    Boolean(
      snapshot &&
        typeof snapshot === "object" &&
        "hasComposerSurface" in snapshot &&
        snapshot.hasComposerSurface,
    );

  if (provider === "chatgpt") {
    if (!bodyText && !pageTitle && !hasComposerSurface) {
      return {
        pageUrl,
        pageTitle,
        workspaceClassification: "provider-adjacent",
        workspaceReady: false,
        reason:
          "The attached browser page could not be introspected deeply enough to confirm a workspace, so persistence audit stayed best-effort.",
      };
    }

    const verdict = validateChatgptBrowserWorkspaceSnapshot({
      finalUrl: pageUrl,
      bodyText,
      hasComposerSurface,
    });
    return verdict.ok
      ? {
          pageUrl,
          pageTitle,
          workspaceClassification: "workspace-ready",
          workspaceReady: true,
          reason: "The attached browser is currently on a provider workspace URL, so the runtime has a plausible live-ready surface.",
        }
      : {
          pageUrl,
          pageTitle,
          workspaceClassification: "login-required",
          workspaceReady: false,
          reason: verdict.diagnostic,
        };
  }

  if (provider === "gemini") {
    const verdict = validateGeminiBrowserWorkspaceSnapshot({
      finalUrl: pageUrl,
      text: bodyText,
      hasComposerSurface,
    });
    return verdict.ok
      ? {
          pageUrl,
          pageTitle,
          workspaceClassification: "workspace-ready",
          workspaceReady: true,
          reason: "The attached browser is currently on a provider workspace URL, so the runtime has a plausible live-ready surface.",
        }
      : {
          pageUrl,
          pageTitle,
          workspaceClassification: "login-required",
          workspaceReady: false,
          reason: verdict.diagnostic,
        };
  }

  if (provider === "qwen") {
    const verdict = validateQwenBrowserWorkspaceSnapshot({
      finalUrl: pageUrl,
      text: bodyText,
      hasComposerSurface,
    });
    const liveProofText =
      context?.liveProof && "diagnostic" in context.liveProof && typeof context.liveProof.diagnostic === "string"
        ? context.liveProof.diagnostic
        : context?.liveProof && "summary" in context.liveProof && typeof context.liveProof.summary === "string"
          ? context.liveProof.summary
          : "";
    const lowerLiveProofDiagnostic = liveProofText.toLowerCase();
    const qwenSessionMaterialPresent =
      context?.artifactStates?.["session-cookie"] !== "missing" &&
      context?.artifactStates?.["session-token"] !== "missing";

    return verdict.ok
      ? {
          pageUrl,
          pageTitle,
          workspaceClassification: "workspace-ready",
          workspaceReady: true,
          reason: "The attached browser is currently on a provider workspace URL, so the runtime has a plausible live-ready surface.",
        }
      : {
          pageUrl,
          pageTitle,
          workspaceClassification:
            qwenSessionMaterialPresent &&
            (
              lowerLiveProofDiagnostic.includes("permission-gated") ||
              lowerLiveProofDiagnostic.includes("unauthorized")
            )
              ? "permission-gated"
              : "login-required",
          workspaceReady: false,
          reason:
            qwenSessionMaterialPresent &&
            (
              lowerLiveProofDiagnostic.includes("permission-gated") ||
              lowerLiveProofDiagnostic.includes("unauthorized")
            )
              ? "Qwen session material is already present, but the attached browser still needs the remaining browser-side permission gate to clear before the composer becomes live-ready."
              : verdict.diagnostic,
        };
  }

  if (provider === "grok") {
    const {
      captureGrokBrowserWorkspaceSnapshot,
      validateGrokBrowserWorkspaceSnapshot,
    } = await import(
      "../../../packages/providers/web/grok/src/live-proof.js"
    );
    const capturedGrokSnapshot = await captureGrokBrowserWorkspaceSnapshot(page).catch(
      () => undefined,
    );
    const grokSnapshot =
      capturedGrokSnapshot &&
      typeof capturedGrokSnapshot === "object" &&
      typeof capturedGrokSnapshot.finalUrl === "string" &&
      typeof capturedGrokSnapshot.bodyText === "string" &&
      typeof capturedGrokSnapshot.hasComposerSurface === "boolean"
        ? capturedGrokSnapshot
        : {
            finalUrl: pageUrl,
            bodyText,
            hasComposerSurface,
          };
    const verdict = validateGrokBrowserWorkspaceSnapshot({
      finalUrl: grokSnapshot.finalUrl,
      bodyText: grokSnapshot.bodyText,
      hasComposerSurface: grokSnapshot.hasComposerSurface,
    });
    return verdict.ok
      ? {
          pageUrl: grokSnapshot.finalUrl,
          pageTitle,
          workspaceClassification: "workspace-ready",
          workspaceReady: true,
          reason:
            "The attached browser is currently on an authenticated Grok workspace/composer surface.",
        }
      : {
          pageUrl: grokSnapshot.finalUrl,
          pageTitle,
          workspaceClassification:
            verdict.classification === "human-verification-required"
              ? "human-verification-required"
              : verdict.classification === "user-action-required"
                ? "account-action-required"
                : "session-incomplete",
          workspaceReady: false,
          reason: verdict.diagnostic,
        };
  }

  const lowerText = `${pageUrl}\n${pageTitle}\n${bodyText}`.toLowerCase();
  const loginSignals =
    provider === "claude"
      ? ["login", "log in", "sign in", "claude.ai/login", "登录"]
      : ["login", "log in", "sign in", "signup", "登录", "注册"];

  if (loginSignals.some((signal) => lowerText.includes(signal))) {
    return {
      pageUrl,
      pageTitle,
      workspaceClassification: "login-required",
      workspaceReady: false,
      reason:
        "Stored session materials exist, but the attached browser is still on a login or verification page. That is store-ready, not live-ready.",
    };
  }

  return {
    pageUrl,
    pageTitle,
    workspaceClassification:
      bodyText || pageTitle ? "workspace-ready" : "provider-adjacent",
    workspaceReady: Boolean(bodyText || pageTitle),
    reason:
      bodyText || pageTitle
        ? "The attached browser is currently on a provider workspace URL, so the runtime has a plausible live-ready surface."
        : "The attached browser page could not be introspected deeply enough to confirm a workspace, so persistence audit stayed best-effort.",
  };
}

function buildPersistenceAudit(
  source: "capture" | "verify",
  provenance: StoredBrowserCaptureProvenance,
  pageAudit: Awaited<ReturnType<typeof buildCurrentPageAudit>>,
  artifactStates: Record<string, StoredWebArtifactState>,
  diskAudit: ReturnType<typeof auditPersistentCookieArtifacts>,
  summary: string,
): StoredBrowserPersistenceAudit {
  return {
    source,
    checkedAt: provenance.capturedAt ?? nowIso(),
    browserMode: provenance.browserMode,
    userDataDir: provenance.userDataDir,
    profileDirectory: provenance.profileDirectory,
    profileName: provenance.profileName,
    cdpUrl: provenance.cdpUrl,
    pageUrl: pageAudit.pageUrl,
    pageTitle: pageAudit.pageTitle,
    workspaceClassification: pageAudit.workspaceClassification,
    workspaceReady: pageAudit.workspaceReady,
    cookieDbPath: diskAudit.cookieDbPath,
    cookieDbAvailable: diskAudit.available,
    matchedCookieNames: diskAudit.matchedCookieNames,
    artifactStates,
    summary,
  };
}

function finalizeCaptureCoherence(args: {
  status: Awaited<ReturnType<typeof buildCaptureStatus>>;
  pageAudit: Awaited<ReturnType<typeof buildCurrentPageAudit>>;
  artifactStates: Record<string, StoredWebArtifactState>;
  provenance: StoredBrowserCaptureProvenance;
  diskAudit: ReturnType<typeof auditPersistentCookieArtifacts>;
}) {
  if (
    args.pageAudit.workspaceClassification === "login-required" ||
    args.pageAudit.workspaceClassification === "session-incomplete" ||
    args.pageAudit.workspaceClassification === "human-verification-required" ||
    args.pageAudit.workspaceClassification === "account-action-required" ||
    args.pageAudit.workspaceClassification === "permission-gated" ||
    args.status.credentialState === "user-action-required" ||
    args.status.credentialState === "expired"
  ) {
    const summary =
      args.pageAudit.reason ??
      args.status.recommendedAction ??
      "The current browser session still needs explicit end-user recovery.";
    return {
      status: "user-action-required" as const,
      summary,
      persistenceAudit: buildPersistenceAudit(
        "capture",
        args.provenance,
        args.pageAudit,
        args.artifactStates,
        args.diskAudit,
        summary,
      ),
    };
  }

  if (
    args.pageAudit.workspaceClassification === "provider-adjacent" ||
    args.status.credentialState === "refreshable-but-degraded" ||
    args.status.credentialState === "expiring"
  ) {
    const summary =
      args.status.recommendedAction ??
      args.pageAudit.reason ??
      "The browser session is partially present but still needs refresh work before it should be trusted as stable.";
    return {
      status: "refreshable-but-degraded" as const,
      summary,
      persistenceAudit: buildPersistenceAudit(
        "capture",
        args.provenance,
        args.pageAudit,
        args.artifactStates,
        args.diskAudit,
        summary,
      ),
    };
  }

  const summary = "The captured browser session is live-ready and its critical provider cookies are now persisted on disk.";
  return {
    status: "ready" as const,
    summary,
    persistenceAudit: buildPersistenceAudit(
      "capture",
      args.provenance,
      args.pageAudit,
      args.artifactStates,
      args.diskAudit,
      summary,
    ),
  };
}

function buildAcquisitionRuntimeEnv(args: {
  provider: WebProviderId;
  mode: WebAuthBrowserBootstrapMode;
  cdpUrl?: string;
  request?: WebAcquisitionRequest;
}): Record<string, string> {
  const runtimeEnv: Record<string, string> = {
    [WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]: args.mode,
    [WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE_ENV_NAME]: args.mode,
  };

  if (args.cdpUrl) {
    runtimeEnv[WEB_AUTH_CDP_URL_ENV_NAME] = args.cdpUrl;

    if (args.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
      runtimeEnv[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME] = args.cdpUrl;
    }

    if (args.mode === "existing-browser-session") {
      runtimeEnv[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME] = args.cdpUrl;
    }

    if (args.provider === "gemini") {
      runtimeEnv[GEMINI_WEB_CDP_URL_ENV_NAME] = args.cdpUrl;
    }
  }

  if (args.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE && args.request?.existingChromeProfile?.userDataDir) {
    runtimeEnv[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME] =
      args.request.existingChromeProfile.userDataDir;
    runtimeEnv[WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME] =
      args.request.existingChromeProfile.userDataDir;
  }

  if (args.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE && args.request?.existingChromeProfile?.profileName) {
    runtimeEnv[WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME] =
      args.request.existingChromeProfile.profileName;
  }

  return runtimeEnv;
}

function buildCaptureRequest(
  mode: WebAuthBrowserBootstrapMode,
  browser: WebAuthBrowserBootstrapResult,
  request: WebAcquisitionRequest | undefined,
): WebAcquisitionRequest {
  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return {
      mode,
      existingChromeProfile: {
        ...request?.existingChromeProfile,
        cdpUrl:
          request?.existingChromeProfile?.cdpUrl ??
          browser.cdpUrl ??
          WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL,
        userDataDir: request?.existingChromeProfile?.userDataDir ?? browser.userDataDir,
        profileName:
          request?.existingChromeProfile?.profileName ?? browser.profileName,
        browserPath: request?.existingChromeProfile?.browserPath ?? browser.browserPath,
      },
    };
  }

  if (mode === "existing-browser-session") {
    return {
      mode,
      existingBrowserSession: {
        sessionUrl:
          request?.existingBrowserSession?.sessionUrl ??
          browser.cdpUrl ??
          WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
      },
    };
  }

  return {
    mode,
  };
}

function buildStartInstructions(args: {
  mode: WebAuthBrowserBootstrapMode;
  providerDisplayName: string;
  loginUrl: string;
  loginOpened: boolean;
}): string {
  if (args.mode === "managed-browser") {
    return args.loginOpened
      ? `Switch to the WebaiBridge onboarding browser, finish the ${args.providerDisplayName} sign-in there, then return here and click Capture Session.`
      : `WebaiBridge attached the managed onboarding browser. If the ${args.providerDisplayName} page did not open automatically, open ${args.loginUrl} there before you click Capture Session.`;
  }

  if (args.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return args.loginOpened
      ? `Switch to the repo-owned Chrome window that uses the isolated root, confirm ${args.providerDisplayName} is signed in there, then return and click Capture Session.`
      : `WebaiBridge attached the isolated repo Chrome session. If the ${args.providerDisplayName} page is not already open, open ${args.loginUrl} in that same Chrome window before you click Capture Session.`;
  }

  return `WebaiBridge attached your existing browser session. If ${args.providerDisplayName} is not already open there, open ${args.loginUrl} in that same browser session before you click Capture Session.`;
}

function resolveWebAuthCdpUrl(env: Record<string, string | undefined> = process.env) {
  const browserMode = env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]?.trim();

  return (
    env[WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    (browserMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
      : undefined) ||
    (browserMode === "existing-browser-session"
      ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME]?.trim()
      : undefined) ||
    env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim() ||
    WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL
  );
}

function resolveCaptureCdpUrl(args: {
  provider: AcquisitionProviderId;
  mode: WebAuthBrowserBootstrapMode;
  env: Record<string, string | undefined>;
  request?: WebAcquisitionRequest;
}) {
  const explicitSessionUrl = args.request?.existingBrowserSession?.sessionUrl?.trim();

  if (explicitSessionUrl) {
    return explicitSessionUrl;
  }

  const explicitProfileCdpUrl = args.request?.existingChromeProfile?.cdpUrl?.trim();

  if (explicitProfileCdpUrl) {
    return explicitProfileCdpUrl;
  }

  if (args.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return (
      args.env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
      (args.provider === "gemini"
        ? args.env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()
        : undefined) ||
      args.env[WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
      WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
    );
  }

  if (args.mode === "existing-browser-session") {
    return (
      args.env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME]?.trim() ||
      args.env[WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
      (args.provider === "gemini"
        ? args.env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()
        : undefined) ||
      WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL
    );
  }

  return (
    (args.provider === "gemini"
      ? args.env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()
      : undefined) ||
    args.env[WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL
  );
}

function resolveCaptureEnv(
  provider: AcquisitionProviderId,
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Record<string, string | undefined> {
  const mode = resolveAcquisitionMode(request, env);
  const cdpUrl = resolveCaptureCdpUrl({
    provider,
    mode,
    env,
    request,
  });
  const merged: Record<string, string | undefined> = {
    ...env,
    ...buildAcquisitionRuntimeEnv({
      provider,
      mode,
      cdpUrl,
      request,
    }),
  };

  return merged;
}

function isBrowserCdpUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return [
    "connectovercdp",
    "econnrefused",
    "cdp",
    "chrome context",
    "browser context",
    "no chrome context",
  ].some((needle) => normalized.includes(needle));
}

function getBootstrapFailureCode(error: unknown): string | undefined {
  return (error as WebAuthBrowserBootstrapFailure | undefined)?.code;
}

function buildStartBlocker(
  provider: WebProviderId,
  mode: WebAuthBrowserBootstrapMode,
  error: unknown,
): string {
  const code = getBootstrapFailureCode(error);

  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    switch (code) {
      case "credentialed-workstation-only":
        return `${provider}-credentialed-workstation-only`;
      case "existing-profile-locked":
        return `${provider}-existing-profile-locked`;
      case "endpoint-not-devtools":
        return `${provider}-existing-profile-not-devtools`;
      case "cdp-unreachable":
        return `${provider}-existing-profile-cdp-unavailable`;
      case "existing-profile-missing":
        return `${provider}-existing-profile-missing`;
      default:
        return `${provider}-existing-profile-unavailable`;
    }
  }

  if (mode === "existing-browser-session") {
    switch (code) {
      case "credentialed-workstation-only":
        return `${provider}-credentialed-workstation-only`;
      case "endpoint-not-devtools":
        return `${provider}-existing-browser-session-not-devtools`;
      case "cdp-unreachable":
        return `${provider}-existing-browser-session-unreachable`;
      case "existing-browser-session-missing":
        return `${provider}-existing-browser-session-missing`;
      default:
        return `${provider}-existing-browser-session-unavailable`;
    }
  }

  return `${provider}-browser-bootstrap-failed`;
}

function buildCaptureBlocker(
  provider: AcquisitionProviderId,
  mode: WebAuthBrowserBootstrapMode,
  error: unknown,
): string {
  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    const code = getBootstrapFailureCode(error);

    switch (code) {
      case "credentialed-workstation-only":
        return `${provider}-credentialed-workstation-only`;
      case "existing-profile-locked":
        return `${provider}-existing-profile-locked`;
      case "endpoint-not-devtools":
        return `${provider}-existing-profile-not-devtools`;
      default:
        return isBrowserCdpUnavailableError(error)
          ? `${provider}-existing-profile-cdp-unavailable`
          : `${provider}-existing-profile-not-reusable`;
    }
  }

  if (mode === "existing-browser-session") {
    const code = getBootstrapFailureCode(error);

    switch (code) {
      case "credentialed-workstation-only":
        return `${provider}-credentialed-workstation-only`;
      case "endpoint-not-devtools":
        return `${provider}-existing-browser-session-not-devtools`;
      case "existing-browser-session-missing":
        return `${provider}-existing-browser-session-missing`;
      default:
        return isBrowserCdpUnavailableError(error)
          ? `${provider}-existing-browser-session-unreachable`
          : `${provider}-existing-browser-session-not-reusable`;
    }
  }

  return `${provider}-browser-cdp-unavailable`;
}

function buildCaptureFailureSummary(
  providerDisplayName: string,
  mode: WebAuthBrowserBootstrapMode,
  error: unknown,
): string {
  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    const code = getBootstrapFailureCode(error);

    if (code === "credentialed-workstation-only") {
      return "WebaiBridge only allows credentialed browser login flows on a local workstation. Cloud CI must stay on repo-side gates only.";
    }

    if (code === "existing-profile-locked") {
      return "WebaiBridge found your regular Chrome profile, but Chrome is still using it. Close Chrome first, or switch to Attach Existing Browser Session.";
    }

    if (code === "existing-profile-missing") {
      return "WebaiBridge isolated Chrome root is not ready yet. Seed the dedicated Chrome root first, then retry.";
    }

    if (code === "endpoint-not-devtools") {
      return "WebaiBridge reached the requested Chrome profile endpoint, but it was not a reusable browser-debug session.";
    }

    if (isBrowserCdpUnavailableError(error)) {
      return "WebaiBridge could not reopen your existing Chrome profile as a reusable browser session. Confirm the profile is not locked, then retry.";
    }

    return `${providerDisplayName} could not reuse the selected Chrome profile.`;
  }

  if (mode === "existing-browser-session") {
    const code = getBootstrapFailureCode(error);

    if (code === "credentialed-workstation-only") {
      return "WebaiBridge only allows credentialed browser login flows on a local workstation. Cloud CI must stay on repo-side gates only.";
    }

    if (code === "endpoint-not-devtools") {
      return "WebaiBridge reached that browser session URL, but it is not a reusable browser-debug session.";
    }

    if (isBrowserCdpUnavailableError(error) || code === "existing-browser-session-missing") {
      return "WebaiBridge could not attach to the existing browser session. Confirm the browser is still running and sharing a reusable session URL, then retry.";
    }

    return `${providerDisplayName} could not reuse the attached browser session.`;
  }

  return isBrowserCdpUnavailableError(error)
    ? "WebaiBridge could not reach the managed local onboarding browser. Click Start Login first so it can launch or reattach the browser, then retry Capture Session."
    : error instanceof Error
      ? error.message
      : `${providerDisplayName} acquisition failed unexpectedly.`;
}

function joinCookieBundle(
  cookies: Array<{ name: string; value: string }>,
): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function hasCookie(
  cookies: Array<{ name: string }>,
  names: readonly string[],
): boolean {
  return cookies.some((cookie) => names.includes(cookie.name));
}

function pickCookieBundle(
  cookies: Array<{ name: string; value: string; domain?: string }>,
  domainNeedles: readonly string[],
): string {
  const filtered = cookies.filter((cookie) =>
    domainNeedles.some((needle) => cookie.domain?.includes(needle)),
  );

  return joinCookieBundle(filtered);
}

async function withBrowserContext<T>(
  env: Record<string, string | undefined>,
  run: (args: { context: BrowserContext; cdpUrl: string }) => Promise<T>,
): Promise<T> {
  const cdpUrl = resolveWebAuthCdpUrl(env);
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    return await run({
      context,
      cdpUrl,
    });
  } finally {
    await browser.close();
  }
}

async function ensurePage(context: BrowserContext, url: string): Promise<Page> {
  const existing = context.pages().find((page) => page.url().includes(new URL(url).host));

  if (existing) {
    await existing.goto(url, {
      waitUntil: "domcontentloaded",
    });
    return existing;
  }

  const page = await context.newPage();
  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
  return page;
}

async function resolveUserAgent(page: Page): Promise<string> {
  return page.evaluate(() => navigator.userAgent);
}

function buildQwenLiveProofEnvStatus(
  runtimeEnv: Record<string, string>,
): WebLiveProofResult["envStatus"] {
  return QWEN_WEB_LIVE_PROOF_ENV_NAMES.map((name) => ({
    name,
    present: Boolean(runtimeEnv[name]?.trim()),
  }));
}

async function runQwenBrowserWorkspaceProof(
  page: Page,
  runtimeEnv: Record<string, string>,
): Promise<WebLiveProofResult> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 2_000 });
  } catch {
    // Best effort only. Some SPA transitions never settle cleanly.
  }

  const snapshot = await page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      document: {
        body: { innerText?: string } | null;
        title?: string;
        querySelector(selector: string): unknown;
      };
      location?: { href?: string };
    };
    const bodyText = browserGlobal.document.body?.innerText ?? "";
    const title = browserGlobal.document.title ?? "";
    const hasComposerSurface = Boolean(
      browserGlobal.document.querySelector("textarea, [contenteditable='true'], [role='textbox']"),
    );

    return {
      url: browserGlobal.location?.href ?? "",
      bodyText,
      title,
      hasComposerSurface,
    };
  });
  const envStatus = buildQwenLiveProofEnvStatus(runtimeEnv);
  const verdict = validateQwenBrowserWorkspaceSnapshot({
    finalUrl: snapshot.url || QWEN_WEB_LIVE_PROOF_URL,
    text: `${snapshot.title}\n${snapshot.bodyText}`,
    hasComposerSurface: snapshot.hasComposerSurface,
  });

  if (!verdict.ok) {
    return {
      status: "failure",
      provider: "qwen",
      probeUrl: QWEN_WEB_LIVE_PROOF_URL,
      finalUrl: snapshot.url || QWEN_WEB_LIVE_PROOF_URL,
      reason: "probe-unexpected-body",
      diagnostic: verdict.diagnostic,
      summary: verdict.summary,
      envStatus,
    };
  }

  return {
    status: "success",
    provider: "qwen",
    probeUrl: QWEN_WEB_LIVE_PROOF_URL,
    finalUrl: snapshot.url || QWEN_WEB_LIVE_PROOF_URL,
    responseStatus: 200,
    responseKind: "html",
    signal: `${verdict.signal}-browser-dom`,
    summary: "Qwen workspace/composer page looked authenticated in the attached browser session.",
    envStatus,
  };
}

function findCookieValue(
  cookies: Array<{ name: string; value: string }>,
  namePattern: RegExp,
): string | undefined {
  return cookies.find((cookie) => namePattern.test(cookie.name))?.value;
}

function findCookieMatch(
  cookies: Array<{ name: string; value: string }>,
  predicate: (cookie: { name: string; value: string }) => boolean,
) {
  return cookies.find(predicate);
}

type QwenSessionTokenCapture = {
  value: string;
  source: "cookie" | "storage";
};

async function resolveQwenSessionToken(
  page: Page,
  cookies: Array<{ name: string; value: string }>,
): Promise<QwenSessionTokenCapture | undefined> {
  const exactCookieToken = findCookieMatch(cookies, (cookie) =>
    QWEN_SESSION_TOKEN_COOKIE_NAMES.some(
      (name) => cookie.name.toLowerCase() === name.toLowerCase(),
    ),
  );

  if (exactCookieToken?.value.trim()) {
    return {
      value: exactCookieToken.value.trim(),
      source: "cookie",
    };
  }

  const looseCookieToken = findCookieValue(cookies, /(session|token|auth)/i);

  if (looseCookieToken) {
    return {
      value: looseCookieToken,
      source: "cookie",
    };
  }

  const storageToken = await page.evaluate((exactPriorityKeys) => {
    type BrowserStorage = {
      length: number;
      key(index: number): string | null;
      getItem(key: string): string | null;
    };
    const browserGlobal = globalThis as typeof globalThis & {
      localStorage: BrowserStorage;
      sessionStorage: BrowserStorage;
    };
    const storages = [browserGlobal.localStorage, browserGlobal.sessionStorage];

    for (const storage of storages) {
      for (const key of exactPriorityKeys) {
        const value = storage.getItem(key)?.trim();

        if (value) {
          return value;
        }
      }
    }

    for (const storage of storages) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);

        if (!key || !/(session|token|auth)/i.test(key)) {
          continue;
        }

        const value = storage.getItem(key)?.trim();

        if (value) {
          return value;
        }
      }
    }

    return undefined;
  }, [...QWEN_SESSION_TOKEN_STORAGE_KEYS]);

  return storageToken
    ? {
        value: storageToken,
        source: "storage",
      }
    : undefined;
}

async function buildCaptureStatus(args: {
  provider: AcquisitionProviderId;
  runtimeEnv: Record<string, string>;
  artifactStates: Record<string, StoredWebArtifactState>;
  accountLabel: string;
  sessionSource: string;
  note: string;
}) {
  const runtimeFactory = {
    chatgpt: createChatgptWebRuntime,
    gemini: createGeminiWebRuntime,
    claude: createClaudeWebRuntime,
    grok: createGrokWebRuntime,
    qwen: createQwenWebRuntime,
  } as const;

  const runtime = runtimeFactory[args.provider]();
  const status = await runtime.getStatus({
    env: args.runtimeEnv,
    sessions: {
      [args.provider]: {
        state: "ready",
        accountLabel: args.accountLabel,
        sessionSource: args.sessionSource,
        lastValidatedAt: nowIso(),
        artifactStates: args.artifactStates,
        note: args.note,
      },
    },
  });

  return {
    ...status,
    session: {
      ...status.session,
      accountLabel: args.accountLabel,
      sessionSource: args.sessionSource,
      artifactStates: args.artifactStates,
      note: args.note,
      lastValidatedAt: status.session?.lastValidatedAt ?? nowIso(),
    },
  };
}

function isLiveProofUserAction(result: WebLiveProofResult): boolean {
  if (result.status === "external-blocker") {
    return true;
  }

  if (result.status !== "failure") {
    return false;
  }

  return (result.responseStatus ?? 0) < 500;
}

function shouldUseQwenBrowserFallback(result: WebLiveProofResult): boolean {
  if (result.status === "success" || result.status === "external-blocker") {
    return false;
  }

  const lowerDiagnostic = `${result.diagnostic ?? result.summary ?? ""}`.toLowerCase();

  if (
    result.classification === "user-action-required" ||
    lowerDiagnostic.includes("permission-gated") ||
    lowerDiagnostic.includes("unauthorized")
  ) {
    return false;
  }

  return true;
}

function buildBlockedCaptureResult(args: {
  provider: AcquisitionProviderId;
  providerDisplayName: string;
  mode: WebAuthBrowserBootstrapMode;
  liveProof?: WebLiveProofResult;
  summary: string;
  blocker?: string;
  cdpUrl?: string;
  status: WebAcquisitionCaptureResult["status"];
  browserTarget?: WebAuthBrowserBootstrapResult["browserTarget"];
}): WebAcquisitionCaptureResult {
  const modeDescriptor = getAcquisitionModeDescriptor(args.mode);

  return {
    status: args.status,
    provider: args.provider,
    providerDisplayName: args.providerDisplayName,
    mode: args.mode,
    modeLabel: modeDescriptor.label,
    advanced: modeDescriptor.advanced,
    supported: true,
    summary: args.summary,
    availableModes: WEB_ACQUISITION_MODE_OPTIONS,
    browserTarget: args.browserTarget,
    liveProof: args.liveProof,
    blocker: args.blocker,
    cdpUrl: args.cdpUrl,
  };
}

function mapCaptureCoherenceStatus(
  status: "ready" | "refreshable-but-degraded" | "user-action-required",
): WebAcquisitionCaptureResult["status"] {
  if (status === "refreshable-but-degraded") {
    return "refreshable-but-degraded";
  }

  if (status === "user-action-required") {
    return "user-action-required";
  }

  return "success";
}

function buildBrowserUnavailableCaptureResult(args: {
  provider: AcquisitionProviderId;
  providerDisplayName: string;
  env: Record<string, string | undefined>;
  mode: WebAuthBrowserBootstrapMode;
  error: unknown;
  browserTarget?: WebAuthBrowserBootstrapResult["browserTarget"];
}): WebAcquisitionCaptureResult {
  const modeDescriptor = getAcquisitionModeDescriptor(args.mode);

  return {
    status: "external-blocker",
    provider: args.provider,
    providerDisplayName: args.providerDisplayName,
    mode: args.mode,
    modeLabel: modeDescriptor.label,
    advanced: modeDescriptor.advanced,
    supported: true,
    blocker: buildCaptureBlocker(args.provider, args.mode, args.error),
    cdpUrl: resolveWebAuthCdpUrl(args.env),
    summary: buildCaptureFailureSummary(args.providerDisplayName, args.mode, args.error),
    availableModes: WEB_ACQUISITION_MODE_OPTIONS,
    browserTarget: args.browserTarget,
  };
}

function persistStoredSession(
  record: StoredWebProviderSession,
  env: Record<string, string | undefined>,
): string {
  upsertStoredWebProviderSession(record, env);
  return resolveLocalWebAuthStorePath(env);
}

function toStoredRecord(args: {
  provider: AcquisitionProviderId;
  mode: WebAuthBrowserBootstrapMode;
  session: WebSessionSnapshot;
  runtimeEnv: Record<string, string>;
  captureProvenance?: StoredBrowserCaptureProvenance;
  persistenceAudit?: StoredBrowserPersistenceAudit;
}): StoredWebProviderSession {
  return {
    providerId: args.provider,
    state: args.session.state,
    acquisitionMode: args.mode,
    accountLabel: args.session.accountLabel,
    sessionSource: args.session.sessionSource,
    lastValidatedAt: args.session.lastValidatedAt,
    expiresAt: args.session.expiresAt,
    refreshEligible: args.session.refreshEligible,
    requiredUserAction: args.session.requiredUserAction,
    degradedReason: args.session.degradedReason,
    artifactStates: args.session.artifactStates,
    captureProvenance: args.captureProvenance ?? args.session.captureProvenance,
    persistenceAudit: args.persistenceAudit ?? args.session.persistenceAudit,
    note: args.session.note,
    runtimeEnv: args.runtimeEnv,
    updatedAt: nowIso(),
    source: "local-auth-portal",
  };
}

async function captureChatgptAcquisition(
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionCaptureResult> {
  const providerDisplayName = "ChatGPT Web";
  const acquisitionEnv = resolveCaptureEnv("chatgpt", env, request);
  const mode = resolveAcquisitionMode(request, acquisitionEnv);
  const browserTarget = buildBrowserTargetFromMode(mode);

  try {
    return await withBrowserContext(acquisitionEnv, async ({ context, cdpUrl }) => {
      const page = await ensurePage(context, "https://chatgpt.com");
      const userAgent = await resolveUserAgent(page);
      const cookies = await context.cookies(["https://chatgpt.com", "https://openai.com"]);
      const cookieBundle = pickCookieBundle(cookies, ["chatgpt.com", "openai.com"]);
      const runtimeEnv = {
        ...buildAcquisitionRuntimeEnv({
          provider: "chatgpt",
          mode,
          cdpUrl,
          request,
        }),
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: cdpUrl,
        WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: cookieBundle,
        WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: userAgent,
      };
      const liveProof = await runChatgptWebLiveProof(runtimeEnv, fetch);

      if (liveProof.status !== "success") {
        return buildBlockedCaptureResult({
          provider: "chatgpt",
          providerDisplayName,
          mode,
          liveProof,
          browserTarget,
          cdpUrl,
          status: isLiveProofUserAction(liveProof) ? "user-action-required" : "external-blocker",
          blocker: isLiveProofUserAction(liveProof) ? "finish-chatgpt-login" : "chatgpt-upstream-unavailable",
          summary:
            liveProof.status === "failure" && liveProof.summary
              ? liveProof.summary
              : "先在本地浏览器里完成 ChatGPT 登录，再重新点击 Capture。",
        });
      }

      const sessionResponse = await fetch("https://chatgpt.com/api/auth/session", {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          cookie: cookieBundle,
          "user-agent": userAgent,
        },
      });
      const sessionJson = sessionResponse.ok
        ? ((await sessionResponse.json()) as { user?: { email?: string; name?: string }; accessToken?: string })
        : undefined;
      const accountLabel =
        sessionJson?.user?.email ??
        sessionJson?.user?.name ??
        "chatgpt:local-browser";
      const artifactStates: Record<string, StoredWebArtifactState> = {
        "next-auth-session-token": hasCookie(cookies, [
          "__Secure-next-auth.session-token",
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ])
          ? "present"
          : "missing",
        "openai-access-token":
          typeof sessionJson?.accessToken === "string" && sessionJson.accessToken.length > 0
            ? "present"
            : "missing",
      };
      const captureProvenance = buildCaptureProvenance(
        mode,
        acquisitionEnv,
        cdpUrl,
      );
      const diskAudit = auditPersistentCookieArtifacts(
        "chatgpt",
        captureProvenance,
      );
      const mergedArtifactStates = mergeArtifactStateMaps(
        artifactStates,
        diskAudit.artifactStates,
      );
      const status = await buildCaptureStatus({
        provider: "chatgpt",
        runtimeEnv,
        artifactStates: mergedArtifactStates,
        accountLabel,
        sessionSource: "chatgpt-browser-profile",
        note: "Captured via local auth portal acquisition.",
      });
      const pageAudit = await buildCurrentPageAudit("chatgpt", page);
      const coherence = finalizeCaptureCoherence({
        status,
        pageAudit,
        artifactStates: mergedArtifactStates,
        provenance: captureProvenance,
        diskAudit,
      });
      const finalSession = {
        ...status.session,
        state: coherence.status,
        acquisitionMode: mode,
        artifactStates: mergedArtifactStates,
        captureProvenance,
        persistenceAudit: coherence.persistenceAudit,
        requiredUserAction:
          coherence.status === "user-action-required"
            ? status.session.requiredUserAction ?? coherence.summary
            : status.session.requiredUserAction,
        degradedReason:
          coherence.status === "ready"
            ? status.session.degradedReason
            : coherence.summary,
      };

      const storePath = persistStoredSession(
        toStoredRecord({
          provider: "chatgpt",
          mode,
          session: finalSession,
          runtimeEnv,
          captureProvenance,
          persistenceAudit: coherence.persistenceAudit,
        }),
        env,
      );

      return {
        status: mapCaptureCoherenceStatus(coherence.status),
        provider: "chatgpt",
        providerDisplayName,
        mode,
        modeLabel: getAcquisitionModeDescriptor(mode).label,
        advanced: getAcquisitionModeDescriptor(mode).advanced,
        supported: true,
        summary: coherence.summary,
        availableModes: WEB_ACQUISITION_MODE_OPTIONS,
        browserTarget,
        session: finalSession,
        liveProof,
        storePath,
        runtimeEnv,
        cdpUrl,
      };
    });
  } catch (error) {
    return buildBrowserUnavailableCaptureResult({
      provider: "chatgpt",
      providerDisplayName,
      env: acquisitionEnv,
      mode,
      error,
      browserTarget,
    });
  }
}

async function captureGeminiAcquisition(
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionCaptureResult> {
  const providerDisplayName = "Gemini Web";
  const acquisitionEnv = resolveCaptureEnv("gemini", env, request);
  const mode = resolveAcquisitionMode(request, acquisitionEnv);
  const browserTarget = buildBrowserTargetFromMode(mode);

  try {
    return await withBrowserContext(acquisitionEnv, async ({ context, cdpUrl }) => {
      const page = await ensurePage(context, "https://gemini.google.com/app");
      const userAgent = await resolveUserAgent(page);
      const cookies = await context.cookies([
        "https://gemini.google.com/app",
        "https://google.com",
        "https://accounts.google.com",
      ]);
      const cookieBundle = pickCookieBundle(cookies, ["google.com", "googleusercontent.com"]);
      const runtimeEnv = {
        ...buildAcquisitionRuntimeEnv({
          provider: "gemini",
          mode,
          cdpUrl,
          request,
        }),
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: cdpUrl,
        WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: cookieBundle,
        WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: userAgent,
        WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: cdpUrl,
      };
      const liveProof = await runGeminiWebLiveProof(runtimeEnv, fetch);

      if (liveProof.status !== "success") {
        return buildBlockedCaptureResult({
          provider: "gemini",
          providerDisplayName,
          mode,
          liveProof,
          browserTarget,
          cdpUrl,
          status: isLiveProofUserAction(liveProof) ? "user-action-required" : "external-blocker",
          blocker: isLiveProofUserAction(liveProof) ? "finish-gemini-login" : "gemini-upstream-unavailable",
          summary:
            liveProof.status === "failure" && liveProof.summary
              ? liveProof.summary
              : "先在本地浏览器里完成 Gemini 登录，再重新点击 Capture。",
        });
      }

      const artifactStates: Record<string, StoredWebArtifactState> = {
        "google-sid-cookie": hasCookie(cookies, ["SID"]) ? "present" : "missing",
        "google-secure-1psid": hasCookie(cookies, ["__Secure-1PSID"]) ? "present" : "missing",
      };
      const captureProvenance = buildCaptureProvenance(
        mode,
        acquisitionEnv,
        cdpUrl,
      );
      const diskAudit = auditPersistentCookieArtifacts(
        "gemini",
        captureProvenance,
      );
      const mergedArtifactStates = mergeArtifactStateMaps(
        artifactStates,
        diskAudit.artifactStates,
      );
      const status = await buildCaptureStatus({
        provider: "gemini",
        runtimeEnv,
        artifactStates: mergedArtifactStates,
        accountLabel: "gemini:local-browser",
        sessionSource: "gemini-google-oauth",
        note: "Captured via local auth portal acquisition.",
      });
      const pageAudit = await buildCurrentPageAudit("gemini", page);
      const coherence = finalizeCaptureCoherence({
        status,
        pageAudit,
        artifactStates: mergedArtifactStates,
        provenance: captureProvenance,
        diskAudit,
      });
      const finalSession = {
        ...status.session,
        acquisitionMode: mode,
        artifactStates: mergedArtifactStates,
        captureProvenance,
        persistenceAudit: coherence.persistenceAudit,
      };

      const storePath = persistStoredSession(
        toStoredRecord({
          provider: "gemini",
          mode,
          session: finalSession,
          runtimeEnv,
          captureProvenance,
          persistenceAudit: coherence.persistenceAudit,
        }),
        env,
      );

      return {
        status: mapCaptureCoherenceStatus(coherence.status),
        provider: "gemini",
        providerDisplayName,
        mode,
        modeLabel: getAcquisitionModeDescriptor(mode).label,
        advanced: getAcquisitionModeDescriptor(mode).advanced,
        supported: true,
        summary: coherence.summary,
        availableModes: WEB_ACQUISITION_MODE_OPTIONS,
        browserTarget,
        session: finalSession,
        liveProof,
        storePath,
        runtimeEnv,
        cdpUrl,
      };
    });
  } catch (error) {
    return buildBrowserUnavailableCaptureResult({
      provider: "gemini",
      providerDisplayName,
      env: acquisitionEnv,
      mode,
      error,
      browserTarget,
    });
  }
}

async function captureClaudeAcquisition(
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionCaptureResult> {
  const providerDisplayName = "Claude Web";
  const acquisitionEnv = resolveCaptureEnv("claude", env, request);
  const mode = resolveAcquisitionMode(request, acquisitionEnv);
  const browserTarget = buildBrowserTargetFromMode(mode);

  try {
    return await withBrowserContext(acquisitionEnv, async ({ context, cdpUrl }) => {
      const page = await ensurePage(context, "https://claude.ai/new");
      const userAgent = await resolveUserAgent(page);
      const cookies = await context.cookies(["https://claude.ai/new"]);
      const cookieBundle = pickCookieBundle(cookies, ["claude.ai"]);
      const runtimeEnv = {
        ...buildAcquisitionRuntimeEnv({
          provider: "claude",
          mode,
          cdpUrl,
          request,
        }),
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: cdpUrl,
        WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: cookieBundle,
        WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT: userAgent,
      };
      const liveProof = await runClaudeWebLiveProof(runtimeEnv, fetch);

      if (liveProof.status !== "success") {
        return buildBlockedCaptureResult({
          provider: "claude",
          providerDisplayName,
          mode,
          liveProof,
          browserTarget,
          cdpUrl,
          status: isLiveProofUserAction(liveProof) ? "user-action-required" : "external-blocker",
          blocker: isLiveProofUserAction(liveProof) ? "finish-claude-login" : "claude-upstream-unavailable",
          summary:
            liveProof.status === "failure" && liveProof.summary
              ? liveProof.summary
              : "先在本地浏览器里完成 Claude 登录，再重新点击 Capture。",
        });
      }

      const organizationsResponse = await fetch("https://claude.ai/api/organizations", {
        method: "GET",
        headers: {
          accept: "application/json",
          cookie: cookieBundle,
          "user-agent": userAgent,
        },
      });
      const organizations = organizationsResponse.ok
        ? ((await organizationsResponse.json()) as Array<{ uuid?: string }>)
        : [];
      const organizationId = organizations[0]?.uuid;
      const artifactStates: Record<string, StoredWebArtifactState> = {
        "claude-session-key": hasCookie(cookies, ["sessionKey"]) ? "present" : "missing",
        "organization-id": organizationId ? "present" : "missing",
      };
      const captureProvenance = buildCaptureProvenance(
        mode,
        acquisitionEnv,
        cdpUrl,
      );
      const diskAudit = auditPersistentCookieArtifacts(
        "claude",
        captureProvenance,
      );
      const mergedArtifactStates = mergeArtifactStateMaps(
        artifactStates,
        diskAudit.artifactStates,
      );
      const status = await buildCaptureStatus({
        provider: "claude",
        runtimeEnv,
        artifactStates: mergedArtifactStates,
        accountLabel: organizationId ? `claude:${organizationId.slice(0, 8)}` : "claude:local-browser",
        sessionSource: "claude-browser-profile",
        note: "Captured via local auth portal acquisition.",
      });
      const pageAudit = await buildCurrentPageAudit("claude", page);
      const coherence = finalizeCaptureCoherence({
        status,
        pageAudit,
        artifactStates: mergedArtifactStates,
        provenance: captureProvenance,
        diskAudit,
      });
      const finalSession = {
        ...status.session,
        state: coherence.status,
        acquisitionMode: mode,
        artifactStates: mergedArtifactStates,
        captureProvenance,
        persistenceAudit: coherence.persistenceAudit,
        requiredUserAction:
          coherence.status === "user-action-required"
            ? status.session.requiredUserAction ?? coherence.summary
            : status.session.requiredUserAction,
        degradedReason:
          coherence.status === "ready"
            ? status.session.degradedReason
            : coherence.summary,
      };

      const storePath = persistStoredSession(
        toStoredRecord({
          provider: "claude",
          mode,
          session: finalSession,
          runtimeEnv,
          captureProvenance,
          persistenceAudit: coherence.persistenceAudit,
        }),
        env,
      );

      return {
        status: mapCaptureCoherenceStatus(coherence.status),
        provider: "claude",
        providerDisplayName,
        mode,
        modeLabel: getAcquisitionModeDescriptor(mode).label,
        advanced: getAcquisitionModeDescriptor(mode).advanced,
        supported: true,
        summary: coherence.summary,
        availableModes: WEB_ACQUISITION_MODE_OPTIONS,
        browserTarget,
        session: finalSession,
        liveProof,
        storePath,
        runtimeEnv,
        cdpUrl,
      };
    });
  } catch (error) {
    return buildBrowserUnavailableCaptureResult({
      provider: "claude",
      providerDisplayName,
      env: acquisitionEnv,
      mode,
      error,
      browserTarget,
    });
  }
}

async function captureGrokAcquisition(
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionCaptureResult> {
  const providerDisplayName = "Grok Web";
  const acquisitionEnv = resolveCaptureEnv("grok", env, request);
  const mode = resolveAcquisitionMode(request, acquisitionEnv);
  const browserTarget = buildBrowserTargetFromMode(mode);

  try {
    return await withBrowserContext(acquisitionEnv, async ({ context, cdpUrl }) => {
      const page = await ensurePage(context, "https://grok.com");
      const userAgent = await resolveUserAgent(page);
      const cookies = await context.cookies(["https://grok.com", "https://x.com"]);
      const cookieBundle = pickCookieBundle(cookies, ["grok.com", "x.com", "twitter.com"]);
      const runtimeEnv = {
        ...buildAcquisitionRuntimeEnv({
          provider: "grok",
          mode,
          cdpUrl,
          request,
        }),
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: cdpUrl,
        WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: cookieBundle,
        WEBAI_BRIDGE_WEB_GROK_USER_AGENT: userAgent,
      };
      const captureProvenance = buildCaptureProvenance(
        mode,
        acquisitionEnv,
        cdpUrl,
      );
      const diskAudit = auditPersistentCookieArtifacts(
        "grok",
        captureProvenance,
      );
      const hasGrokSessionCookie = hasCookie(cookies, ["sso", "sso-rw"]);
      const hasGrokOauthBrowserSession = hasCookie(cookies, [
        "x-userid",
        "_twitter_sess",
        "auth_token",
      ]);
      const artifactStates: Record<string, StoredWebArtifactState> = {
        "session-cookie": hasGrokSessionCookie ? "present" : "missing",
        "oauth-browser-session": hasGrokOauthBrowserSession ? "present" : "missing",
      };
      const mergedArtifactStates = mergeArtifactStateMaps(
        artifactStates,
        diskAudit.artifactStates,
      );
      const pageAudit = await buildCurrentPageAudit("grok", page);
      const liveProof = await runGrokWebLiveProof(runtimeEnv, fetch);

      if (liveProof.status !== "success") {
        const blockedResult = buildBlockedCaptureResult({
          provider: "grok",
          providerDisplayName,
          mode,
          liveProof,
          browserTarget,
          cdpUrl,
          status: isLiveProofUserAction(liveProof) ? "user-action-required" : "external-blocker",
          blocker: isLiveProofUserAction(liveProof) ? "finish-grok-login" : "grok-upstream-unavailable",
          summary:
            liveProof.status === "failure" && liveProof.summary
              ? liveProof.summary
              : "先在本地浏览器里完成 Grok 登录，再重新点击 Capture。",
        });

        if (isLiveProofUserAction(liveProof)) {
          const liveProofSummary =
            "summary" in liveProof && typeof liveProof.summary === "string"
              ? liveProof.summary
              : undefined;
          const liveProofDiagnostic =
            "diagnostic" in liveProof && typeof liveProof.diagnostic === "string"
              ? liveProof.diagnostic
              : undefined;
          const summary =
            liveProofSummary ??
            liveProofDiagnostic ??
            "先在本地浏览器里完成 Grok 登录，再重新点击 Capture。";
          const blockedSession = {
            ...(await buildCaptureStatus({
              provider: "grok",
              runtimeEnv,
              artifactStates: mergedArtifactStates,
              accountLabel: "grok:local-browser",
              sessionSource: "grok-x-oauth",
              note:
                hasGrokSessionCookie || hasGrokOauthBrowserSession
                  ? "Captured via local auth portal acquisition. Browser cookie bundle and Grok OAuth/browser-session artifacts were harvested from the attached local profile."
                  : "Captured via local auth portal acquisition. Browser cookie material is present, but the Grok OAuth/browser-session artifacts still need to be recovered from the attached local profile.",
            })).session,
            state: "user-action-required" as const,
            acquisitionMode: mode,
            artifactStates: mergedArtifactStates,
            captureProvenance,
            persistenceAudit: buildPersistenceAudit(
              "capture",
              captureProvenance,
              pageAudit,
              mergedArtifactStates,
              diskAudit,
              summary,
            ),
            requiredUserAction: summary,
            degradedReason: summary,
          };
          const storePath = persistStoredSession(
            toStoredRecord({
              provider: "grok",
              mode,
              session: blockedSession,
              runtimeEnv,
              captureProvenance,
              persistenceAudit: blockedSession.persistenceAudit,
            }),
            env,
          );

          return {
            ...blockedResult,
            storePath,
            session: blockedSession,
          };
        }

        return blockedResult;
      }
      const status = await buildCaptureStatus({
        provider: "grok",
        runtimeEnv,
        artifactStates: mergedArtifactStates,
        accountLabel: "grok:local-browser",
        sessionSource: "grok-x-oauth",
        note:
          hasGrokSessionCookie || hasGrokOauthBrowserSession
            ? "Captured via local auth portal acquisition. Browser cookie bundle and Grok OAuth/browser-session artifacts were harvested from the attached local profile."
            : "Captured via local auth portal acquisition. Browser cookie material is present, but the Grok OAuth/browser-session artifacts still need to be recovered from the attached local profile.",
      });
      const coherence = finalizeCaptureCoherence({
        status,
        pageAudit,
        artifactStates: mergedArtifactStates,
        provenance: captureProvenance,
        diskAudit,
      });
      const finalSession = {
        ...status.session,
        state: coherence.status,
        acquisitionMode: mode,
        artifactStates: mergedArtifactStates,
        captureProvenance,
        persistenceAudit: coherence.persistenceAudit,
        requiredUserAction:
          coherence.status === "user-action-required"
            ? status.session.requiredUserAction ?? coherence.summary
            : status.session.requiredUserAction,
        degradedReason:
          coherence.status === "ready"
            ? status.session.degradedReason
            : coherence.summary,
      };

      const storePath = persistStoredSession(
        toStoredRecord({
          provider: "grok",
          mode,
          session: finalSession,
          runtimeEnv,
          captureProvenance,
          persistenceAudit: coherence.persistenceAudit,
        }),
        env,
      );

      return {
        status: mapCaptureCoherenceStatus(coherence.status),
        provider: "grok",
        providerDisplayName,
        mode,
        modeLabel: getAcquisitionModeDescriptor(mode).label,
        advanced: getAcquisitionModeDescriptor(mode).advanced,
        supported: true,
        summary: coherence.summary,
        availableModes: WEB_ACQUISITION_MODE_OPTIONS,
        browserTarget,
        session: finalSession,
        liveProof,
        storePath,
        runtimeEnv,
        cdpUrl,
      };
    });
  } catch (error) {
    return buildBrowserUnavailableCaptureResult({
      provider: "grok",
      providerDisplayName,
      env: acquisitionEnv,
      mode,
      error,
      browserTarget,
    });
  }
}

async function captureQwenAcquisition(
  env: Record<string, string | undefined>,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionCaptureResult> {
  const providerDisplayName = "Qwen Web";
  const acquisitionEnv = resolveCaptureEnv("qwen", env, request);
  const mode = resolveAcquisitionMode(request, acquisitionEnv);
  const browserTarget = buildBrowserTargetFromMode(mode);

  try {
    return await withBrowserContext(acquisitionEnv, async ({ context, cdpUrl }) => {
      const page = await ensurePage(context, "https://chat.qwen.ai");
      const userAgent = await resolveUserAgent(page);
      const cookies = await context.cookies(["https://chat.qwen.ai"]);
      const cookieBundle = pickCookieBundle(cookies, ["qwen.ai"]);
      const sessionToken = await resolveQwenSessionToken(page, cookies);
      const runtimeEnv = {
        ...buildAcquisitionRuntimeEnv({
          provider: "qwen",
          mode,
          cdpUrl,
          request,
        }),
        WEBAI_BRIDGE_WEB_AUTH_CDP_URL: cdpUrl,
        WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: cookieBundle,
        WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: userAgent,
      };
      const httpLiveProof = await runQwenWebLiveProof(runtimeEnv, fetch);
      let liveProof = httpLiveProof;

      if (httpLiveProof.status !== "success" && shouldUseQwenBrowserFallback(httpLiveProof)) {
        const browserProof = await runQwenBrowserWorkspaceProof(page, runtimeEnv);

        if (browserProof.status === "success") {
          liveProof = browserProof;
        }
      }
      const artifactStates: Record<string, StoredWebArtifactState> = {
        "session-cookie": cookieBundle.length > 0 ? "present" : "missing",
        "session-token":
          sessionToken?.source === "cookie"
            ? "present"
            : sessionToken?.source === "storage"
              ? "derived"
              : cookieBundle.length > 0
                ? "derived"
                : "missing",
      };
      const captureProvenance = buildCaptureProvenance(
        mode,
        acquisitionEnv,
        cdpUrl,
      );
      const diskAudit = auditPersistentCookieArtifacts(
        "qwen",
        captureProvenance,
      );
      const mergedArtifactStates = mergeArtifactStateMaps(
        artifactStates,
        diskAudit.artifactStates,
      );
      const pageAudit = await buildCurrentPageAudit("qwen", page, {
        artifactStates: mergedArtifactStates,
        liveProof,
      });

      if (liveProof.status !== "success") {
        const blockedResult = buildBlockedCaptureResult({
          provider: "qwen",
          providerDisplayName,
          mode,
          liveProof,
          browserTarget,
          cdpUrl,
          status: isLiveProofUserAction(liveProof) ? "user-action-required" : "external-blocker",
          blocker: isLiveProofUserAction(liveProof) ? "finish-qwen-login" : "qwen-upstream-unavailable",
          summary:
            liveProof.status === "failure" && liveProof.summary
              ? liveProof.summary
              : "先在本地浏览器里完成 Qwen 登录，再重新点击 Capture。",
        });
        if (isLiveProofUserAction(liveProof)) {
          const liveProofSummary =
            "summary" in liveProof && typeof liveProof.summary === "string"
              ? liveProof.summary
              : undefined;
          const liveProofDiagnostic =
            "diagnostic" in liveProof && typeof liveProof.diagnostic === "string"
              ? liveProof.diagnostic
              : undefined;
          const summary =
            liveProofSummary ??
            liveProofDiagnostic ??
            pageAudit.reason ??
            "先在本地浏览器里完成 Qwen 登录，再重新点击 Capture。";
          const blockedSession = {
            ...(await buildCaptureStatus({
              provider: "qwen",
              runtimeEnv,
              artifactStates: mergedArtifactStates,
              accountLabel: sessionToken ? `qwen:${sessionToken.value.slice(0, 8)}` : "qwen:local-browser",
              sessionSource: "qwen-browser-profile",
              note:
                sessionToken
                  ? "Captured via local auth portal acquisition. Browser cookie bundle and a Qwen session token were harvested from the attached local profile."
                  : "Captured via local auth portal acquisition. Browser cookie bundle is present; the Qwen session token still needs a richer capture path than the current local profile probe.",
            })).session,
            state: "user-action-required" as const,
            acquisitionMode: mode,
            artifactStates: mergedArtifactStates,
            captureProvenance,
            persistenceAudit: buildPersistenceAudit(
              "capture",
              captureProvenance,
              pageAudit,
              mergedArtifactStates,
              diskAudit,
              summary,
            ),
            requiredUserAction: summary,
            degradedReason: summary,
          };
          const storePath = persistStoredSession(
            toStoredRecord({
              provider: "qwen",
              mode,
              session: blockedSession,
              runtimeEnv,
              captureProvenance,
              persistenceAudit: blockedSession.persistenceAudit,
            }),
            env,
          );

          return {
            ...blockedResult,
            storePath,
            session: blockedSession,
          };
        }

        return blockedResult;
      }
      const status = await buildCaptureStatus({
        provider: "qwen",
        runtimeEnv,
        artifactStates: mergedArtifactStates,
        accountLabel: sessionToken ? `qwen:${sessionToken.value.slice(0, 8)}` : "qwen:local-browser",
        sessionSource: "qwen-browser-profile",
        note:
          sessionToken
            ? "Captured via local auth portal acquisition. Browser cookie bundle and a Qwen session token were harvested from the attached local profile."
            : "Captured via local auth portal acquisition. Browser cookie bundle is present; the Qwen session token still needs a richer capture path than the current local profile probe.",
      });
      const coherence = finalizeCaptureCoherence({
        status,
        pageAudit,
        artifactStates: mergedArtifactStates,
        provenance: captureProvenance,
        diskAudit,
      });
      const finalSession = {
        ...status.session,
        state: coherence.status,
        acquisitionMode: mode,
        artifactStates: mergedArtifactStates,
        captureProvenance,
        persistenceAudit: coherence.persistenceAudit,
        requiredUserAction:
          coherence.status === "user-action-required"
            ? status.session.requiredUserAction ?? coherence.summary
            : status.session.requiredUserAction,
        degradedReason:
          coherence.status === "ready"
            ? status.session.degradedReason
            : coherence.summary,
      };

      const storePath = persistStoredSession(
        toStoredRecord({
          provider: "qwen",
          mode,
          session: finalSession,
          runtimeEnv,
          captureProvenance,
          persistenceAudit: coherence.persistenceAudit,
        }),
        env,
      );

      return {
        status: mapCaptureCoherenceStatus(coherence.status),
        provider: "qwen",
        providerDisplayName,
        mode,
        modeLabel: getAcquisitionModeDescriptor(mode).label,
        advanced: getAcquisitionModeDescriptor(mode).advanced,
        supported: true,
        summary: coherence.summary,
        availableModes: WEB_ACQUISITION_MODE_OPTIONS,
        browserTarget,
        session: finalSession,
        liveProof,
        storePath,
        runtimeEnv,
        cdpUrl,
      };
    });
  } catch (error) {
    return buildBrowserUnavailableCaptureResult({
      provider: "qwen",
      providerDisplayName,
      env: acquisitionEnv,
      mode,
      error,
      browserTarget,
    });
  }
}

export interface DefaultWebAcquisitionRunnerOptions {
  bootstrapBrowser?: WebAuthBrowserBootstrapRunner;
}

async function createStartResult(
  provider: WebProviderId,
  providerDisplayName: string,
  loginUrl: string,
  env: Record<string, string | undefined>,
  bootstrapBrowser: WebAuthBrowserBootstrapRunner,
  request?: WebAcquisitionRequest,
): Promise<WebAcquisitionStartResult> {
  const mode = resolveAcquisitionMode(request, env);
  const modeDescriptor = getAcquisitionModeDescriptor(mode);

  try {
    const browser = await bootstrapBrowser({
      provider,
      loginUrl,
      env,
      request: {
        ...request,
        mode,
      },
    });
    const captureRequest = buildCaptureRequest(mode, browser, request);

    return {
      status: "ready-for-user-login",
      provider,
      providerDisplayName,
      mode,
      modeLabel: modeDescriptor.label,
      advanced: modeDescriptor.advanced,
      supported: true,
      loginUrl,
      availableModes: WEB_ACQUISITION_MODE_OPTIONS,
      browserTarget: browser.browserTarget,
      captureRequest,
      runtimeEnv: buildAcquisitionRuntimeEnv({
        provider,
        mode,
        cdpUrl: browser.cdpUrl,
        request: captureRequest,
      }),
      instructions: buildStartInstructions({
        mode,
        providerDisplayName,
        loginUrl,
        loginOpened: browser.loginOpened,
      }),
      cdpUrl: browser.cdpUrl,
      browser,
      summary: browser.summary,
    };
  } catch (error) {
    return {
      status: "external-blocker",
      provider,
      providerDisplayName,
      mode,
      modeLabel: modeDescriptor.label,
      advanced: modeDescriptor.advanced,
      supported: true,
      loginUrl,
      availableModes: WEB_ACQUISITION_MODE_OPTIONS,
      browserTarget: buildBrowserTargetFromMode(mode),
      blocker: buildStartBlocker(provider, mode, error),
      cdpUrl: buildAcquisitionRuntimeEnv({
        provider,
        mode,
        cdpUrl:
          request?.existingChromeProfile?.cdpUrl ??
          request?.existingBrowserSession?.sessionUrl,
        request,
      })[WEB_AUTH_CDP_URL_ENV_NAME],
      summary:
        error instanceof Error
          ? error.message
          : `WebaiBridge failed to prepare the managed onboarding browser for ${providerDisplayName}.`,
      instructions:
        mode === "managed-browser"
          ? "Confirm Chrome or Chromium is installed, then retry Start Login so WebaiBridge can launch or reattach the local onboarding browser for you."
          : mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
            ? "WebaiBridge could not safely reuse the isolated repo Chrome root. Reattach to the running instance, or fall back to the managed onboarding browser."
            : "WebaiBridge could not attach to the requested browser session. Confirm the browser session is still shareable, or fall back to the managed onboarding browser.",
    };
  }
}

export function createDefaultWebAcquisitionRunners(
  env: Record<string, string | undefined> = process.env,
  options: DefaultWebAcquisitionRunnerOptions = {},
): WebAcquisitionRunnerMap {
  const bootstrapBrowser = options.bootstrapBrowser ?? bootstrapLocalWebAuthBrowser;

  return {
    chatgpt: {
      start: async (request) =>
        createStartResult(
          "chatgpt",
          "ChatGPT Web",
          "https://chatgpt.com",
          env,
          bootstrapBrowser,
          request,
        ),
      capture: async (request) => captureChatgptAcquisition(env, request),
    },
    gemini: {
      start: async (request) =>
        createStartResult(
          "gemini",
          "Gemini Web",
          "https://gemini.google.com/app",
          env,
          bootstrapBrowser,
          request,
        ),
      capture: async (request) => captureGeminiAcquisition(env, request),
    },
    claude: {
      start: async (request) =>
        createStartResult(
          "claude",
          "Claude Web",
          "https://claude.ai/new",
          env,
          bootstrapBrowser,
          request,
        ),
      capture: async (request) => captureClaudeAcquisition(env, request),
    },
    grok: {
      start: async (request) =>
        createStartResult(
          "grok",
          "Grok Web",
          "https://grok.com",
          env,
          bootstrapBrowser,
          request,
        ),
      capture: async (request) => captureGrokAcquisition(env, request),
    },
    qwen: {
      start: async (request) =>
        createStartResult(
          "qwen",
          "Qwen Web",
          "https://chat.qwen.ai",
          env,
          bootstrapBrowser,
          request,
        ),
      capture: async (request) => captureQwenAcquisition(env, request),
    },
  };
}

export function buildAcquisitionJsonResponse(status: number, body: unknown): SurfaceResponse {
  return {
    status,
    body,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  };
}
