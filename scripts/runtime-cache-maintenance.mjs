import "./load-local-env.mjs";

import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveConfiguredChromeProfile,
  resolveWebaiBridgeCacheMaxBytes,
  resolveWebaiBridgeCacheRoots,
  resolveWebaiBridgeCacheTtlDays,
  WEBAI_BRIDGE_CACHE_MAX_BYTES_ENV_NAME,
  WEBAI_BRIDGE_CACHE_TTL_DAYS_ENV_NAME,
  WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT_ENV_NAME,
} from "./runtime-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "..");
export const runtimeCacheRoot = join(repoRoot, ".runtime-cache");
export const managedBrowserProfileDir = join(
  runtimeCacheRoot,
  "webai-bridge-web-auth-browser",
);
export const browserDebugDir = join(runtimeCacheRoot, "browser-debug");
export const browserDebugBundlesDir = join(browserDebugDir, "bundles");
export const browserSupportDir = join(runtimeCacheRoot, "browser-support");
export const runtimeTempDir = join(runtimeCacheRoot, "temp");

const MANAGED_BROWSER_PORTS = ["39222", "9338"];
const PROTECTED_BUNDLE_COUNT = 20;
const KNOWN_CATEGORY_NAMES = new Set([
  "webai-bridge-web-auth-browser",
  "browser-debug",
  "browser-support",
  "temp",
]);
const PROTECTED_EXTERNAL_BROWSER_BUCKET = "browser";
const SHARED_TOOL_CACHES = [
  "node_modules",
  "~/.npm",
  "~/.cache/pnpm",
  "~/Library/Caches/pnpm",
  "~/Library/Caches/ms-playwright",
  "pnpm store",
  "uv cache",
  "pre-commit cache",
  "Docker global cache",
  ".serena/cache",
];
const EXTERNAL_BUCKETS = {
  temp: {
    category: "external-disposable-generated",
    defaultAction: "delete",
    priority: 10,
    ttlMode: "always",
  },
  diagnostics: {
    category: "external-debug-evidence",
    defaultAction: "prune",
    priority: 30,
    ttlMode: "ttl",
  },
  "browser-debug": {
    category: "external-debug-evidence",
    defaultAction: "prune",
    priority: 30,
    ttlMode: "ttl",
  },
  "support-bundles": {
    category: "external-debug-evidence",
    defaultAction: "prune",
    priority: 35,
    ttlMode: "ttl",
  },
  "session-snapshots": {
    category: "external-debug-evidence",
    defaultAction: "prune",
    priority: 35,
    ttlMode: "ttl",
  },
  profiles: {
    category: "external-browser-artifacts",
    defaultAction: "prune",
    priority: 40,
    ttlMode: "ttl",
  },
  "browser-profiles": {
    category: "external-browser-artifacts",
    defaultAction: "prune",
    priority: 40,
    ttlMode: "ttl",
  },
  "cloned-profiles": {
    category: "external-browser-artifacts",
    defaultAction: "prune",
    priority: 40,
    ttlMode: "ttl",
  },
};
const OTHER_RUNTIME_CACHE_RULES = [
  {
    category: "disposable-generated",
    label: "verify-web-login-test-state",
    match: (name) => name.startsWith("webai-bridge-verify-web-login-test-"),
    priority: 12,
    reason: "cleanup-verify-web-login-test-state",
  },
  {
    category: "disposable-generated",
    label: "store-preserve-snapshot",
    match: (name) => name.startsWith("webai-bridge-store-preserve-"),
    priority: 13,
    reason: "cleanup-store-preserve-snapshot",
  },
  {
    category: "disposable-generated",
    label: "chatgpt-writeback-snapshot",
    match: (name) => name.startsWith("webai-bridge-chatgpt-ready-writeback-"),
    priority: 13,
    reason: "cleanup-chatgpt-writeback-snapshot",
  },
  {
    category: "disposable-generated",
    label: "service-log",
    match: (name) => /^app-service(?:-\d+|-live)?\.log$/u.test(name),
    priority: 14,
    reason: "cleanup-service-log",
  },
  {
    category: "disposable-generated",
    label: "reality-gate-report",
    match: (name) => /^reality-gate(?:-latest)?\.(?:out|exit)$/u.test(name),
    priority: 14,
    reason: "cleanup-reality-gate-report",
  },
];

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unitIndex = -1;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function toRelativePath(baseRoot, targetPath) {
  const rel = relative(baseRoot, targetPath);
  if (!rel) {
    return ".";
  }

  return rel.startsWith("..") ? targetPath : rel.replaceAll("\\", "/");
}

function safeMtime(targetPath) {
  if (!existsSync(targetPath)) {
    return null;
  }

  try {
    return statSync(targetPath).mtime.toISOString();
  } catch {
    return null;
  }
}

function safeMtimeMs(targetPath) {
  if (!existsSync(targetPath)) {
    return 0;
  }

  try {
    return statSync(targetPath).mtimeMs;
  } catch {
    return 0;
  }
}

function getPathSizeBytes(targetPath) {
  if (!existsSync(targetPath)) {
    return 0;
  }

  let stats;

  try {
    stats = lstatSync(targetPath);
  } catch {
    return 0;
  }

  if (!stats.isDirectory()) {
    return stats.size;
  }

  let total = 0;

  try {
    for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
      total += getPathSizeBytes(join(targetPath, entry.name));
    }
  } catch {
    return total;
  }

  return total;
}

function describeEntry(baseRoot, category, targetPath, defaultAction, extra = {}) {
  const exists = existsSync(targetPath);
  const sizeBytes = extra.sizeBytes ?? getPathSizeBytes(targetPath);

  return {
    category,
    path: toRelativePath(baseRoot, targetPath),
    absolutePath: targetPath,
    exists,
    sizeBytes,
    sizeHuman: formatBytes(sizeBytes),
    mtime: safeMtime(targetPath),
    defaultAction,
    ...extra,
  };
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
  });
}

function resolveMaintenancePaths(customRepoRoot = repoRoot, env = process.env) {
  const roots = resolveWebaiBridgeCacheRoots(customRepoRoot, env);
  return {
    ...roots,
    managedBrowserProfileDir: join(
      roots.runtimeCacheRoot,
      "webai-bridge-web-auth-browser",
    ),
    browserDebugBundlesDir: join(
      roots.runtimeCacheRoot,
      "browser-debug",
      "bundles",
    ),
    browserSupportDir: join(roots.runtimeCacheRoot, "browser-support"),
    runtimeTempDir: join(roots.runtimeCacheRoot, "temp"),
    cacheTtlDays: resolveWebaiBridgeCacheTtlDays(env),
    cacheMaxBytes: resolveWebaiBridgeCacheMaxBytes(env),
    userOwnedChromeProfile: resolveConfiguredChromeProfile(env),
  };
}

function listChildren(targetPath) {
  if (!existsSync(targetPath)) {
    return [];
  }

  try {
    return readdirSync(targetPath, { withFileTypes: true })
      .map((entry) => join(targetPath, entry.name))
      .sort((left, right) => safeMtimeMs(left) - safeMtimeMs(right));
  } catch {
    return [];
  }
}

function collectOtherRuntimeCacheChildren(runtimeCacheRootPath) {
  if (!existsSync(runtimeCacheRootPath)) {
    return [];
  }

  return readdirSync(runtimeCacheRootPath, { withFileTypes: true })
    .filter((entry) => !KNOWN_CATEGORY_NAMES.has(entry.name))
    .map((entry) => join(runtimeCacheRootPath, entry.name));
}

function resolveOtherRuntimeCacheRule(targetPath) {
  const name = targetPath.split(/[\\/]/).at(-1) ?? "";

  for (const rule of OTHER_RUNTIME_CACHE_RULES) {
    if (rule.match(name)) {
      return rule;
    }
  }

  return null;
}

function summarizeExternalCacheChildren(baseRoot, externalRoot) {
  if (!existsSync(externalRoot)) {
    return [];
  }

  return readdirSync(externalRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== PROTECTED_EXTERNAL_BROWSER_BUCKET)
    .map((entry) => toRelativePath(baseRoot, join(externalRoot, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function buildAuditEntries(paths) {
  const otherChildren = collectOtherRuntimeCacheChildren(paths.runtimeCacheRoot);
  const otherSizeBytes = otherChildren.reduce(
    (total, childPath) => total + getPathSizeBytes(childPath),
    0,
  );
  const externalChildren = summarizeExternalCacheChildren(
    paths.repoRoot,
    paths.externalCacheRoot,
  );

  return [
    describeEntry(
      paths.repoRoot,
      "managed-browser-profile",
      paths.managedBrowserProfileDir,
      "protect",
    ),
    describeEntry(
      paths.repoRoot,
      "debug-evidence",
      paths.browserDebugBundlesDir,
      "prune",
      {
        bundleCount: listChildren(paths.browserDebugBundlesDir).length,
      },
    ),
    describeEntry(
      paths.repoRoot,
      "support-bundles",
      paths.browserSupportDir,
      "prune",
    ),
    describeEntry(
      paths.repoRoot,
      "disposable-generated",
      paths.runtimeTempDir,
      "delete",
    ),
    describeEntry(
      paths.repoRoot,
      "other-runtime-cache",
      paths.runtimeCacheRoot,
      "report-only",
      {
        sizeBytes: otherSizeBytes,
        children: otherChildren.map((childPath) =>
          toRelativePath(paths.repoRoot, childPath),
        ),
      },
    ),
    describeEntry(
      paths.repoRoot,
      "external-dedicated-cache",
      paths.externalCacheRoot,
      "prune",
      {
        children: externalChildren,
      },
    ),
    describeEntry(
      paths.repoRoot,
      "protected-permanent-browser-root",
      paths.userOwnedChromeProfile.userDataDir,
      "protect",
      {
        profileDirectory: paths.userOwnedChromeProfile.profileDirectory,
        profileName: paths.userOwnedChromeProfile.profileName,
      },
    ),
  ];
}

function inspectManagedBrowserListeners() {
  const blockedReasons = [];

  for (const port of MANAGED_BROWSER_PORTS) {
    const result = runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);

    if (result.error) {
      blockedReasons.push(
        `Could not verify whether port ${port} is idle: ${result.error.message}`,
      );
      continue;
    }

    if (result.status === 0 && result.stdout.trim()) {
      blockedReasons.push(
        `Refusing managed-browser cleanup because port ${port} still has a listening process.`,
      );
    }
  }

  return blockedReasons;
}

function inspectManagedBrowserProcesses(baseRoot, profilePath) {
  const result = runCommand("ps", ["axww", "-o", "pid=,command="]);

  if (result.error) {
    return [
      `Could not verify Chrome/Chromium process ownership for ${toRelativePath(baseRoot, profilePath)}: ${result.error.message}`,
    ];
  }

  if (result.status !== 0) {
    return [
      `Could not verify Chrome/Chromium process ownership for ${toRelativePath(baseRoot, profilePath)}.`,
    ];
  }

  const profileName =
    profilePath.split(/[\\/]/).at(-1) ?? "webai-bridge-web-auth-browser";
  const blockedReasons = [];

  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();

    if (!line) {
      continue;
    }

    if (!lower.includes("chrome") && !lower.includes("chromium")) {
      continue;
    }

    if (!line.includes(profilePath) && !line.includes(profileName)) {
      continue;
    }

    blockedReasons.push(
      `Refusing managed-browser cleanup because an active Chrome/Chromium process still references ${toRelativePath(baseRoot, profilePath)}.`,
    );
  }

  return blockedReasons;
}

function buildManagedBrowserBlockers(baseRoot, profilePath) {
  return [
    ...inspectManagedBrowserListeners(),
    ...inspectManagedBrowserProcesses(baseRoot, profilePath),
  ];
}

function createDeleteCandidate(baseRoot, category, absolutePath, reason, priority) {
  const sizeBytes = getPathSizeBytes(absolutePath);
  return {
    category,
    path: toRelativePath(baseRoot, absolutePath),
    absolutePath,
    sizeBytes,
    sizeHuman: formatBytes(sizeBytes),
    mtime: safeMtime(absolutePath),
    mtimeMs: safeMtimeMs(absolutePath),
    reason,
    priority,
  };
}

function addCandidate(candidateMap, candidate) {
  if (!candidate?.absolutePath) {
    return;
  }

  const existing = candidateMap.get(candidate.absolutePath);

  if (!existing) {
    candidateMap.set(candidate.absolutePath, candidate);
    return;
  }

  if (candidate.priority < existing.priority) {
    candidateMap.set(candidate.absolutePath, candidate);
    return;
  }

  if (candidate.priority === existing.priority && candidate.reason.length < existing.reason.length) {
    candidateMap.set(candidate.absolutePath, candidate);
  }
}

function isExpired(targetPath, ttlMs, nowMs) {
  if (!ttlMs || !existsSync(targetPath)) {
    return false;
  }

  return nowMs - safeMtimeMs(targetPath) >= ttlMs;
}

function collectRepoLocalCandidates(paths, nowMs, ttlMs, options = {}) {
  const candidateMap = new Map();
  let ttlHits = 0;
  const bundlePaths = listChildren(paths.browserDebugBundlesDir);
  const otherChildren = collectOtherRuntimeCacheChildren(paths.runtimeCacheRoot);

  if (existsSync(paths.runtimeTempDir)) {
    if (options.lightweight) {
      for (const tempPath of listChildren(paths.runtimeTempDir)) {
        if (!isExpired(tempPath, ttlMs, nowMs)) {
          continue;
        }

        addCandidate(
          candidateMap,
          createDeleteCandidate(
            paths.repoRoot,
            "disposable-generated",
            tempPath,
            "cleanup-stale-temp-child",
            10,
          ),
        );
      }
    } else {
      addCandidate(
        candidateMap,
        createDeleteCandidate(
          paths.repoRoot,
          "disposable-generated",
          paths.runtimeTempDir,
          "cleanup-temp-root",
          10,
        ),
      );
    }
  }

  for (const bundlePath of bundlePaths) {
    if (!isExpired(bundlePath, ttlMs, nowMs)) {
      continue;
    }

    ttlHits += 1;
    addCandidate(
      candidateMap,
      createDeleteCandidate(
        paths.repoRoot,
        "debug-evidence",
        bundlePath,
        "ttl-expired-debug-bundle",
        20,
      ),
    );
  }

  if (bundlePaths.length > PROTECTED_BUNDLE_COUNT) {
    for (const bundlePath of bundlePaths.slice(
      0,
      bundlePaths.length - PROTECTED_BUNDLE_COUNT,
    )) {
      addCandidate(
        candidateMap,
        createDeleteCandidate(
          paths.repoRoot,
          "debug-evidence",
          bundlePath,
          `older-than-protected-${PROTECTED_BUNDLE_COUNT}`,
          22,
        ),
      );
    }
  }

  for (const supportPath of listChildren(paths.browserSupportDir)) {
    if (!isExpired(supportPath, ttlMs, nowMs)) {
      continue;
    }

    ttlHits += 1;
    addCandidate(
      candidateMap,
      createDeleteCandidate(
        paths.repoRoot,
        "support-bundles",
        supportPath,
        "ttl-expired-support-bundle",
        25,
      ),
    );
  }

  for (const otherPath of otherChildren) {
    const rule = resolveOtherRuntimeCacheRule(otherPath);

    if (!rule) {
      continue;
    }

    addCandidate(
      candidateMap,
      createDeleteCandidate(
        paths.repoRoot,
        rule.category,
        otherPath,
        rule.reason,
        rule.priority,
      ),
    );
  }

  return {
    candidateMap,
    ttlHits,
  };
}

function collectExternalCandidates(paths, nowMs, ttlMs, options = {}) {
  const candidateMap = new Map();
  let ttlHits = 0;

  if (!existsSync(paths.externalCacheRoot)) {
    return {
      candidateMap,
      ttlHits,
    };
  }

  for (const bucketPath of listChildren(paths.externalCacheRoot)) {
    const bucketName = bucketPath.split(/[\\/]/).at(-1) ?? "";

    if (bucketName === PROTECTED_EXTERNAL_BROWSER_BUCKET) {
      continue;
    }

    const bucketConfig =
      EXTERNAL_BUCKETS[bucketName] ?? {
        category: "external-dedicated-cache",
        defaultAction: "prune",
        priority: 45,
        ttlMode: "ttl",
      };

    if (bucketConfig.ttlMode === "always") {
      if (options.lightweight && lstatSync(bucketPath).isDirectory()) {
        for (const tempPath of listChildren(bucketPath)) {
          if (!isExpired(tempPath, ttlMs, nowMs)) {
            continue;
          }

          addCandidate(
            candidateMap,
            createDeleteCandidate(
              paths.repoRoot,
              bucketConfig.category,
              tempPath,
              "cleanup-stale-external-temp-child",
              bucketConfig.priority,
            ),
          );
        }
      } else {
        addCandidate(
          candidateMap,
          createDeleteCandidate(
            paths.repoRoot,
            bucketConfig.category,
            bucketPath,
            "cleanup-external-temp-root",
            bucketConfig.priority,
          ),
        );
      }
      continue;
    }

    const targets = lstatSync(bucketPath).isDirectory() ? listChildren(bucketPath) : [bucketPath];

    for (const targetPath of targets) {
      if (!isExpired(targetPath, ttlMs, nowMs)) {
        continue;
      }

      ttlHits += 1;
      addCandidate(
        candidateMap,
        createDeleteCandidate(
          paths.repoRoot,
          bucketConfig.category,
          targetPath,
          `ttl-expired-${bucketConfig.category}`,
          bucketConfig.priority,
        ),
      );
    }
  }

  return {
    candidateMap,
    ttlHits,
  };
}

function buildCapPrunePool(paths) {
  const pool = [];

  for (const bundlePath of listChildren(paths.browserDebugBundlesDir)) {
    pool.push(
      createDeleteCandidate(
        paths.repoRoot,
        "debug-evidence",
        bundlePath,
        "capacity-prune-debug-bundle",
        60,
      ),
    );
  }

  for (const supportPath of listChildren(paths.browserSupportDir)) {
    pool.push(
      createDeleteCandidate(
        paths.repoRoot,
        "support-bundles",
        supportPath,
        "capacity-prune-support-bundle",
        65,
      ),
    );
  }

  if (existsSync(paths.externalCacheRoot)) {
    for (const bucketPath of listChildren(paths.externalCacheRoot)) {
      const bucketName = bucketPath.split(/[\\/]/).at(-1) ?? "";

      if (bucketName === PROTECTED_EXTERNAL_BROWSER_BUCKET) {
        continue;
      }

      const bucketConfig =
        EXTERNAL_BUCKETS[bucketName] ?? {
          category: "external-dedicated-cache",
          priority: 75,
        };
      const targets = lstatSync(bucketPath).isDirectory() ? listChildren(bucketPath) : [bucketPath];

      for (const targetPath of targets) {
        pool.push(
          createDeleteCandidate(
            paths.repoRoot,
            bucketConfig.category,
            targetPath,
            `capacity-prune-${bucketConfig.category}`,
            bucketConfig.priority,
          ),
        );
      }
    }
  }

  return pool.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    if (left.mtimeMs !== right.mtimeMs) {
      return left.mtimeMs - right.mtimeMs;
    }

    return left.absolutePath.localeCompare(right.absolutePath);
  });
}

function computeWouldDelete(paths, options) {
  const nowMs = Date.now();
  const ttlMs = paths.cacheTtlDays * 24 * 60 * 60 * 1000;
  const repoLocal = collectRepoLocalCandidates(paths, nowMs, ttlMs, options);
  const external = collectExternalCandidates(paths, nowMs, ttlMs, options);
  const candidateMap = new Map([
    ...repoLocal.candidateMap.entries(),
    ...external.candidateMap.entries(),
  ]);
  const blockedReasons = [];

  if (options.includeManagedBrowser && existsSync(paths.managedBrowserProfileDir)) {
    const blockers = buildManagedBrowserBlockers(
      paths.repoRoot,
      paths.managedBrowserProfileDir,
    );
    blockedReasons.push(...blockers);

    if (blockers.length === 0) {
      addCandidate(
        candidateMap,
        createDeleteCandidate(
          paths.repoRoot,
          "managed-browser-profile",
          paths.managedBrowserProfileDir,
          "explicit-include-managed-browser",
          99,
        ),
      );
    }
  }

  const repoLocalBytes = getPathSizeBytes(paths.runtimeCacheRoot);
  const externalCacheBytes = getPathSizeBytes(paths.externalCacheRoot);
  const totalBytes = repoLocalBytes + externalCacheBytes;
  let projectedBytes = totalBytes;

  for (const candidate of candidateMap.values()) {
    projectedBytes -= candidate.sizeBytes;
  }

  if (projectedBytes > paths.cacheMaxBytes) {
    for (const candidate of buildCapPrunePool(paths)) {
      if (projectedBytes <= paths.cacheMaxBytes) {
        break;
      }

      if (candidateMap.has(candidate.absolutePath)) {
        continue;
      }

      addCandidate(candidateMap, candidate);
      projectedBytes -= candidate.sizeBytes;
    }
  }

  const wouldDelete = [...candidateMap.values()].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    if (left.mtimeMs !== right.mtimeMs) {
      return left.mtimeMs - right.mtimeMs;
    }

    return left.absolutePath.localeCompare(right.absolutePath);
  });

  return {
    wouldDelete,
    blockedReasons,
    ttlHits: repoLocal.ttlHits + external.ttlHits,
  };
}

export function buildRuntimeCacheMaintenancePayload(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveMaintenancePaths(options.repoRoot, env);
  const command = options.command ?? "audit";
  const includeManagedBrowser = options.includeManagedBrowser === true;
  const apply = options.apply === true && command === "cleanup";
  const entries = buildAuditEntries(paths);
  const { wouldDelete, blockedReasons, ttlHits } =
    command === "cleanup"
      ? computeWouldDelete(paths, {
          ...options,
          includeManagedBrowser,
        })
      : {
          wouldDelete: [],
          blockedReasons: [],
          ttlHits: 0,
        };
  const repoLocalBytes = getPathSizeBytes(paths.runtimeCacheRoot);
  const externalCacheBytes = getPathSizeBytes(paths.externalCacheRoot);
  const totalBytes = repoLocalBytes + externalCacheBytes;
  const deletableBytes = wouldDelete.reduce(
    (total, candidate) => total + candidate.sizeBytes,
    0,
  );
  const protectedBytes =
    getPathSizeBytes(paths.managedBrowserProfileDir) +
    getPathSizeBytes(paths.userOwnedChromeProfile.userDataDir);

  return {
    command,
    apply,
    includeManagedBrowser,
    repoRoot: paths.repoRoot,
    runtimeCacheRoot: paths.runtimeCacheRoot,
    externalCacheRoot: paths.externalCacheRoot,
    entries,
    cachePolicy: {
      ttlDays: paths.cacheTtlDays,
      ttlSource: env[WEBAI_BRIDGE_CACHE_TTL_DAYS_ENV_NAME]?.trim()
        ? WEBAI_BRIDGE_CACHE_TTL_DAYS_ENV_NAME
        : "default",
      maxBytes: paths.cacheMaxBytes,
      maxBytesHuman: formatBytes(paths.cacheMaxBytes),
      maxBytesSource: env[WEBAI_BRIDGE_CACHE_MAX_BYTES_ENV_NAME]?.trim()
        ? WEBAI_BRIDGE_CACHE_MAX_BYTES_ENV_NAME
        : "default",
      externalCacheRootSource: env[WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT_ENV_NAME]?.trim()
        ? WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT_ENV_NAME
        : "default",
      sharedToolCaches: SHARED_TOOL_CACHES,
    },
    protectedPermanentBrowserRoot: {
      configured: true,
      userDataDir: paths.userOwnedChromeProfile.userDataDir,
      profileName: paths.userOwnedChromeProfile.profileName,
      profileDirectory: paths.userOwnedChromeProfile.profileDirectory,
      profileDir: paths.userOwnedChromeProfile.profileDir,
      managedByRepo: true,
      defaultAction: "protect",
      excludedFromTtlAndCap: true,
    },
    totals: {
      runtimeCacheBytes: repoLocalBytes,
      runtimeCacheHuman: formatBytes(repoLocalBytes),
      repoLocalBytes,
      repoLocalHuman: formatBytes(repoLocalBytes),
      externalCacheBytes,
      externalCacheHuman: formatBytes(externalCacheBytes),
      totalBytes,
      totalHuman: formatBytes(totalBytes),
      deletableBytes,
      deletableHuman: formatBytes(deletableBytes),
      deletedBytes: 0,
      deletedHuman: formatBytes(0),
      protectedBytes,
      protectedHuman: formatBytes(protectedBytes),
      ttlHits,
    },
    wouldDelete,
    blockedReasons,
  };
}

function removePath(targetPath) {
  rmSync(targetPath, {
    recursive: true,
    force: true,
  });
}

export function cleanupRuntimeCache(options = {}) {
  const payload = buildRuntimeCacheMaintenancePayload({
    ...options,
    command: "cleanup",
  });
  const bestEffort = options.bestEffort === true;

  if (!payload.apply) {
    return {
      ...payload,
      deleted: [],
      aborted: false,
    };
  }

  if (payload.includeManagedBrowser && payload.blockedReasons.length > 0) {
    return {
      ...payload,
      deleted: [],
      aborted: true,
    };
  }

  const deleted = [];
  const blockedReasons = [...payload.blockedReasons];

  for (const candidate of payload.wouldDelete) {
    try {
      removePath(candidate.absolutePath);
      deleted.push(candidate);
    } catch (error) {
      if (!bestEffort) {
        throw error;
      }

      const message = error instanceof Error ? error.message : `${error}`;
      blockedReasons.push(
        `Best-effort cleanup skipped ${candidate.path}: ${message}`,
      );
    }
  }

  const deletedBytes = deleted.reduce(
    (total, candidate) => total + candidate.sizeBytes,
    0,
  );

  return {
    ...payload,
    deleted,
    aborted: false,
    blockedReasons,
    totals: {
      ...payload.totals,
      deletedBytes,
      deletedHuman: formatBytes(deletedBytes),
    },
  };
}

export async function autoPruneRuntimeCaches(options = {}) {
  return cleanupRuntimeCache({
    command: "cleanup",
    apply: true,
    bestEffort: true,
    lightweight: true,
    ...options,
  });
}

export const runLightweightRuntimePrune = autoPruneRuntimeCaches;

function padCell(value, width) {
  return `${value ?? ""}`.padEnd(width, " ");
}

export function renderRuntimeCacheMaintenancePayload(payload) {
  const lines = [
    `WebaiBridge runtime cache maintenance (${payload.command}${payload.apply ? " apply" : payload.command === "cleanup" ? " dry-run" : ""})`,
    "",
    `repo-local runtime root : ${payload.runtimeCacheRoot}`,
    `external cache root    : ${payload.externalCacheRoot}`,
    `ttl / max bytes        : ${payload.cachePolicy.ttlDays} days / ${payload.cachePolicy.maxBytesHuman}`,
    "",
  ];
  const headers = [
    ["category", 26],
    ["path", 44],
    ["size", 12],
    ["mtime", 24],
    ["defaultAction", 14],
  ];

  lines.push(headers.map(([label, width]) => padCell(label, width)).join(" | "));
  lines.push(headers.map(([, width]) => "-".repeat(width)).join("-|-"));

  for (const entry of payload.entries) {
    lines.push(
      [
        padCell(entry.category, 26),
        padCell(entry.path, 44),
        padCell(entry.sizeHuman, 12),
        padCell(entry.mtime ?? "missing", 24),
        padCell(entry.defaultAction, 14),
      ].join(" | "),
    );
  }

  lines.push("");
  lines.push(`repoLocal: ${payload.totals.repoLocalHuman}`);
  lines.push(`external : ${payload.totals.externalCacheHuman}`);
  lines.push(`total    : ${payload.totals.totalHuman}`);
  lines.push(`wouldDelete: ${payload.totals.deletableHuman}`);
  lines.push(`protected: ${payload.totals.protectedHuman}`);
  lines.push(`ttlHits  : ${payload.totals.ttlHits}`);

  if (payload.protectedPermanentBrowserRoot?.configured) {
    lines.push("");
    lines.push("Protected permanent browser root:");
    lines.push(
      `- ${payload.protectedPermanentBrowserRoot.profileDir} (dir=${payload.protectedPermanentBrowserRoot.profileDirectory}, profile=${payload.protectedPermanentBrowserRoot.profileName}, excluded from TTL/cap)`,
    );
  }

  if (payload.wouldDelete.length > 0) {
    lines.push("");
    lines.push("Would delete:");
    for (const candidate of payload.wouldDelete) {
      lines.push(
        `- ${candidate.path} [${candidate.category}] (${candidate.sizeHuman}) ${candidate.reason}`,
      );
    }
  }

  if (payload.blockedReasons.length > 0) {
    lines.push("");
    lines.push("Blocked reasons:");
    for (const blockedReason of payload.blockedReasons) {
      lines.push(`- ${blockedReason}`);
    }
  }

  if (Array.isArray(payload.deleted) && payload.deleted.length > 0) {
    lines.push("");
    lines.push("Deleted:");
    for (const candidate of payload.deleted) {
      lines.push(`- ${candidate.path} (${candidate.sizeHuman})`);
    }
  }

  lines.push("");
  lines.push("Shared caches not managed by this repo:");
  for (const cachePath of payload.cachePolicy.sharedToolCaches) {
    lines.push(`- ${cachePath}`);
  }

  return `${lines.join("\n")}\n`;
}

export function parseRuntimeCacheMaintenanceArgs(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;

  if (!command || (command !== "audit" && command !== "cleanup")) {
    throw new Error("Expected command: audit | cleanup");
  }

  const options = {
    command,
    json: false,
    apply: false,
    includeManagedBrowser: false,
  };

  for (const arg of rest) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.apply = false;
      continue;
    }

    if (arg === "--include-managed-browser") {
      options.includeManagedBrowser = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runRuntimeCacheMaintenance(options = {}) {
  if (options.command === "cleanup") {
    return cleanupRuntimeCache(options);
  }

  return buildRuntimeCacheMaintenancePayload(options);
}

async function main() {
  const options = parseRuntimeCacheMaintenanceArgs();
  const payload = await runRuntimeCacheMaintenance(options);

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    process.stdout.write(renderRuntimeCacheMaintenancePayload(payload));
  }

  if (payload.command === "cleanup" && payload.apply && payload.blockedReasons.length > 0) {
    process.exit(1);
  }
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
