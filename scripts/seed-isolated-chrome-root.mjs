import "./load-local-env.mjs";

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { auditProviderPersistentArtifacts } from "./browser-session-coherence.mjs";
import {
  DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  DEFAULT_SOURCE_CHROME_PROFILE_DIRECTORY,
  DEFAULT_SOURCE_CHROME_PROFILE_NAME,
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  assertPathInsideAllowedRoots,
  resolveAllowedRuntimeArtifactRoots,
  resolveChromeProfileDirectory,
  resolveIsolatedChromeProfileConfig,
  resolveSourceChromeProfileSelection,
} from "./runtime-policy.mjs";
import { homedir } from "node:os";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const SINGLETON_FILE_NAMES = new Set([
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    reseed: false,
    sourceRoot: undefined,
    sourceProfileDir: undefined,
    sourceProfileName: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--reseed") {
      options.reseed = true;
      continue;
    }

    if (arg === "--source-root") {
      options.sourceRoot = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-profile-dir") {
      options.sourceProfileDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-profile-name") {
      options.sourceProfileName = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function createSeedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePsLines(stdout = "") {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectDefaultChromeRootConflicts(sourceRoot) {
  const result = spawnSync("ps", ["axww", "-o", "pid=,command="], {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return [
      "WebaiBridge could not verify whether the default Chrome root is idle before seeding.",
    ];
  }

  const blockers = [];

  for (const line of normalizePsLines(result.stdout)) {
    const lower = line.toLowerCase();
    const isTopLevelChrome =
      lower.includes("/contents/macos/google chrome") ||
      lower.includes("/google-chrome") ||
      lower.includes("/chromium");
    const isHelperOrCrashpad =
      lower.includes("helper") || lower.includes("crashpad");

    if (!isTopLevelChrome || isHelperOrCrashpad) {
      continue;
    }

    const explicitUserDataDirMatch = /--user-data-dir=([^\s]+)/.exec(line);
    const explicitUserDataDir = explicitUserDataDirMatch?.[1]
      ? resolve(explicitUserDataDirMatch[1])
      : undefined;

    if (!explicitUserDataDir || explicitUserDataDir === sourceRoot) {
      blockers.push(
        `Default Chrome root is still active via browser process: ${line}`,
      );
    }
  }

  return blockers;
}

function ensureReadableSource(sourceRoot, sourceProfileDir) {
  const localStatePath = join(sourceRoot, "Local State");
  const profilePath = join(sourceRoot, sourceProfileDir);

  if (!existsSync(localStatePath)) {
    throw createSeedError(
      "missing-source-local-state",
      `WebaiBridge could not find Local State under ${sourceRoot}.`,
    );
  }

  if (!existsSync(profilePath)) {
    throw createSeedError(
      "missing-source-profile",
      `WebaiBridge could not find source profile ${sourceProfileDir} under ${sourceRoot}.`,
    );
  }

  return {
    localStatePath,
    profilePath,
  };
}

function isDirectoryEmpty(targetPath) {
  return !existsSync(targetPath) || readdirSync(targetPath).length === 0;
}

function ensureTargetReady(targetRoot, reseed) {
  if (!existsSync(targetRoot)) {
    mkdirSync(targetRoot, { recursive: true });
    return;
  }

  if (isDirectoryEmpty(targetRoot)) {
    return;
  }

  if (!reseed) {
    throw createSeedError(
      "target-root-not-empty",
      `WebaiBridge isolated Chrome root already exists at ${targetRoot}. Refusing to overwrite it without --reseed.`,
    );
  }

  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
}

function copySeedInputs({ sourceLocalStatePath, sourceProfilePath, targetRoot }) {
  const targetLocalStatePath = join(targetRoot, "Local State");
  const targetProfilePath = join(
    targetRoot,
    DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  );

  cpSync(sourceLocalStatePath, targetLocalStatePath);
  cpSync(sourceProfilePath, targetProfilePath, {
    recursive: true,
    force: true,
    filter(sourcePath) {
      return !SINGLETON_FILE_NAMES.has(sourcePath.split("/").at(-1) ?? "");
    },
  });

  return {
    targetLocalStatePath,
    targetProfilePath,
  };
}

function rewriteLocalState({
  targetLocalStatePath,
  sourceProfileDirectory,
  displayName,
}) {
  const localState = JSON.parse(readFileSync(targetLocalStatePath, "utf8"));
  const nextLocalState = typeof structuredClone === "function"
    ? structuredClone(localState)
    : JSON.parse(JSON.stringify(localState));
  const sourceInfo = nextLocalState?.profile?.info_cache?.[sourceProfileDirectory] ?? {};

  nextLocalState.profile ??= {};
  nextLocalState.profile.info_cache = {
    [DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY]: {
      ...sourceInfo,
      name: displayName,
    },
  };
  nextLocalState.profile.last_used = DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY;
  nextLocalState.profile.last_active_profiles = [
    DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  ];
  nextLocalState.profile.profiles_order = [
    DEFAULT_ISOLATED_CHROME_PROFILE_DIRECTORY,
  ];

  writeFileSync(
    targetLocalStatePath,
    `${JSON.stringify(nextLocalState, null, 2)}\n`,
    "utf8",
  );
}

function removeSingletonFiles(targetRoot) {
  const removed = [];

  for (const name of SINGLETON_FILE_NAMES) {
    const candidate = join(targetRoot, name);

    if (!existsSync(candidate)) {
      continue;
    }

    rmSync(candidate, { force: true });
    removed.push(candidate);
  }

  return removed;
}

function resolveSeedSource(options, env = process.env) {
  const sourceSelection = resolveSourceChromeProfileSelection({
    ...env,
    ...(options.sourceRoot
      ? { WEBAI_BRIDGE_SOURCE_CHROME_USER_DATA_DIR: options.sourceRoot }
      : {}),
    ...(options.sourceProfileName
      ? { WEBAI_BRIDGE_SOURCE_CHROME_PROFILE_NAME: options.sourceProfileName }
      : {}),
  });
  const sourceProfileDirectory =
    options.sourceProfileDir?.trim() ||
    sourceSelection.profileDirectory ||
    resolveChromeProfileDirectory(
      sourceSelection.userDataDir,
      sourceSelection.profileName,
      DEFAULT_SOURCE_CHROME_PROFILE_DIRECTORY,
    );

  return {
    userDataDir: assertPathInsideAllowedRoots(
      sourceSelection.userDataDir,
      [homedir()],
      "WebaiBridge source Chrome root",
    ),
    profileName: sourceSelection.profileName || DEFAULT_SOURCE_CHROME_PROFILE_NAME,
    profileDirectory: sourceProfileDirectory,
    profileDir: join(sourceSelection.userDataDir, sourceProfileDirectory),
  };
}

export function planIsolatedChromeRootSeed(
  options = {},
  env = process.env,
) {
  const source = resolveSeedSource(options, env);
  const runtimeRoots = resolveAllowedRuntimeArtifactRoots(env, repoRoot);
  const targetConfig = resolveIsolatedChromeProfileConfig(env);
  const target = {
    ...targetConfig,
    userDataDir: assertPathInsideAllowedRoots(
      targetConfig.userDataDir,
      [
        runtimeRoots.repoRuntimeCacheRoot,
        runtimeRoots.externalCacheRoot,
        runtimeRoots.protectedBrowserRoot,
      ],
      "WebaiBridge isolated Chrome root",
    ),
  };
  const blockers = detectDefaultChromeRootConflicts(source.userDataDir);

  return {
    source,
    target,
    blockers,
  };
}

export function seedIsolatedChromeRoot(options = {}, env = process.env) {
  const plan = planIsolatedChromeRootSeed(options, env);

  if (plan.blockers.length > 0) {
    throw createSeedError(
      "source-root-busy",
      `WebaiBridge will not seed from the default Chrome root while it is still active.\n${plan.blockers.join("\n")}`,
    );
  }

  const { localStatePath, profilePath } = ensureReadableSource(
    plan.source.userDataDir,
    plan.source.profileDirectory,
  );
  ensureTargetReady(plan.target.userDataDir, options.reseed === true);

  const copied = copySeedInputs({
    sourceLocalStatePath: localStatePath,
    sourceProfilePath: profilePath,
    targetRoot: plan.target.userDataDir,
  });

  rewriteLocalState({
    targetLocalStatePath: copied.targetLocalStatePath,
    sourceProfileDirectory: plan.source.profileDirectory,
    displayName: plan.target.profileName,
  });

  const removedSingletons = removeSingletonFiles(plan.target.userDataDir);
  const sourceChatgptAudit = auditProviderPersistentArtifacts("chatgpt", {
    mode: WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
    existingProfileDir: plan.source.userDataDir,
    existingProfileDirectory: plan.source.profileDirectory,
  });
  const targetChatgptAudit = auditProviderPersistentArtifacts("chatgpt", {
    mode: WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
    existingProfileDir: plan.target.userDataDir,
    existingProfileDirectory: plan.target.profileDirectory,
  });
  const targetHasRecoverableChatgptSession =
    targetChatgptAudit.artifactStates["next-auth-session-token"] === "present";

  return {
    ok: true,
    sourceRoot: plan.source.userDataDir,
    sourceProfileDirectory: plan.source.profileDirectory,
    targetRoot: plan.target.userDataDir,
    targetProfileDirectory: plan.target.profileDirectory,
    targetDisplayName: plan.target.profileName,
    reseed: options.reseed === true,
    removedSingletons,
    chatgptAudit: {
      source: {
        cookieDbPath: sourceChatgptAudit.cookieDbPath,
        cookieDbAvailable: sourceChatgptAudit.available,
        hostCookieCount: sourceChatgptAudit.hostCookieCount,
        matchedCookieNames: sourceChatgptAudit.matchedCookieNames,
        artifactStates: sourceChatgptAudit.artifactStates,
      },
      target: {
        cookieDbPath: targetChatgptAudit.cookieDbPath,
        cookieDbAvailable: targetChatgptAudit.available,
        hostCookieCount: targetChatgptAudit.hostCookieCount,
        matchedCookieNames: targetChatgptAudit.matchedCookieNames,
        artifactStates: targetChatgptAudit.artifactStates,
        hasRecoverableSession: targetHasRecoverableChatgptSession,
      },
      summary: targetHasRecoverableChatgptSession
        ? "Seed completed and the target root now contains the persistent ChatGPT session cookie."
        : "Seed completed, but the target root still does not contain the persistent ChatGPT session cookie required for authenticated workspace recovery.",
    },
  };
}

async function main() {
  const options = parseArgs();
  const result = seedIsolatedChromeRoot(options, process.env);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `Seeded WebaiBridge isolated Chrome root: ${result.sourceProfileDirectory} -> ${result.targetProfileDirectory}`,
  );
  console.log(`Root: ${result.targetRoot}`);
}

try {
  await main();
} catch (error) {
  const args = parseArgs();
  const message = error instanceof Error ? error.message : `${error}`;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: error?.code,
            message,
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.error(message);
  }

  process.exitCode = 1;
}
