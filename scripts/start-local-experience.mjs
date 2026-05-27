import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, "..");

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_SERVICE_PORT = 4010;
export const DEFAULT_DOCS_PORT = 4185;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

function toPositivePort(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

export function resolveServicePort(env = process.env) {
  return toPositivePort(env.WEBAI_BRIDGE_SERVICE_PORT, DEFAULT_SERVICE_PORT);
}

export function resolveDocsPort(env = process.env) {
  return toPositivePort(env.WEBAI_BRIDGE_DOCS_PORT, DEFAULT_DOCS_PORT);
}

export function buildExperienceUrls({
  host = DEFAULT_HOST,
  servicePort = DEFAULT_SERVICE_PORT,
  docsPort = DEFAULT_DOCS_PORT,
} = {}) {
  const serviceBaseUrl = `http://${host}:${servicePort}`;
  const docsBaseUrl = `http://${host}:${docsPort}`;

  return {
    serviceBaseUrl,
    authPortalUrl: `${serviceBaseUrl}/v1/runtime/auth-portal`,
    runtimeDoctorUrl: `${serviceBaseUrl}/v1/runtime/doctor`,
    runtimePlanUrl: `${serviceBaseUrl}/v1/runtime/plan`,
    chatgptWorkbenchUrl: `${serviceBaseUrl}/v1/runtime/providers/chatgpt/debug/workbench`,
    docsFrontDoorUrl: `${docsBaseUrl}/`,
    runtimeControlLedgerUrl: `${docsBaseUrl}/runtime-control-ledger.md`,
  };
}

export function formatReadyExperienceLines(urls) {
  return [
    `  - Runtime WebUI: ${urls.authPortalUrl}`,
    `  - Runtime doctor: ${urls.runtimeDoctorUrl}`,
    `  - Runtime plan: ${urls.runtimePlanUrl}`,
    `  - ChatGPT workbench: ${urls.chatgptWorkbenchUrl}`,
    `  - Docs front door: ${urls.docsFrontDoorUrl}`,
    `  - Doctor-first control ledger: ${urls.runtimeControlLedgerUrl}`,
    "  - Press Ctrl+C to stop both local servers.",
  ];
}

export function resolveStaticFilePath(rootDir, requestPath) {
  const rawPath = `${requestPath || "/"}`.split("?")[0]?.split("#")[0] || "/";
  const decodedPath = decodeURIComponent(rawPath);

  if (decodedPath.split("/").includes("..")) {
    return null;
  }

  const buildDocsAliasPath = (pathValue) => {
    if (pathValue === "/") {
      return ["/docs/index.html"];
    }

    const trimmedPath = pathValue.replace(/\/+$/, "");
    const segments = trimmedPath.split("/").filter(Boolean);

    if (segments.length === 0) {
      return ["/docs/index.html"];
    }

    if (segments[0] === "docs") {
      return [pathValue];
    }

    return [
      `/docs${trimmedPath}`,
      `/${segments[0]}/docs/${segments.slice(1).join("/")}`,
    ];
  };

  const candidatePaths =
    decodedPath === "/"
      ? ["/docs/index.html"]
      : decodedPath.startsWith("/docs/")
        ? [decodedPath]
        : Array.from(
            new Set([
              ...buildDocsAliasPath(decodedPath),
              decodedPath,
            ]),
          );

  for (const candidatePath of candidatePaths) {
    const absolutePath = resolve(rootDir, `.${candidatePath}`);

    if (!absolutePath.startsWith(`${rootDir}${sep}`)) {
      continue;
    }

    if (!existsSync(absolutePath)) {
      continue;
    }

    if (statSync(absolutePath).isDirectory()) {
      const indexPath = resolve(absolutePath, "index.html");
      if (existsSync(indexPath)) {
        return indexPath;
      }
      continue;
    }

    return absolutePath;
  }

  return null;
}

export function getContentType(filePath) {
  return (
    MIME_TYPES.get(extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  );
}

export async function startDocsStaticServer({
  rootDir = repoRoot,
  host = DEFAULT_HOST,
  port = DEFAULT_DOCS_PORT,
} = {}) {
  const server = createServer((request, response) => {
    const filePath = resolveStaticFilePath(rootDir, request.url);

    if (!filePath) {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Not found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("content-type", getContentType(filePath));
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => {
      server.removeListener("error", rejectPromise);
      resolvePromise();
    });
  });

  return server;
}

async function waitForService(url, retries = 60, delayMs = 500) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local runtime finishes booting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
  }

  throw new Error(
    `Local runtime did not become ready at ${url} within ${Math.round(
      (retries * delayMs) / 1000,
    )} seconds.`,
  );
}

export async function main({
  env = process.env,
  rootDir = repoRoot,
  host = DEFAULT_HOST,
  spawnImpl = spawn,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const servicePort = resolveServicePort(env);
  const docsPort = resolveDocsPort(env);
  const urls = buildExperienceUrls({ host, servicePort, docsPort });

  const docsServer = await startDocsStaticServer({
    rootDir,
    host,
    port: docsPort,
  });

  const serviceProcess = spawnImpl(
    "pnpm",
    ["--filter", "@webai-bridge/app-service", "start"],
    {
      cwd: rootDir,
      env: {
        ...env,
        WEBAI_BRIDGE_SERVICE_PORT: `${servicePort}`,
      },
      stdio: "inherit",
    },
  );

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    if (!serviceProcess.killed) {
      serviceProcess.kill("SIGTERM");
    }

    await new Promise((resolvePromise) => docsServer.close(() => resolvePromise()));
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  stdout.write(
    `[local-experience] Docs front door is serving at ${urls.docsFrontDoorUrl}\n`,
  );
  stdout.write(
    `[local-experience] Waiting for the local runtime to become ready at ${urls.serviceBaseUrl}/v1/runtime/health ...\n`,
  );

  try {
    await waitForService(`${urls.serviceBaseUrl}/v1/runtime/health`);
  } catch (error) {
    await cleanup();
    throw error;
  }

  stdout.write("[local-experience] Local experience is ready:\n");
  for (const line of formatReadyExperienceLines(urls)) {
    stdout.write(`${line}\n`);
  }

  await new Promise((resolvePromise, rejectPromise) => {
    serviceProcess.once("exit", async (code, signal) => {
      await cleanup();

      if (signal === "SIGTERM" || signal === "SIGINT" || code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `Local runtime exited unexpectedly (code=${code ?? "null"}, signal=${
            signal ?? "null"
          }).`,
        ),
      );
    });

    serviceProcess.once("error", async (error) => {
      await cleanup();
      rejectPromise(error);
    });
  });
}

const isEntryScript =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntryScript) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : `${error}`;
    process.stderr.write(`[local-experience] ${message}\n`);
    process.exit(1);
  });
}
