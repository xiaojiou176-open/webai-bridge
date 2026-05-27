import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const EXPLICIT_BROWSER_ENV_KEYS = [
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
  "WEBAI_BRIDGE_TEST_BROWSER_PATH",
] as const;

function commandExists(command: string): string | undefined {
  try {
    const locator = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(locator, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
  } catch {
    return undefined;
  }
}

export function resolveChromiumExecutablePath(env = process.env): string {
  for (const key of EXPLICIT_BROWSER_ENV_KEYS) {
    const candidate = env[key]?.trim();

    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  const platformPaths =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "win32"
        ? [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Chromium\\Application\\chrome.exe",
          ]
        : [
            "/opt/google/chrome/google-chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];

  for (const candidate of platformPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const commands =
    process.platform === "win32"
      ? ["chrome", "chromium"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  for (const command of commands) {
    const candidate = commandExists(command);

    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to find a local Chrome/Chromium executable. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE or WEBAI_BRIDGE_TEST_BROWSER_PATH.",
  );
}

export async function launchChromiumForUiTest() {
  const { chromium } = await import("playwright-core");

  return chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutablePath(),
  });
}
