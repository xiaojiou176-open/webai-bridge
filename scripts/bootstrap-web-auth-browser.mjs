import "./load-local-env.mjs";

import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  LEGACY_EXISTING_PROFILE_MODE,
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  assertPathInsideAllowedRoots,
  isCiEnvironment,
  resolveAllowedRuntimeArtifactRoots,
  resolveChromeProfileDirectory,
  resolveCredentialedBrowserMode,
  resolveManagedBrowserUserDataDir,
  resolveOptionalExistingChromeProfileRoot,
} from "./runtime-policy.mjs";
import {
  launchBrowserViaOsHandoff,
  openUrlInExistingBrowserViaCdp,
} from "./browser-launch-handoff.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_BROWSER_PATH_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_BROWSER_PATH";
const WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL = "http://127.0.0.1:9338";
const DEFAULT_LOGIN_URLS = {
  chatgpt: "https://chatgpt.com",
  gemini: "https://gemini.google.com/app",
  claude: "https://claude.ai/new",
  grok: "https://grok.com",
  qwen: "https://chat.qwen.ai",
};
const ALLOWED_BROWSER_BASENAMES = new Set([
  "google chrome",
  "chromium",
  "chrome.exe",
  "chromium.exe",
]);

function resolveAllowedProfileRoots(env = process.env) {
  const runtimeRoots = resolveAllowedRuntimeArtifactRoots(env, repoRoot);
  return [
    homedir(),
    runtimeRoots.repoRuntimeCacheRoot,
    runtimeRoots.externalCacheRoot,
    runtimeRoots.protectedBrowserRoot,
  ];
}

function parseArgs(argv) {
  const options = {
    provider: undefined,
    loginUrl: undefined,
    mode: undefined,
    existingProfileDir: undefined,
    profileName: undefined,
    browserPath: undefined,
    cdpUrl: undefined,
    attachSessionUrl: undefined,
    json: false,
    ensureOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--provider") {
      options.provider = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--login-url") {
      options.loginUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      options.mode = argv[index + 1] ?? "managed-browser";
      index += 1;
      continue;
    }

    if (arg === "--existing-profile-dir") {
      options.existingProfileDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--profile-name") {
      options.profileName = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--browser-path") {
      options.browserPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cdp-url") {
      options.cdpUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--attach-session-url") {
      options.attachSessionUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--ensure-only") {
      options.ensureOnly = true;
    }
  }

  return options;
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function validateBrowserPath(candidate) {
  const resolvedCandidate = resolve(candidate);
  const browserName = basename(resolvedCandidate).toLowerCase();

  if (!isAbsolute(candidate) || !ALLOWED_BROWSER_BASENAMES.has(browserName)) {
    throw createBootstrapError(
      "browser-path-invalid",
      `WebaiBridge browser path must be an absolute local Chrome/Chromium binary. Refusing ${candidate}.`,
    );
  }

  return resolvedCandidate;
}

function detectBrowserPath(env = process.env, explicitOverride) {
  const explicit =
    explicitOverride?.trim() || env[WEBAI_BRIDGE_WEB_AUTH_BROWSER_PATH_ENV_NAME]?.trim();

  if (explicit) {
    return validateBrowserPath(explicit);
  }

  const platformPaths =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "win32"
        ? [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Chromium\\Application\\chrome.exe",
          ]
        : [
            "/opt/google/chrome/google-chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];

  for (const candidate of platformPaths) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  const commandCandidates =
    process.platform === "win32"
      ? ["chrome", "chromium"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  for (const candidate of commandCandidates) {
    const commandPath = commandExists(candidate);

    if (commandPath) {
      return commandPath;
    }
  }

  return undefined;
}

function resolveManagedCdpUrl(env = process.env, explicitCdpUrl) {
  return (
    explicitCdpUrl?.trim() ||
    env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL
  );
}

function resolveExistingProfileCdpUrl(env = process.env, explicitCdpUrl) {
  return (
    explicitCdpUrl?.trim() ||
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
    WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
  );
}

function resolveCdpPort(cdpUrl) {
  const url = new URL(cdpUrl);
  return Number(url.port || (url.protocol === "https:" ? 443 : 80));
}

function resolveManagedUserDataDir(env = process.env) {
  return resolveManagedBrowserUserDataDir(env, repoRoot);
}

function resolveExistingProfileSelection(
  env = process.env,
  explicitDir,
  explicitProfileName,
) {
  const configuredRealProfile = resolveOptionalExistingChromeProfileRoot(env);
  const configuredUserDataDir =
    explicitDir?.trim() ||
    configuredRealProfile?.userDataDir ||
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME]?.trim();
  const userDataDir = configuredUserDataDir
    ? assertPathInsideAllowedRoots(
        configuredUserDataDir,
        resolveAllowedProfileRoots(env),
        "WebaiBridge browser profile root",
      )
    : undefined;
  const profileName = explicitProfileName?.trim() || configuredRealProfile?.profileName;
  const profileDirectory =
    explicitProfileName?.trim() && userDataDir
      ? resolveChromeProfileDirectory(userDataDir, explicitProfileName.trim())
      : configuredRealProfile?.profileDirectory;

  return {
    userDataDir,
    profileName,
    profileDirectory,
  };
}

function resolveExistingBrowserSessionUrl(env = process.env, explicitSessionUrl, explicitCdpUrl) {
  return (
    explicitSessionUrl?.trim() ||
    explicitCdpUrl?.trim() ||
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME]?.trim() ||
    env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()
  );
}

function createBootstrapError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function findProfileLock(userDataDir) {
  const candidates = [
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "lockfile",
  ];

  for (const candidate of candidates) {
    const fullPath = resolve(userDataDir, candidate);

    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

async function inspectDevToolsEndpoint(cdpUrl) {
  try {
    const response = await fetch(new URL("/json/version", cdpUrl), {
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "endpoint-not-devtools",
        message:
          "WebaiBridge reached that browser session URL, but it did not respond like a reusable Chrome DevTools endpoint.",
      };
    }

    const payload = await response.json().catch(() => undefined);

    if (
      typeof payload?.Browser !== "string" ||
      typeof payload?.webSocketDebuggerUrl !== "string"
    ) {
      return {
        ok: false,
        code: "endpoint-not-devtools",
        message:
          "WebaiBridge reached that browser session URL, but it is not a reusable Chrome DevTools endpoint.",
      };
    }

    return {
      ok: true,
      browserVersion: payload.Browser,
    };
  } catch {
    return {
      ok: false,
      code: "cdp-unreachable",
      message:
        "WebaiBridge could not reach that browser session. Confirm the browser is still running, then retry.",
    };
  }
}

async function waitForCdp(cdpUrl, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const endpoint = await inspectDevToolsEndpoint(cdpUrl);

    if (endpoint.ok) {
      return endpoint;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  return {
    ok: false,
    code: "cdp-unreachable",
    message: `WebaiBridge started Chrome, but the browser session never became reachable at ${cdpUrl}.`,
  };
}

function buildBrowserArgs({ cdpPort, userDataDir, loginUrl, profileName }) {
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--disable-features=TranslateUI",
    "--remote-allow-origins=*",
  ];

  if (profileName) {
    args.push(`--profile-directory=${profileName}`);
  }

  if (loginUrl) {
    args.push(loginUrl);
  }

  return args;
}

function buildModeMetadata(mode) {
  switch (mode) {
    case WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE:
      return {
        modeLabel: "Use Isolated Chrome Root",
        advanced: true,
        browserTarget: {
          kind: "isolated-chrome-root",
          label: "Isolated Chrome root",
          summary:
            "Reuse WebaiBridge's dedicated Chrome user-data root and single repo-owned profile instead of the managed onboarding browser.",
        },
      };
    case "existing-browser-session":
      return {
        modeLabel: "Attach Existing Browser Session",
        advanced: true,
        browserTarget: {
          kind: "attached-browser-session",
          label: "Existing browser session",
          summary:
            "Attach to a browser session that is already exposing a reusable Chrome DevTools endpoint.",
        },
      };
    default:
      return {
        modeLabel: "Managed Browser",
        advanced: false,
        browserTarget: {
          kind: "managed-onboarding-browser",
          label: "WebaiBridge onboarding browser",
          summary:
            "Let WebaiBridge manage a dedicated local onboarding browser for sign-in and capture.",
        },
      };
  }
}

function buildSummary({ mode, status, provider, loginUrl, loginOpened, cdpUrl }) {
  if (mode === "managed-browser") {
    if (status === "started") {
      return loginOpened
        ? `WebaiBridge started its dedicated local onboarding browser for ${provider} and opened ${loginUrl}.`
        : `WebaiBridge started its dedicated local onboarding browser for ${provider}. Open ${loginUrl} there to finish sign-in.`;
    }

    return loginOpened
      ? `WebaiBridge reattached to the existing local onboarding browser for ${provider} and reopened ${loginUrl}.`
      : `WebaiBridge reattached to the existing local onboarding browser at ${cdpUrl} for ${provider}.`;
  }

  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    if (status === "started") {
      return loginOpened
        ? `WebaiBridge started the isolated repo Chrome root for ${provider} and opened ${loginUrl}.`
        : `WebaiBridge started the isolated repo Chrome root for ${provider}. Open ${loginUrl} there if you still need to finish sign-in.`;
    }

    return `WebaiBridge reattached to the single repo-owned Chrome session backed by the isolated root for ${provider}.`;
  }

  return `WebaiBridge attached to your existing browser session for ${provider}.`;
}

export async function ensureManagedBrowser({
  provider,
  loginUrl,
  env = process.env,
  browserPath: explicitBrowserPath,
  cdpUrl: explicitCdpUrl,
  ensureOnly = false,
}) {
  const browserPath = detectBrowserPath(env, explicitBrowserPath);

  if (!browserPath) {
    throw createBootstrapError(
      "chrome-not-found",
      "WebaiBridge could not find Chrome or Chromium. Install Chrome or Chromium, then retry Start Login.",
    );
  }

  const cdpUrl = resolveManagedCdpUrl(env, explicitCdpUrl);
  const cdpPort = resolveCdpPort(cdpUrl);
  const userDataDir = resolveManagedUserDataDir(env);
  mkdirSync(userDataDir, {
    recursive: true,
  });

  const reachableEndpoint = await inspectDevToolsEndpoint(cdpUrl);
  let status = reachableEndpoint.ok ? "attached" : "started";
  let browserVersion = reachableEndpoint.ok ? reachableEndpoint.browserVersion : undefined;
  let loginOpened = false;

  if (!reachableEndpoint.ok) {
    launchBrowserViaOsHandoff(
      browserPath,
      buildBrowserArgs({
        cdpPort,
        userDataDir,
        loginUrl: ensureOnly ? undefined : loginUrl,
      }),
    );
    loginOpened = !ensureOnly && Boolean(loginUrl);
    const endpoint = await waitForCdp(cdpUrl);

    if (!endpoint.ok) {
      throw createBootstrapError(endpoint.code, endpoint.message);
    }

    browserVersion = endpoint.browserVersion;
  } else if (loginUrl && !ensureOnly) {
    loginOpened = await openUrlInExistingBrowserViaCdp(cdpUrl, loginUrl);
  }

  return {
    status,
    provider,
    mode: "managed-browser",
    ...buildModeMetadata("managed-browser"),
    loginUrl,
    loginOpened,
    cdpUrl,
    browserPath,
    userDataDir,
    summary: buildSummary({
      mode: "managed-browser",
      status,
      provider,
      loginUrl,
      loginOpened,
      cdpUrl,
    }),
    browserVersion,
  };
}

export async function ensureIsolatedChromeRoot({
  provider,
  loginUrl,
  env = process.env,
  existingProfileDir,
  profileName: explicitProfileName,
  browserPath: explicitBrowserPath,
  cdpUrl: explicitCdpUrl,
  ensureOnly = false,
}) {
  const browserPath = detectBrowserPath(env, explicitBrowserPath);

  if (!browserPath) {
    throw createBootstrapError(
      "chrome-not-found",
      "WebaiBridge could not find Chrome or Chromium. Install Chrome or Chromium, or point advanced profile mode at a local browser binary.",
    );
  }

  const {
    userDataDir,
    profileName,
    profileDirectory,
  } = resolveExistingProfileSelection(env, existingProfileDir, explicitProfileName);

  if (!userDataDir || !profileName) {
    throw createBootstrapError(
      "existing-profile-missing",
      "WebaiBridge did not receive an explicit real Chrome profile. Set WEBAI_BRIDGE_CHROME_USER_DATA_DIR and WEBAI_BRIDGE_CHROME_PROFILE_NAME, or pass --existing-profile-dir and --profile-name.",
    );
  }

  const cdpUrl = resolveExistingProfileCdpUrl(env, explicitCdpUrl);
  const cdpPort = resolveCdpPort(cdpUrl);
  const reachableEndpoint = await inspectDevToolsEndpoint(cdpUrl);
  let status = reachableEndpoint.ok ? "attached" : "started";
  let browserVersion = reachableEndpoint.ok ? reachableEndpoint.browserVersion : undefined;
  let loginOpened = false;

  if (!reachableEndpoint.ok) {
    const profileLock = findProfileLock(userDataDir);

    if (profileLock) {
      throw createBootstrapError(
        "existing-profile-locked",
        "WebaiBridge found the isolated repo Chrome root locked by another Chrome instance, but CDP is not reachable. Reuse the existing instance via attach, or close it before retrying.",
      );
    }

    launchBrowserViaOsHandoff(
      browserPath,
      buildBrowserArgs({
        cdpPort,
        userDataDir,
        profileName: profileDirectory ?? DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
        loginUrl: ensureOnly ? undefined : loginUrl,
      }),
    );
    loginOpened = !ensureOnly && Boolean(loginUrl);
    const endpoint = await waitForCdp(cdpUrl);

    if (!endpoint.ok) {
      throw createBootstrapError(endpoint.code, endpoint.message);
    }

    browserVersion = endpoint.browserVersion;
  } else if (loginUrl && !ensureOnly) {
    loginOpened = await openUrlInExistingBrowserViaCdp(cdpUrl, loginUrl);
  }

  return {
    status,
    provider,
    mode: WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
    ...buildModeMetadata(WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE),
    loginUrl,
    loginOpened,
    cdpUrl,
    browserPath,
    userDataDir,
    profileName,
    profileDirectory,
    summary: buildSummary({
      mode: WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
      status,
      provider,
      loginUrl,
      loginOpened,
      cdpUrl,
    }),
    browserVersion,
  };
}

async function ensureExistingBrowserSession({
  provider,
  loginUrl,
  env = process.env,
  attachSessionUrl,
  cdpUrl: explicitCdpUrl,
}) {
  const cdpUrl = resolveExistingBrowserSessionUrl(env, attachSessionUrl, explicitCdpUrl);

  if (!cdpUrl) {
    throw createBootstrapError(
      "existing-browser-session-missing",
      "WebaiBridge could not find a reusable browser session to attach to. Start a compatible browser session first, then retry Attach Existing Browser Session.",
    );
  }

  const endpoint = await inspectDevToolsEndpoint(cdpUrl);

  if (!endpoint.ok) {
    throw createBootstrapError(endpoint.code, endpoint.message);
  }

  return {
    status: "attached",
    provider,
    mode: "existing-browser-session",
    ...buildModeMetadata("existing-browser-session"),
    loginUrl,
    loginOpened: false,
    cdpUrl,
    summary: buildSummary({
      mode: "existing-browser-session",
      status: "attached",
      provider,
      loginUrl,
      loginOpened: false,
      cdpUrl,
    }),
    browserVersion: endpoint.browserVersion,
  };
}

function printHumanResult(browser) {
  console.log(`${browser.modeLabel}: ${browser.summary}`);
  console.log(`Session: ${browser.cdpUrl}`);

  if (browser.userDataDir) {
    console.log(`Profile: ${browser.userDataDir}`);
  }

  if (browser.profileName) {
    console.log(`Profile Name: ${browser.profileName}`);
  }

  if (browser.browserVersion) {
    console.log(`Browser: ${browser.browserVersion}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider;
  const mode = args.mode ?? resolveCredentialedBrowserMode(process.env);

  if (!provider || !(provider in DEFAULT_LOGIN_URLS)) {
    throw createBootstrapError(
      "unsupported-provider",
      "Provide a supported --provider value: chatgpt, gemini, claude, grok, or qwen.",
    );
  }

  if (isCiEnvironment(process.env)) {
    throw createBootstrapError(
      "credentialed-workstation-only",
      "WebaiBridge browser bootstrap is credentialed-workstation only and must not run inside CI.",
    );
  }

  if (mode === "disabled-for-live") {
    throw createBootstrapError(
      "credentialed-workstation-only",
      "WebaiBridge browser bootstrap is disabled for live credentialed work in this environment.",
    );
  }

  const loginUrl = args.loginUrl ?? DEFAULT_LOGIN_URLS[provider];
  let browser;

  await runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });

  if (
    mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE ||
    mode === LEGACY_EXISTING_PROFILE_MODE
  ) {
    browser = await ensureIsolatedChromeRoot({
      provider,
      loginUrl,
      existingProfileDir: args.existingProfileDir,
      profileName: args.profileName,
      browserPath: args.browserPath,
      cdpUrl: args.cdpUrl,
      ensureOnly: args.ensureOnly,
    });
  } else if (mode === "existing-browser-session") {
    browser = await ensureExistingBrowserSession({
      provider,
      loginUrl,
      attachSessionUrl: args.attachSessionUrl,
      cdpUrl: args.cdpUrl,
    });
  } else {
    browser = await ensureManagedBrowser({
      provider,
      loginUrl,
      browserPath: args.browserPath,
      cdpUrl: args.cdpUrl,
      ensureOnly: args.ensureOnly,
    });
  }

  await runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, browser })}\n`);
    return;
  }

  printHumanResult(browser);
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : "WebaiBridge failed to prepare the local onboarding browser.";
  const args = parseArgs(process.argv.slice(2));

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: {
          code: error?.code,
          message,
        },
      })}\n`,
    );
  } else {
    console.error(message);
  }

  process.exitCode = 1;
}
