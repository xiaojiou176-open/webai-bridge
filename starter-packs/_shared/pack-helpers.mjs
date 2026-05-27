import "../../scripts/load-local-env.mjs";
import {
  buildRuntimeRequestUrl,
  encodeRuntimePathSegment,
  formatRuntimeHelpUrl,
  resolveRuntimeBaseUrlFromEnv,
} from "../../scripts/runtime-request-url.mjs";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const LOCAL_SERVICE_START_COMMAND = "pnpm run start:service-local";

export function resolveRuntimeBaseUrl(env = process.env) {
  return resolveRuntimeBaseUrlFromEnv(env);
}

export { encodeRuntimePathSegment };

function resolveRuntimeRequestContext(path, env = process.env) {
  const baseUrl = resolveRuntimeBaseUrlFromEnv(env);
  return {
    baseUrl,
    requestUrl: buildRuntimeRequestUrl(baseUrl, path),
  };
}

export function readPackJson(moduleUrl, relativePath) {
  const packDir = dirname(fileURLToPath(moduleUrl));
  return JSON.parse(readFileSync(resolve(packDir, relativePath), "utf8"));
}

export function readRepoJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

export function readRepoText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

export function normalizeInvokeRequest(request) {
  const nextRequest = {
    ...request,
  };
  const rawModel = typeof nextRequest.model === "string" ? nextRequest.model.trim() : undefined;

  if (rawModel?.includes("/")) {
    const [providerHint, ...rest] = rawModel.split("/");
    const normalizedModel = rest.join("/").trim();

    if (!nextRequest.provider && providerHint && normalizedModel) {
      nextRequest.provider = providerHint;
      nextRequest.model = normalizedModel;
    } else if (
      typeof nextRequest.provider === "string" &&
      nextRequest.provider.trim() === providerHint &&
      normalizedModel
    ) {
      nextRequest.model = normalizedModel;
    }
  }

  if (
    typeof nextRequest.input !== "string" &&
    Array.isArray(nextRequest.messages)
  ) {
    const userMessage = [...nextRequest.messages]
      .reverse()
      .find((entry) => entry?.role === "user" && typeof entry?.content === "string");

    if (userMessage?.content) {
      nextRequest.input = userMessage.content;
    }
  }

  return nextRequest;
}

function buildRuntimeUnavailableError(baseUrl, path, error) {
  const help = [
    `WebaiBridge runtime is not reachable at ${formatRuntimeHelpUrl(baseUrl, path)}.`,
    `Start the local runtime first: ${LOCAL_SERVICE_START_COMMAND}`,
    "Or point the starter pack at another runtime with WEBAI_BRIDGE_RUNTIME_BASE_URL=http://host:port",
  ].join(" ");
  const wrapped = new Error(help);
  Object.assign(wrapped, {
    cause: error,
    baseUrl,
    path,
    localServiceStartCommand: LOCAL_SERVICE_START_COMMAND,
  });
  return wrapped;
}

export async function requestJsonAtRuntimePath(path, init = {}, env = process.env) {
  const { baseUrl, requestUrl } = resolveRuntimeRequestContext(path, env);
  let response;

  try {
    response = await fetch(requestUrl, init);
  } catch (error) {
    throw buildRuntimeUnavailableError(baseUrl, path, error);
  }

  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(
      `Starter-pack request failed with HTTP ${response.status} at ${path}.`,
    );
    Object.assign(error, {
      status: response.status,
      payload,
    });
    throw error;
  }

  return payload;
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
