import { isIP } from "node:net";

const DEFAULT_RUNTIME_PORT = "4010";
const RUNTIME_PATH_ROOT_URL = "http://webai-bridge.local";

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map((segment) => Number.parseInt(segment, 10));

  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }

  if (octets[0] === 10 || octets[0] === 127) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

function isPrivateIpv6(hostname) {
  const lower = hostname.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd");
}

function isAllowedRuntimeHostname(hostname) {
  const lower = hostname.trim().toLowerCase();

  if (!lower) {
    return false;
  }

  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return true;
  }

  const ipFamily = isIP(lower);
  if (ipFamily === 4) {
    return isPrivateIpv4(lower);
  }

  if (ipFamily === 6) {
    return isPrivateIpv6(lower);
  }

  return !lower.includes(".");
}

export function normalizeRuntimeBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `WebaiBridge runtime base URL must use http or https. Received: ${parsed.protocol}`,
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "WebaiBridge runtime base URL must not include credentials, query parameters, or fragments.",
    );
  }

  if (!isAllowedRuntimeHostname(parsed.hostname)) {
    throw new Error(
      `WebaiBridge runtime base URL must point at a loopback, private-network, or local-development host. Refusing ${parsed.hostname}.`,
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
  return parsed;
}

export function encodeRuntimePathSegment(segment, label = "WebaiBridge runtime path segment") {
  if (typeof segment !== "string" || !segment.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  const normalized = segment.trim();

  if (!/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new Error(
      `${label} must only use letters, numbers, dots, underscores, colons, or hyphens. Refusing: ${segment}`,
    );
  }

  return encodeURIComponent(normalized);
}

function normalizeRuntimeRequestPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`WebaiBridge runtime request path must start with /. Received: ${path}`);
  }

  if (path.startsWith("//")) {
    throw new Error(
      `WebaiBridge runtime request path must stay on the local runtime origin. Refusing host-style path: ${path}`,
    );
  }

  if (path.includes("\\") || path.includes("?") || path.includes("#")) {
    throw new Error(
      `WebaiBridge runtime request path must not include backslashes, query parameters, or fragments. Received: ${path}`,
    );
  }

  const decodedRawSegments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => decodePathSegment(segment));

  if (decodedRawSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(
      `WebaiBridge runtime request path must not contain path traversal segments. Received: ${path}`,
    );
  }

  const parsed = new URL(path, RUNTIME_PATH_ROOT_URL);
  if (parsed.origin !== RUNTIME_PATH_ROOT_URL) {
    throw new Error(
      `WebaiBridge runtime request path must stay on the local runtime origin. Refusing: ${path}`,
    );
  }

  return parsed.pathname;
}

export function buildRuntimeRequestUrl(baseUrl, path) {
  const normalizedBaseUrl = normalizeRuntimeBaseUrl(baseUrl);
  const normalizedPath = normalizeRuntimeRequestPath(path);
  const requestUrl = new URL(normalizedPath, normalizedBaseUrl);

  if (requestUrl.origin !== normalizedBaseUrl.origin) {
    throw new Error(
      `WebaiBridge runtime request path must stay on the local runtime origin. Refusing: ${path}`,
    );
  }

  return requestUrl.toString();
}

export function resolveRuntimeBaseUrlFromEnv(
  env = process.env,
  defaultPort = DEFAULT_RUNTIME_PORT,
) {
  const explicit = env.WEBAI_BRIDGE_RUNTIME_BASE_URL?.trim();

  if (explicit) {
    return normalizeRuntimeBaseUrl(explicit).toString().replace(/\/$/u, "");
  }

  const port = env.WEBAI_BRIDGE_SERVICE_PORT?.trim() || defaultPort;
  return normalizeRuntimeBaseUrl(`http://127.0.0.1:${port}`)
    .toString()
    .replace(/\/$/u, "");
}

export function formatRuntimeHelpUrl(baseUrl, path) {
  try {
    return buildRuntimeRequestUrl(baseUrl, path).replace(/\/$/u, "");
  } catch {
    return `${baseUrl}${path}`;
  }
}
