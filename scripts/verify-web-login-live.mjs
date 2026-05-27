import "./load-local-env.mjs";

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import {
  textContainsUrlWithHostAndPathPrefix,
  textContainsUrlWithHostname,
} from "./url-hosts.mjs";
import { captureBrowserDebugContext } from "./browser-debug-support.mjs";
import {
  auditProviderPersistentArtifacts,
  buildBrowserCaptureProvenance,
  evaluateProviderSessionCoherence,
  filterProviderArtifactStates,
  mergeProviderArtifactStates,
} from "./browser-session-coherence.mjs";
import {
  classifyLiveWorkspace,
  collectBrowserEvidence,
  resolveCanonicalAttachTarget,
} from "./diagnose-web-login-browser.mjs";
import {
  isCiEnvironment,
  resolveCredentialedBrowserMode,
  resolveLocalWebAuthStoreArtifactPath,
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
} from "./runtime-policy.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const tempRootDir = join(repoRoot, ".runtime-cache", "temp");
const ISOLATED_CHILD_ENV_NAME = "WEBAI_BRIDGE_WEB_LOGIN_ISOLATED_CHILD";
const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const GEMINI_WEB_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL =
  "http://127.0.0.1:9338";
const STORED_RUNTIME_ROUTING_ENV_NAMES = new Set([
  "WEBAI_BRIDGE_BROWSER_MODE",
  "WEBAI_BRIDGE_CHROME_USER_DATA_DIR",
  "WEBAI_BRIDGE_CHROME_PROFILE_NAME",
  "WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE",
  "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
  "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR",
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR",
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL",
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL",
  "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
]);

const providerProofs = [
  {
    provider: "chatgpt",
    tsconfig: "packages/providers/web/chatgpt/tsconfig.json",
    entrypoint: "packages/providers/web/chatgpt/src/live-proof.js",
    exportName: "runChatgptWebLiveProof",
    runtimeEntrypoint: "packages/providers/web/chatgpt/src/runtime.js",
    runtimeExportName: "createChatgptWebRuntime",
    model: "gpt-4o",
  },
  {
    provider: "gemini",
    tsconfig: "packages/providers/web/gemini/tsconfig.json",
    entrypoint: "packages/providers/web/gemini/src/live-proof.js",
    exportName: "runGeminiWebLiveProof",
    browserProofExportName: "runGeminiBrowserWorkspaceProof",
    runtimeEntrypoint: "packages/providers/web/gemini/src/runtime.js",
    runtimeExportName: "createGeminiWebRuntime",
    model: "gemini-2.5-pro",
  },
  {
    provider: "claude",
    tsconfig: "packages/providers/web/claude/tsconfig.json",
    entrypoint: "packages/providers/web/claude/src/live-proof.js",
    exportName: "runClaudeWebLiveProof",
    runtimeEntrypoint: "packages/providers/web/claude/src/runtime.js",
    runtimeExportName: "createClaudeWebRuntime",
    model: "claude-sonnet-4-6",
  },
  {
    provider: "grok",
    tsconfig: "packages/providers/web/grok/tsconfig.json",
    entrypoint: "packages/providers/web/grok/src/live-proof.js",
    exportName: "runGrokWebLiveProof",
    browserProofExportName: "runGrokBrowserWorkspaceProof",
    runtimeEntrypoint: "packages/providers/web/grok/src/runtime.js",
    runtimeExportName: "createGrokWebRuntime",
    model: "grok-3",
  },
  {
    provider: "qwen",
    tsconfig: "packages/providers/web/qwen/tsconfig.json",
    entrypoint: "packages/providers/web/qwen/src/live-proof.js",
    exportName: "runQwenWebLiveProof",
    browserProofExportName: "runQwenBrowserWorkspaceProof",
    runtimeEntrypoint: "packages/providers/web/qwen/src/runtime.js",
    runtimeExportName: "createQwenWebRuntime",
    model: "qwen3.5-plus",
  },
];

const providerIds = providerProofs.map((proof) => proof.provider);
const providerSessionMaterialCatalog = {
  chatgpt: {
    envNames: [
      "WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE",
      "WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT",
    ],
    probeUrl: "https://chatgpt.com/api/auth/session",
  },
  gemini: {
    envNames: [
      "WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE",
      "WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT",
    ],
    probeUrl: "https://gemini.google.com/app",
  },
  claude: {
    envNames: [
      "WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE",
      "WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT",
    ],
    probeUrl: "https://claude.ai/api/organizations",
  },
  grok: {
    envNames: [
      "WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE",
      "WEBAI_BRIDGE_WEB_GROK_USER_AGENT",
    ],
    probeUrl: "https://grok.com",
  },
  qwen: {
    envNames: [
      "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
      "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
    ],
    probeUrl: "https://chat.qwen.ai",
  },
};

function buildVerifyWebLoginCommand(providers) {
  if (!providers || providers.length === 0) {
    return "pnpm exec node scripts/verify-web-login-live.mjs";
  }

  return `pnpm exec node scripts/verify-web-login-live.mjs --provider ${providers.join(",")}`;
}

function buildProviderRerunCommand(provider) {
  return `pnpm run bootstrap:web-login-browser -- --provider ${provider} && ${buildVerifyWebLoginCommand([provider])}`;
}

function buildProviderSupportBundlePath(provider) {
  return `.runtime-cache/browser-support/${provider}-support-bundle.json`;
}

function buildProviderDiagnoseCommand(provider) {
  return `pnpm exec node scripts/diagnose-web-login-browser.mjs --provider ${provider} --reload --json --bundle-path ${buildProviderSupportBundlePath(provider)}`;
}

function buildProviderDiagnosisArtifacts(provider) {
  return {
    diagnoseCommand: buildProviderDiagnoseCommand(provider),
    supportBundlePath: buildProviderSupportBundlePath(provider),
  };
}

function summarizeProviderResult(result) {
  if (!result || typeof result !== "object") {
    return "unknown";
  }

  if (result.status === "external-blocker") {
    return `${result.status}:${result.blocker ?? result.classification ?? "unknown"}`;
  }

  if (result.status === "failure") {
    return `${result.status}:${result.reason ?? result.classification ?? "unknown"}`;
  }

  return `${result.status ?? "unknown"}`;
}

function resolveRequestedProviders(requestedProviders) {
  if (!requestedProviders || requestedProviders.length === 0) {
    return providerProofs;
  }

  const normalized = [
    ...new Set(
      requestedProviders
        .map((provider) => `${provider}`.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const invalid = normalized.filter((provider) => !providerIds.includes(provider));

  if (invalid.length > 0) {
    throw new Error(
      `Unknown web-login provider filter: ${invalid.join(", ")}. Expected one or more of ${providerIds.join(", ")}.`,
    );
  }

  return providerProofs.filter((proof) => normalized.includes(proof.provider));
}

export function parseProviderArgs(argv = process.argv.slice(2)) {
  const providers = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--provider") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("Missing value for --provider.");
      }

      providers.push(
        ...value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      providers.push(
        ...arg
          .slice("--provider=".length)
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return providers;
}

export function createInvokeProofExpectation(provider) {
  const shortSuffix = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  const stableBaseTokens = {
    chatgpt: "CHATGPT_OK",
    gemini: "GEMINI_OK",
    claude: "CLAUDE_OK",
    grok: "GROK_OK",
    qwen: "QWEN_OK",
  };
  const token = `${stableBaseTokens[provider] ?? provider.toUpperCase()}_${shortSuffix}`;

  return {
    prompt: `Reply with exactly ${token} and nothing else.`,
    token,
  };
}

const invokeProofExpectations = {
  chatgpt: createInvokeProofExpectation("chatgpt"),
  gemini: createInvokeProofExpectation("gemini"),
  claude: createInvokeProofExpectation("claude"),
  grok: createInvokeProofExpectation("grok"),
  qwen: createInvokeProofExpectation("qwen"),
};

export function getInvokeProofExpectation(provider) {
  return invokeProofExpectations[provider];
}

const PROVIDER_LIVE_PROOF_TIMEOUT_MS = {
  chatgpt: 45_000,
  gemini: 75_000,
  claude: 45_000,
  grok: 45_000,
  qwen: 45_000,
};

const PROVIDER_INVOKE_TIMEOUT_MS = {
  chatgpt: 90_000,
  gemini: 180_000,
  claude: 60_000,
  grok: 240_000,
  qwen: 60_000,
};
const PROVIDER_ISOLATION_OVERHEAD_MS = 30_000;

const browserBackedProviders = new Set(["chatgpt", "gemini", "claude", "grok", "qwen"]);

export function normalizeInvokeProofText(value) {
  return `${value ?? ""}`
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "")
    .toLowerCase();
}

function trimTokenPunctuation(value) {
  return value.replace(/^[`"'([{<\s]+|[`"')\]}>.,:;!?\s]+$/g, "");
}

export function resolveVerifiedInvokeOutputText(value, expectedToken) {
  const normalizedExpectedToken = normalizeInvokeProofText(expectedToken);
  const normalizedValue = normalizeInvokeProofText(value);

  if (normalizedValue === normalizedExpectedToken) {
    return expectedToken;
  }

  if (normalizedValue.endsWith(normalizedExpectedToken)) {
    return expectedToken;
  }

  const exactLineMatch = `${value ?? ""}`
    .split(/\r?\n/)
    .map((line) => trimTokenPunctuation(line.trim()))
    .filter(Boolean)
    .findLast((line) => normalizeInvokeProofText(line) === normalizedExpectedToken);

  return exactLineMatch;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function bootstrapManagedBrowser(
  provider,
  env = process.env,
  options = { ensureOnly: true },
) {
  if (!browserBackedProviders.has(provider)) {
    return undefined;
  }

  const args = [
    join(scriptDir, "bootstrap-web-auth-browser.mjs"),
    "--provider",
    provider,
  ];

  if (options.ensureOnly !== false) {
    args.push("--ensure-only");
  }

  args.push("--json");

  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    return undefined;
  }

  const stdout = result.stdout?.trim();

  if (!stdout) {
    return undefined;
  }

  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function shouldRetryWithManagedBootstrap(invokeResult) {
  if (!invokeResult || invokeResult.ok) {
    return false;
  }

  const lowerMessage = `${invokeResult.message ?? ""}`.toLowerCase();

  return (
    lowerMessage.includes("connectovercdp") ||
    lowerMessage.includes("target page, context or browser has been closed") ||
    lowerMessage.includes("execution context was destroyed") ||
    lowerMessage.includes("timeout 30000ms exceeded") ||
    lowerMessage.includes("econnrefused 127.0.0.1:39222")
  );
}

function buildIsolatedProviderTimeout(provider) {
  return (
    PROVIDER_LIVE_PROOF_TIMEOUT_MS[provider] +
    PROVIDER_INVOKE_TIMEOUT_MS[provider] +
    PROVIDER_ISOLATION_OVERHEAD_MS
  );
}

function buildIsolatedProviderFailure(provider, env, diagnostic, classification = "transport-instability") {
  return mapBrowserAttachFailureAsExternalBlocker(provider, env, diagnostic) ?? {
    status: "failure",
    provider,
    classification,
    probeUrl: providerSessionMaterialCatalog[provider]?.probeUrl,
    reason: "probe-request-failed",
    diagnostic,
    summary: `${provider} live verification aborted inside its isolated provider lane.`,
    envStatus: collectProviderSessionMaterialStatus(provider, env),
    ...buildProviderDiagnosisArtifacts(provider),
  };
}

function mapIsolatedProviderFailureResult(result) {
  if (
    result?.provider === "chatgpt" &&
    result.status === "failure" &&
    result.reason === "probe-request-failed" &&
    (
      result.classification === "transport-instability" ||
      /target page, context or browser has been closed|connectovercdp|econnrefused/i.test(
        `${result.diagnostic ?? ""}`,
      )
    )
  ) {
    return {
      status: "external-blocker",
      provider: result.provider,
      blocker: `${result.provider}-cdp-unavailable`,
      classification: "transport-instability",
      probeUrl: result.probeUrl,
      finalUrl: result.finalUrl,
      responseStatus: result.responseStatus,
      envStatus: result.envStatus,
      rerunCommand: buildProviderRerunCommand(result.provider),
      ...buildProviderDiagnosisArtifacts(result.provider),
      diagnostic: result.diagnostic,
      summary:
        `${result.provider} needs the managed onboarding browser attached over CDP before WebaiBridge can prove or invoke the live web session.`,
      debug: result.debug,
    };
  }

  return result;
}

function mapBrowserAttachFailureAsExternalBlocker(provider, env, diagnostic) {
  if (!(provider === "chatgpt" || provider === "gemini")) {
    return undefined;
  }

  const lowerDiagnostic = `${diagnostic ?? ""}`.toLowerCase();

  if (
    !(
      lowerDiagnostic.includes("connectovercdp") ||
      lowerDiagnostic.includes("econnrefused") ||
      lowerDiagnostic.includes("existing-profile-locked") ||
      lowerDiagnostic.includes("cdp-unreachable") ||
      lowerDiagnostic.includes("endpoint-not-devtools")
    )
  ) {
    return undefined;
  }

  return {
    status: "external-blocker",
    provider,
    blocker: `${provider}-cdp-unavailable`,
    classification: "transport-instability",
    probeUrl: providerSessionMaterialCatalog[provider]?.probeUrl,
    envStatus: collectProviderSessionMaterialStatus(provider, env),
    rerunCommand: buildProviderRerunCommand(provider),
    ...buildProviderDiagnosisArtifacts(provider),
    diagnostic,
    summary: `${provider} needs the managed onboarding browser attached over CDP before WebaiBridge can prove or invoke the live web session.`,
  };
}

function runIsolatedProviderVerificationOnce(provider, env = process.env) {
  const timeout = buildIsolatedProviderTimeout(provider);
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--provider", provider],
    {
      cwd: repoRoot,
      env: {
        ...env,
        [ISOLATED_CHILD_ENV_NAME]: "1",
      },
      encoding: "utf8",
      timeout,
    },
  );

  if (
    result.error instanceof Error &&
    "code" in result.error &&
    result.error.code === "ETIMEDOUT"
  ) {
    return mapIsolatedProviderFailureResult(
      buildIsolatedProviderFailure(
        provider,
        env,
        `${provider} isolated live verification timed out after ${timeout}ms.`,
      ),
    );
  }

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout?.trim();

  if (stdout) {
    try {
      const parsed = JSON.parse(stdout);

      if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] && typeof parsed[0] === "object") {
        return mapIsolatedProviderFailureResult({
          provider,
          ...parsed[0],
        });
      }
    } catch {
      // Fall through to the structured failure below when the child does not emit parseable JSON.
    }
  }

  return mapIsolatedProviderFailureResult(
    buildIsolatedProviderFailure(
      provider,
      env,
      result.stderr?.trim() ||
        stdout ||
        `${provider} isolated live verification exited without a parseable JSON payload.`,
      result.status === 0 ? "probe-misclassification" : "transport-instability",
    ),
  );
}

function shouldRetryIsolatedProviderFailure(result) {
  if (!result || result.status !== "failure") {
    return false;
  }

  const diagnostic = `${result.diagnostic ?? ""}`.toLowerCase();

  return (
    diagnostic.includes("parseable json payload") ||
    diagnostic.includes("[verify:web-login-live]") ||
    diagnostic.includes("provider-start") ||
    diagnostic.includes("provider-finish") ||
    diagnostic.includes("connectovercdp") ||
    diagnostic.includes("eaddrnotavail") ||
    diagnostic.includes("econnrefused") ||
    diagnostic.includes("execution context was destroyed") ||
    diagnostic.includes("target page, context or browser has been closed") ||
    diagnostic.includes("page has been closed") ||
    diagnostic.includes("browser has been closed") ||
    diagnostic.includes("fetch failed")
  );
}

function runIsolatedProviderVerification(provider, env = process.env) {
  const firstResult = runIsolatedProviderVerificationOnce(provider, env);

  if (!shouldRetryIsolatedProviderFailure(firstResult)) {
    return firstResult;
  }

  if (browserBackedProviders.has(provider)) {
    bootstrapManagedBrowser(provider, env, {
      ensureOnly: false,
    });
  }

  return runIsolatedProviderVerificationOnce(provider, env);
}

async function runWithTimeout(label, timeoutMs, factory) {
  let timeoutId;

  try {
    return await Promise.race([
      factory(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createEphemeralCompiledOutDir() {
  mkdirSync(tempRootDir, {
    recursive: true,
  });

  return join(tempRootDir, `web-login-live-proof-${process.pid}-${randomUUID()}`);
}

function prepareCompiledOutDir(compiledOutDir) {
  rmSync(compiledOutDir, {
    recursive: true,
    force: true,
  });
}

function compileWebLoginProviderProofs(compiledOutDir, selectedProviderProofs = providerProofs) {
  for (const proof of selectedProviderProofs) {
    run("pnpm", [
      "exec",
      "tsc",
      "-p",
      proof.tsconfig,
      "--pretty",
      "false",
      "--noEmit",
      "false",
      "--rootDir",
      repoRoot,
      "--outDir",
      compiledOutDir,
      "--declaration",
      "false",
      "--declarationMap",
      "false",
      "--sourceMap",
      "false",
    ]);
  }
}

function collectProviderSessionMaterialStatus(provider, env) {
  const sessionMaterial = providerSessionMaterialCatalog[provider];

  if (!sessionMaterial) {
    return [];
  }

  return sessionMaterial.envNames.map((name) => ({
    name,
    present: Boolean(env[name]?.trim()),
  }));
}

async function enrichProviderResultWithDebug(provider, result, env) {
  if (
    !browserBackedProviders.has(provider) ||
    !result ||
    typeof result !== "object" ||
    (result.status !== "external-blocker" && result.status !== "failure")
  ) {
    return result;
  }

  const debug = await captureBrowserDebugContext(provider, result, env);

  if (
    result.status === "failure" &&
    debug?.attachError
  ) {
    const attachFailure = mapBrowserAttachFailureAsExternalBlocker(
      provider,
      env,
      debug.attachError,
    );

    if (attachFailure) {
      return {
        ...attachFailure,
        debug,
      };
    }
  }

  return debug ? { ...result, debug } : result;
}

function buildMissingSessionMaterialResult(provider, env) {
  const sessionMaterial = providerSessionMaterialCatalog[provider];
  const envStatus = collectProviderSessionMaterialStatus(provider, env);

  return {
    status: "external-blocker",
    provider,
    blocker: "missing-web-session-material",
    classification: "session-material-missing",
    probeUrl: sessionMaterial?.probeUrl,
    envStatus,
    missingEnvNames: envStatus
      .filter((entry) => !entry.present)
      .map((entry) => entry.name),
    rerunCommand: buildProviderRerunCommand(provider),
    ...buildProviderDiagnosisArtifacts(provider),
    summary:
      "Missing the provider-specific cookie bundle and browser user agent required for the live web proof.",
  };
}

function providerHasSessionMaterial(proof, env, storedSessions) {
  const envStatus = collectProviderSessionMaterialStatus(proof.provider, env);

  if (envStatus.length > 0 && envStatus.every((entry) => entry.present)) {
    return true;
  }

  const storedSession = storedSessions[proof.provider];

  if (!storedSession || typeof storedSession !== "object") {
    return false;
  }

  const state = storedSession.state;
  return typeof state === "string" && state !== "missing";
}

function resolveGeminiCdpUrl(env = process.env) {
  const defaultSharedCdpUrl =
    resolveCredentialedBrowserMode(env) === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
      ? env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
      : WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL;

  return (
    env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim() ||
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    defaultSharedCdpUrl
  );
}

function applyPreferredCdpDefaults(env) {
  if (resolveCredentialedBrowserMode(env) !== WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return env;
  }

  const sharedCdpUrl =
    env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
    WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL;

  return {
    ...env,
    [EXISTING_PROFILE_CDP_URL_ENV_NAME]:
      env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() || sharedCdpUrl,
    [SHARED_WEB_AUTH_CDP_URL_ENV_NAME]: sharedCdpUrl,
    [GEMINI_WEB_CDP_URL_ENV_NAME]: sharedCdpUrl,
  };
}

function isGeminiCdpUnavailable(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    invokeResult.errorCategory === "provider-unavailable" &&
    [
      "connectovercdp",
      "ecconnrefused",
      "econnrefused",
      "cdp",
      "chrome context",
      "browser dom transport",
    ].some((needle) => message.includes(needle))
  );
}

function isGeminiSessionExternalBlocker(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    message.includes("cookiemismatch") ||
    message.includes("unauthenticated or incomplete session") ||
    message.includes("redirected away from gemini.google.com") ||
    message.includes("input box not found")
  );
}

function isGeminiHumanVerificationSignal(value) {
  const lowerValue = `${value ?? ""}`.toLowerCase();

  return (
    textContainsUrlWithHostAndPathPrefix(value, "google.com", "/sorry") ||
    lowerValue.includes("abnormal-traffic verification page") ||
    lowerValue.includes("abnormal traffic verification page") ||
    lowerValue.includes("unusual traffic") ||
    lowerValue.includes("自动程序") ||
    lowerValue.includes("异常流量")
  );
}

function isGeminiRateLimitedSignal(value) {
  const lowerValue = `${value ?? ""}`.toLowerCase();

  return (
    lowerValue.includes("rate-limit") ||
    lowerValue.includes("rate limit") ||
    lowerValue.includes("usage-cap") ||
    lowerValue.includes("usage cap") ||
    lowerValue.includes("usage limit") ||
    lowerValue.includes("reached your limit") ||
    lowerValue.includes("reached the limit") ||
    lowerValue.includes("已达到使用上限") ||
    lowerValue.includes("达到限制") ||
    lowerValue.includes("请求过多")
  );
}

function isGeminiCdpUnavailableSignal(value) {
  const lowerValue = `${value ?? ""}`.toLowerCase();

  return (
    lowerValue.includes("connectovercdp") ||
    lowerValue.includes("econnrefused") ||
    lowerValue.includes("browser session") ||
    lowerValue.includes("chrome context")
  );
}

function isBrowserProofWorthRetry(liveProofResult) {
  return (
    liveProofResult.status === "failure" &&
    liveProofResult.reason === "probe-unexpected-body"
  );
}

function isProviderRiskExternalBlocker(proof, invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  if (proof.provider === "chatgpt") {
    return (
      message.includes("unusual activity") ||
      message.includes("token_invalidated") ||
      message.includes("authentication token has been invalidated") ||
      message.includes("try signing in again") ||
      message.includes("captcha") ||
      message.includes("human verification") ||
      message.includes("verify you are human") ||
      message.includes("risk check") ||
      message.includes("rate limit") ||
      message.includes("try again later") ||
      message.includes("usage limit") ||
      message.includes("usage cap") ||
      message.includes("message cap") ||
      message.includes("reached our limit") ||
      message.includes("reached the limit") ||
      message.includes("too many requests") ||
      message.includes("too many messages")
    );
  }

  if (proof.provider === "grok") {
    return (
      message.includes("anti-bot") ||
      message.includes("captcha") ||
      message.includes("human verification") ||
      message.includes("verify you are human")
    );
  }

  return false;
}

function isQwenSessionExternalBlocker(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    message.includes("qwen chat creation did not return a chat id") ||
    message.includes("unauthorized") ||
    message.includes("do not have permission") ||
    message.includes("session token") ||
    message.includes("refresh the qwen browser session")
  );
}

function isChatgptEmailVerificationRequired(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    message.includes("email verification") ||
    message.includes("check your inbox") ||
    message.includes("verification code")
  );
}

function isChatgptBrowserSessionIncomplete(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    message.includes("logged-out landing page") ||
    message.includes("login/signup controls") ||
    message.includes("browser workspace is not ready")
  );
}

function isGeminiBrowserSessionInvalid(invokeResult) {
  const message = `${invokeResult.message ?? ""} ${invokeResult.suggestedAction ?? ""}`.toLowerCase();

  return (
    message.includes("cookiemismatch") ||
    message.includes("google sign-in screen") ||
    message.includes("browser session must be repaired")
  );
}

export function mapGeminiLiveProofFailureResult(liveProofResult, env = process.env) {
  if (
    liveProofResult.provider !== "gemini" ||
    liveProofResult.status !== "failure" ||
    !liveProofResult.diagnostic
  ) {
    return undefined;
  }

  if (isGeminiCdpUnavailableSignal(liveProofResult.diagnostic)) {
    return {
      status: "external-blocker",
      provider: "gemini",
      blocker: "gemini-cdp-unavailable",
      classification: "transport-instability",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: [
        ...liveProofResult.envStatus,
        {
          name: GEMINI_WEB_CDP_URL_ENV_NAME,
          present: Boolean(env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()),
        },
        {
          name: SHARED_WEB_AUTH_CDP_URL_ENV_NAME,
          present: Boolean(env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()),
        },
      ],
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: liveProofResult.diagnostic,
      summary:
        "Gemini needs the managed onboarding browser attached over CDP before WebaiBridge can prove or invoke the live web session.",
    };
  }

  if (
    isGeminiRateLimitedSignal(liveProofResult.diagnostic) ||
    isGeminiRateLimitedSignal(liveProofResult.summary)
  ) {
    return {
      status: "external-blocker",
      provider: "gemini",
      blocker: "gemini-provider-rate-limited",
      classification: "provider-unavailable",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: liveProofResult.diagnostic,
      summary:
        "Gemini attached browser is already showing a usage-cap or rate-limit gate. Wait for provider capacity or upgrade the account, then rerun the Gemini live gate.",
    };
  }

  if (
    !(
      isGeminiHumanVerificationSignal(liveProofResult.finalUrl) ||
      isGeminiHumanVerificationSignal(liveProofResult.diagnostic) ||
      isGeminiHumanVerificationSignal(liveProofResult.summary)
    )
  ) {
    return undefined;
  }

  return {
    status: "external-blocker",
    provider: "gemini",
    blocker: "gemini-human-verification-required",
    classification: "human-verification-required",
    probeUrl: liveProofResult.probeUrl,
    finalUrl: liveProofResult.finalUrl,
    responseStatus: liveProofResult.responseStatus,
    envStatus: liveProofResult.envStatus,
    cdpUrl: resolveGeminiCdpUrl(env),
    rerunCommand: buildProviderRerunCommand("gemini"),
    ...buildProviderDiagnosisArtifacts("gemini"),
    diagnostic: liveProofResult.diagnostic,
    summary:
      "Gemini is currently landing on Google's abnormal-traffic verification page. Clear the human verification inside the attached Gemini browser, then rerun the live gate.",
  };
}

export function mapGrokLiveProofFailureResult(liveProofResult) {
  if (
    liveProofResult.provider !== "grok" ||
    liveProofResult.status !== "failure" ||
    liveProofResult.reason !== "probe-unexpected-body"
  ) {
    return undefined;
  }

  const lowerDiagnostic = `${liveProofResult.diagnostic ?? ""}`.toLowerCase();
  const lowerSummary = `${liveProofResult.summary ?? ""}`.toLowerCase();

  if (
    liveProofResult.classification === "user-action-required" ||
    lowerDiagnostic.includes("linking an x account") ||
    lowerDiagnostic.includes("unlocking the required plan") ||
    lowerDiagnostic.includes("end-user account action")
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-account-action-required",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: liveProofResult.diagnostic,
      summary:
        "Grok cookie material is present, but the attached browser still requires an end-user account action such as linking an X account or unlocking the required plan before the live composer can run.",
    };
  }

  if (
    liveProofResult.classification === "human-verification-required" ||
    lowerDiagnostic.includes("human-verification") ||
    lowerDiagnostic.includes("anti-bot gate") ||
    lowerDiagnostic.includes("captcha")
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-human-verification-required",
      classification: "human-verification-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: liveProofResult.diagnostic,
      summary:
        "Grok cookie material is present, but the attached browser is blocked on a human-verification or anti-bot gate. Complete that verification in the WebaiBridge browser, then rerun the Grok-only live gate.",
    };
  }

  if (
    !(
      lowerDiagnostic.includes("unauthenticated") ||
      lowerDiagnostic.includes("missing the live composer surface") ||
      lowerDiagnostic.includes("incomplete session") ||
      textContainsUrlWithHostname(liveProofResult.summary ?? "", "grok.com")
    )
  ) {
    return undefined;
  }

  return {
    status: "external-blocker",
    provider: "grok",
    blocker: "grok-browser-session-incomplete",
    classification: "session-incomplete",
    probeUrl: liveProofResult.probeUrl,
    finalUrl: liveProofResult.finalUrl,
    responseStatus: liveProofResult.responseStatus,
    envStatus: liveProofResult.envStatus,
    rerunCommand: buildProviderRerunCommand("grok"),
    ...buildProviderDiagnosisArtifacts("grok"),
    diagnostic: liveProofResult.diagnostic,
    summary:
      "Grok cookie material is present, but the attached browser is not landing on the authenticated composer surface. Reopen Grok in the WebaiBridge browser, finish sign-in or any human verification there, then rerun the Grok-only live gate.",
  };
}

function buildProviderRiskExternalBlocker({ proof, liveProofResult, invokeResult }) {
  if (proof.provider === "chatgpt") {
    const lowerMessage = `${invokeResult.message ?? ""}`.toLowerCase();
    const isRateLimited =
      lowerMessage.includes("rate limit") ||
      lowerMessage.includes("try again later") ||
      lowerMessage.includes("usage limit") ||
      lowerMessage.includes("usage cap") ||
      lowerMessage.includes("message cap") ||
      lowerMessage.includes("reached our limit") ||
      lowerMessage.includes("reached the limit") ||
      lowerMessage.includes("too many requests") ||
      lowerMessage.includes("too many messages");
    const isTokenInvalidated =
      lowerMessage.includes("token_invalidated") ||
      lowerMessage.includes("authentication token has been invalidated") ||
      lowerMessage.includes("try signing in again");

    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: isTokenInvalidated
        ? "chatgpt-session-refresh-required"
        : isRateLimited
          ? "chatgpt-provider-rate-limited"
        : "chatgpt-risk-check-required",
      classification: isRateLimited ? "provider-unavailable" : "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("chatgpt"),
      ...buildProviderDiagnosisArtifacts("chatgpt"),
      diagnostic: invokeResult.message,
      summary:
        isTokenInvalidated
          ? "ChatGPT proved the stored session, but the live conversation endpoint reports that the current auth token has been invalidated. Reopen ChatGPT in the WebaiBridge browser, complete sign-in again, then rerun the live gate."
          : isRateLimited
            ? "ChatGPT attached browser is already showing a visible rate-limit gate. Wait for provider capacity or switch to a plan with more headroom, then rerun the ChatGPT-only live gate."
          : "ChatGPT proved the stored session, but the live conversation endpoint was blocked by an unusual-activity risk check. Reopen ChatGPT in the WebaiBridge browser, finish any verification/CAPTCHA, then rerun the live gate.",
    };
  }

  return {
    status: "external-blocker",
    provider: proof.provider,
    blocker: "grok-anti-bot-check-required",
    classification: "human-verification-required",
    probeUrl: liveProofResult.probeUrl,
    finalUrl: liveProofResult.finalUrl,
    responseStatus: liveProofResult.responseStatus,
    envStatus: liveProofResult.envStatus,
    rerunCommand: buildProviderRerunCommand("grok"),
    diagnostic: invokeResult.message,
    summary:
      "Grok proved the stored session, but the live response endpoint was rejected by upstream anti-bot checks. Reopen Grok in the WebaiBridge browser, complete any human verification, then rerun the live gate.",
  };
}

function isClaudeProviderUnavailable(invokeResult) {
  const lowerMessage = `${invokeResult?.message ?? ""}`.toLowerCase();

  return (
    lowerMessage.includes("http 429") ||
    lowerMessage.includes("rate_limit_error") ||
    lowerMessage.includes("exceeded_limit")
  );
}

function isClaudeAccountActionRequired(invokeResult) {
  const lowerMessage = `${invokeResult?.message ?? ""}`.toLowerCase();

  return (
    lowerMessage.includes("permission_error") &&
    (
      lowerMessage.includes("subscription_past_due") ||
      lowerMessage.includes("past due") ||
      lowerMessage.includes("overdue invoice") ||
      lowerMessage.includes("restore access")
    )
  );
}

export function detectSoftInvokeFailure({ proof, liveProofResult, invokeResult }) {
  const outputText = `${invokeResult.outputText ?? ""}`.toLowerCase();

  if (proof.provider === "qwen" && outputText.includes("model not found")) {
    return {
      status: "failure",
      provider: proof.provider,
      classification: "probe-misclassification",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      reason: "invoke-failed",
      invokeErrorCategory: "model-resolution-error",
      failureStage: "invoke",
      diagnostic:
        "Qwen runtime reached the upstream transport, but the configured model id was rejected as not found.",
      summary:
        "WebaiBridge reached the live Qwen transport, but the configured model id does not exist upstream. Update the default Qwen model before rerunning verify:web-login-live.",
      envStatus: liveProofResult.envStatus,
    };
  }

  const expectation = invokeProofExpectations[proof.provider];
  const normalizedExpectedToken = normalizeInvokeProofText(expectation.token);
  const normalizedOutputText = normalizeInvokeProofText(invokeResult.outputText);
  const verifiedOutputText = resolveVerifiedInvokeOutputText(
    invokeResult.outputText,
    expectation.token,
  );

  if (
    !verifiedOutputText &&
    proof.provider === "grok" &&
    normalizedOutputText.includes(normalizedExpectedToken)
  ) {
    return undefined;
  }

  if (!verifiedOutputText) {
    return {
      status: "failure",
      provider: proof.provider,
      classification: "probe-misclassification",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      reason: "invoke-failed",
      invokeErrorCategory: "provider-unavailable",
      failureStage: "invoke",
      diagnostic:
        `The ${proof.provider} invoke proof returned output, but it did not produce an exact sentinel reply for ${expectation.token}.`,
      summary:
        "The runtime reached the provider, but the returned content still looks too weak to count as a reliable live success.",
      envStatus: liveProofResult.envStatus,
    };
  }

  return undefined;
}

export function mapInvokeFailureResult({ proof, liveProofResult, invokeResult, env = process.env }) {
  if (proof.provider === "gemini" && isGeminiHumanVerificationSignal(invokeResult.message)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "gemini-human-verification-required",
      classification: "human-verification-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: invokeResult.message,
      summary:
        "Gemini is currently landing on Google's abnormal-traffic verification page. Clear the human verification inside the attached Gemini browser, then rerun the live gate.",
    };
  }

  if (proof.provider === "gemini" && isGeminiRateLimitedSignal(invokeResult.message)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "gemini-provider-rate-limited",
      classification: "provider-unavailable",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      diagnostic: invokeResult.message,
      summary:
        "Gemini attached browser is already showing a usage-cap or rate-limit gate. Wait for provider capacity or upgrade the account, then rerun the Gemini live gate.",
    };
  }

  if (proof.provider === "gemini" && isGeminiCdpUnavailable(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "gemini-cdp-unavailable",
      classification: "transport-instability",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: [
        ...liveProofResult.envStatus,
        {
          name: GEMINI_WEB_CDP_URL_ENV_NAME,
          present: Boolean(env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()),
        },
        {
          name: SHARED_WEB_AUTH_CDP_URL_ENV_NAME,
          present: Boolean(env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()),
        },
      ],
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Let WebaiBridge start or reattach the managed Gemini onboarding browser, finish sign-in there, then rerun verify:web-login-live.",
    };
  }

  if (proof.provider === "gemini" && isGeminiBrowserSessionInvalid(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "gemini-browser-session-invalid",
      classification: "session-incomplete",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: invokeResult.message,
      summary:
        "Gemini is currently attached to a Google CookieMismatch or sign-in page. Reopen the managed Gemini browser, complete Google sign-in again, then rerun the live gate.",
    };
  }

  if (proof.provider === "gemini" && isGeminiSessionExternalBlocker(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "gemini-browser-session-incomplete",
      classification: "session-incomplete",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      cdpUrl: resolveGeminiCdpUrl(env),
      rerunCommand: buildProviderRerunCommand("gemini"),
      ...buildProviderDiagnosisArtifacts("gemini"),
      diagnostic: invokeResult.message,
      summary:
        "Gemini cookie material is present, but the attached browser session is not landing on the authenticated Gemini composer. Reopen Gemini in the WebaiBridge browser, finish Google sign-in or fix the CookieMismatch page, then rerun the live gate.",
    };
  }

  if (proof.provider === "chatgpt" && isChatgptEmailVerificationRequired(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "chatgpt-email-verification-required",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("chatgpt"),
      ...buildProviderDiagnosisArtifacts("chatgpt"),
      diagnostic: invokeResult.message,
      summary:
        "ChatGPT cookie material is present, but the attached browser is blocked on OpenAI email verification. Finish that verification in the managed browser, then rerun the ChatGPT-only live gate.",
    };
  }

  if (proof.provider === "chatgpt" && isChatgptBrowserSessionIncomplete(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "chatgpt-browser-session-incomplete",
      classification: "session-incomplete",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("chatgpt"),
      ...buildProviderDiagnosisArtifacts("chatgpt"),
      diagnostic: invokeResult.message,
      summary:
        "ChatGPT cookie material is present, but the attached browser is still on the logged-out landing page instead of an authenticated workspace. Reopen ChatGPT in the managed browser, complete sign-in there, then rerun the ChatGPT-only live gate.",
    };
  }

  if (
    proof.provider === "chatgpt" &&
    invokeResult.errorCategory === "user-action-required"
  ) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "chatgpt-browser-session-incomplete",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("chatgpt"),
      ...buildProviderDiagnosisArtifacts("chatgpt"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "ChatGPT still needs explicit browser-side session recovery before Web/Login traffic can continue.",
    };
  }

  if (
    proof.provider === "chatgpt" &&
    invokeResult.errorCategory === "provider-unavailable" &&
    /target page, context or browser has been closed|connectovercdp/i.test(
      `${invokeResult.message ?? ""}`,
    )
  ) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "chatgpt-cdp-unavailable",
      classification: "transport-instability",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("chatgpt"),
      ...buildProviderDiagnosisArtifacts("chatgpt"),
      diagnostic: invokeResult.message,
      summary:
        "ChatGPT proved the stored session, but the aggregate run lost a stable browser/CDP attach target before invocation completed. Reattach the managed browser and rerun the ChatGPT-only live gate.",
    };
  }

  if (isProviderRiskExternalBlocker(proof, invokeResult)) {
    return buildProviderRiskExternalBlocker({
      proof,
      liveProofResult,
      invokeResult,
    });
  }

  if (
    proof.provider === "qwen" &&
    invokeResult.errorCategory === "user-action-required"
  ) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "qwen-browser-session-incomplete",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("qwen"),
      ...buildProviderDiagnosisArtifacts("qwen"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Refresh the Qwen browser session in the same repo-owned browser, clear the remaining browser-side gate, and rerun the Qwen-only live gate.",
    };
  }

  if (
    proof.provider === "qwen" &&
    invokeResult.errorCategory === "provider-unavailable" &&
    isQwenSessionExternalBlocker(invokeResult)
  ) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "qwen-browser-session-incomplete",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("qwen"),
      ...buildProviderDiagnosisArtifacts("qwen"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Qwen browser workspace looks present, but the live chat bootstrap is still unauthorized or permission-gated. Refresh the Qwen session in the same repo-owned browser, clear the remaining browser-side gate, and rerun the Qwen-only live gate.",
    };
  }

  if (proof.provider === "claude" && isClaudeProviderUnavailable(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "claude-provider-rate-limited",
      classification: "provider-unavailable",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("claude"),
      ...buildProviderDiagnosisArtifacts("claude"),
      diagnostic: invokeResult.message,
      summary:
        "Claude proved the stored browser session, but the live completion endpoint is currently rate limited upstream. Retry the Claude-only live gate later without changing the local credential.",
    };
  }

  if (proof.provider === "claude" && isClaudeAccountActionRequired(invokeResult)) {
    return {
      status: "external-blocker",
      provider: proof.provider,
      blocker: "claude-account-action-required",
      classification: "account-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("claude"),
      ...buildProviderDiagnosisArtifacts("claude"),
      diagnostic: invokeResult.message,
      summary:
        "Claude proved the stored browser session, but the account behind this browser session is currently blocked by an overdue subscription payment. Restore the provider account first, then rerun the Claude-only live gate.",
    };
  }

  if (
    proof.provider === "grok" &&
    `${invokeResult.message ?? ""}`.toLowerCase().includes("grok browser dom fallback timed out")
  ) {
    return buildGrokInvokeTimeoutExternalBlocker({
      liveProofResult,
      diagnostic: invokeResult.message,
    });
  }

  if (
    proof.provider === "grok" &&
    invokeResult.errorCategory === "provider-unavailable" &&
    invokeResult.failureStage === "probe"
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-provider-unavailable",
      classification: "provider-unavailable",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Grok workspace proof passed, but the upstream provider probe is still unstable. Retry the Grok-only live gate later without changing the local browser session.",
    };
  }

  if (
    proof.provider === "grok" &&
    invokeResult.errorCategory === "provider-unavailable" &&
    /keyboard\.press|target crashed|target page, context or browser has been closed|connectovercdp/i.test(
      `${invokeResult.message ?? ""}`,
    )
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-provider-unavailable",
      classification: "provider-unavailable",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: invokeResult.message,
      summary:
        "Grok browser session is still present, but the live submit path crashed or detached before the provider could return a stable response. Treat this as an upstream/provider availability blocker and retry the Grok-only live gate later.",
    };
  }

  if (
    proof.provider === "grok" &&
    invokeResult.errorCategory === "refreshable-but-degraded"
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-browser-session-degraded",
      classification: "refreshable-but-degraded",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Grok browser workspace looks locally present, but the live composer session is degraded and must be renewed from the same repo-owned browser before traffic can continue.",
    };
  }

  if (
    proof.provider === "grok" &&
    invokeResult.errorCategory === "user-action-required"
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "grok-browser-session-incomplete",
      classification: "user-action-required",
      probeUrl: liveProofResult.probeUrl,
      finalUrl: liveProofResult.finalUrl,
      responseStatus: liveProofResult.responseStatus,
      envStatus: liveProofResult.envStatus,
      rerunCommand: buildProviderRerunCommand("grok"),
      ...buildProviderDiagnosisArtifacts("grok"),
      diagnostic: invokeResult.message,
      summary:
        invokeResult.suggestedAction ??
        "Grok workspace proof passed, but the browser session still needs an explicit user action before live Web/Login traffic can continue.",
    };
  }

  return {
    status: "failure",
    provider: proof.provider,
    classification:
      invokeResult.errorCategory === "provider-unavailable"
        ? "transport-instability"
        : "probe-misclassification",
    probeUrl: liveProofResult.probeUrl,
    finalUrl: liveProofResult.finalUrl,
    responseStatus: liveProofResult.responseStatus,
    reason: "invoke-failed",
    invokeErrorCategory: invokeResult.errorCategory,
    failureStage: invokeResult.failureStage,
    diagnostic: invokeResult.message,
    summary: invokeResult.suggestedAction,
    envStatus: liveProofResult.envStatus,
  };
}

export function buildGrokInvokeTimeoutExternalBlocker({
  liveProofResult,
  diagnostic,
}) {
  return {
    status: "external-blocker",
    provider: "grok",
    blocker: "grok-provider-unavailable",
    classification: "provider-unavailable",
    probeUrl: liveProofResult.probeUrl,
    finalUrl: liveProofResult.finalUrl,
    responseStatus: liveProofResult.responseStatus,
    envStatus: liveProofResult.envStatus,
    rerunCommand: buildProviderRerunCommand("grok"),
    ...buildProviderDiagnosisArtifacts("grok"),
    diagnostic,
    summary:
      "Grok browser workspace still looks authenticated, but the live response endpoint timed out after the session proof passed. Retry the Grok-only live gate later without changing the local browser session.",
  };
}

export function loadStoredWebAuthInputs(env) {
  const storePath = resolveLocalWebAuthStoreArtifactPath(env, repoRoot);

  if (!existsSync(storePath)) {
    return {
      storedRuntimeEnv: {},
      storedSessions: {},
    };
  }

  const raw = readFileSync(storePath, "utf8").trim();

  if (!raw) {
    return {
      storedRuntimeEnv: {},
      storedSessions: {},
    };
  }

  const parsed = JSON.parse(raw);
  const providers = parsed?.providers ?? {};
  const storedRuntimeEnv = {};
  const storedSessions = {};

  for (const [providerId, record] of Object.entries(providers)) {
    if (!record || typeof record !== "object") {
      continue;
    }

    const runtimeEnv = record.runtimeEnv ?? {};

    for (const [name, value] of Object.entries(runtimeEnv)) {
      if (value && !STORED_RUNTIME_ROUTING_ENV_NAMES.has(name)) {
        storedRuntimeEnv[name] = value;
      }
    }

    storedSessions[providerId] = {
      ...record,
      providerId,
    };
  }

  return {
    storedRuntimeEnv,
    storedSessions,
  };
}

export function readStoredWebSessionRecord(env, provider) {
  const { storedSessions } = loadStoredWebAuthInputs(env);
  const record = storedSessions[provider];
  return record && typeof record === "object" ? record : undefined;
}

export function writeStoredWebSessionRecord(env, provider, nextRecord) {
  const storePath = resolveLocalWebAuthStoreArtifactPath(env, repoRoot);
  const raw = existsSync(storePath) ? readFileSync(storePath, "utf8").trim() : "";
  const parsed = raw
    ? JSON.parse(raw)
    : {
        version: 1,
        providers: {},
      };

  parsed.version = 1;
  parsed.updatedAt = new Date().toISOString();
  parsed.providers ??= {};
  const existingRecord =
    parsed.providers[provider] && typeof parsed.providers[provider] === "object"
      ? parsed.providers[provider]
      : {};
  parsed.providers[provider] = {
    ...existingRecord,
    ...nextRecord,
    providerId: provider,
    runtimeEnv: {
      ...(existingRecord.runtimeEnv ?? {}),
      ...(nextRecord.runtimeEnv ?? {}),
    },
    captureProvenance:
      nextRecord.captureProvenance ?? existingRecord.captureProvenance,
    persistenceAudit:
      nextRecord.persistenceAudit ?? existingRecord.persistenceAudit,
    updatedAt: nextRecord.updatedAt ?? parsed.updatedAt,
  };

  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return storePath;
}

function inferBrowserPersistenceClassification(args) {
  const persistedClassification =
    args.result?.persistenceAudit?.workspaceClassification;

  if (persistedClassification) {
    return persistedClassification;
  }

  const directClassification = `${args.result?.classification ?? ""}`.toLowerCase();

  if (
    directClassification === "session-incomplete" ||
    directClassification === "human-verification-required" ||
    directClassification === "account-action-required" ||
    directClassification === "permission-gated"
  ) {
    return directClassification;
  }

  const storedClassification =
    args.storedSession?.persistenceAudit?.workspaceClassification;

  if (storedClassification) {
    return storedClassification;
  }

  const diagnostic = `${args.result?.diagnostic ?? args.result?.summary ?? ""}`.toLowerCase();

  if (
    args.provider === "qwen" &&
    args.artifactStates?.["session-token"] === "present" &&
    (
      diagnostic.includes("permission-gated") ||
      diagnostic.includes("unauthorized")
    )
  ) {
    return "permission-gated";
  }

  if (diagnostic.includes("human verification") || diagnostic.includes("anti-bot")) {
    return "human-verification-required";
  }

  if (
    diagnostic.includes("linking x") ||
    diagnostic.includes("connect your x account") ||
    diagnostic.includes("unlock the required plan") ||
    diagnostic.includes("account action")
  ) {
    return "account-action-required";
  }

  return args.nextState === "user-action-required"
    ? "login-required"
    : "provider-adjacent";
}

function persistBrowserBackedResultVerdict(args) {
  if (!browserBackedProviders.has(args.provider)) {
    return undefined;
  }

  const storedSession = args.storedSession;

  if (!storedSession || typeof storedSession !== "object") {
    return undefined;
  }

  const result = args.result;

  if (!result || typeof result !== "object") {
    return undefined;
  }

  let nextState;

  if (result.status === "external-blocker") {
    switch (result.classification) {
      case "session-material-missing":
        nextState = "missing";
        break;
      case "provider-unavailable":
        nextState = "provider-unavailable";
        break;
      case "transport-instability":
        nextState = "refreshable-but-degraded";
        break;
      case "session-incomplete":
      case "human-verification-required":
      case "account-action-required":
      case "user-action-required":
        nextState = "user-action-required";
        break;
      default:
        nextState = undefined;
        break;
    }
  }

  if (!nextState) {
    return undefined;
  }

  const updatedAt = new Date().toISOString();
  const summary = result.summary ?? result.diagnostic;
  const debugAuditTarget =
    result.debug?.attachTarget?.mode
      ? {
          mode: result.debug.attachTarget.mode,
          cdpUrl: result.debug.attachTarget.cdpUrl,
          sessionUrl: result.debug.attachTarget.cdpUrl,
          userDataDir: result.debug?.canonicalProfile?.managedProfileDir,
          existingProfileDir: result.debug?.canonicalProfile?.existingProfileDir,
          existingProfileDirectory: result.debug?.canonicalProfile?.existingProfileDirectory,
          existingProfileName: result.debug?.canonicalProfile?.existingProfileName,
          existingProfileCdpUrl: result.debug?.attachTarget?.cdpUrl,
        }
      : undefined;
  const debugDiskAudit = debugAuditTarget
    ? auditProviderPersistentArtifacts(args.provider, debugAuditTarget, {
        checkedAt: updatedAt,
      })
    : undefined;
  const artifactStates = mergeProviderArtifactStates(
    args.provider,
    storedSession.artifactStates,
    result.persistenceAudit?.artifactStates,
    debugDiskAudit?.artifactStates,
  );
  const debugCaptureProvenance =
    result.debug?.attachTarget?.mode === "isolated-chrome-root"
      ? {
          browserMode: "isolated-chrome-root",
          userDataDir: result.debug?.canonicalProfile?.existingProfileDir,
          profileDirectory: result.debug?.canonicalProfile?.existingProfileDirectory,
          profileName: result.debug?.canonicalProfile?.existingProfileName,
          cdpUrl: result.debug?.attachTarget?.cdpUrl,
          capturedAt: updatedAt,
        }
      : undefined;
  const debugPersistenceAudit =
    result.debug?.currentPage
      ? {
          ...(function () {
            const inferredWorkspaceClassification = inferBrowserPersistenceClassification({
              provider: args.provider,
              result,
              storedSession,
              artifactStates,
              nextState,
            });

            return {
              inferredWorkspaceClassification,
              inferredWorkspaceReady:
                inferredWorkspaceClassification === "workspace-ready",
            };
          })(),
          source: "verify",
          checkedAt: updatedAt,
          browserMode:
            debugCaptureProvenance?.browserMode ??
            storedSession.persistenceAudit?.browserMode,
          userDataDir:
            debugCaptureProvenance?.userDataDir ??
            storedSession.persistenceAudit?.userDataDir,
          profileDirectory:
            debugCaptureProvenance?.profileDirectory ??
            storedSession.persistenceAudit?.profileDirectory,
          profileName:
            debugCaptureProvenance?.profileName ??
            storedSession.persistenceAudit?.profileName,
          cdpUrl:
            debugCaptureProvenance?.cdpUrl ??
            storedSession.persistenceAudit?.cdpUrl,
          pageUrl: result.debug.currentPage.url,
          pageTitle: result.debug.currentPage.title,
          workspaceClassification: undefined,
          workspaceReady: false,
          cookieDbPath:
            debugDiskAudit?.cookieDbPath ??
            storedSession.persistenceAudit?.cookieDbPath,
          cookieDbAvailable:
            debugDiskAudit?.available ??
            storedSession.persistenceAudit?.cookieDbAvailable,
          hostCookieCount:
            debugDiskAudit?.hostCookieCount ??
            storedSession.persistenceAudit?.hostCookieCount,
          matchedCookieNames:
            debugDiskAudit?.matchedCookieNames ??
            storedSession.persistenceAudit?.matchedCookieNames,
          artifactStates,
          summary,
        }
      : undefined;
  if (debugPersistenceAudit) {
    debugPersistenceAudit.workspaceClassification =
      debugPersistenceAudit.inferredWorkspaceClassification;
    debugPersistenceAudit.workspaceReady =
      debugPersistenceAudit.inferredWorkspaceReady;
    delete debugPersistenceAudit.inferredWorkspaceClassification;
    delete debugPersistenceAudit.inferredWorkspaceReady;
  }
  if (!result.persistenceAudit && debugPersistenceAudit) {
    result.persistenceAudit = debugPersistenceAudit;
  }

  return writeStoredWebSessionRecord(args.env, args.provider, {
    ...storedSession,
    state: nextState,
    lastValidatedAt: updatedAt,
    updatedAt,
    requiredUserAction:
      nextState === "user-action-required" ? summary : undefined,
    degradedReason:
      nextState === "refreshable-but-degraded" || nextState === "user-action-required"
        ? summary
        : undefined,
    artifactStates,
    captureProvenance:
      debugCaptureProvenance ?? result.captureProvenance ?? storedSession.captureProvenance,
    persistenceAudit:
      result.persistenceAudit ?? debugPersistenceAudit ?? storedSession.persistenceAudit,
  });
}

function buildCoherenceExternalBlocker(args) {
  const workspaceClassification =
    args.coherence.persistenceAudit?.workspaceClassification;
  const blocker =
    args.reasonCode === "provenance-mismatch"
      ? `${args.provider}-browser-target-mismatch`
      : workspaceClassification === "human-verification-required"
        ? `${args.provider}-human-verification-required`
        : workspaceClassification === "account-action-required"
          ? `${args.provider}-account-action-required`
      : args.coherence.status === "user-action-required"
        ? `${args.provider}-browser-session-incomplete`
        : `${args.provider}-browser-session-degraded`;
  const qwenTokenPresent =
    args.provider === "qwen" &&
    args.coherence.artifactStates?.["session-token"] === "present";
  const summary =
    qwenTokenPresent &&
    args.coherence.status === "user-action-required"
      ? "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated. Refresh the Qwen session in the same repo-owned browser and clear the remaining browser-side gate before rerunning the Qwen-only live gate."
      : args.coherence.summary;

  return {
    status: "external-blocker",
    provider: args.provider,
    blocker,
    classification: args.coherence.status,
    probeUrl: providerSessionMaterialCatalog[args.provider]?.probeUrl,
    finalUrl: args.browserEvidence?.currentPage?.url,
    responseStatus: args.responseStatus,
    envStatus: collectProviderSessionMaterialStatus(args.provider, args.env),
    rerunCommand: buildProviderRerunCommand(args.provider),
    ...buildProviderDiagnosisArtifacts(args.provider),
    diagnostic: summary,
    summary,
    persistenceAudit: args.coherence.persistenceAudit,
  };
}

function refineBrowserBackedCoherence(args) {
  const coherence = args.coherence;

  if (
    args.provider !== "qwen" ||
    coherence.status !== "user-action-required" ||
    coherence.artifactStates?.["session-token"] !== "present"
  ) {
    return coherence;
  }

  const summary =
    "Qwen browser workspace and session-token are present, but the live chat bootstrap is still unauthorized or permission-gated. Refresh the Qwen session in the same repo-owned browser and clear the remaining browser-side gate before rerunning the Qwen-only live gate.";

  return {
    ...coherence,
    summary,
    requiredUserAction: summary,
    degradedReason: summary,
    persistenceAudit: coherence.persistenceAudit
      ? {
          ...coherence.persistenceAudit,
          summary,
        }
      : coherence.persistenceAudit,
  };
}

async function inspectProviderSessionCoherence(args) {
  if (!browserBackedProviders.has(args.proof.provider)) {
    return undefined;
  }

  const storedSession = args.storedSession;

  if (!storedSession || typeof storedSession !== "object") {
    return undefined;
  }

  const target = resolveCanonicalAttachTarget(
    args.proof.provider,
    args.env,
    storedSession,
  );
  const mergedStoredArtifacts = mergeProviderArtifactStates(
    args.proof.provider,
    storedSession.artifactStates,
  );
  const currentProvenance = buildBrowserCaptureProvenance({
    mode: target.mode,
    env: args.env,
    cdpUrl:
      target.existingProfileCdpUrl ??
      target.sessionUrl ??
      target.cdpUrl,
    capturedAt: new Date().toISOString(),
  });
  let browserEvidence = await collectBrowserEvidence(
    args.proof.provider,
    target,
    {
      reload: false,
      consoleLimit: 8,
      networkLimit: 12,
    },
  );
  let workspaceStatus = classifyLiveWorkspace(
    args.proof.provider,
    browserEvidence.currentPage,
    {
      storeStatus: {
        state: storedSession.state,
        reason:
          storedSession.requiredUserAction ??
          storedSession.degradedReason,
      },
      artifactStates: mergedStoredArtifacts,
      currentNetwork: browserEvidence.currentNetwork,
      currentConsole: browserEvidence.currentConsole,
    },
  );

  if (!workspaceStatus.liveReady) {
    browserEvidence = await collectBrowserEvidence(
      args.proof.provider,
      target,
      {
        reload: true,
        consoleLimit: 8,
        networkLimit: 12,
      },
    );
    workspaceStatus = classifyLiveWorkspace(
      args.proof.provider,
      browserEvidence.currentPage,
      {
        storeStatus: {
          state: storedSession.state,
          reason:
            storedSession.requiredUserAction ??
            storedSession.degradedReason,
        },
        artifactStates: mergedStoredArtifacts,
        currentNetwork: browserEvidence.currentNetwork,
        currentConsole: browserEvidence.currentConsole,
      },
    );
  }

  const diskAudit = auditProviderPersistentArtifacts(args.proof.provider, target, {
    checkedAt: currentProvenance.capturedAt,
  });
  const runtime = args.createRuntime();
  const runtimeStatus = await runtime.getStatus({
    env: args.env,
    sessions: {
      [args.proof.provider]: {
        ...storedSession,
        state: storedSession.state ?? "ready",
        acquisitionMode: target.mode,
        artifactStates: mergeProviderArtifactStates(
          args.proof.provider,
          storedSession.artifactStates,
          diskAudit.artifactStates,
        ),
        captureProvenance:
          storedSession.captureProvenance ?? currentProvenance,
      },
    },
  });
  const coherence = refineBrowserBackedCoherence({
    provider: args.proof.provider,
    coherence: evaluateProviderSessionCoherence({
      provider: args.proof.provider,
      storedSession,
      currentProvenance,
      target,
      browserEvidence,
      workspaceStatus,
      diskAudit,
      runtimeStatus,
      source: "verify",
      checkedAt: currentProvenance.capturedAt,
    }),
  });

  const nextRecordBase = {
    ...storedSession,
    acquisitionMode: target.mode,
    lastValidatedAt: currentProvenance.capturedAt,
    artifactStates: coherence.artifactStates,
    captureProvenance: currentProvenance,
    persistenceAudit: coherence.persistenceAudit,
    updatedAt: currentProvenance.capturedAt,
  };

  if (coherence.status === "ready") {
    writeStoredWebSessionRecord(args.env, args.proof.provider, {
      ...nextRecordBase,
      state: "ready",
      requiredUserAction: undefined,
      degradedReason: undefined,
    });
    return undefined;
  }

  const nextRecord = {
    ...nextRecordBase,
    state: coherence.status,
    requiredUserAction: coherence.requiredUserAction,
    degradedReason: coherence.degradedReason,
  };
  const storePath = writeStoredWebSessionRecord(
    args.env,
    args.proof.provider,
    nextRecord,
  );

  return {
    result: buildCoherenceExternalBlocker({
      provider: args.proof.provider,
      coherence,
      env: args.env,
      browserEvidence,
      responseStatus: 200,
      reasonCode:
        coherence.persistenceAudit.workspaceClassification === "login-required"
          ? "browser-session-incomplete"
          : coherence.persistenceAudit.summary.includes("provenance")
            ? "provenance-mismatch"
            : "browser-session-degraded",
    }),
    storePath,
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runWebLoginLiveVerification(options = {}) {
  const selectedProviderProofs = resolveRequestedProviders(options.providers);
  const env = options.env ?? process.env;
  const fetchFn = options.fetchFn ?? fetch;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : undefined;
  const runningInIsolatedChild = env[ISOLATED_CHILD_ENV_NAME] === "1";
  const shouldIsolateProviders =
    options.isolateProviders ??
    (
      fetchFn === fetch &&
      !options.outDir &&
      !runningInIsolatedChild &&
      selectedProviderProofs.some((proof) => browserBackedProviders.has(proof.provider))
    );

  if (shouldIsolateProviders) {
    return selectedProviderProofs.map((proof) => {
      onProgress?.({
        provider: proof.provider,
        stage: "isolated-provider-start",
      });

      const result = runIsolatedProviderVerification(proof.provider, env);

      onProgress?.({
        provider: proof.provider,
        stage: "isolated-provider-finish",
        summary: summarizeProviderResult(result),
      });

      return result;
    });
  }

  const compiledOutDir = options.outDir ?? createEphemeralCompiledOutDir();
  const ownsCompiledOutDir = !options.outDir;

  try {
    prepareCompiledOutDir(compiledOutDir);
    const { storedRuntimeEnv, storedSessions } = loadStoredWebAuthInputs(env);
    const resolvedEnv = applyPreferredCdpDefaults({
      ...env,
      ...storedRuntimeEnv,
    });
    const resultsByProvider = new Map();
    const readyProviderProofs = [];

    for (const proof of selectedProviderProofs) {
      if (providerHasSessionMaterial(proof, resolvedEnv, storedSessions)) {
        readyProviderProofs.push(proof);
        continue;
      }

      resultsByProvider.set(
        proof.provider,
        buildMissingSessionMaterialResult(proof.provider, resolvedEnv),
      );
    }

    if (readyProviderProofs.length === 0) {
      return selectedProviderProofs.map((proof) => resultsByProvider.get(proof.provider));
    }

    compileWebLoginProviderProofs(compiledOutDir, readyProviderProofs);

	    for (const proof of readyProviderProofs) {
      onProgress?.({
        provider: proof.provider,
        stage: "provider-start",
      });

	      try {
        if (fetchFn === fetch && browserBackedProviders.has(proof.provider)) {
          bootstrapManagedBrowser(proof.provider, resolvedEnv, {
            ensureOnly: false,
          });
        }

        const moduleUrl = new URL(pathToFileURL(join(compiledOutDir, proof.entrypoint)).href);
        moduleUrl.searchParams.set("ts", `${Date.now()}-${proof.provider}-proof`);
        const loaded = await import(moduleUrl.href);
        const runProof = loaded[proof.exportName];

        if (typeof runProof !== "function") {
          throw new Error(`Missing export ${proof.exportName} for ${proof.provider} live proof.`);
        }

	        let liveProofResult = await runWithTimeout(
	          `${proof.provider} live proof`,
	          PROVIDER_LIVE_PROOF_TIMEOUT_MS[proof.provider],
	          () => runProof(resolvedEnv, fetchFn),
        );

        if (isBrowserProofWorthRetry(liveProofResult) && proof.browserProofExportName) {
          const runBrowserProof = loaded[proof.browserProofExportName];

          if (typeof runBrowserProof === "function") {
            liveProofResult = await runWithTimeout(
              `${proof.provider} browser workspace proof`,
              PROVIDER_LIVE_PROOF_TIMEOUT_MS[proof.provider],
              () =>
                runBrowserProof(
                  resolvedEnv,
                  chromium.connectOverCDP.bind(chromium),
                ),
            );
          }
        }

    const geminiLiveProofExternalBlocker =
      proof.provider === "gemini"
        ? mapGeminiLiveProofFailureResult(liveProofResult, resolvedEnv)
        : undefined;
    const grokLiveProofExternalBlocker =
      proof.provider === "grok"
        ? mapGrokLiveProofFailureResult(liveProofResult)
        : undefined;

    if (geminiLiveProofExternalBlocker) {
      const enrichedResult = await enrichProviderResultWithDebug(
        proof.provider,
        geminiLiveProofExternalBlocker,
        resolvedEnv,
      );
      const storePath = persistBrowserBackedResultVerdict({
        provider: proof.provider,
        result: enrichedResult,
        storedSession: storedSessions[proof.provider],
        env: resolvedEnv,
      });
      if (storePath && enrichedResult && typeof enrichedResult === "object") {
        enrichedResult.storePath = storePath;
      }
      resultsByProvider.set(proof.provider, enrichedResult);
      onProgress?.({
        provider: proof.provider,
        stage: "provider-finish",
        summary: summarizeProviderResult(enrichedResult),
      });
      continue;
    }

    if (grokLiveProofExternalBlocker) {
      const enrichedResult = await enrichProviderResultWithDebug(
        proof.provider,
        grokLiveProofExternalBlocker,
        resolvedEnv,
      );
      const storePath = persistBrowserBackedResultVerdict({
        provider: proof.provider,
        result: enrichedResult,
        storedSession: storedSessions[proof.provider],
        env: resolvedEnv,
      });
      if (storePath && enrichedResult && typeof enrichedResult === "object") {
        enrichedResult.storePath = storePath;
      }
      resultsByProvider.set(proof.provider, enrichedResult);
      onProgress?.({
        provider: proof.provider,
        stage: "provider-finish",
        summary: summarizeProviderResult(enrichedResult),
      });
      continue;
    }

    if (liveProofResult.status !== "success") {
      const enrichedResult = await enrichProviderResultWithDebug(
        proof.provider,
        liveProofResult,
        resolvedEnv,
      );
      const storePath = persistBrowserBackedResultVerdict({
        provider: proof.provider,
        result: enrichedResult,
        storedSession: storedSessions[proof.provider],
        env: resolvedEnv,
      });
      if (storePath && enrichedResult && typeof enrichedResult === "object") {
        enrichedResult.storePath = storePath;
      }
      resultsByProvider.set(proof.provider, enrichedResult);
      onProgress?.({
        provider: proof.provider,
        stage: "provider-finish",
        summary: summarizeProviderResult(enrichedResult),
      });
      continue;
      }

        const runtimeModuleUrl = new URL(
          pathToFileURL(join(compiledOutDir, proof.runtimeEntrypoint)).href,
        );
        runtimeModuleUrl.searchParams.set("ts", `${Date.now()}-${proof.provider}-runtime`);
        const runtimeModule = await import(runtimeModuleUrl.href);
        const createRuntime = runtimeModule[proof.runtimeExportName];

        if (typeof createRuntime !== "function") {
          throw new Error(
            `Missing export ${proof.runtimeExportName} for ${proof.provider} runtime proof.`,
          );
        }

        let invokeSessionRecord =
          storedSessions[proof.provider] ?? {
            state: "ready",
            accountLabel: `${proof.provider}:live-proof`,
            lastValidatedAt: new Date().toISOString(),
          };

        if (fetchFn === fetch && browserBackedProviders.has(proof.provider)) {
          const runtimeForCoherence = createRuntime();

          if (typeof runtimeForCoherence.getStatus === "function") {
          const coherenceInspection = await inspectProviderSessionCoherence({
            proof,
            env: resolvedEnv,
            storedSession: storedSessions[proof.provider],
            createRuntime: () => runtimeForCoherence,
          });

          if (coherenceInspection) {
            const enrichedResult = await enrichProviderResultWithDebug(
              proof.provider,
              {
                ...coherenceInspection.result,
                storePath: coherenceInspection.storePath,
              },
              resolvedEnv,
            );
            resultsByProvider.set(proof.provider, enrichedResult);
            onProgress?.({
              provider: proof.provider,
              stage: "provider-finish",
              summary: summarizeProviderResult(enrichedResult),
            });
            continue;
          }

          invokeSessionRecord =
            readStoredWebSessionRecord(resolvedEnv, proof.provider) ??
            {
              ...invokeSessionRecord,
              state: "ready",
              requiredUserAction: undefined,
              degradedReason: undefined,
              lastValidatedAt: new Date().toISOString(),
            };
          }
        }

        const previousFetch = globalThis.fetch;
        const expectation = invokeProofExpectations[proof.provider];
        const invokeRequest = {
          provider: proof.provider,
          model: proof.model,
          input: expectation.prompt,
          lane: "web",
        };
        const invokeContext = {
          env: resolvedEnv,
          sessions: {
            [proof.provider]: invokeSessionRecord,
          },
        };
        const runtime = createRuntime();
        const runInvokeProof = () =>
          runWithTimeout(
            `${proof.provider} invoke proof`,
            PROVIDER_INVOKE_TIMEOUT_MS[proof.provider],
            () => runtime.invoke(invokeRequest, invokeContext),
          );

        if (fetchFn !== previousFetch) {
          globalThis.fetch = fetchFn;
        }

        let invokeResult;

	        try {
	          invokeResult = await runInvokeProof();
	        } catch (error) {
	          const message = error instanceof Error ? error.message : String(error);

	          if (
	            proof.provider === "grok" &&
	            proof.browserProofExportName &&
	            message.toLowerCase().includes("invoke proof timed out")
	          ) {
	            const runBrowserProof = loaded[proof.browserProofExportName];

	            if (typeof runBrowserProof === "function") {
	              const grokBrowserProofResult = await runWithTimeout(
	                `${proof.provider} browser workspace proof after invoke timeout`,
	                PROVIDER_LIVE_PROOF_TIMEOUT_MS[proof.provider],
	                () =>
	                  runBrowserProof(
	                    resolvedEnv,
	                    chromium.connectOverCDP.bind(chromium),
	                  ),
	              );
	              const mappedGrokBlocker = mapGrokLiveProofFailureResult(grokBrowserProofResult);

	              if (mappedGrokBlocker) {
	                const enrichedResult = await enrichProviderResultWithDebug(
                    proof.provider,
                    mappedGrokBlocker,
                    resolvedEnv,
                  );
	                resultsByProvider.set(proof.provider, enrichedResult);
                  onProgress?.({
                    provider: proof.provider,
                    stage: "provider-finish",
                    summary: summarizeProviderResult(enrichedResult),
                  });
	                continue;
	              }

                if (grokBrowserProofResult.status === "success") {
                  const timeoutBlocker = buildGrokInvokeTimeoutExternalBlocker({
                    liveProofResult: grokBrowserProofResult,
                    diagnostic: message,
                  });
                  const enrichedResult = await enrichProviderResultWithDebug(
                    proof.provider,
                    timeoutBlocker,
                    resolvedEnv,
                  );
                  resultsByProvider.set(proof.provider, enrichedResult);
                  onProgress?.({
                    provider: proof.provider,
                    stage: "provider-finish",
                    summary: summarizeProviderResult(enrichedResult),
                  });
                  continue;
                }
	            }
	          }

	          throw error;
	        } finally {
	          globalThis.fetch = previousFetch;
	        }

        if (
          !invokeResult.ok &&
          fetchFn === fetch &&
          browserBackedProviders.has(proof.provider) &&
          shouldRetryWithManagedBootstrap(invokeResult)
        ) {
          bootstrapManagedBrowser(proof.provider, resolvedEnv, {
            ensureOnly: false,
          });
          await wait(1_500);

          const previousFetchBeforeRetry = globalThis.fetch;

          if (fetchFn !== previousFetchBeforeRetry) {
            globalThis.fetch = fetchFn;
          }

          try {
            invokeResult = await runInvokeProof();
          } finally {
            globalThis.fetch = previousFetchBeforeRetry;
          }
        }

        if (invokeResult.ok) {
          let softFailure = detectSoftInvokeFailure({
            proof,
            liveProofResult,
            invokeResult,
          });

          if (softFailure && proof.provider === "qwen") {
            await wait(750);

            const previousFetchBeforeRetry = globalThis.fetch;

            if (fetchFn !== previousFetchBeforeRetry) {
              globalThis.fetch = fetchFn;
            }

            try {
              const retryInvokeResult = await runInvokeProof();

              if (retryInvokeResult.ok) {
                const retrySoftFailure = detectSoftInvokeFailure({
                  proof,
                  liveProofResult,
                  invokeResult: retryInvokeResult,
                });

                if (!retrySoftFailure) {
                  invokeResult = retryInvokeResult;
                  softFailure = undefined;
                } else {
                  softFailure = retrySoftFailure;
                }
              } else {
                resultsByProvider.set(
                  proof.provider,
                  mapInvokeFailureResult({
                    proof,
                    liveProofResult,
                    invokeResult: retryInvokeResult,
                    env: resolvedEnv,
                  }),
                );
                continue;
              }
            } finally {
              globalThis.fetch = previousFetchBeforeRetry;
            }
          }

          if (softFailure) {
            const enrichedResult = await enrichProviderResultWithDebug(
              proof.provider,
              softFailure,
              resolvedEnv,
            );
            const storePath = persistBrowserBackedResultVerdict({
              provider: proof.provider,
              result: enrichedResult,
              storedSession: storedSessions[proof.provider],
              env: resolvedEnv,
            });
            resultsByProvider.set(proof.provider, enrichedResult);
            onProgress?.({
              provider: proof.provider,
              stage: "provider-finish",
              summary: summarizeProviderResult(enrichedResult),
            });
            if (storePath && enrichedResult && typeof enrichedResult === "object") {
              enrichedResult.storePath = storePath;
            }
            continue;
          }

          const successResult = {
            ...liveProofResult,
            invokeProof: {
              status: "success",
              model: proof.model,
              expectedToken: invokeProofExpectations[proof.provider].token,
              providerMessageId: invokeResult.providerMessageId,
              outputText:
                resolveVerifiedInvokeOutputText(
                  invokeResult.outputText,
                  invokeProofExpectations[proof.provider].token,
                ) ?? invokeResult.outputText,
            },
          };
          resultsByProvider.set(proof.provider, successResult);
          onProgress?.({
            provider: proof.provider,
            stage: "provider-finish",
            summary: summarizeProviderResult(successResult),
          });
          continue;
        }

        const mappedFailure = mapInvokeFailureResult({
          proof,
          liveProofResult,
          invokeResult,
          env: resolvedEnv,
        });
        const enrichedResult = await enrichProviderResultWithDebug(
          proof.provider,
          mappedFailure,
          resolvedEnv,
        );
        const storePath = persistBrowserBackedResultVerdict({
          provider: proof.provider,
          result: enrichedResult,
          storedSession: storedSessions[proof.provider],
          env: resolvedEnv,
        });
        if (storePath && enrichedResult && typeof enrichedResult === "object") {
          enrichedResult.storePath = storePath;
        }
        resultsByProvider.set(proof.provider, enrichedResult);
        onProgress?.({
          provider: proof.provider,
          stage: "provider-finish",
          summary: summarizeProviderResult(enrichedResult),
        });
      } catch (error) {
        if (
          proof.provider === "grok" &&
          error instanceof Error &&
          error.message.includes("grok invoke proof timed out")
        ) {
          try {
            const moduleUrl = new URL(pathToFileURL(join(compiledOutDir, proof.entrypoint)).href);
            moduleUrl.searchParams.set("ts", `${Date.now()}-${proof.provider}-timeout-proof`);
            const loaded = await import(moduleUrl.href);
            const runBrowserProof = proof.browserProofExportName
              ? loaded[proof.browserProofExportName]
              : undefined;

            if (typeof runBrowserProof === "function") {
              const browserProofResult = await runWithTimeout(
                `${proof.provider} browser workspace re-proof`,
                PROVIDER_LIVE_PROOF_TIMEOUT_MS[proof.provider],
                () =>
                  runBrowserProof(
                    resolvedEnv,
                    chromium.connectOverCDP.bind(chromium),
                  ),
              );
              const grokExternalBlocker = mapGrokLiveProofFailureResult(browserProofResult);

	              if (grokExternalBlocker) {
	                const enrichedResult = await enrichProviderResultWithDebug(
                    proof.provider,
                    grokExternalBlocker,
                    resolvedEnv,
                  );
	                resultsByProvider.set(proof.provider, enrichedResult);
                  onProgress?.({
                    provider: proof.provider,
                    stage: "provider-finish",
                    summary: summarizeProviderResult(enrichedResult),
                  });
	                continue;
	              }

              if (browserProofResult.status === "success") {
                const timeoutBlocker = buildGrokInvokeTimeoutExternalBlocker({
                  liveProofResult: browserProofResult,
                  diagnostic: error.message,
                });
                const enrichedResult = await enrichProviderResultWithDebug(
                  proof.provider,
                  timeoutBlocker,
                  resolvedEnv,
                );
                resultsByProvider.set(proof.provider, enrichedResult);
                onProgress?.({
                  provider: proof.provider,
                  stage: "provider-finish",
                  summary: summarizeProviderResult(enrichedResult),
                });
                continue;
              }
	            }
	          } catch {
            // Fall through to the generic failure if the timeout re-proof cannot classify the page.
          }
        }

        const diagnostic =
          error instanceof Error
            ? error.message
            : `Unknown ${proof.provider} live verification failure.`;
        const fallbackFailure =
          mapBrowserAttachFailureAsExternalBlocker(
            proof.provider,
            resolvedEnv,
            diagnostic,
          ) ?? {
            status: "failure",
            provider: proof.provider,
            classification: "provider-unavailable",
            probeUrl: proof.provider === "gemini" ? "https://gemini.google.com/app" : undefined,
            reason: "probe-request-failed",
            diagnostic,
            summary:
              `${proof.provider} live verification aborted inside its isolated provider lane.`,
            envStatus: [],
          };
        const enrichedResult = await enrichProviderResultWithDebug(
          proof.provider,
          fallbackFailure,
          resolvedEnv,
        );
        resultsByProvider.set(proof.provider, enrichedResult);
        onProgress?.({
          provider: proof.provider,
          stage: "provider-finish",
          summary: summarizeProviderResult(enrichedResult),
        });
      }
    }

    return selectedProviderProofs.map((proof) => resultsByProvider.get(proof.provider));
  } finally {
    if (ownsCompiledOutDir) {
      rmSync(compiledOutDir, {
        recursive: true,
        force: true,
      });
    }
  }
}

async function main() {
  if (isCiEnvironment(process.env)) {
    throw new Error(
      "WebaiBridge verify:web-login-live is credentialed-workstation only and must not run inside CI.",
    );
  }

  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  const requestedProviders = parseProviderArgs();
  const results = await runWebLoginLiveVerification({
    providers: requestedProviders,
    onProgress(event) {
      const providerLabel = event.provider ? `[${event.provider}] ` : "";
      const summaryLabel = event.summary ? ` -> ${event.summary}` : "";
      console.error(`[verify:web-login-live] ${providerLabel}${event.stage}${summaryLabel}`);
    },
  });
  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  console.log(JSON.stringify(results, null, 2));
  const exitCode = results.some((result) => result.status === "failure")
    ? 1
    : results.some((result) => result.status === "external-blocker")
      ? 2
      : 0;

  process.exit(exitCode);
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
