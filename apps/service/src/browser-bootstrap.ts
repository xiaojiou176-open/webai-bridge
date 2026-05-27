import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { WebProviderId } from "../../../packages/lanes/web/src/index.js";

export const WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
export const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
export const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
export const WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME =
  "WEBAI_BRIDGE_CHROME_USER_DATA_DIR";
export const WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME =
  "WEBAI_BRIDGE_CHROME_PROFILE_NAME";
export const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR";
export const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
export const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL = "http://127.0.0.1:9338";
export const WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL";
export const WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE = "isolated-chrome-root";
export const LEGACY_EXISTING_CHROME_PROFILE_MODE = "existing-chrome-profile";
export const DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY = "Profile 1";

export type WebAuthBrowserBootstrapMode =
  | "managed-browser"
  | "isolated-chrome-root"
  | "existing-browser-session";
export type WebAuthBrowserBootstrapModeInput =
  | WebAuthBrowserBootstrapMode
  | "existing-chrome-profile";

export interface ExistingChromeProfileAttachOptions {
  userDataDir?: string;
  profileName?: string;
  browserPath?: string;
  cdpUrl?: string;
}

export interface ExistingBrowserSessionAttachOptions {
  sessionUrl?: string;
}

export interface WebAuthBrowserBootstrapRequest {
  mode?: WebAuthBrowserBootstrapModeInput;
  existingChromeProfile?: ExistingChromeProfileAttachOptions;
  existingBrowserSession?: ExistingBrowserSessionAttachOptions;
}

export interface WebAuthBrowserBootstrapResult {
  status: "started" | "attached";
  provider: WebProviderId;
  mode: WebAuthBrowserBootstrapMode;
  modeLabel: string;
  advanced: boolean;
  loginUrl: string;
  loginOpened: boolean;
  cdpUrl: string;
  browserPath?: string;
  userDataDir?: string;
  profileName?: string;
  profileDirectory?: string;
  browserTarget: {
    kind: "managed-onboarding-browser" | "isolated-chrome-root" | "attached-browser-session";
    label: string;
    summary: string;
  };
  summary: string;
  browserVersion?: string;
}

export interface WebAuthBrowserBootstrapRunnerArgs {
  provider: WebProviderId;
  loginUrl: string;
  env?: Record<string, string | undefined>;
  request?: WebAuthBrowserBootstrapRequest;
}

export type WebAuthBrowserBootstrapRunner = (
  args: WebAuthBrowserBootstrapRunnerArgs,
) => Promise<WebAuthBrowserBootstrapResult> | WebAuthBrowserBootstrapResult;

interface WebAuthBrowserBootstrapPayload {
  ok: boolean;
  browser?: WebAuthBrowserBootstrapResult;
  error?: {
    code?: string;
    message: string;
  };
}

export interface WebAuthBrowserBootstrapFailure extends Error {
  code?: string;
}

export function normalizeWebAuthBrowserBootstrapMode(
  value: string | undefined,
): WebAuthBrowserBootstrapMode | undefined {
  if (value === "managed-browser" || value === "existing-browser-session") {
    return value;
  }

  if (value === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    return value;
  }

  if (value === LEGACY_EXISTING_CHROME_PROFILE_MODE) {
    return WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE;
  }

  return undefined;
}

export function isCiEnvironment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const ci = `${env.CI ?? ""}`.trim().toLowerCase();
  const githubActions = `${env.GITHUB_ACTIONS ?? ""}`.trim().toLowerCase();
  return ci === "1" || ci === "true" || githubActions === "1" || githubActions === "true";
}

export function resolveConfiguredExistingChromeProfile(
  env: Record<string, string | undefined> = process.env,
): ExistingChromeProfileAttachOptions | undefined {
  const userDataDir =
    env[WEBAI_BRIDGE_CHROME_USER_DATA_DIR_ENV_NAME]?.trim() ||
    env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME]?.trim();
  const profileName =
    env[WEBAI_BRIDGE_CHROME_PROFILE_NAME_ENV_NAME]?.trim() || "webai-bridge";

  if (!userDataDir) {
    return undefined;
  }

  return {
    userDataDir,
    profileName,
  };
}

export function shouldPreferConfiguredExistingChromeProfile(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isCiEnvironment(env);
}

function resolveBootstrapScriptPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [moduleDir, process.cwd()];

  for (const start of candidateRoots) {
    let current = start;

    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = join(current, "scripts", "bootstrap-web-auth-browser.mjs");

      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = resolve(current, "..");

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  throw new Error(
    "WebaiBridge could not locate scripts/bootstrap-web-auth-browser.mjs from the current runtime context.",
  );
}

export async function bootstrapLocalWebAuthBrowser(
  args: WebAuthBrowserBootstrapRunnerArgs,
): Promise<WebAuthBrowserBootstrapResult> {
  const scriptPath = resolveBootstrapScriptPath();
  const request = args.request ?? {};
  const mode = normalizeWebAuthBrowserBootstrapMode(request.mode) ?? "managed-browser";
  const commandArgs = [
    scriptPath,
    "--provider",
    args.provider,
    "--login-url",
    args.loginUrl,
    "--mode",
    mode,
    "--json",
  ];

  if (request.existingChromeProfile?.userDataDir) {
    commandArgs.push("--existing-profile-dir", request.existingChromeProfile.userDataDir);
  }

  if (request.existingChromeProfile?.profileName) {
    commandArgs.push("--profile-name", request.existingChromeProfile.profileName);
  }

  if (request.existingChromeProfile?.browserPath) {
    commandArgs.push("--browser-path", request.existingChromeProfile.browserPath);
  }

  if (request.existingChromeProfile?.cdpUrl) {
    commandArgs.push("--cdp-url", request.existingChromeProfile.cdpUrl);
  }

  if (request.existingBrowserSession?.sessionUrl) {
    commandArgs.push("--attach-session-url", request.existingBrowserSession.sessionUrl);
  }

  const result = spawnSync(
    process.execPath,
    commandArgs,
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(args.env ?? {}),
      },
      encoding: "utf8",
    },
  );
  const stdout = result.stdout?.trim();
  const stderr = result.stderr?.trim();
  let payload: WebAuthBrowserBootstrapPayload | undefined;

  if (stdout) {
    try {
      payload = JSON.parse(stdout) as WebAuthBrowserBootstrapPayload;
    } catch {
      payload = undefined;
    }
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 || !payload?.ok || !payload.browser) {
    const error = new Error(
      payload?.error?.message ||
        stderr ||
        stdout ||
        `WebaiBridge failed to prepare the local onboarding browser for ${args.provider}.`,
    ) as WebAuthBrowserBootstrapFailure;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload.browser;
}
