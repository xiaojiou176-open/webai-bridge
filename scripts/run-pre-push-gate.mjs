import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROCESS_DRAIN_TIMEOUT_MS = 15_000;
const PROCESS_DRAIN_POLL_MS = 500;
const sanitizedEnv = { ...process.env };

for (const name of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
]) {
  delete sanitizedEnv[name];
}

export function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: sanitizedEnv,
    stdio: ["ignore", "inherit", "inherit"],
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function listRepoOwnedVitestProcesses() {
  const result = spawnSync(
    "pgrep",
    ["-af", "pnpm exec vitest"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    return [];
  }

  return `${result.stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(repoRoot));
}

export async function waitForVitestDrain(options = {}) {
  const timeoutMs = options.timeoutMs ?? PROCESS_DRAIN_TIMEOUT_MS;
  const pollMs = options.pollMs ?? PROCESS_DRAIN_POLL_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (listRepoOwnedVitestProcesses().length === 0) {
      return;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, pollMs);
    });
  }

  const lingering = listRepoOwnedVitestProcesses();
  if (lingering.length > 0) {
    throw new Error(
      `WebaiBridge pre-push gate observed lingering repo-owned Vitest processes before coverage: ${lingering.join(" | ")}`,
    );
  }
}

export async function runPrePushGate() {
  run("pnpm", ["typecheck"]);
  run("pnpm", ["run", "test:coverage"]);
  run("pnpm", ["test"]);
  run("pnpm", ["build"]);
  await waitForVitestDrain();
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await runPrePushGate();
}
