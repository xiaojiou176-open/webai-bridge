import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  assertPathInsideAllowedRoots,
  assertSafePathSegment,
  resolveAllowedRuntimeArtifactRoots,
  resolveManagedBrowserUserDataDir,
  resolveOptionalExistingChromeProfileRoot,
} from "./runtime-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY = "Default";
const QWEN_SESSION_TOKEN_COOKIE_NAMES = [
  "token",
  "session-token",
  "session_token",
  "atpsida",
];

export const PROVIDER_SESSION_AUDIT_SPECS = {
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
    hostPatterns: ["%chatgpt.com%", "%openai.com%"],
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
    hostPatterns: ["%gemini.google.com%", "%google.com%"],
  },
  claude: {
    cookieBackedArtifacts: [
      {
        artifactId: "claude-session-key",
        cookieNames: ["sessionKey"],
      },
    ],
    hostPatterns: ["%claude.ai%"],
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
    hostPatterns: ["%grok.com%", "%x.com%"],
  },
  qwen: {
    cookieBackedArtifacts: [
      {
        artifactId: "session-cookie",
        cookieNames: ["acw_tc", "sca"],
      },
      {
        artifactId: "session-token",
        cookieNames: QWEN_SESSION_TOKEN_COOKIE_NAMES,
      },
    ],
    hostPatterns: ["%chat.qwen.ai%", "%qwen.ai%"],
  },
};

const PROVIDER_ARTIFACT_ALLOWLISTS = {
  chatgpt: new Set([
    "next-auth-session-token",
    "openai-access-token",
    "sentinel-chat-requirements",
  ]),
  gemini: new Set([
    "google-sid-cookie",
    "google-secure-1psid",
  ]),
  claude: new Set([
    "claude-session-key",
    "organization-id",
  ]),
  grok: new Set([
    "session-cookie",
    "oauth-browser-session",
  ]),
  qwen: new Set([
    "session-cookie",
    "session-token",
  ]),
};

function quoteSqlLiteral(value) {
  return `'${`${value}`.replaceAll("'", "''")}'`;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim() ? resolve(value.trim()) : undefined;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    `${left}`.localeCompare(`${right}`),
  );
}

function normalizeBrowserModeForComparison(mode) {
  if (mode === "existing-chrome-profile") {
    return WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE;
  }

  return mode;
}

function defaultSqliteRunner(args) {
  return spawnSync("sqlite3", args, {
    encoding: "utf8",
  });
}

function resolveAllowedBrowserFilesystemRoots(env = process.env) {
  const runtimeRoots = resolveAllowedRuntimeArtifactRoots(env, repoRoot);
  return uniqueSorted([
    runtimeRoots.repoRuntimeCacheRoot,
    runtimeRoots.externalCacheRoot,
    runtimeRoots.protectedBrowserRoot,
    tmpdir(),
  ]);
}

function resolveStrongerArtifactState(left, right) {
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

function mergeArtifactStateMaps(...maps) {
  const merged = {};

  for (const map of maps) {
    if (!map || typeof map !== "object") {
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

function buildCookieAuditSql(spec) {
  const hostClause = spec.hostPatterns
    .map((pattern) => `host_key LIKE ${quoteSqlLiteral(pattern)}`)
    .join(" OR ");

  return `SELECT host_key, name FROM cookies WHERE ${hostClause} ORDER BY host_key, name;`;
}

function parseSqliteCookieRows(stdout) {
  return `${stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hostKey, name] = line.split("|");
      return {
        hostKey: hostKey?.trim() ?? "",
        name: name?.trim() ?? "",
      };
    })
    .filter((row) => row.hostKey && row.name);
}

function normalizeComparisonValue(field, value) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim();

  if (field === "userDataDir") {
    return resolve(normalized);
  }

  if (field === "browserMode") {
    return normalizeBrowserModeForComparison(normalized);
  }

  if (field === "cdpUrl") {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
}

export function filterProviderArtifactStates(provider, artifactStates) {
  const allowlist = PROVIDER_ARTIFACT_ALLOWLISTS[provider];

  if (!allowlist || !artifactStates || typeof artifactStates !== "object") {
    return artifactStates ?? {};
  }

  return Object.fromEntries(
    Object.entries(artifactStates).filter(([artifactId]) => allowlist.has(artifactId)),
  );
}

export function mergeProviderArtifactStates(provider, ...artifactStateMaps) {
  return filterProviderArtifactStates(
    provider,
    mergeArtifactStateMaps(...artifactStateMaps),
  );
}

function readLegacyRuntimeEnvValue(storedSession, names) {
  const runtimeEnv = storedSession?.runtimeEnv ?? {};

  for (const name of names) {
    const value = runtimeEnv[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function buildLegacyStoredCaptureProvenance(storedSession) {
  const browserMode = normalizeBrowserModeForComparison(storedSession?.acquisitionMode);

  if (!browserMode) {
    return undefined;
  }

  if (browserMode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    const userDataDir = readLegacyRuntimeEnvValue(storedSession, [
      "WEBAI_BRIDGE_CHROME_USER_DATA_DIR",
      "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR",
    ]);

    return {
      browserMode,
      userDataDir,
      profileDirectory: userDataDir ? "Profile 1" : undefined,
      profileName:
        readLegacyRuntimeEnvValue(storedSession, [
          "WEBAI_BRIDGE_CHROME_PROFILE_NAME",
        ]) ?? (userDataDir ? "webai-bridge" : undefined),
      cdpUrl: readLegacyRuntimeEnvValue(storedSession, [
        "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL",
        "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
        "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
      ]),
    };
  }

  if (browserMode === "managed-browser") {
    const userDataDir = readLegacyRuntimeEnvValue(storedSession, [
      "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR",
    ]);

    return {
      browserMode,
      userDataDir,
      profileDirectory: userDataDir ? DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY : undefined,
      profileName: userDataDir ? DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY : undefined,
      cdpUrl: readLegacyRuntimeEnvValue(storedSession, [
        "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
        "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
      ]),
    };
  }

  if (browserMode === "existing-browser-session") {
    return {
      browserMode,
      cdpUrl: readLegacyRuntimeEnvValue(storedSession, [
        "WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL",
        "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
        "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
      ]),
    };
  }

  return {
    browserMode,
    cdpUrl: readLegacyRuntimeEnvValue(storedSession, [
      "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL",
      "WEBAI_BRIDGE_WEB_AUTH_CDP_URL",
    ]),
  };
}

function workspaceClassificationFromEvidence(browserEvidence, workspaceStatus) {
  if (browserEvidence?.attachStatus === "attach-failed") {
    return "attach-failed";
  }

  if (!browserEvidence?.currentPage?.url) {
    return "missing-page";
  }

  if (workspaceStatus?.liveReady === true) {
    return "workspace-ready";
  }

  const explicitClassification = `${workspaceStatus?.classification ?? ""}`.toLowerCase();

  if (
    explicitClassification === "session-incomplete" ||
    explicitClassification === "human-verification-required" ||
    explicitClassification === "account-action-required" ||
    explicitClassification === "permission-gated"
  ) {
    return explicitClassification;
  }

  const reason = `${workspaceStatus?.reason ?? ""}`.toLowerCase();

  if (
    reason.includes("login or verification page") ||
    reason.includes("logged-out landing page") ||
    reason.includes("store-ready, not live-ready")
  ) {
    return "login-required";
  }

  return "provider-adjacent";
}

export function buildBrowserCaptureProvenance(args) {
  const capturedAt = args.capturedAt ?? new Date().toISOString();
  const mode = normalizeBrowserModeForComparison(args.mode);

  if (mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    const isolatedProfile = resolveOptionalExistingChromeProfileRoot(args.env);
    return {
      browserMode: mode,
      userDataDir: isolatedProfile.userDataDir,
      profileDirectory: isolatedProfile.profileDirectory,
      profileName: isolatedProfile.profileName,
      cdpUrl: args.cdpUrl,
      capturedAt,
    };
  }

  if (mode === "managed-browser") {
    return {
      browserMode: mode,
      userDataDir: resolveManagedBrowserUserDataDir(args.env, repoRoot),
      profileDirectory: DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY,
      profileName: DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY,
      cdpUrl: args.cdpUrl,
      capturedAt,
    };
  }

  return {
    browserMode: mode,
    cdpUrl: args.cdpUrl,
    capturedAt,
  };
}

export function diffCaptureProvenance(storedProvenance, currentProvenance) {
  const fields = [
    "browserMode",
    "userDataDir",
    "profileDirectory",
    "profileName",
    "cdpUrl",
  ];
  const mismatchedFields = [];

  for (const field of fields) {
    const storedValue = normalizeComparisonValue(field, storedProvenance?.[field]);
    const currentValue = normalizeComparisonValue(field, currentProvenance?.[field]);

    if (!storedValue || !currentValue) {
      continue;
    }

    if (storedValue !== currentValue) {
      mismatchedFields.push(field);
    }
  }

  return {
    mismatch: mismatchedFields.length > 0,
    mismatchedFields,
  };
}

export function resolvePersistentCookieDbPath(target) {
  if (target?.mode === "existing-browser-session") {
    return undefined;
  }

  if (target?.mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE) {
    if (!target?.existingProfileDir) {
      return undefined;
    }

    const safeUserDataDir = assertPathInsideAllowedRoots(
      target.existingProfileDir,
      resolveAllowedBrowserFilesystemRoots(process.env),
      "WebaiBridge browser cookie root",
    );

    return join(
      safeUserDataDir,
      assertSafePathSegment(
        target.existingProfileDirectory ?? "Profile 1",
        "WebaiBridge browser cookie profile directory",
      ),
      "Cookies",
    );
  }

  if (!target?.userDataDir) {
    return undefined;
  }

  const safeUserDataDir = assertPathInsideAllowedRoots(
    target.userDataDir,
    resolveAllowedBrowserFilesystemRoots(process.env),
    "WebaiBridge browser cookie root",
  );

  return join(
    safeUserDataDir,
    assertSafePathSegment(
      target.profileDirectory ?? DEFAULT_MANAGED_BROWSER_PROFILE_DIRECTORY,
      "WebaiBridge browser cookie profile directory",
    ),
    "Cookies",
  );
}

export function auditProviderPersistentArtifacts(provider, target, options = {}) {
  const spec = PROVIDER_SESSION_AUDIT_SPECS[provider];
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const cookieDbPath = options.cookieDbPath ?? resolvePersistentCookieDbPath(target);
  const cookieDbExists =
    options.assumeCookieDbExists === true ||
    (cookieDbPath ? existsSync(cookieDbPath) : false);

  if (!spec || !cookieDbPath) {
    return {
      available: false,
      checkedAt,
      cookieDbPath,
      exists: false,
      hostCookieCount: 0,
      matchedCookieNames: [],
      artifactStates: {},
      summary:
        "No disk-backed cookie database is available for the current browser target, so persistence audit stayed best-effort.",
    };
  }

  if (!cookieDbExists) {
    return {
      available: false,
      checkedAt,
      cookieDbPath,
      exists: false,
      hostCookieCount: 0,
      matchedCookieNames: [],
      artifactStates: {},
      summary:
        "The browser target does not currently expose a readable Cookies sqlite file, so persistence audit could not confirm disk-backed session state.",
    };
  }

  const sqliteRunner = options.sqliteRunner ?? defaultSqliteRunner;
  let result;

  try {
    result = sqliteRunner([
      cookieDbPath,
      "-separator",
      "|",
      buildCookieAuditSql(spec),
    ]);
  } catch (error) {
    return {
      available: false,
      checkedAt,
      cookieDbPath,
      exists: true,
      hostCookieCount: 0,
      matchedCookieNames: [],
      artifactStates: {},
      error: error instanceof Error ? error.message : String(error),
      summary:
        "WebaiBridge could not query the Cookies sqlite file for persistence audit, so disk truth stayed unconfirmed.",
    };
  }

  if (result.error || result.status !== 0) {
    return {
      available: false,
      checkedAt,
      cookieDbPath,
      exists: true,
      hostCookieCount: 0,
      matchedCookieNames: [],
      artifactStates: {},
      error:
        result.error?.message ??
        `${result.stderr ?? result.stdout ?? ""}`.trim() ??
        "sqlite-query-failed",
      summary:
        "WebaiBridge could not query the Cookies sqlite file for persistence audit, so disk truth stayed unconfirmed.",
    };
  }

  const rows = parseSqliteCookieRows(result.stdout);
  const matchedCookieNames = uniqueSorted(rows.map((row) => row.name));
  const artifactStates = Object.fromEntries(
    spec.cookieBackedArtifacts.map((artifact) => [
      artifact.artifactId,
      artifact.cookieNames.some((cookieName) => matchedCookieNames.includes(cookieName))
        ? "present"
        : "missing",
    ]),
  );

  return {
    available: true,
    checkedAt,
    cookieDbPath,
    exists: true,
    hostCookieCount: rows.length,
    matchedCookieNames,
    artifactStates,
    summary:
      rows.length > 0
        ? `Persistence audit found ${rows.length} provider cookie row(s) on disk.`
        : "Persistence audit found no provider cookie rows on disk.",
  };
}

export function buildBrowserPersistenceAudit(args) {
  const checkedAt = args.checkedAt ?? new Date().toISOString();
  const target = args.target ?? {};
  const browserEvidence = args.browserEvidence ?? {};
  const workspaceStatus = args.workspaceStatus ?? {};
  const diskAudit = args.diskAudit ?? {};
  const artifactStates = args.artifactStates ?? {};

  return {
    source: args.source,
    checkedAt,
    browserMode: target.mode ?? args.captureProvenance?.browserMode,
    userDataDir:
      target.existingProfileDir ??
      target.userDataDir ??
      args.captureProvenance?.userDataDir,
    profileDirectory:
      target.existingProfileDirectory ??
      target.profileDirectory ??
      args.captureProvenance?.profileDirectory,
    profileName: target.existingProfileName ?? args.captureProvenance?.profileName,
    cdpUrl:
      target.existingProfileCdpUrl ??
      target.cdpUrl ??
      args.captureProvenance?.cdpUrl,
    pageUrl: browserEvidence.currentPage?.url,
    pageTitle: browserEvidence.currentPage?.title,
    workspaceClassification: workspaceClassificationFromEvidence(
      browserEvidence,
      workspaceStatus,
    ),
    workspaceReady: workspaceStatus.liveReady === true,
    cookieDbPath: diskAudit.cookieDbPath,
    cookieDbAvailable: diskAudit.available === true,
    hostCookieCount: diskAudit.hostCookieCount,
    matchedCookieNames: diskAudit.matchedCookieNames ?? [],
    artifactStates,
    summary: args.summary,
  };
}

export function evaluateProviderSessionCoherence(args) {
  const currentProvenance = args.currentProvenance;
  const storedSession = args.storedSession ?? {};
  const runtimeStatus = args.runtimeStatus;
  const browserEvidence = args.browserEvidence ?? {};
  const workspaceStatus = args.workspaceStatus ?? {};
  const diskAudit = args.diskAudit ?? {};
  const filteredStoredArtifactStates = filterProviderArtifactStates(
    args.provider,
    storedSession.artifactStates,
  );
  const filteredDiskArtifactStates = filterProviderArtifactStates(
    args.provider,
    diskAudit.artifactStates,
  );
  const mergedArtifactStates = mergeProviderArtifactStates(
    args.provider,
    filteredStoredArtifactStates,
    filteredDiskArtifactStates,
  );
  const workspaceClassification = workspaceClassificationFromEvidence(
    browserEvidence,
    workspaceStatus,
  );
  const hasFreshWorkspaceArtifacts = Object.values(mergedArtifactStates).some(
    (value) => value === "present",
  );
  const storedCaptureProvenance =
    storedSession.captureProvenance ?? buildLegacyStoredCaptureProvenance(storedSession);
  const provenanceDiff = diffCaptureProvenance(storedCaptureProvenance, currentProvenance);

  if (storedCaptureProvenance && provenanceDiff.mismatch) {
    const summary = storedSession.captureProvenance
      ? `Stored session provenance no longer matches the active browser target (${provenanceDiff.mismatchedFields.join(", ")}).`
      : `Stored session routing hints no longer match the active browser target (${provenanceDiff.mismatchedFields.join(", ")}). This record predates explicit provenance hardening and now needs a fresh browser-backed capture.`;
    return {
      status: "user-action-required",
      validationState: "stale",
      requiredUserAction:
        runtimeStatus?.session?.reAuth?.handoff ??
        runtimeStatus?.session?.requiredUserAction ??
        summary,
      degradedReason: summary,
      artifactStates: mergedArtifactStates,
      summary,
      persistenceAudit: buildBrowserPersistenceAudit({
        source: args.source,
        target: args.target,
        captureProvenance: currentProvenance,
        browserEvidence,
        workspaceStatus,
        diskAudit,
        artifactStates: mergedArtifactStates,
        summary,
        checkedAt: args.checkedAt,
      }),
    };
  }

  if (
    workspaceClassification === "login-required" ||
    workspaceClassification === "session-incomplete" ||
    workspaceClassification === "human-verification-required" ||
    workspaceClassification === "account-action-required" ||
    workspaceClassification === "permission-gated"
  ) {
    const summary =
      workspaceStatus.reason ??
      "The attached browser is still on a login or verification page.";
    return {
      status: "user-action-required",
      validationState: "stale",
      requiredUserAction:
        runtimeStatus?.session?.reAuth?.handoff ??
        runtimeStatus?.session?.requiredUserAction ??
        summary,
      degradedReason: summary,
      artifactStates: mergedArtifactStates,
      summary,
      persistenceAudit: buildBrowserPersistenceAudit({
        source: args.source,
        target: args.target,
        captureProvenance: currentProvenance,
        browserEvidence,
        workspaceStatus,
        diskAudit,
        artifactStates: mergedArtifactStates,
        summary,
        checkedAt: args.checkedAt,
      }),
    };
  }

  if (
    runtimeStatus?.credentialState === "user-action-required" ||
    runtimeStatus?.credentialState === "expired"
  ) {
    if (workspaceClassification === "workspace-ready" && hasFreshWorkspaceArtifacts) {
      // Fresh browser+disk truth wins over a stale stored recovery verdict.
    } else {
    const summary =
      runtimeStatus.session?.requiredUserAction ??
      runtimeStatus.session?.degradedReason ??
      runtimeStatus.recommendedAction ??
      `${args.provider} now needs explicit end-user recovery.`;
    return {
      status: "user-action-required",
      validationState: runtimeStatus.session?.validationState ?? "stale",
      requiredUserAction:
        runtimeStatus.session?.requiredUserAction ??
        runtimeStatus.session?.reAuth?.handoff ??
        summary,
      degradedReason: summary,
      artifactStates: mergedArtifactStates,
      summary,
      persistenceAudit: buildBrowserPersistenceAudit({
        source: args.source,
        target: args.target,
        captureProvenance: currentProvenance,
        browserEvidence,
        workspaceStatus,
        diskAudit,
        artifactStates: mergedArtifactStates,
        summary,
        checkedAt: args.checkedAt,
      }),
    };
    }
  }

  const staleButRecoverableRuntimeState =
    runtimeStatus?.credentialState === "refreshable-but-degraded" ||
    runtimeStatus?.credentialState === "expiring";

  if (
    workspaceClassification === "provider-adjacent" ||
    workspaceClassification === "missing-page" ||
    workspaceClassification === "attach-failed" ||
    (workspaceClassification !== "workspace-ready" && staleButRecoverableRuntimeState)
  ) {
    const summary =
      workspaceStatus.reason ??
      runtimeStatus?.session?.degradedReason ??
      runtimeStatus?.recommendedAction ??
      `${args.provider} currently needs a refresh before the browser session can be trusted again.`;
    return {
      status: "refreshable-but-degraded",
      validationState: runtimeStatus?.session?.validationState ?? "recovering",
      degradedReason: summary,
      artifactStates: mergedArtifactStates,
      summary,
      persistenceAudit: buildBrowserPersistenceAudit({
        source: args.source,
        target: args.target,
        captureProvenance: currentProvenance,
        browserEvidence,
        workspaceStatus,
        diskAudit,
        artifactStates: mergedArtifactStates,
        summary,
        checkedAt: args.checkedAt,
      }),
    };
  }

  const summary =
    workspaceStatus.reason ??
    runtimeStatus?.statusSummary ??
    `${args.provider} store, browser, and disk truth are currently coherent.`;
  return {
    status: "ready",
    validationState: runtimeStatus?.session?.validationState ?? "validated",
    artifactStates: mergedArtifactStates,
    summary,
    persistenceAudit: buildBrowserPersistenceAudit({
      source: args.source,
      target: args.target,
      captureProvenance: currentProvenance,
      browserEvidence,
      workspaceStatus,
      diskAudit,
      artifactStates: mergedArtifactStates,
      summary,
      checkedAt: args.checkedAt,
    }),
  };
}
