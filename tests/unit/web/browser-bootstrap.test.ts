import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ALLOWED_PROFILE_ROOT = join(
  homedir(),
  ".cache",
  "webai-bridge",
  "tests",
  "chatgpt-profile",
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("web auth browser bootstrap", () => {
  it("rejects non-absolute or non-Chrome browser overrides before launch", async () => {
    const { ensureIsolatedChromeRoot } = await import(
      "../../../scripts/bootstrap-web-auth-browser.mjs"
    );

    await expect(
      ensureIsolatedChromeRoot({
        provider: "chatgpt",
        loginUrl: "https://chatgpt.com",
        env: {},
        existingProfileDir: ALLOWED_PROFILE_ROOT,
        browserPath: "./chrome",
        cdpUrl: "http://127.0.0.1:9338",
      }),
    ).rejects.toMatchObject({
      code: "browser-path-invalid",
    });
  });

  it("rejects profile roots outside the allowed browser storage roots", async () => {
    const { ensureIsolatedChromeRoot } = await import(
      "../../../scripts/bootstrap-web-auth-browser.mjs"
    );

    await expect(
      ensureIsolatedChromeRoot({
        provider: "chatgpt",
        loginUrl: "https://chatgpt.com",
        env: {},
        existingProfileDir: "/etc",
        browserPath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        cdpUrl: "http://127.0.0.1:9338",
      }),
    ).rejects.toThrow(/must stay inside one of/i);
  });

  it("opens the provider page when attaching to an existing isolated chrome root", async () => {
    const openUrlInExistingBrowserViaCdp = vi.fn(async () => true);

    vi.doMock("../../../scripts/browser-launch-handoff.mjs", () => ({
      launchBrowserViaOsHandoff: vi.fn(),
      openUrlInExistingBrowserViaCdp,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Browser: "Chrome/146.0.0.0",
          webSocketDebuggerUrl: "ws://127.0.0.1:9338/devtools/browser/test",
        }),
      })) as typeof fetch,
    );

    const { ensureIsolatedChromeRoot } = await import(
      "../../../scripts/bootstrap-web-auth-browser.mjs"
    );

    const result = await ensureIsolatedChromeRoot({
      provider: "chatgpt",
      loginUrl: "https://chatgpt.com",
      env: {},
      existingProfileDir: ALLOWED_PROFILE_ROOT,
      profileName: "webai-bridge",
      browserPath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      cdpUrl: "http://127.0.0.1:9338",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "attached",
        mode: "isolated-chrome-root",
        loginOpened: true,
        cdpUrl: "http://127.0.0.1:9338",
      }),
    );
    expect(openUrlInExistingBrowserViaCdp).toHaveBeenCalledWith(
      "http://127.0.0.1:9338",
      "https://chatgpt.com",
    );
  });

  it("normalizes the legacy existing-profile alias into isolated chrome root flags", async () => {
    const existsSync = vi.fn((path: string) =>
      path.endsWith("scripts/bootstrap-web-auth-browser.mjs"),
    );
    const spawnSync = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        browser: {
          status: "started",
          provider: "chatgpt",
          mode: "isolated-chrome-root",
          modeLabel: "Use Isolated Chrome Root",
          advanced: true,
          loginUrl: "https://chatgpt.com",
          loginOpened: true,
          cdpUrl: "http://127.0.0.1:9338",
          browserPath: "/Applications/Google Chrome.app",
          userDataDir: ALLOWED_PROFILE_ROOT,
          profileName: "webai-bridge",
          profileDirectory: "Profile 1",
          browserTarget: {
            kind: "isolated-chrome-root",
            label: "Isolated Chrome root",
            summary: "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile.",
          },
          summary: "WebaiBridge attached or launched the isolated repo Chrome root.",
        },
      }),
      stderr: "",
    }));

    vi.doMock("node:fs", () => ({ existsSync }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { bootstrapLocalWebAuthBrowser } = await import(
      "../../../apps/service/src/browser-bootstrap.ts"
    );

    const result = await bootstrapLocalWebAuthBrowser({
      provider: "chatgpt",
      loginUrl: "https://chatgpt.com",
      request: {
        mode: "existing-chrome-profile",
        existingChromeProfile: {
          userDataDir: ALLOWED_PROFILE_ROOT,
          profileName: "webai-bridge",
          browserPath: "/Applications/Google Chrome.app",
          cdpUrl: "http://127.0.0.1:9222",
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        provider: "chatgpt",
        mode: "isolated-chrome-root",
        cdpUrl: "http://127.0.0.1:9338",
        userDataDir: ALLOWED_PROFILE_ROOT,
        profileName: "webai-bridge",
        profileDirectory: "Profile 1",
      }),
    );
    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([
        expect.stringContaining("scripts/bootstrap-web-auth-browser.mjs"),
        "--provider",
        "chatgpt",
        "--login-url",
        "https://chatgpt.com",
        "--mode",
        "isolated-chrome-root",
        "--json",
        "--existing-profile-dir",
        ALLOWED_PROFILE_ROOT,
        "--profile-name",
        "webai-bridge",
        "--browser-path",
        "/Applications/Google Chrome.app",
        "--cdp-url",
        "http://127.0.0.1:9222",
      ]),
      expect.objectContaining({
        cwd: process.cwd(),
        encoding: "utf8",
      }),
    );
  });

  it("surfaces structured bootstrap failures with code and message", async () => {
    const existsSync = vi.fn((path: string) =>
      path.endsWith("scripts/bootstrap-web-auth-browser.mjs"),
    );
    const spawnSync = vi.fn(() => ({
      status: 1,
      stdout: JSON.stringify({
        ok: false,
        error: {
          code: "cdp-unreachable",
          message: "WebaiBridge could not reach the requested CDP endpoint.",
        },
      }),
      stderr: "",
    }));

    vi.doMock("node:fs", () => ({ existsSync }));
    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { bootstrapLocalWebAuthBrowser } = await import(
      "../../../apps/service/src/browser-bootstrap.ts"
    );

    await expect(
      bootstrapLocalWebAuthBrowser({
        provider: "grok",
        loginUrl: "https://grok.com",
      }),
    ).rejects.toMatchObject({
      code: "cdp-unreachable",
      message: "WebaiBridge could not reach the requested CDP endpoint.",
    });
  });

  it("rejects non-absolute browser path overrides before launch", async () => {
    vi.doMock("../../../scripts/browser-launch-handoff.mjs", () => ({
      launchBrowserViaOsHandoff: vi.fn(),
      openUrlInExistingBrowserViaCdp: vi.fn(async () => false),
    }));

    const { ensureManagedBrowser } = await import(
      "../../../scripts/bootstrap-web-auth-browser.mjs"
    );

    await expect(
      ensureManagedBrowser({
        provider: "chatgpt",
        loginUrl: "https://chatgpt.com",
        env: {},
        browserPath: "relative/chrome",
        cdpUrl: "http://127.0.0.1:39222",
      }),
    ).rejects.toMatchObject({
      code: "browser-path-invalid",
    });
  });

  it("starts the managed onboarding browser when no reachable CDP session exists yet", async () => {
    const launchBrowserViaOsHandoff = vi.fn();

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
      };
    });
    vi.doMock("../../../scripts/browser-launch-handoff.mjs", () => ({
      launchBrowserViaOsHandoff,
      openUrlInExistingBrowserViaCdp: vi.fn(),
    }));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            Browser: "Chrome/146.0.0.0",
            webSocketDebuggerUrl: "ws://127.0.0.1:39222/devtools/browser/test",
          }),
        }) as typeof fetch,
    );

    const { ensureManagedBrowser } = await import(
      "../../../scripts/bootstrap-web-auth-browser.mjs"
    );
    const result = await ensureManagedBrowser({
      provider: "qwen",
      loginUrl: "https://chat.qwen.ai",
      env: {
        WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR: join(
          process.cwd(),
          ".runtime-cache",
          "tests",
          "managed-browser",
        ),
      },
      browserPath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      cdpUrl: "http://127.0.0.1:39222",
    });

    expect(launchBrowserViaOsHandoff).toHaveBeenCalledWith(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      expect.arrayContaining([
        "--remote-debugging-port=39222",
        expect.stringContaining("--user-data-dir="),
        "https://chat.qwen.ai",
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "started",
        mode: "managed-browser",
        loginOpened: true,
        cdpUrl: "http://127.0.0.1:39222",
        browserVersion: "Chrome/146.0.0.0",
      }),
    );
  });
});
