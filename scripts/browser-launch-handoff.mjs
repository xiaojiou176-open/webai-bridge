import { spawnSync } from "node:child_process";

function createLaunchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveDarwinAppBundlePath(browserPath) {
  const marker = ".app/Contents/MacOS/";
  const markerIndex = browserPath.indexOf(marker);

  if (markerIndex < 0) {
    return undefined;
  }

  return browserPath.slice(0, markerIndex + 4);
}

function buildWindowsStartProcessCommand(browserPath, args) {
  const quotedBrowserPath = JSON.stringify(browserPath);
  const quotedArgs = args.map((value) => JSON.stringify(String(value))).join(", ");
  const command =
    quotedArgs.length > 0
      ? `Start-Process -FilePath ${quotedBrowserPath} -ArgumentList @(${quotedArgs})`
      : `Start-Process -FilePath ${quotedBrowserPath}`;

  return {
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ],
    launchMode: "windows-start-process",
    windowsHide: true,
  };
}

function buildBrowserLaunchSpec(browserPath, args, platform = process.platform) {
  if (platform === "darwin") {
    const appBundlePath = resolveDarwinAppBundlePath(browserPath);

    if (!appBundlePath) {
      throw createLaunchError(
        "unsupported-browser-launch-target",
        "WebaiBridge safe browser bootstrap on macOS requires a Chrome or Chromium app bundle path. Point WEBAI_BRIDGE_WEB_AUTH_BROWSER_PATH at a .app binary, or use Attach Existing Browser Session instead.",
      );
    }

    return {
      command: "/usr/bin/open",
      args: [
        "-n",
        "-a",
        appBundlePath,
        "--args",
        ...args,
      ],
      launchMode: "darwin-open-app",
      windowsHide: false,
    };
  }

  if (platform === "win32") {
    return buildWindowsStartProcessCommand(browserPath, args);
  }

  throw createLaunchError(
    "unsupported-browser-launch-host",
    "WebaiBridge safe browser bootstrap currently cannot prove a detached-free launch handoff on this host. Start the browser yourself and use Attach Existing Browser Session instead.",
  );
}

export function launchBrowserViaOsHandoff(
  browserPath,
  args,
  {
    platform = process.platform,
    spawnSyncImpl = spawnSync,
  } = {},
) {
  const spec = buildBrowserLaunchSpec(browserPath, args, platform);
  const result = spawnSyncImpl(spec.command, spec.args, {
    stdio: "ignore",
    windowsHide: spec.windowsHide,
  });

  if (result.error) {
    throw createLaunchError(
      "browser-launch-failed",
      `WebaiBridge could not hand off the browser launch to the host launcher: ${result.error.message}`,
    );
  }

  if ((result.status ?? 0) !== 0) {
    throw createLaunchError(
      "browser-launch-failed",
      `WebaiBridge browser launch handoff exited with status ${result.status ?? "unknown"}.`,
    );
  }

  return {
    launchMode: spec.launchMode,
  };
}

export async function openUrlInExistingBrowserViaCdp(
  cdpUrl,
  targetUrl,
  {
    fetchImpl = fetch,
  } = {},
) {
  let normalizedTargetUrl;

  try {
    normalizedTargetUrl = new URL(targetUrl).toString();
  } catch {
    normalizedTargetUrl = undefined;
  }

  if (normalizedTargetUrl) {
    try {
      const listResponse = await fetchImpl(new URL("/json/list", cdpUrl), {
        method: "GET",
        signal: AbortSignal.timeout(3_000),
      });

      if (listResponse.ok) {
        const targets = await listResponse.json().catch(() => []);
        const normalizedTarget = new URL(normalizedTargetUrl);
        const match = Array.isArray(targets)
          ? targets.find((target) => {
              if (target?.type !== "page" || typeof target.id !== "string" || typeof target.url !== "string") {
                return false;
              }

              try {
                const candidate = new URL(target.url);
                const normalizedTargetPath = normalizedTarget.pathname.replace(/\/+$/, "") || "/";
                const normalizedCandidatePath = candidate.pathname.replace(/\/+$/, "") || "/";

                return (
                  candidate.origin === normalizedTarget.origin &&
                  (
                    normalizedTargetPath === "/" ||
                    normalizedCandidatePath === normalizedTargetPath ||
                    normalizedCandidatePath.startsWith(`${normalizedTargetPath}/`)
                  )
                );
              } catch {
                return false;
              }
            })
          : undefined;

        if (match) {
          const activateResponse = await fetchImpl(
            new URL(`/json/activate/${encodeURIComponent(match.id)}`, cdpUrl),
            {
              method: "GET",
              signal: AbortSignal.timeout(3_000),
            },
          ).catch(() => undefined);

          if (activateResponse?.ok) {
            return true;
          }
        }
      }
    } catch {
      // Fall through to the new-tab path. Reusing an existing page is a best-effort optimization.
    }
  }

  const endpoint = `${new URL("/json/new", cdpUrl).toString()}?${encodeURIComponent(targetUrl)}`;

  for (const method of ["PUT", "GET"]) {
    try {
      const response = await fetchImpl(endpoint, {
        method,
        signal: AbortSignal.timeout(3_000),
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore and try the next request shape so we can stay fail-closed.
    }
  }

  return false;
}
