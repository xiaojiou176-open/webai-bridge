import "./load-local-env.mjs";

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isCiEnvironment } from "./runtime-policy.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const tempRootDir = join(repoRoot, '.runtime-cache', 'temp');
const liveProofEntrypoint = 'packages/providers/byok/gemini/src/live-proof.js';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function compileGeminiLiveProof(compiledOutDir) {
  rmSync(compiledOutDir, {
    recursive: true,
    force: true,
  });

  run('pnpm', [
    'exec',
    'tsc',
    '-p',
    'packages/providers/byok/gemini/tsconfig.json',
    '--pretty',
    'false',
    '--noEmit',
    'false',
    '--outDir',
    compiledOutDir,
    '--declaration',
    'false',
    '--declarationMap',
    'false',
    '--sourceMap',
    'false',
  ]);
}

function createEphemeralCompiledOutDir() {
  return join(
    tempRootDir,
    `gemini-live-proof-${process.pid}-${randomUUID()}`,
  );
}

function normalizeGeminiLiveVerificationResult(result) {
  const rawSummary = `${result?.rawSummary ?? ""}`.toLowerCase();
  const hasUsableCredential = Array.isArray(result?.envStatus)
    ? result.envStatus.some((entry) => entry?.present)
    : false;

  if (
    result?.status === "failure" &&
    result?.reason === "invoke-failed" &&
    hasUsableCredential &&
    rawSummary.includes("fetch failed")
  ) {
    return {
      status: "external-blocker",
      provider: "gemini",
      blocker: "gemini-provider-unavailable",
      classification: "provider-unavailable",
      envStatus: result.envStatus,
      envNameUsed: result.envNameUsed,
      requestUrl: result.requestUrl,
      diagnostics: result.diagnostics,
      rawSummary: result.rawSummary,
      rerunCommand: "pnpm exec node scripts/verify-gemini-live.mjs",
      summary:
        "Gemini API access is configured on this workstation, but the provider request is currently failing before a response payload is returned. Treat this as a provider/network-side blocker and rerun later.",
    };
  }

  return result;
}

export async function runGeminiLiveVerification(options = {}) {
  const compiledOutDir = options.outDir ?? createEphemeralCompiledOutDir();
  const ownsCompiledOutDir = !options.outDir;
  const env = options.env ?? process.env;

  try {
    compileGeminiLiveProof(compiledOutDir);

    const moduleUrl = new URL(pathToFileURL(join(compiledOutDir, liveProofEntrypoint)).href);
    moduleUrl.searchParams.set('ts', `${Date.now()}`);
    const loaded = await import(moduleUrl.href);

    if (typeof loaded.runGeminiLiveProof !== 'function') {
      throw new Error('Missing runGeminiLiveProof export in compiled Gemini live-proof module.');
    }

    return normalizeGeminiLiveVerificationResult(
      await loaded.runGeminiLiveProof(env),
    );
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
      "WebaiBridge verify:gemini-live is credentialed-workstation only and must not run inside CI.",
    );
  }

  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  const result = await runGeminiLiveVerification();
  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'success') {
    return;
  }

  process.exitCode = result.status === 'external-blocker' ? 2 : 1;
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
