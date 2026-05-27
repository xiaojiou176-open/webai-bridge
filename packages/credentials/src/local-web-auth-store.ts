import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  WEB_LOGIN_PROVIDER_IDS,
  type WebLoginProviderId,
} from "./catalog.js";
import {
  createCredentialRecord,
  type CredentialRecord,
} from "./model.js";
import type { CredentialHealthFacts, CredentialState } from "./state.js";

export const LOCAL_WEB_AUTH_STORE_ENV_NAME = "WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH";

export type StoredWebArtifactState = "present" | "missing" | "derived";

export interface StoredBrowserCaptureProvenance {
  browserMode?:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  userDataDir?: string;
  profileDirectory?: string;
  profileName?: string;
  cdpUrl?: string;
  capturedAt?: string;
}

export interface StoredBrowserPersistenceAudit {
  source: "capture" | "verify";
  checkedAt: string;
  browserMode?:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  userDataDir?: string;
  profileDirectory?: string;
  profileName?: string;
  cdpUrl?: string;
  pageUrl?: string;
  pageTitle?: string;
  workspaceClassification?:
    | "workspace-ready"
    | "login-required"
    | "session-incomplete"
    | "human-verification-required"
    | "account-action-required"
    | "permission-gated"
    | "provider-adjacent"
    | "missing-page"
    | "attach-failed"
    | "unknown";
  workspaceReady: boolean;
  cookieDbPath?: string;
  cookieDbAvailable?: boolean;
  hostCookieCount?: number;
  matchedCookieNames?: string[];
  artifactStates?: Record<string, StoredWebArtifactState>;
  summary: string;
}

export interface StoredWebProviderSession {
  providerId: WebLoginProviderId;
  state: CredentialState;
  acquisitionMode?:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  accountLabel?: string;
  sessionSource?: string;
  lastValidatedAt?: string;
  expiresAt?: string;
  refreshEligible?: boolean;
  requiredUserAction?: string;
  degradedReason?: string;
  artifactStates?: Record<string, StoredWebArtifactState>;
  captureProvenance?: StoredBrowserCaptureProvenance;
  persistenceAudit?: StoredBrowserPersistenceAudit;
  note?: string;
  runtimeEnv: Record<string, string>;
  updatedAt: string;
  source: "local-auth-portal";
}

export interface LocalWebAuthStore {
  version: 1;
  updatedAt?: string;
  providers: Partial<Record<WebLoginProviderId, StoredWebProviderSession>>;
}

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

function shouldLoadStoredRuntimeEnvName(name: string): boolean {
  return !STORED_RUNTIME_ROUTING_ENV_NAMES.has(name);
}

function isPathInsideRoot(root: string, targetPath: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(targetPath);

  if (normalizedRoot === normalizedTarget) {
    return true;
  }

  return normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

function defaultStorePath() {
  const candidates = [
    process.cwd(),
    dirname(fileURLToPath(import.meta.url)),
  ];

  for (const candidate of candidates) {
    let current = candidate;

    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
        return resolve(current, ".runtime-cache/local-web-auth-store.json");
      }

      const parent = resolve(current, "..");

      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return resolve(process.cwd(), ".runtime-cache/local-web-auth-store.json");
}

export function resolveLocalWebAuthStorePath(
  env: Record<string, string | undefined> = process.env,
): string {
  const resolvedPath = resolve(
    env[LOCAL_WEB_AUTH_STORE_ENV_NAME]?.trim() || defaultStorePath(),
  );
  const runtimeCacheRoot = resolve(dirname(defaultStorePath()));

  if (!isPathInsideRoot(runtimeCacheRoot, resolvedPath)) {
    throw new Error(
      `WebaiBridge local web auth store must stay inside ${runtimeCacheRoot}. Refusing ${resolvedPath}.`,
    );
  }

  return resolvedPath;
}

export function createEmptyLocalWebAuthStore(): LocalWebAuthStore {
  return {
    version: 1,
    providers: {},
  };
}

export function readLocalWebAuthStore(
  env: Record<string, string | undefined> = process.env,
): LocalWebAuthStore {
  const storePath = resolveLocalWebAuthStorePath(env);

  if (!existsSync(storePath)) {
    return createEmptyLocalWebAuthStore();
  }

  const raw = readFileSync(storePath, "utf8").trim();

  if (!raw) {
    return createEmptyLocalWebAuthStore();
  }

  const parsed = JSON.parse(raw) as Partial<LocalWebAuthStore>;

  return {
    version: 1,
    updatedAt: parsed.updatedAt,
    providers: parsed.providers ?? {},
  };
}

export function writeLocalWebAuthStore(
  store: LocalWebAuthStore,
  env: Record<string, string | undefined> = process.env,
): LocalWebAuthStore {
  const storePath = resolveLocalWebAuthStorePath(env);
  mkdirSync(dirname(storePath), {
    recursive: true,
  });

  const nextStore: LocalWebAuthStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    providers: store.providers,
  };

  writeFileSync(storePath, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
  return nextStore;
}

export function getStoredWebProviderSession(
  providerId: WebLoginProviderId,
  env: Record<string, string | undefined> = process.env,
): StoredWebProviderSession | undefined {
  return readLocalWebAuthStore(env).providers[providerId];
}

export function listStoredWebProviderSessions(
  env: Record<string, string | undefined> = process.env,
): StoredWebProviderSession[] {
  const store = readLocalWebAuthStore(env);

  return WEB_LOGIN_PROVIDER_IDS.map((providerId) => store.providers[providerId]).filter(
    (record): record is StoredWebProviderSession => Boolean(record),
  );
}

export function upsertStoredWebProviderSession(
  record: StoredWebProviderSession,
  env: Record<string, string | undefined> = process.env,
): LocalWebAuthStore {
  const store = readLocalWebAuthStore(env);

  return writeLocalWebAuthStore(
    {
      ...store,
      providers: {
        ...store.providers,
        [record.providerId]: record,
      },
    },
    env,
  );
}

export function removeStoredWebProviderSession(
  providerId: WebLoginProviderId,
  env: Record<string, string | undefined> = process.env,
): LocalWebAuthStore {
  const store = readLocalWebAuthStore(env);
  const nextProviders = {
    ...store.providers,
  };
  delete nextProviders[providerId];

  return writeLocalWebAuthStore(
    {
      ...store,
      providers: nextProviders,
    },
    env,
  );
}

function stateToHealthFacts(record: StoredWebProviderSession): Partial<CredentialHealthFacts> {
  switch (record.state) {
    case "missing":
      return {
        hasMaterial: false,
      };
    case "ready":
      return {
        hasMaterial: true,
        providerAvailable: true,
      };
    case "expiring":
      return {
        hasMaterial: true,
        providerAvailable: true,
        expiringSoon: true,
      };
    case "expired":
      return {
        hasMaterial: true,
        providerAvailable: true,
        expired: true,
      };
    case "refreshable-but-degraded":
      return {
        hasMaterial: true,
        providerAvailable: true,
        refreshEligible: record.refreshEligible ?? true,
        degraded: true,
      };
    case "provider-unavailable":
      return {
        hasMaterial: true,
        providerAvailable: false,
      };
    case "user-action-required":
      return {
        hasMaterial: true,
        providerAvailable: true,
        userActionRequired: true,
      };
  }
}

export function buildStoredWebCredentialRecords(
  userId = "local-user",
  env: Record<string, string | undefined> = process.env,
): CredentialRecord[] {
  return listStoredWebProviderSessions(env).map((record) =>
    createCredentialRecord({
      userId,
      providerId: record.providerId,
      authModeId: "web-login",
      accountId: record.accountLabel ?? `${record.providerId}-local-slot`,
      accountLabel: record.accountLabel,
      lifecycleStage:
        record.state === "missing"
          ? "acquire"
          : record.state === "expired"
            ? "expire-degrade"
            : record.state === "user-action-required"
              ? "re-auth"
              : record.state === "refreshable-but-degraded"
                ? "refresh-renew"
                : "check",
      materialKind:
        record.sessionSource?.toLowerCase().includes("oauth") ? "oauth-session" : "browser-session",
      status: {
        ...stateToHealthFacts(record),
        lastCheckedAt: record.lastValidatedAt,
        expiresAt: record.expiresAt,
      },
      notes: record.note ? [record.note] : [],
      origin: "local-user",
    }),
  );
}

export function buildStoredWebProviderSessions(
  env: Record<string, string | undefined> = process.env,
): Partial<Record<WebLoginProviderId, Record<string, unknown>>> {
  const sessions: Partial<Record<WebLoginProviderId, Record<string, unknown>>> = {};

  for (const record of listStoredWebProviderSessions(env)) {
    sessions[record.providerId] = {
      state: record.state,
      acquisitionMode: record.acquisitionMode,
      accountLabel: record.accountLabel,
      sessionSource: record.sessionSource,
      lastValidatedAt: record.lastValidatedAt,
      expiresAt: record.expiresAt,
      refreshEligible: record.refreshEligible,
      requiredUserAction: record.requiredUserAction,
      degradedReason: record.degradedReason,
      artifactStates: record.artifactStates,
      captureProvenance: record.captureProvenance,
      persistenceAudit: record.persistenceAudit,
      note: record.note,
    };
  }

  return sessions;
}

export function buildStoredWebRuntimeEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return listStoredWebProviderSessions(env).reduce<Record<string, string>>((merged, record) => {
    const runtimeEnv = record.runtimeEnv ?? {};

    for (const [name, value] of Object.entries(runtimeEnv)) {
      if (value && shouldLoadStoredRuntimeEnvName(name)) {
        merged[name] = value;
      }
    }

    return merged;
  }, {});
}
