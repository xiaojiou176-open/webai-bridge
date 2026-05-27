import "./load-local-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import {
  auditProviderPersistentArtifacts,
  buildBrowserCaptureProvenance,
  buildBrowserPersistenceAudit,
  mergeProviderArtifactStates,
} from "./browser-session-coherence.mjs";
import {
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  assertPathInsideAllowedRoots,
  isCiEnvironment,
  resolveAllowedRuntimeArtifactRoots,
  normalizeBrowserMode,
  resolveCredentialedBrowserMode,
  resolveLocalWebAuthStoreArtifactPath,
  resolveManagedBrowserUserDataDir,
  resolveOptionalExistingChromeProfileRoot,
} from "./runtime-policy.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultManagedBrowserDir = resolve(
  repoRoot,
  ".runtime-cache",
  "webai-bridge-web-auth-browser",
);
const defaultSupportBundleDir = resolve(
  repoRoot,
  ".runtime-cache",
  "browser-support",
);

const WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL";
const WEBAI_BRIDGE_WEB_GEMINI_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL";
const WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH_ENV_NAME =
  "WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH";

const providerHosts = {
  chatgpt: ["chatgpt.com", "openai.com", "auth.openai.com"],
  gemini: ["gemini.google.com", "accounts.google.com"],
  claude: ["claude.ai"],
  grok: ["grok.com", "x.com", "twitter.com"],
  qwen: ["chat.qwen.ai", "auth.qwen.ai"],
};

const providerLoginSignals = {
  chatgpt: ["login", "log in", "sign up", "signup", "email-verification", "auth.openai.com", "登录", "注册"],
  gemini: ["accounts.google.com", "cookiemismatch", "signin", "sign in", "登录"],
  claude: ["login", "log in", "sign in", "claude.ai/login", "登录"],
  grok: ["login", "log in", "sign in", "signup", "登录", "注册"],
  qwen: ["login", "log in", "sign in", "signup", "登录", "注册"],
};

const providerWorkspaceSignals = {
  chatgpt: ["chatgpt.com"],
  gemini: ["gemini.google.com/app"],
  claude: ["claude.ai"],
  grok: ["grok.com"],
  qwen: ["chat.qwen.ai"],
};

const GROK_HUMAN_VERIFICATION_SIGNALS = [
  "verify you are human",
  "human verification",
  "captcha",
  "are you human",
  "机器人验证",
];

const GROK_ACCOUNT_ACTION_SIGNALS = [
  "connect your x account",
  "关联你的",
  "unlock early features",
  "unlock extended capabilities",
  "upgrade to supergrok",
  "解锁早期功能",
  "解锁扩展能力",
  "升级到 supergrok",
  "free trial",
  "免费试用",
];
const QWEN_READY_WORKSPACE_SIGNALS = [
  "qwen3",
  "新建对话",
  "社区",
  "coder",
  "项目",
  "所有对话",
  "有什么我能帮您的吗",
  "有什么我能帮您的",
  "你想从哪里开始",
  "你准备好了我就来",
  "今天有什么议程",
];

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function normalizePageText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

export function summarizeCurrentPageTextEvidence({
  bodyText = "",
  rootText = "",
  visibleHintParts = [],
} = {}) {
  const normalizedBody = normalizePageText(bodyText);

  if (normalizedBody) {
    return normalizedBody.slice(0, 300);
  }

  const normalizedRoot = normalizePageText(rootText);
  const hintParts = [];

  for (const part of visibleHintParts) {
    const normalizedPart = normalizePageText(part);

    if (!normalizedPart) {
      continue;
    }

    if (normalizedRoot && normalizedRoot.includes(normalizedPart)) {
      continue;
    }

    if (hintParts.includes(normalizedPart)) {
      continue;
    }

    hintParts.push(normalizedPart);
  }

  return [normalizedRoot, ...hintParts]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

function nowIso() {
  return new Date().toISOString();
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    provider: undefined,
    json: false,
    reload: false,
    consoleLimit: 12,
    networkLimit: 16,
    bundlePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--provider") {
      options.provider = argv[index + 1]?.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      options.provider = arg.slice("--provider=".length).trim().toLowerCase();
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--reload") {
      options.reload = true;
      continue;
    }

    if (arg === "--bundle-path") {
      options.bundlePath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--bundle-path=")) {
      options.bundlePath = arg.slice("--bundle-path=".length);
      continue;
    }

    if (arg === "--console-limit") {
      options.consoleLimit = Number(argv[index + 1] ?? options.consoleLimit);
      index += 1;
      continue;
    }

    if (arg === "--network-limit") {
      options.networkLimit = Number(argv[index + 1] ?? options.networkLimit);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.provider || !(options.provider in providerHosts)) {
    throw new Error(
      `Missing or unsupported --provider. Expected one of ${Object.keys(providerHosts).join(", ")}.`,
    );
  }

  return options;
}

function defaultStorePath() {
  return resolveLocalWebAuthStoreArtifactPath(process.env, repoRoot);
}

function resolveStorePath(env = process.env) {
  return resolveLocalWebAuthStoreArtifactPath(env, repoRoot);
}

function readStoredSession(provider, env = process.env) {
  const storePath = resolveStorePath(env);

  if (!existsSync(storePath)) {
    return undefined;
  }

  const raw = readFileSync(storePath, "utf8").trim();

  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw);
  return parsed?.providers?.[provider];
}

export function resolveCanonicalAttachTarget(provider, env = process.env, storedSession = undefined) {
  const acquisitionMode =
    (() => {
      const preferredMode = resolveCredentialedBrowserMode(env);
      const storedMode = normalizeBrowserMode(storedSession?.acquisitionMode);

      if (
        preferredMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE &&
        storedMode === "managed-browser"
      ) {
        return preferredMode;
      }

      return storedMode ?? preferredMode;
    })();
  const configuredRealProfile = resolveOptionalExistingChromeProfileRoot(env);
  const isolatedRootCdpUrl =
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
    "http://127.0.0.1:9338";
  const geminiSharedCdp =
    acquisitionMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      ? isolatedRootCdpUrl
      : env[WEBAI_BRIDGE_WEB_GEMINI_CDP_URL_ENV_NAME]?.trim() ||
        env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
        "http://127.0.0.1:39222";

  if (provider === "gemini") {
    return {
      mode: acquisitionMode ?? "managed-browser",
      source: acquisitionMode ? "stored-session" : "default-env",
      cdpUrl: geminiSharedCdp,
      userDataDir: resolveManagedBrowserUserDataDir(env, repoRoot),
      sessionUrl:
        acquisitionMode === "existing-browser-session"
          ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME]?.trim() ||
            geminiSharedCdp
          : undefined,
      existingProfileDir: configuredRealProfile?.userDataDir,
      existingProfileName: configuredRealProfile?.profileName,
      existingProfileDirectory: configuredRealProfile?.profileDirectory,
      existingProfileCdpUrl: isolatedRootCdpUrl,
    };
  }

  return {
    mode: acquisitionMode ?? "managed-browser",
    source: acquisitionMode ? "stored-session" : "default-env",
    cdpUrl:
      acquisitionMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? isolatedRootCdpUrl
        : env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
          "http://127.0.0.1:39222",
    userDataDir: resolveManagedBrowserUserDataDir(env, repoRoot),
    sessionUrl:
      acquisitionMode === "existing-browser-session"
        ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME]?.trim() ||
          env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
          "http://127.0.0.1:39222"
        : undefined,
    existingProfileDir: configuredRealProfile?.userDataDir,
    existingProfileName: configuredRealProfile?.profileName,
    existingProfileDirectory: configuredRealProfile?.profileDirectory,
    existingProfileCdpUrl: isolatedRootCdpUrl,
  };
}

export function buildAttachHelper(provider, target) {
  const bootstrap = `pnpm run bootstrap:web-login-browser -- --provider ${provider}`;
  const verify = `pnpm exec node scripts/verify-web-login-live.mjs --provider ${provider}`;
  const diagnose = `pnpm exec node scripts/diagnose-web-login-browser.mjs --provider ${provider} --reload --json`;
  const normalizedMode =
    target.mode === "existing-chrome-profile"
      ? WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      : target.mode;

  return {
    bootstrapCommand: bootstrap,
    verifyCommand: verify,
    diagnoseCommand: diagnose,
    recommendedSequence: [bootstrap, diagnose, verify],
    canonicalTargetHint:
      normalizedMode === "existing-browser-session"
        ? `Attach to ${target.sessionUrl ?? target.cdpUrl}`
        : normalizedMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
          ? `Attach to the isolated repo Chrome root ${target.existingProfileName ?? "(missing profile name)"} at ${target.existingProfileDir ?? "(missing profile dir)"}.`
          : `Use WebaiBridge managed browser at ${target.userDataDir ?? "(missing user data dir)"}.`,
  };
}

export function summarizeStoreReadiness(storedSession) {
  if (!storedSession) {
    return {
      ready: false,
      reason: "no stored session record",
      state: "missing",
      artifactStates: {},
    };
  }

  return {
    ready: storedSession.state && storedSession.state !== "missing",
    reason:
      storedSession.state === "ready"
        ? "local session materials are present in the auth store"
        : storedSession.requiredUserAction ||
          storedSession.degradedReason ||
          "local session exists but is not fully healthy",
    state: storedSession.state,
    artifactStates: storedSession.artifactStates ?? {},
    acquisitionMode: storedSession.acquisitionMode,
    captureProvenance: storedSession.captureProvenance,
    persistenceAudit: storedSession.persistenceAudit,
    requiredUserAction: storedSession.requiredUserAction,
    degradedReason: storedSession.degradedReason,
  };
}

function hasFinishedNetworkStatus(entries, urlNeedle, status) {
  return (entries ?? []).some(
    (entry) =>
      entry?.outcome === "finished" &&
      typeof entry.url === "string" &&
      entry.url.includes(urlNeedle) &&
      entry.status === status,
  );
}

function includesConsoleText(entries, needle) {
  return (entries ?? []).some(
    (entry) =>
      typeof entry?.text === "string" &&
      entry.text.toLowerCase().includes(needle.toLowerCase()),
  );
}

export function classifyLiveWorkspace(provider, currentPage, context = {}) {
  if (!currentPage?.url) {
    return {
      liveReady: false,
      classification: "missing-page",
      reason:
        "WebaiBridge could not resolve a provider page after attaching, so store-ready cannot be promoted to live-ready.",
    };
  }

  const lowerUrl = currentPage.url.toLowerCase();
  const loginSignals = providerLoginSignals[provider] ?? [];
  const workspaceSignals = providerWorkspaceSignals[provider] ?? [];
  const lowerTitle = `${currentPage.title ?? ""}`.toLowerCase();
  const lowerBody = `${currentPage.bodySnippet ?? currentPage.text ?? ""}`.toLowerCase();
  const combinedText = `${lowerUrl}\n${lowerTitle}\n${lowerBody}`;
  const currentPageClassification = `${currentPage.classification ?? ""}`.toLowerCase();
  const currentPageDiagnostic = `${currentPage.diagnostic ?? ""}`.toLowerCase();
  const workspaceUrlMatched = workspaceSignals.some((signal) => lowerUrl.includes(signal));
  const hasComposerSurface = Boolean(currentPage.hasComposerSurface);
  const hasConversationUrlEvidence =
    (provider === "grok" || provider === "qwen") && /\/c\//.test(lowerUrl);
  const requiresVisibleWorkspaceEvidence = provider === "grok" || provider === "qwen";
  const hasVisibleWorkspaceEvidence =
    lowerBody.trim().length > 0 || hasComposerSurface || hasConversationUrlEvidence;
  const artifactStates = context.artifactStates ?? {};
  const currentNetwork = context.currentNetwork ?? [];
  const currentConsole = context.currentConsole ?? [];
  const storeStatus = context.storeStatus;
  const qwenLooksWorkspaceReady =
    provider === "qwen" &&
    workspaceUrlMatched &&
    artifactStates["session-cookie"] !== "missing" &&
    artifactStates["session-token"] !== "missing" &&
    (
      includesAny(lowerBody, QWEN_READY_WORKSPACE_SIGNALS) ||
      hasComposerSurface ||
      hasConversationUrlEvidence ||
      (
        lowerTitle.includes("qwen chat") &&
        currentNetwork.length > 0
      )
    ) &&
    !hasFinishedNetworkStatus(currentNetwork, "/api/v1/auths/", 401) &&
    !includesConsoleText(currentConsole, "unauthorized") &&
    !currentPageDiagnostic.includes("permission-gated") &&
    !currentPageDiagnostic.includes("unauthorized");

  if (qwenLooksWorkspaceReady) {
    return {
      liveReady: true,
      classification: "workspace-ready",
      reason:
        "Qwen current page already shows authenticated workspace markers and composer-ready prompts, so fresh page truth wins over the stale permission-gated store reason.",
    };
  }

  if (
    provider === "qwen" &&
    artifactStates["session-cookie"] !== "missing" &&
    artifactStates["session-token"] !== "missing" &&
    storeStatus?.state === "user-action-required" &&
    `${storeStatus.reason ?? ""}`.toLowerCase().includes("permission-gated")
  ) {
    return {
      liveReady: false,
      classification: "permission-gated",
      reason:
        "Qwen session material is already present, but the attached browser still needs the remaining browser-side permission gate to clear before the composer becomes live-ready.",
    };
  }

  if (
    provider === "qwen" &&
    artifactStates["session-cookie"] !== "missing" &&
    artifactStates["session-token"] !== "missing" &&
    (
      hasFinishedNetworkStatus(currentNetwork, "/api/v1/auths/", 401) ||
      includesConsoleText(currentConsole, "unauthorized") ||
      currentPageDiagnostic.includes("permission-gated") ||
      currentPageDiagnostic.includes("unauthorized")
    )
  ) {
    return {
      liveReady: false,
      classification: "permission-gated",
      reason:
        "Qwen session material is already present, but the attached browser is still hitting an Unauthorized or permission-gated browser-side path.",
    };
  }

  if (provider === "grok" && includesAny(combinedText, GROK_HUMAN_VERIFICATION_SIGNALS)) {
    return {
      liveReady: false,
      classification: "human-verification-required",
      reason:
        "Grok attached browser is still blocked on a human-verification or anti-bot gate.",
    };
  }

  if (provider === "grok" && includesAny(combinedText, GROK_ACCOUNT_ACTION_SIGNALS)) {
    return {
      liveReady: false,
      classification: "account-action-required",
      reason:
        "Grok attached browser still requires an end-user account action such as linking X or unlocking the required plan before the live composer is usable.",
    };
  }

  if (
    provider === "grok" &&
    artifactStates["session-cookie"] !== "missing" &&
    hasFinishedNetworkStatus(currentNetwork, "/rest/user-skills", 403)
  ) {
    return {
      liveReady: false,
      classification: "account-action-required",
      reason:
        "Grok attached browser is still hitting an account or plan gate before the authenticated composer becomes usable.",
    };
  }

  if (
    provider === "grok" &&
    artifactStates["session-cookie"] === "missing" &&
    artifactStates["oauth-browser-session"] === "missing" &&
    storeStatus?.state === "user-action-required" &&
    `${storeStatus.reason ?? ""}`.toLowerCase().includes("authenticated composer surface")
  ) {
    return {
      liveReady: false,
      classification: "session-incomplete",
      reason:
        "Grok still lacks the required local session artifacts and is not landing on an authenticated composer surface yet.",
    };
  }

  if (
    currentPageClassification === "session-incomplete" ||
    currentPageClassification === "human-verification-required" ||
    currentPageClassification === "account-action-required" ||
    currentPageClassification === "permission-gated" ||
    currentPageDiagnostic.includes("unauthenticated or incomplete session") ||
    currentPageDiagnostic.includes("login/signup or public-landing markers")
  ) {
    return {
      liveReady: false,
      classification: "login-required",
      reason:
        currentPage.diagnostic ||
        "Stored session materials exist, but the attached browser is still on a login or verification page. That is store-ready, not live-ready.",
    };
  }

  if (loginSignals.some((signal) => combinedText.includes(signal))) {
    return {
      liveReady: false,
      classification: "login-required",
      reason:
        "Stored session materials exist, but the attached browser is still on a login or verification page. That is store-ready, not live-ready.",
    };
  }

  if (workspaceUrlMatched) {
    if (requiresVisibleWorkspaceEvidence && !hasVisibleWorkspaceEvidence) {
      return {
        liveReady: false,
        classification: "provider-adjacent",
        reason:
          "The attached browser reached the provider home URL, but diagnose could not read enough visible workspace text to prove the authenticated composer surface yet.",
      };
    }

    return {
      liveReady: true,
      classification: "workspace-ready",
      reason:
        "The attached browser is currently on a provider workspace URL, so the runtime has a plausible live-ready surface.",
    };
  }

  return {
    liveReady: false,
    classification: "provider-adjacent",
    reason:
      "The attached browser is on a provider-adjacent page that does not look like a usable workspace yet. Treat this as store-ready but not live-ready until verification passes.",
  };
}

function summarizeArtifactGap(artifactStates = {}) {
  const gaps = Object.entries(artifactStates).filter(([, state]) =>
    state === "missing" || state === "derived",
  );

  if (gaps.length === 0) {
    return undefined;
  }

  return gaps.map(([artifactId, state]) => `${artifactId}=${state}`).join(", ");
}

export function buildDiagnoseLadder(provider, target, storeStatus, workspaceStatus, artifactStates) {
  const artifactGap = summarizeArtifactGap(artifactStates);
  const qwenPermissionGateHint =
    provider === "qwen" &&
    storeStatus?.state === "user-action-required" &&
    artifactStates?.["session-token"] === "present" &&
    artifactStates?.["session-cookie"] === "present";
  const ladder = [
    {
      step: 1,
      label: "Check stored session truth",
      detail:
        qwenPermissionGateHint
          ? `Auth store says qwen is ${storeStatus.state}; session-cookie and session-token are already present, so the remaining blocker is likely a browser-side Unauthorized/permission gate rather than missing session material.`
          : storeStatus.ready
          ? artifactGap
            ? `Auth store says ${provider} is ${storeStatus.state}; required artifact gap: ${artifactGap}.`
            : `Auth store says ${provider} is ${storeStatus.state}.`
          : `Auth store does not currently prove a reusable ${provider} session.`,
    },
    {
      step: 2,
      label: "Attach the canonical browser target",
      detail:
        target.mode === "existing-browser-session"
          ? `Connect to ${target.sessionUrl ?? target.cdpUrl}.`
          : target.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
            ? `Attach the isolated repo Chrome root ${target.existingProfileName ?? "webai-bridge"} at ${target.existingProfileDir ?? "(missing user data dir)"} over ${target.existingProfileCdpUrl}.`
            : `Use the managed browser at ${target.userDataDir} over ${target.cdpUrl}.`,
    },
    {
      step: 3,
      label: "Inspect current page before invoking",
      detail:
        qwenPermissionGateHint
          ? `${workspaceStatus.reason} Qwen session material is already present, so focus on clearing the remaining browser-side account or permission gate in this same repo-owned browser.`
          : workspaceStatus.liveReady
          ? "Current page looks like a provider workspace."
          : workspaceStatus.reason,
    },
    {
      step: 4,
      label: "Collect console and network evidence",
      detail:
        "Use the attached page snapshot to see whether refresh/reload reveals login redirects, provider errors, or browser transport drift.",
    },
    {
      step: 5,
      label: "Only then rerun provider-scoped live verification",
      detail: qwenPermissionGateHint
        ? `After the remaining browser-side gate clears in the same repo-owned browser, run pnpm exec node scripts/verify-web-login-live.mjs --provider ${provider}.`
        : `Run pnpm exec node scripts/verify-web-login-live.mjs --provider ${provider}.`,
    },
  ];

  return ladder;
}

export function buildDefaultBundlePath(provider) {
  return join(defaultSupportBundleDir, `${provider}-support-bundle.json`);
}

function resolveBundlePath(bundlePath, env = process.env) {
  const targetPath = resolve(bundlePath);
  const allowedRoots = resolveAllowedRuntimeArtifactRoots(env, repoRoot);

  return assertPathInsideAllowedRoots(
    targetPath,
    [allowedRoots.repoRuntimeCacheRoot, allowedRoots.externalCacheRoot],
    "WebaiBridge browser support bundle",
  );
}

function limitPush(items, value, limit) {
  if (items.length >= limit) {
    return;
  }

  items.push(value);
}

function normalizeConsoleEntry(message) {
  return {
    type: message.type(),
    text: message.text(),
    location: message.location(),
  };
}

export async function selectCanonicalPage(browser, provider) {
  const hostSignals = providerHosts[provider] ?? [];
  const contexts = browser.contexts();

  for (const context of contexts) {
    for (const page of context.pages()) {
      const url = page.url().toLowerCase();
      if (hostSignals.some((signal) => url.includes(signal))) {
        return page;
      }
    }
  }

  for (const context of contexts) {
    const [firstPage] = context.pages();
    if (firstPage) {
      return firstPage;
    }
  }

  return undefined;
}

export async function collectBrowserEvidence(provider, target, options) {
  const connectUrl =
    target.mode === "existing-browser-session"
      ? target.sessionUrl ?? target.cdpUrl
      : target.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? target.existingProfileCdpUrl ?? target.cdpUrl
        : target.cdpUrl;

  const browser = await chromium.connectOverCDP(connectUrl);

  try {
    const page = await selectCanonicalPage(browser, provider);

    if (!page) {
      return {
        ok: false,
        attachUrl: connectUrl,
        error:
          "WebaiBridge attached to the browser target, but no reusable provider page was found.",
      };
    }

    const consoleEntries = [];
    const networkEntries = [];
    const pageErrors = [];

    page.on("console", (message) => {
      limitPush(
        consoleEntries,
        normalizeConsoleEntry(message),
        options.consoleLimit,
      );
    });
    page.on("pageerror", (error) => {
      limitPush(
        pageErrors,
        {
          message: error.message,
          stack: error.stack,
        },
        options.consoleLimit,
      );
    });
    page.on("requestfinished", async (request) => {
      let status = undefined;
      try {
        status = (await request.response())?.status();
      } catch {
        status = undefined;
      }

      limitPush(
        networkEntries,
        {
          outcome: "finished",
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          status,
        },
        options.networkLimit,
      );
    });
    page.on("requestfailed", (request) => {
      limitPush(
        networkEntries,
        {
          outcome: "failed",
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          failureText: request.failure()?.errorText,
        },
        options.networkLimit,
      );
    });

    if (options.reload) {
      await page.reload({
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
    } else {
      await page.waitForLoadState("domcontentloaded", {
        timeout: 5_000,
      }).catch(() => undefined);
    }

    const title = await page.title().catch(() => "");
    let pageSnapshot = {
      bodySnippet: "",
      hasComposerSurface: false,
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rawSnapshot = await page
        .evaluate(() => {
          const selectors = [
            '[contenteditable="true"]',
            'div[role="textbox"]',
            "textarea[placeholder]",
            "textarea",
            'input[type="text"]',
          ];
          const hasComposerSurface = selectors.some((selector) => {
            const element = document.querySelector(selector);
            return Boolean(element && element.offsetParent !== null);
          });
          const visibleHintParts = Array.from(
            document.querySelectorAll(
              [
                "[aria-label]",
                "[placeholder]",
                "[data-placeholder]",
                "button",
                "a",
                "nav",
                "aside",
                "[role='button']",
                "[role='textbox']",
                '[contenteditable="true"]',
                "textarea",
              ].join(", "),
            ),
          )
            .map((node) => {
              const text =
                node.textContent?.trim() ||
                node.getAttribute?.("aria-label")?.trim() ||
                node.getAttribute?.("placeholder")?.trim() ||
                node.getAttribute?.("data-placeholder")?.trim() ||
                "";
              return text;
            })
            .filter(Boolean);
          const bodyText = document.body?.innerText?.trim() ?? "";
          const rootText = document.documentElement?.innerText?.trim() ?? "";

          return {
            bodyText,
            rootText,
            visibleHintParts,
            hasComposerSurface,
          };
        })
        .catch(() => ({
          bodyText: "",
          rootText: "",
          visibleHintParts: [],
          hasComposerSurface: false,
        }));

      pageSnapshot = {
        bodySnippet: summarizeCurrentPageTextEvidence(rawSnapshot),
        hasComposerSurface: Boolean(rawSnapshot.hasComposerSurface),
      };

      if (pageSnapshot.bodySnippet || pageSnapshot.hasComposerSurface || attempt === 2) {
        break;
      }

      if (typeof page.waitForTimeout === "function") {
        await page.waitForTimeout(500);
      }
    }

    return {
      ok: true,
      attachUrl: connectUrl,
      currentPage: {
        url: page.url(),
        title,
        bodySnippet: pageSnapshot.bodySnippet,
        hasComposerSurface: pageSnapshot.hasComposerSurface,
      },
      currentConsole: consoleEntries,
      pageErrors,
      currentNetwork: networkEntries,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function writeSupportBundle(bundlePath, payload) {
  mkdirSync(dirname(bundlePath), {
    recursive: true,
  });
  writeFileSync(bundlePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function runWebLoginBrowserDiagnosis(options) {
  const provider = options.provider;
  const env = options.env ?? process.env;
  const storedSession = readStoredSession(provider, env);
  const storeStatus = summarizeStoreReadiness(storedSession);
  const canonicalAttachTarget = resolveCanonicalAttachTarget(
    provider,
    env,
    storedSession,
  );
  const attachHelper = buildAttachHelper(provider, canonicalAttachTarget);

  let browserEvidence;
  try {
    browserEvidence = await collectBrowserEvidence(provider, canonicalAttachTarget, options);
  } catch (error) {
    browserEvidence = {
      ok: false,
      attachUrl:
        canonicalAttachTarget.mode === "existing-browser-session"
          ? canonicalAttachTarget.sessionUrl ?? canonicalAttachTarget.cdpUrl
          : canonicalAttachTarget.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
            ? canonicalAttachTarget.existingProfileCdpUrl ??
              canonicalAttachTarget.cdpUrl
            : canonicalAttachTarget.cdpUrl,
      error: error instanceof Error ? error.message : `${error}`,
    };
  }

  const workspaceStatus = classifyLiveWorkspace(
    provider,
    browserEvidence.ok ? browserEvidence.currentPage : undefined,
    {
      storeStatus,
      artifactStates: mergeProviderArtifactStates(
        provider,
        storeStatus.artifactStates,
      ),
      currentNetwork: browserEvidence.ok ? browserEvidence.currentNetwork : undefined,
      currentConsole: browserEvidence.ok ? browserEvidence.currentConsole : undefined,
    },
  );
  const captureProvenance = buildBrowserCaptureProvenance({
    mode: canonicalAttachTarget.mode,
    env,
    cdpUrl:
      canonicalAttachTarget.existingProfileCdpUrl ??
      canonicalAttachTarget.sessionUrl ??
      canonicalAttachTarget.cdpUrl,
    capturedAt: nowIso(),
  });
  const diskAudit = auditProviderPersistentArtifacts(
    provider,
    canonicalAttachTarget,
    {
      checkedAt: captureProvenance.capturedAt,
    },
  );
  const mergedArtifactStates = mergeProviderArtifactStates(
    provider,
    storeStatus.artifactStates,
    diskAudit.artifactStates,
  );
  const persistenceAudit = buildBrowserPersistenceAudit({
    source: "verify",
    target: canonicalAttachTarget,
    captureProvenance,
    browserEvidence,
    workspaceStatus,
    diskAudit,
    artifactStates: mergedArtifactStates,
    summary: workspaceStatus.reason,
    checkedAt: captureProvenance.capturedAt,
  });
  const diagnoseLadder = buildDiagnoseLadder(
    provider,
    canonicalAttachTarget,
    storeStatus,
    workspaceStatus,
    mergedArtifactStates,
  );

  const payload = {
    generatedAt: nowIso(),
    provider,
    storeStatus,
    canonicalAttachTarget,
    attachHelper,
    browserEvidence,
    workspaceStatus,
    captureProvenance,
    diskAudit,
    persistenceAudit,
    diagnoseLadder,
  };

  const bundlePath = resolveBundlePath(
    options.bundlePath?.trim() || buildDefaultBundlePath(provider),
    env,
  );
  writeSupportBundle(bundlePath, payload);

  return {
    ...payload,
    supportBundle: {
      path: bundlePath,
      written: true,
    },
  };
}

async function main() {
  if (isCiEnvironment(process.env)) {
    throw new Error(
      "WebaiBridge diagnose:web-login-browser is credentialed-workstation only and must not run inside CI.",
    );
  }

  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  const options = parseArgs();
  const payload = await runWebLoginBrowserDiagnosis(options);
  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`[${payload.provider}]`);
  console.log(`store-ready: ${payload.storeStatus.ready ? "yes" : "no"} (${payload.storeStatus.state})`);
  console.log(`live-ready: ${payload.workspaceStatus.liveReady ? "yes" : "no"}`);
  console.log(`reason: ${payload.workspaceStatus.reason}`);
  console.log(`bundle: ${payload.supportBundle.path}`);
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
