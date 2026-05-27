import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CredentialState,
  WebProviderId,
  WebSessionSnapshot,
} from "../../../packages/lanes/web/src/index.js";
import { WEB_PROVIDER_IDS } from "../../../packages/lanes/web/src/index.js";

let localEnvLoaded = false;

export function loadLocalEnvFiles() {
  if (localEnvLoaded) {
    return;
  }

  localEnvLoaded = true;

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [
    process.cwd(),
    resolve(moduleDir, "../../.."),
    resolve(moduleDir, "../../../.."),
  ];
  const uniqueRoots = Array.from(new Set(candidateRoots));

  for (const root of uniqueRoots) {
    const envLocal = join(root, ".env.local");
    const envFile = join(root, ".env");

    if (existsSync(envLocal)) {
      process.loadEnvFile(envLocal);
    }

    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
  }
}

const VALID_STATES = new Set<CredentialState>([
  "missing",
  "ready",
  "expiring",
  "expired",
  "refreshable-but-degraded",
  "provider-unavailable",
  "user-action-required",
]);

function envKey(provider: WebProviderId, suffix: string): string {
  return `WEBAI_BRIDGE_WEB_${provider.toUpperCase()}_${suffix}`;
}

export function loadProviderSessionsFromEnv(
  env: NodeJS.ProcessEnv,
): Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> {
  const sessions: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> = {};

  for (const provider of WEB_PROVIDER_IDS) {
    const state = env[envKey(provider, "STATE")];

    if (!state || !VALID_STATES.has(state as CredentialState)) {
      continue;
    }

    sessions[provider] = {
      state: state as CredentialState,
      accountLabel: env[envKey(provider, "ACCOUNT_LABEL")],
      sessionSource: env[envKey(provider, "SESSION_SOURCE")],
      expiresAt: env[envKey(provider, "EXPIRES_AT")],
      lastValidatedAt: env[envKey(provider, "LAST_VALIDATED_AT")],
      note: env[envKey(provider, "NOTE")],
      refreshEligible:
        env[envKey(provider, "REFRESH_ELIGIBLE")] === undefined
          ? undefined
          : env[envKey(provider, "REFRESH_ELIGIBLE")] === "true",
    };
  }

  return sessions;
}

export function loadServicePort(env: NodeJS.ProcessEnv): number {
  const rawPort = env.WEBAI_BRIDGE_SERVICE_PORT;
  const parsed = rawPort ? Number(rawPort) : 4010;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4010;
}
