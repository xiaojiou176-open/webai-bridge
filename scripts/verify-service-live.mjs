import "./load-local-env.mjs";

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { runWebLoginLiveVerification } from "./verify-web-login-live.mjs";
import { captureBrowserDebugContext } from "./browser-debug-support.mjs";
import { isCiEnvironment } from "./runtime-policy.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const tempRootDir = join(repoRoot, ".runtime-cache", "temp");
const serviceEntrypoint = "apps/service/src/index.js";

const HIGH_STABILITY_CASES = [
  { provider: "chatgpt", model: "gpt-4o", requiresManagedBrowser: true },
  { provider: "gemini", model: "gemini-2.5-pro", requiresManagedBrowser: true },
  { provider: "claude", model: "claude-sonnet-4-6", requiresManagedBrowser: false },
];
const DEFAULT_SERVICE_INVOKE_TIMEOUT_MS = 90_000;

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

function buildProviderLiveRerunCommand(provider) {
  return `pnpm run bootstrap:web-login-browser -- --provider ${provider} && pnpm exec node scripts/verify-web-login-live.mjs --provider ${provider}`;
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
    process.exit(result.status ?? 1);
  }
}

function compileServiceLiveProof(compiledOutDir) {
  rmSync(compiledOutDir, {
    recursive: true,
    force: true,
  });

  run("pnpm", [
    "exec",
    "tsc",
    "-p",
    "apps/service/tsconfig.json",
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

function createEphemeralCompiledOutDir() {
  return join(
    tempRootDir,
    `service-live-proof-${process.pid}-${randomUUID()}`,
  );
}

function ensureManagedBrowser(provider, env = process.env) {
  return ensureManagedBrowserWithOptions(provider, env, { ensureOnly: true });
}

function ensureManagedBrowserWithOptions(
  provider,
  env = process.env,
  options = { ensureOnly: true },
) {
  const result = spawnSync(
    process.execPath,
    [
      join(scriptDir, "bootstrap-web-auth-browser.mjs"),
      "--provider",
      provider,
      ...(options.ensureOnly !== false ? ["--ensure-only"] : []),
      "--json",
    ],
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const details = result.stdout?.trim() || result.stderr?.trim();
    let parsedDetails;

    if (details) {
      try {
        parsedDetails = JSON.parse(details);
      } catch {
        parsedDetails = undefined;
      }
    }

    const error = new Error(
      `Managed browser bootstrap for ${provider} failed${details ? `: ${details}` : "."}`,
    );
    error.code = parsedDetails?.error?.code;
    error.bootstrapDetails = parsedDetails?.error;
    throw error;
  }
}

function parseBootstrapFailureDetails(error) {
  const message = error instanceof Error ? error.message : String(error);
  const rawDetails = message.includes(": ") ? message.slice(message.indexOf(": ") + 2) : "";

  if (!rawDetails) {
    return {
      message,
    };
  }

  try {
    const parsed = JSON.parse(rawDetails);

    return {
      message,
      code:
        parsed && typeof parsed === "object" && typeof parsed.error?.code === "string"
          ? parsed.error.code
          : undefined,
      detailMessage:
        parsed && typeof parsed === "object" && typeof parsed.error?.message === "string"
          ? parsed.error.message
          : undefined,
      parsed,
    };
  } catch {
    return {
      message,
      detailMessage: rawDetails,
    };
  }
}

function mapManagedBrowserBootstrapFailure(testCase, error) {
  const details = parseBootstrapFailureDetails(error);
  const explicitErrorCode =
    error && typeof error === "object" && "code" in error ? error.code : undefined;
  const explicitDetailMessage =
    error &&
    typeof error === "object" &&
    "bootstrapDetails" in error &&
    error.bootstrapDetails &&
    typeof error.bootstrapDetails === "object" &&
    "message" in error.bootstrapDetails &&
    typeof error.bootstrapDetails.message === "string"
      ? error.bootstrapDetails.message
      : undefined;
  const errorCode = explicitErrorCode ?? details.code;
  const errorMessage = explicitDetailMessage ?? details.detailMessage ?? details.message;

  if (
    errorCode === "existing-profile-locked" ||
    errorCode === "cdp-unreachable" ||
    errorCode === "endpoint-not-devtools"
  ) {
    return {
      status: "external-blocker",
      provider: testCase.provider,
      blocker: `${testCase.provider}-cdp-unavailable`,
      classification: "transport-instability",
      errorCode,
      diagnostic: errorMessage,
      rerunCommand: buildProviderLiveRerunCommand(testCase.provider),
      ...buildProviderDiagnosisArtifacts(testCase.provider),
    };
  }

  return undefined;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isServiceInvokeTimeoutError(error) {
  return error instanceof Error && error.name === "ServiceInvokeTimeoutError";
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;

  try {
    return await Promise.race([
      fetch(url, {
        ...init,
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          const timeoutError = new Error(
            `Service invoke timed out after ${timeoutMs}ms.`,
          );
          timeoutError.name = "ServiceInvokeTimeoutError";
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      const timeoutError = new Error(
        `Service invoke timed out after ${timeoutMs}ms.`,
      );
      timeoutError.name = "ServiceInvokeTimeoutError";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createExpectationToken(provider) {
  return `${provider.toUpperCase()}_SERVICE_${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

export function normalizeText(value) {
  return `${value ?? ""}`.replace(/[\s\u200B-\u200D\uFEFF]+/g, "").toLowerCase();
}

export function mapServiceInvokeFailure(testCase, service, response, body) {
  const errorMessage = `${body?.error?.message ?? ""}`;
  const claudeContextText = [
    body?.error?.message,
    body?.error?.suggestedAction,
    body?.auth?.transportHint,
    body?.auth?.session?.requiredUserAction,
    body?.auth?.session?.degradedReason,
    body?.auth?.reAuth?.reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const lowerMessage = errorMessage.toLowerCase();
  const errorType = `${body?.error?.type ?? ""}`.toLowerCase();
  const isClaudeAccountActionRequiredMessage =
    (
      claudeContextText.includes("permission_error") ||
      claudeContextText.includes("subscription")
    ) &&
    (
      claudeContextText.includes("subscription_past_due") ||
      claudeContextText.includes("past due") ||
      claudeContextText.includes("overdue invoice") ||
      claudeContextText.includes("overdue subscription payment") ||
      claudeContextText.includes("restore access")
    );

  if (response.status === 409 && errorType === "missing-credential") {
    return {
      status: "external-blocker",
      provider: testCase.provider,
      baseUrl: service.baseUrl,
      blocker: "missing-web-session-material",
      classification: "session-material-missing",
      responseStatus: response.status,
      errorMessage,
      rerunCommand: buildProviderLiveRerunCommand(testCase.provider),
      ...buildProviderDiagnosisArtifacts(testCase.provider),
      body,
    };
  }

  if (
    testCase.provider === "chatgpt" &&
    (
      lowerMessage.includes("logged-out landing page") ||
      lowerMessage.includes("login/signup controls") ||
      lowerMessage.includes("browser workspace is not ready")
    )
  ) {
    return {
      status: "external-blocker",
      provider: testCase.provider,
      baseUrl: service.baseUrl,
      blocker: "chatgpt-browser-session-incomplete",
      classification: "session-incomplete",
      responseStatus: response.status,
      errorMessage,
      ...buildProviderDiagnosisArtifacts(testCase.provider),
      body,
    };
  }

  if (
    testCase.provider === "chatgpt" &&
    lowerMessage.includes("connectovercdp")
  ) {
    return {
      status: "external-blocker",
      provider: testCase.provider,
      baseUrl: service.baseUrl,
      blocker: "chatgpt-cdp-unavailable",
      classification: "transport-instability",
      responseStatus: response.status,
      errorMessage,
      ...buildProviderDiagnosisArtifacts(testCase.provider),
      body,
    };
  }

  if (
    testCase.provider === "claude" &&
    isClaudeAccountActionRequiredMessage &&
    (
      errorType === "provider-unavailable" ||
      errorType === "user-action-required"
    )
  ) {
    return {
      status: "external-blocker",
      provider: testCase.provider,
      baseUrl: service.baseUrl,
      blocker: "claude-account-action-required",
      classification: "account-action-required",
      responseStatus: response.status,
      errorMessage,
      rerunCommand: buildProviderLiveRerunCommand(testCase.provider),
      ...buildProviderDiagnosisArtifacts(testCase.provider),
      body,
    };
  }

  return undefined;
}

export function mapServicePreflightResult(
  testCase,
  service,
  response,
  body,
  providerResult,
) {
  if (!providerResult || providerResult.status !== "external-blocker") {
    return undefined;
  }

  return {
    status: "external-blocker",
    provider: testCase.provider,
    baseUrl: service.baseUrl,
    blocker: providerResult.blocker,
    classification: providerResult.classification,
    responseStatus: response.status,
    errorMessage: `${body?.error?.message ?? ""}`,
    rerunCommand: providerResult.rerunCommand,
    diagnoseCommand:
      providerResult.diagnoseCommand ?? buildProviderDiagnoseCommand(testCase.provider),
    supportBundlePath:
      providerResult.supportBundlePath ??
      buildProviderSupportBundlePath(testCase.provider),
    diagnostic: "diagnostic" in providerResult ? providerResult.diagnostic : undefined,
    summary: providerResult.summary,
    liveVerification: providerResult,
    body,
  };
}

async function refineManagedBrowserServiceFailure(
  testCase,
  service,
  response,
  body,
  env,
) {
  if (!testCase.requiresManagedBrowser) {
    return undefined;
  }

  const [providerResult] = await runWebLoginLiveVerification({
    env,
    providers: [testCase.provider],
  });

  return mapServicePreflightResult(
    testCase,
    service,
    response,
    body,
    providerResult,
  );
}

export function shouldRetryWithManagedBrowserBootstrap(testCase, body) {
  if (!testCase.requiresManagedBrowser) {
    return false;
  }

  const errorMessage = `${body?.error?.message ?? ""}`.toLowerCase();

  return (
    errorMessage.includes("target page, context or browser has been closed") ||
    errorMessage.includes("execution context was destroyed") ||
    errorMessage.includes("connectovercdp") ||
    errorMessage.includes("econnrefused") ||
    errorMessage.includes("eaddrnotavail")
  );
}

async function enrichServiceResultWithDebug(result, env) {
  if (
    !result ||
    typeof result !== "object" ||
    result.status === "success" ||
    typeof result.provider !== "string"
  ) {
    return result;
  }

  const debug = await captureBrowserDebugContext(result.provider, result, env);
  return debug ? { ...result, debug } : result;
}

export async function runServiceLiveVerification(options = {}) {
  const compiledOutDir = options.outDir ?? createEphemeralCompiledOutDir();
  const ownsCompiledOutDir = !options.outDir;
  const env = options.env ?? process.env;
  const serviceInvokeTimeoutMs =
    options.serviceInvokeTimeoutMs ?? DEFAULT_SERVICE_INVOKE_TIMEOUT_MS;

  try {
    for (const testCase of HIGH_STABILITY_CASES) {
      if (!testCase.requiresManagedBrowser) {
        continue;
      }

      try {
        ensureManagedBrowser(testCase.provider, env);
      } catch (error) {
        const refinedFailure = mapManagedBrowserBootstrapFailure(testCase, error);

        if (refinedFailure) {
          return enrichServiceResultWithDebug(refinedFailure, env);
        }

        throw error;
      }
    }

    compileServiceLiveProof(compiledOutDir);

    const moduleUrl = new URL(pathToFileURL(join(compiledOutDir, serviceEntrypoint)).href);
    moduleUrl.searchParams.set("ts", `${Date.now()}`);
    const loaded = await import(moduleUrl.href);

    if (typeof loaded.startWebaiBridgeService !== "function") {
      throw new Error("Missing startWebaiBridgeService export in compiled service module.");
    }

    const service = await loaded.startWebaiBridgeService({
      serviceName: "webai-bridge-service-live-proof",
    });

    const results = [];
    try {
      for (const testCase of HIGH_STABILITY_CASES) {
        const expectedToken = createExpectationToken(testCase.provider);
        const invokeRequest = {
          provider: testCase.provider,
          model: testCase.model,
          input: `Reply with exactly ${expectedToken} and nothing else.`,
          lane: "web",
        };
        const invokeService = async () => {
          return fetchWithTimeout(
            `${service.baseUrl}/v1/runtime/invoke`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify(invokeRequest),
            },
            serviceInvokeTimeoutMs,
          );
        };
        let response;

        try {
          response = await invokeService();
        } catch (error) {
          const diagnostic = error instanceof Error ? error.message : String(error);
          const refinedFailure = await refineManagedBrowserServiceFailure(
            testCase,
            service,
            {
              status: 504,
            },
            {
              error: {
                message: diagnostic,
              },
            },
            env,
          );

          if (refinedFailure) {
            return enrichServiceResultWithDebug(refinedFailure, env);
          }

          return enrichServiceResultWithDebug({
            status: "failure",
            provider: testCase.provider,
            baseUrl: service.baseUrl,
            reason: isServiceInvokeTimeoutError(error)
              ? "service-invoke-timeout"
              : "service-invoke-fetch-failed",
            classification: isServiceInvokeTimeoutError(error)
              ? "transport-instability"
              : undefined,
            diagnostic,
            errorCode:
              error && typeof error === "object" && "cause" in error
                ? (error.cause?.code ?? undefined)
                : undefined,
          }, env);
        }

        let body = await response.json();

        if (
          response.status !== 200 &&
          shouldRetryWithManagedBrowserBootstrap(testCase, body)
        ) {
          ensureManagedBrowserWithOptions(testCase.provider, env, {
            ensureOnly: false,
          });
          await wait(1_500);
          response = await invokeService();
          body = await response.json();
        }

        if (response.status !== 200) {
          return enrichServiceResultWithDebug((
            mapServiceInvokeFailure(testCase, service, response, body) ??
            (await refineManagedBrowserServiceFailure(
              testCase,
              service,
              response,
              body,
              env,
            )) ?? {
            status: "failure",
            provider: testCase.provider,
            baseUrl: service.baseUrl,
            reason: "service-invoke-failed",
            responseStatus: response.status,
            body,
            }
          ), env);
        }

        const outputText = body.outputText ?? "";

        if (normalizeText(outputText) !== normalizeText(expectedToken)) {
          return enrichServiceResultWithDebug({
            status: "failure",
            provider: testCase.provider,
            baseUrl: service.baseUrl,
            reason: "service-token-mismatch",
            expectedToken,
            outputText,
            body,
          }, env);
        }

        results.push({
          provider: testCase.provider,
          model: testCase.model,
          expectedToken,
          outputText,
          providerMessageId: body.providerMessageId,
        });
      }

      return {
        status: "success",
        baseUrl: service.baseUrl,
        providers: results,
      };
    } finally {
      await service.close();
    }
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
      "WebaiBridge verify:service-live is credentialed-workstation only and must not run inside CI.",
    );
  }

  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  const result = await runServiceLiveVerification();
  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "success") {
    return;
  }

  process.exitCode = result.status === "external-blocker" ? 2 : 1;
}

const invokedPath = process.argv[1];

if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
