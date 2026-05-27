import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_STATE_KEY = "__webai_bridgeVerifyWebLoginState";
const deferredCleanupPaths = new Set<string>();

function scheduleDeferredCleanup(path: string) {
  if (deferredCleanupPaths.size === 0) {
    process.once("exit", () => {
      for (const cleanupPath of deferredCleanupPaths) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
    });
  }

  deferredCleanupPaths.add(path);
}

function setState(state: unknown) {
  (globalThis as Record<string, unknown>)[TEST_STATE_KEY] = state;
}

function buildStoredRuntimeEnv(provider: "chatgpt" | "grok" | "qwen") {
  if (provider === "chatgpt") {
    return {
      WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_cookie=1",
      WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: "chatgpt-test-agent",
    };
  }

  if (provider === "grok") {
    return {
      WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
      WEBAI_BRIDGE_WEB_GROK_USER_AGENT: "grok-test-agent",
    };
  }

  return {
    WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
    WEBAI_BRIDGE_WEB_QWEN_USER_AGENT: "qwen-test-agent",
  };
}

function createTestEnv(provider: "chatgpt" | "grok" | "qwen") {
  const workspaceRoot = mkdtempSync(
    join(process.cwd(), ".runtime-cache", "webai-bridge-verify-web-login-test-"),
  );
  scheduleDeferredCleanup(workspaceRoot);

  return {
    ...buildStoredRuntimeEnv(provider),
    WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: join(
      workspaceRoot,
      "local-web-auth-store.json",
    ),
    CI: "false",
    GITHUB_ACTIONS: "false",
  };
}

function createCredentialsModule() {
  return `
const key = ${JSON.stringify(TEST_STATE_KEY)};
const state = globalThis[key] ?? {};
export function buildStoredWebRuntimeEnv() {
  return state.storedRuntimeEnv ?? {};
}
export function buildStoredWebProviderSessions() {
  return state.storedSessions ?? {};
}
`;
}

function createProviderModule(args: {
  provider: string;
  exportName: string;
  runtimeExportName: string;
  browserProofExportName?: string;
}) {
  return `
const key = ${JSON.stringify(TEST_STATE_KEY)};
const provider = ${JSON.stringify(args.provider)};
function readState() {
  return globalThis[key] ?? {};
}
export async function ${args.exportName}(env, fetchFn) {
  const fn = readState().liveProofs?.[provider];
  return fn ? await fn(env, fetchFn) : { status: "success", provider };
}
${args.browserProofExportName ? `export async function ${args.browserProofExportName}(env, connectOverCDP) {
  const fn = readState().browserProofs?.[provider];
  return fn ? await fn(env, connectOverCDP) : { status: "success", provider };
}` : ""}
export function ${args.runtimeExportName}() {
  const statusFn = readState().statuses?.[provider];
  return {
    ...(statusFn
      ? {
          async getStatus(input) {
            return await statusFn(input);
          },
        }
      : {}),
    async invoke(request, context) {
      const fn = readState().invokes?.[provider];
      if (!fn) {
        return {
          ok: true,
          outputText: "DEFAULT_OK",
          providerMessageId: provider + "-default-msg",
        };
      }

      return await fn(request, context);
    },
  };
}
  `;
}

function extractTokenFromPrompt(value: string) {
  return value.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i)?.[1];
}

function ensureFile(path: string, content: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function createSpawnSyncMock(options: {
  bootstrapResults?: Array<{ status?: number; stdout?: string; error?: Error }>;
}) {
  const bootstrapResults = [...(options.bootstrapResults ?? [])];

  return vi.fn((command: string, args: string[]) => {
    if (
      command === process.execPath &&
      Array.isArray(args) &&
      args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs"))
    ) {
      const next = bootstrapResults.shift() ?? { status: 0, stdout: "" };
      return {
        status: next.status ?? 0,
        stdout: next.stdout ?? "",
        error: next.error,
      };
    }

    if (command !== "pnpm") {
      throw new Error(`Unexpected command: ${command}`);
    }

    const outDirIndex = args.indexOf("--outDir");
    const tsconfigIndex = args.indexOf("-p");
    const outDir = outDirIndex >= 0 ? args[outDirIndex + 1] : undefined;
    const tsconfig = tsconfigIndex >= 0 ? args[tsconfigIndex + 1] : undefined;

    if (!outDir || !tsconfig) {
      return {
        status: 0,
        stdout: "",
      };
    }

    if (tsconfig === "packages/credentials/tsconfig.json") {
      ensureFile(join(outDir, "packages/credentials/src/index.js"), createCredentialsModule());
      return {
        status: 0,
        stdout: "",
      };
    }

    const providerMap = {
      "packages/providers/web/chatgpt/tsconfig.json": {
        provider: "chatgpt",
        exportName: "runChatgptWebLiveProof",
        runtimeExportName: "createChatgptWebRuntime",
      },
      "packages/providers/web/gemini/tsconfig.json": {
        provider: "gemini",
        exportName: "runGeminiWebLiveProof",
        runtimeExportName: "createGeminiWebRuntime",
        browserProofExportName: "runGeminiBrowserWorkspaceProof",
      },
      "packages/providers/web/claude/tsconfig.json": {
        provider: "claude",
        exportName: "runClaudeWebLiveProof",
        runtimeExportName: "createClaudeWebRuntime",
      },
      "packages/providers/web/grok/tsconfig.json": {
        provider: "grok",
        exportName: "runGrokWebLiveProof",
        runtimeExportName: "createGrokWebRuntime",
        browserProofExportName: "runGrokBrowserWorkspaceProof",
      },
      "packages/providers/web/qwen/tsconfig.json": {
        provider: "qwen",
        exportName: "runQwenWebLiveProof",
        runtimeExportName: "createQwenWebRuntime",
        browserProofExportName: "runQwenBrowserWorkspaceProof",
      },
    } as const;

    const providerConfig = providerMap[tsconfig as keyof typeof providerMap];

    if (providerConfig) {
      ensureFile(
        join(outDir, `packages/providers/web/${providerConfig.provider}/src/live-proof.js`),
        createProviderModule(providerConfig),
      );
      ensureFile(
        join(outDir, `packages/providers/web/${providerConfig.provider}/src/runtime.js`),
        createProviderModule(providerConfig),
      );
    }

    return {
      status: 0,
      stdout: "",
    };
  });
}

function createTempOutDir() {
  return mkdtempSync(join(tmpdir(), "webai-bridge-orchestration-"));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)[TEST_STATE_KEY];
});

describe("verify-web-login orchestration", () => {
  it("opens the provider page during the initial browser-backed bootstrap instead of ensure-only attaching", async () => {
    const outDir = createTempOutDir();
    const baseSpawnSync = createSpawnSyncMock({
      bootstrapResults: [
        {
          status: 0,
          stdout: JSON.stringify({
            status: "attached",
            provider: "chatgpt",
            cdpUrl: "http://127.0.0.1:9338",
          }),
        },
      ],
    });
    const spawnSync = vi.fn((command: string, args: string[]) => baseSpawnSync(command, args));

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("chatgpt"),
      storedSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:test",
        },
      },
      liveProofs: {
        chatgpt: async () => ({
          status: "success",
          provider: "chatgpt",
          probeUrl: "https://chatgpt.com/api/auth/session",
          finalUrl: "https://chatgpt.com/api/auth/session",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        chatgpt: async (request: { input: string }) => {
          const token = extractTokenFromPrompt(request.input);

          return {
            ok: true,
            outputText: token ?? "CHATGPT_OK",
            providerMessageId: "chatgpt-msg-bootstrap-open",
          };
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const [result] = await runWebLoginLiveVerification({
      env: createTestEnv("chatgpt"),
      providers: ["chatgpt"],
      outDir,
    });

    const bootstrapCall = spawnSync.mock.calls.find(
      ([command, args]) =>
        command === process.execPath &&
        Array.isArray(args) &&
        args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs")),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "chatgpt",
      }),
    );
    expect(bootstrapCall).toBeTruthy();
    expect(bootstrapCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bootstrap-web-auth-browser.mjs"),
        "--provider",
        "chatgpt",
        "--json",
      ]),
    );
    expect(bootstrapCall?.[1]).not.toContain("--ensure-only");
  });

  it("isolates multi-provider live verification into provider-scoped subprocesses by default for real fetch runs", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;

        if (provider === "chatgpt") {
          return {
            status: 1,
            stdout: JSON.stringify([
              {
                status: "failure",
                provider: "chatgpt",
                reason: "probe-request-failed",
                classification: "transport-instability",
              },
            ]),
          };
        }

        if (provider === "gemini") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                status: "success",
                provider: "gemini",
              },
            ]),
          };
        }
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt", "gemini"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
      }),
      expect.objectContaining({
        status: "success",
        provider: "gemini",
      }),
    ]);
    expect(
      spawnSync.mock.calls.filter(
        ([command, args]) =>
          command === process.execPath &&
          Array.isArray(args) &&
          `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs"),
      ),
    ).toHaveLength(2);
  });

  it("turns isolated provider timeouts into transport-instability failures", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;

        if (provider === "grok") {
          const error = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
          return {
            status: null,
            stdout: "",
            error,
          };
        }

        return {
          status: 0,
          stdout: JSON.stringify([
            {
              status: "success",
              provider,
            },
          ]),
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["grok", "qwen"],
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "grok",
        classification: "transport-instability",
        reason: "probe-request-failed",
        diagnostic: expect.stringContaining("timed out"),
      }),
    );
    expect(results[1]).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
      }),
    );
  });

  it("maps browser attach failures to explicit cdp-unavailable external blockers", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs"))
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            status: "started",
            provider: args[args.indexOf("--provider") + 1],
            cdpUrl: "http://127.0.0.1:9338",
          }),
        };
      }

      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;

        if (provider === "chatgpt") {
          return {
            status: 1,
            stdout: "",
            stderr:
              "browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9338",
          };
        }

        return {
          status: 0,
          stdout: JSON.stringify([
            {
              status: "success",
              provider,
            },
          ]),
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt", "gemini"],
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
      }),
    );
    expect(results[1]).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "gemini",
      }),
    );
  });

  it("isolates single browser-backed providers through a child lane", async () => {
    const spawnSync = vi.fn((command: string, args: string[], options?: { env?: Record<string, string> }) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        expect(args).toEqual(
          expect.arrayContaining(["--provider", "chatgpt"]),
        );
        expect(options?.env?.WEBAI_BRIDGE_WEB_LOGIN_ISOLATED_CHILD).toBe("1");

        return {
          status: 0,
          stdout: JSON.stringify([
            {
              status: "success",
              provider: "chatgpt",
            },
          ]),
          stderr: "",
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "success",
        provider: "chatgpt",
      }),
    ]);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it("turns malformed isolated provider payloads into parseable failure records", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;

        return {
          status: provider === "chatgpt" ? 1 : 0,
          stdout: provider === "chatgpt" ? "not-json" : JSON.stringify([{ status: "success", provider }]),
          stderr: provider === "chatgpt" ? "child emitted garbage" : "",
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt", "gemini"],
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
        diagnostic: "child emitted garbage",
      }),
    );
    expect(results[1]).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "gemini",
      }),
    );
  });

  it("retries retryable isolated provider drift before locking the final verdict", async () => {
    const providerAttempts: Record<string, number> = {};
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs"))
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            status: "started",
            provider: args[args.indexOf("--provider") + 1],
            cdpUrl: "http://127.0.0.1:39222",
          }),
        };
      }

      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;
        providerAttempts[provider ?? "unknown"] = (providerAttempts[provider ?? "unknown"] ?? 0) + 1;

        if (provider === "chatgpt" && providerAttempts.chatgpt === 1) {
          return {
            status: 1,
            stdout: "",
            stderr: "",
          };
        }

        if (provider === "chatgpt") {
          return {
            status: 2,
            stdout: JSON.stringify([
              {
                status: "external-blocker",
                provider: "chatgpt",
                blocker: "chatgpt-browser-session-incomplete",
                classification: "session-incomplete",
              },
            ]),
          };
        }

        if (provider === "qwen" && providerAttempts.qwen === 1) {
          return {
            status: 1,
            stdout: JSON.stringify([
              {
                status: "failure",
                provider: "qwen",
                reason: "probe-request-failed",
                classification: "transport-instability",
                diagnostic:
                  "browserType.connectOverCDP: connect EADDRNOTAVAIL 127.0.0.1:39222 - Local (0.0.0.0:0)",
              },
            ]),
          };
        }

        if (provider === "qwen") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                status: "success",
                provider: "qwen",
              },
            ]),
          };
        }
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt", "qwen"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
      }),
      expect.objectContaining({
        status: "success",
        provider: "qwen",
      }),
    ]);
    expect(providerAttempts).toEqual({
      chatgpt: 1,
      qwen: 2,
    });
    expect(
      spawnSync.mock.calls.filter(
        ([command, args]) =>
          command === process.execPath &&
          Array.isArray(args) &&
          args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs")) &&
          !args.includes("--ensure-only"),
      ),
    ).toHaveLength(1);
  });

  it("retries isolated providers when the child only emitted progress noise before exiting", async () => {
    const attempts: Record<string, number> = {};
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (
        command === process.execPath &&
        Array.isArray(args) &&
        args.some((value) => `${value}`.includes("bootstrap-web-auth-browser.mjs"))
      ) {
        return {
          status: 0,
          stdout: JSON.stringify({
            status: "started",
            provider: args[args.indexOf("--provider") + 1],
            cdpUrl: "http://127.0.0.1:39222",
          }),
        };
      }

      if (
        command === process.execPath &&
        Array.isArray(args) &&
        `${args[0] ?? ""}`.endsWith("scripts/verify-web-login-live.mjs")
      ) {
        const providerIndex = args.indexOf("--provider");
        const provider = providerIndex >= 0 ? args[providerIndex + 1] : undefined;
        attempts[provider ?? "unknown"] = (attempts[provider ?? "unknown"] ?? 0) + 1;

        if (provider === "chatgpt" && attempts.chatgpt === 1) {
          return {
            status: 1,
            stdout: "",
            stderr: "[verify:web-login-live] [chatgpt] provider-start",
          };
        }

        if (provider === "gemini") {
          return {
            status: 0,
            stdout: JSON.stringify([
              {
                status: "success",
                provider: "gemini",
              },
            ]),
            stderr: "",
          };
        }

        return {
          status: 2,
          stdout: JSON.stringify([
            {
              status: "external-blocker",
              provider,
              blocker: `${provider}-session-incomplete`,
              classification: "session-incomplete",
            },
          ]),
          stderr: "",
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      providers: ["chatgpt", "gemini"],
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-cdp-unavailable",
        classification: "transport-instability",
      }),
      expect.objectContaining({
        status: "success",
        provider: "gemini",
      }),
    ]);
    expect(attempts.chatgpt).toBe(1);
  });

  it("attaches browser debug context to browser-backed external blockers", async () => {
    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.doMock("../../../scripts/browser-debug-support.mjs", () => ({
      captureBrowserDebugContext: vi.fn(async () => ({
        attachStatus: "attached",
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
        currentConsole: [{ type: "warning", text: "login gate still visible" }],
        currentNetwork: [{ method: "GET", url: "https://chatgpt.com/api/auth/session" }],
        supportBundle: {
          command:
            "pnpm exec node scripts/capture-web-debug-bundle.mjs --provider chatgpt",
        },
        diagnoseLadder: ["step 1", "step 2"],
      })),
    }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("chatgpt"),
      storedSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:test",
        },
      },
      liveProofs: {
        chatgpt: async () => ({
          status: "success",
          provider: "chatgpt",
          probeUrl: "https://chatgpt.com/api/auth/session",
          finalUrl: "https://chatgpt.com/",
          envStatus: [],
        }),
      },
      invokes: {
        chatgpt: async () => ({
          ok: false,
          errorCategory: "provider-unavailable",
          failureStage: "invoke",
          message:
            "ChatGPT attached browser is still showing the logged-out landing page or login/signup controls, so the browser workspace is not ready for live invocation.",
        }),
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("chatgpt"),
      providers: ["chatgpt"],
      outDir: createTempOutDir(),
    });

    expect(results).toEqual([
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        blocker: "chatgpt-browser-session-incomplete",
        debug: expect.objectContaining({
          attachStatus: "attached",
          currentPage: expect.objectContaining({
            url: "https://chatgpt.com/",
          }),
          supportBundle: expect.objectContaining({
            command:
              "pnpm exec node scripts/capture-web-debug-bundle.mjs --provider chatgpt",
          }),
        }),
      }),
    ]);
  });

  it("writes a recovered browser-backed store record back to ready after coherence passes", async () => {
    const outDir = createTempOutDir();
    const workspaceRoot = mkdtempSync(
      join(process.cwd(), ".runtime-cache", "webai-bridge-chatgpt-ready-writeback-"),
    );
    const storePath = join(workspaceRoot, "local-web-auth-store.json");
    scheduleDeferredCleanup(workspaceRoot);
    writeFileSync(
      storePath,
      `${JSON.stringify(
        {
          version: 1,
          providers: {
            chatgpt: {
              providerId: "chatgpt",
              state: "refreshable-but-degraded",
              acquisitionMode: "isolated-chrome-root",
              degradedReason: "stale store state",
              artifactStates: {
                "next-auth-session-token": "present",
                "openai-access-token": "present",
              },
              runtimeEnv: buildStoredRuntimeEnv("chatgpt"),
              updatedAt: "2026-04-05T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const spawnSync = createSpawnSyncMock({
      bootstrapResults: [
        {
          status: 0,
          stdout: JSON.stringify({
            status: "attached",
            provider: "chatgpt",
            cdpUrl: "http://127.0.0.1:9338",
          }),
        },
      ],
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    const collectBrowserEvidence = vi.fn(async () => ({
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
      }));
    const classifyLiveWorkspace = vi.fn(() => ({
        liveReady: true,
        reason: "workspace ready",
      }));
    vi.doMock("../../../scripts/diagnose-web-login-browser.mjs", () => ({
      collectBrowserEvidence,
      classifyLiveWorkspace,
      resolveCanonicalAttachTarget: vi.fn(() => ({
        mode: "isolated-chrome-root",
        existingProfileDir: "/tmp/isolated",
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
        cdpUrl: "http://127.0.0.1:9338",
      })),
    }));
    vi.doMock("../../../scripts/browser-session-coherence.mjs", () => ({
      filterProviderArtifactStates: vi.fn((_, artifactStates) => artifactStates ?? {}),
      mergeProviderArtifactStates: vi.fn((_, ...artifactStateMaps) =>
        Object.assign({}, ...artifactStateMaps.filter(Boolean)),
      ),
      buildBrowserCaptureProvenance: vi.fn(() => ({
        browserMode: "isolated-chrome-root",
        userDataDir: "/tmp/isolated",
        profileDirectory: "Profile 1",
        profileName: "webai-bridge",
        cdpUrl: "http://127.0.0.1:9338",
        capturedAt: "2026-04-05T01:00:00.000Z",
      })),
      auditProviderPersistentArtifacts: vi.fn(() => ({
        available: true,
        cookieDbPath: "/tmp/isolated/Profile 1/Cookies",
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      })),
      evaluateProviderSessionCoherence: vi.fn(() => ({
        status: "ready",
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
        persistenceAudit: {
          source: "verify",
          checkedAt: "2026-04-05T01:00:00.000Z",
          browserMode: "isolated-chrome-root",
          userDataDir: "/tmp/isolated",
          profileDirectory: "Profile 1",
          profileName: "webai-bridge",
          cdpUrl: "http://127.0.0.1:9338",
          pageUrl: "https://chatgpt.com/",
          pageTitle: "ChatGPT",
          workspaceClassification: "workspace-ready",
          workspaceReady: true,
          summary: "workspace ready",
        },
      })),
    }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("chatgpt"),
      storedSessions: {
        chatgpt: {
          state: "refreshable-but-degraded",
          accountLabel: "chatgpt:test",
        },
      },
      liveProofs: {
        chatgpt: async () => ({
          status: "success",
          provider: "chatgpt",
          probeUrl: "https://chatgpt.com/api/auth/session",
          finalUrl: "https://chatgpt.com/api/auth/session",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      statuses: {
        chatgpt: async () => ({
          credentialState: "refreshable-but-degraded",
          session: {
            validationState: "recovering",
          },
        }),
      },
      invokes: {
        chatgpt: async (request: { input: string }) => {
          const token = extractTokenFromPrompt(request.input);

          return {
            ok: true,
            outputText: token ?? "CHATGPT_OK",
            providerMessageId: "chatgpt-msg-ready-writeback",
          };
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const [result] = await runWebLoginLiveVerification({
      env: {
        ...createTestEnv("chatgpt"),
        WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: storePath,
      },
      providers: ["chatgpt"],
      outDir,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "chatgpt",
      }),
    );

    const persisted = JSON.parse(readFileSync(storePath, "utf8"));
    expect(persisted.providers.chatgpt.state).toBe("ready");
    expect(persisted.providers.chatgpt).not.toHaveProperty("degradedReason");
    expect(persisted.providers.chatgpt).not.toHaveProperty("requiredUserAction");
    expect(persisted.providers.chatgpt.captureProvenance).toEqual(
      expect.objectContaining({
        browserMode: "isolated-chrome-root",
        cdpUrl: "http://127.0.0.1:9338",
      }),
    );
    expect(persisted.providers.chatgpt.persistenceAudit).toEqual(
      expect.objectContaining({
        workspaceClassification: "workspace-ready",
        workspaceReady: true,
      }),
    );
    expect(collectBrowserEvidence).toHaveBeenCalledTimes(1);
    expect(collectBrowserEvidence).toHaveBeenCalledWith(
      "chatgpt",
      expect.any(Object),
      expect.objectContaining({
        reload: false,
      }),
    );
  });

  it("writes qwen user-action-required invoke verdict back into the local auth store", async () => {
    const outDir = createTempOutDir();
    const env = createTestEnv("qwen");
    const storePath = env.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH;
    vi.doUnmock("../../../scripts/browser-session-coherence.mjs");
    writeFileSync(
      storePath,
      `${JSON.stringify(
        {
          version: 1,
          providers: {
            qwen: {
              providerId: "qwen",
              state: "ready",
              acquisitionMode: "isolated-chrome-root",
              artifactStates: {
                "session-cookie": "present",
                "session-token": "missing",
                "next-auth-session-token": "present",
              },
              runtimeEnv: buildStoredRuntimeEnv("qwen"),
              updatedAt: "2026-04-05T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("qwen"),
      storedSessions: {
        qwen: {
          state: "ready",
          accountLabel: "qwen:test",
        },
      },
      liveProofs: {
        qwen: async () => ({
          status: "success",
          provider: "qwen",
          probeUrl: "https://chat.qwen.ai",
          finalUrl: "https://chat.qwen.ai/",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        qwen: async () => ({
          ok: false,
          errorCategory: "user-action-required",
          failureStage: "re-auth",
          message: "Qwen Web needs explicit user action before Web/Login traffic can continue.",
          suggestedAction:
            "Refresh the Qwen browser session in the same repo-owned browser, clear the remaining browser-side gate, and re-probe the authenticated workspace plus composer before resuming traffic.",
        }),
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const [result] = await runWebLoginLiveVerification({
      env,
      providers: ["qwen"],
      outDir,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "qwen-browser-session-incomplete",
        classification: "user-action-required",
      }),
    );

    const persisted = JSON.parse(readFileSync(storePath, "utf8"));
    expect(persisted.providers.qwen.state).toBe("user-action-required");
    expect(persisted.providers.qwen.artifactStates).toEqual({
      "session-cookie": "present",
      "session-token": "missing",
    });
  });

  it("writes qwen unauthorized bootstrap failures back as external blockers", async () => {
    const outDir = createTempOutDir();
    const env = createTestEnv("qwen");
    const storePath = env.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH;
    writeFileSync(
      storePath,
      `${JSON.stringify(
        {
          version: 1,
          providers: {
            qwen: {
              providerId: "qwen",
              state: "ready",
              acquisitionMode: "isolated-chrome-root",
              artifactStates: {
                "session-cookie": "present",
                "session-token": "missing",
              },
              runtimeEnv: buildStoredRuntimeEnv("qwen"),
              updatedAt: "2026-04-05T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("qwen"),
      storedSessions: {
        qwen: {
          state: "ready",
          accountLabel: "qwen:test",
        },
      },
      liveProofs: {
        qwen: async () => ({
          status: "success",
          provider: "qwen",
          probeUrl: "https://chat.qwen.ai",
          finalUrl: "https://chat.qwen.ai/",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        qwen: async () => ({
          ok: false,
          errorCategory: "provider-unavailable",
          failureStage: "invoke",
          message:
            "Qwen chat creation did not return a chat id. You do not have permission to access this resource. Please contact your administrator for assistance.",
          suggestedAction:
            "Refresh the Qwen browser session in the same repo-owned browser, clear the remaining browser-side gate, and re-probe the authenticated workspace plus composer before resuming traffic.",
        }),
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const [result] = await runWebLoginLiveVerification({
      env,
      providers: ["qwen"],
      outDir,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "qwen-browser-session-incomplete",
        classification: "user-action-required",
      }),
    );

    const persisted = JSON.parse(readFileSync(storePath, "utf8"));
    expect(persisted.providers.qwen.state).toBe("user-action-required");
    expect(persisted.providers.qwen.artifactStates).toEqual({
      "session-cookie": "present",
      "session-token": "missing",
    });
  });

  it("writes claude overdue subscription blockers back into the local auth store", async () => {
    const outDir = createTempOutDir();
    const env = createTestEnv("claude");
    const storePath = env.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH;
    writeFileSync(
      storePath,
      `${JSON.stringify(
        {
          version: 1,
          providers: {
            claude: {
              providerId: "claude",
              state: "ready",
              acquisitionMode: "isolated-chrome-root",
              artifactStates: {
                "claude-session-key": "present",
                "organization-id": "present",
              },
              runtimeEnv: buildStoredRuntimeEnv("claude"),
              persistenceAudit: {
                pageUrl: "https://claude.ai/new",
                pageTitle: "Claude",
                workspaceClassification: "workspace-ready",
                workspaceReady: true,
              },
              updatedAt: "2026-04-05T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("claude"),
      storedSessions: {
        claude: {
          state: "ready",
          accountLabel: "claude:test",
        },
      },
      liveProofs: {
        claude: async () => ({
          status: "success",
          provider: "claude",
          probeUrl: "https://claude.ai/api/organizations",
          finalUrl: "https://claude.ai/api/organizations",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        claude: async () => ({
          ok: false,
          errorCategory: "provider-unavailable",
          failureStage: "invoke",
          message:
            "Claude completion request failed with HTTP 403: {\"type\":\"error\",\"error\":{\"type\":\"permission_error\",\"message\":\"Your subscription payment is past due. Please pay your overdue invoice to restore access.\",\"details\":{\"error_code\":\"subscription_past_due\"}}}",
          suggestedAction:
            "Restore the Claude subscription, then rerun the Claude-only live gate.",
        }),
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const [result] = await runWebLoginLiveVerification({
      env,
      providers: ["claude"],
      outDir,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "claude-account-action-required",
        classification: "account-action-required",
      }),
    );

    const persisted = JSON.parse(readFileSync(storePath, "utf8"));
    expect(persisted.providers.claude.state).toBe("user-action-required");
    expect(persisted.providers.claude.requiredUserAction).toContain("overdue subscription payment");
    expect(persisted.providers.claude.persistenceAudit.workspaceClassification).toBe(
      "account-action-required",
    );
  });

  it("retries ChatGPT after a managed-browser bootstrap when the first invoke hits a closed page", async () => {
    const outDir = createTempOutDir();
    const spawnSync = createSpawnSyncMock({
      bootstrapResults: [
        {
          status: 0,
          stdout: "not-json",
        },
        {
          status: 0,
          stdout: JSON.stringify({
            status: "started",
            provider: "chatgpt",
            cdpUrl: "http://127.0.0.1:39222",
          }),
        },
      ],
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    let invokeCount = 0;
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("chatgpt"),
      storedSessions: {
        chatgpt: {
          state: "ready",
          accountLabel: "chatgpt:test",
        },
      },
      liveProofs: {
        chatgpt: async () => ({
          status: "success",
          provider: "chatgpt",
          probeUrl: "https://chatgpt.com/api/auth/session",
          finalUrl: "https://chatgpt.com/api/auth/session",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        chatgpt: async (request: { input: string }) => {
          invokeCount += 1;
          if (invokeCount === 1) {
            return {
              ok: false,
              errorCategory: "provider-unavailable",
              failureStage: "invoke",
              message: "Target page, context or browser has been closed.",
            };
          }

          const token = extractTokenFromPrompt(request.input);

          return {
            ok: true,
            outputText: token ?? "CHATGPT_OK_RETRIED",
            providerMessageId: "chatgpt-msg-1",
          };
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("chatgpt"),
      providers: ["chatgpt"],
      outDir,
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "chatgpt",
        invokeProof: expect.objectContaining({
          status: "success",
          providerMessageId: "chatgpt-msg-1",
          outputText: expect.stringMatching(/^CHATGPT_OK_[A-Z0-9]+$/),
        }),
      }),
    );
    expect(invokeCount).toBe(2);
    expect(
      spawnSync.mock.calls.some(
        ([command, args]) =>
          command === process.execPath &&
          Array.isArray(args) &&
          args.includes("--provider") &&
          args.includes("chatgpt") &&
          !args.includes("--ensure-only"),
      ),
    ).toBe(true);

    scheduleDeferredCleanup(outDir);
  });

  it("retries Qwen after a soft failure and accepts the second exact token", async () => {
    const outDir = createTempOutDir();
    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    let invokeCount = 0;
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("qwen"),
      storedSessions: {
        qwen: {
          state: "ready",
          accountLabel: "qwen:test",
        },
      },
      liveProofs: {
        qwen: async () => ({
          status: "success",
          provider: "qwen",
          probeUrl: "https://chat.qwen.ai",
          finalUrl: "https://chat.qwen.ai",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        qwen: async (request: { input: string }) => {
          invokeCount += 1;
          return invokeCount === 1
            ? {
                ok: true,
                outputText: "model not found for this qwen alias",
                providerMessageId: "qwen-msg-soft",
              }
            : {
                ok: true,
                outputText: extractTokenFromPrompt(request.input) ?? "QWEN_OK_RETRIED",
                providerMessageId: "qwen-msg-hard",
              };
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("qwen"),
      providers: ["qwen"],
      outDir,
    });

    expect(invokeCount).toBe(2);
    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "qwen",
        invokeProof: expect.objectContaining({
          status: "success",
          providerMessageId: "qwen-msg-hard",
          outputText: expect.stringMatching(/^QWEN_OK_[A-Z0-9]+$/),
        }),
      }),
    );

    scheduleDeferredCleanup(outDir);
  });

  it("re-proves Grok after invoke timeout and converts the still-authenticated workspace into an external blocker", async () => {
    const outDir = createTempOutDir();
    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("grok"),
      storedSessions: {
        grok: {
          state: "ready",
          accountLabel: "grok:test",
        },
      },
      liveProofs: {
        grok: async () => ({
          status: "success",
          provider: "grok",
          probeUrl: "https://grok.com",
          finalUrl: "https://grok.com/",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      browserProofs: {
        grok: async () => ({
          status: "success",
          provider: "grok",
          probeUrl: "https://grok.com",
          finalUrl: "https://grok.com/",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        grok: async () => {
          throw new Error("grok invoke proof timed out after 240000ms.");
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("grok"),
      providers: ["grok"],
      outDir,
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-provider-unavailable",
        classification: "provider-unavailable",
      }),
    );

    scheduleDeferredCleanup(outDir);
  });

  it("maps a Grok timeout re-proof back into the classified external blocker when the browser page is still blocked", async () => {
    const outDir = createTempOutDir();
    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("grok"),
      storedSessions: {
        grok: {
          state: "ready",
          accountLabel: "grok:test",
        },
      },
      liveProofs: {
        grok: async () => ({
          status: "success",
          provider: "grok",
          probeUrl: "https://grok.com",
          finalUrl: "https://grok.com/",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      browserProofs: {
        grok: async () => ({
          status: "failure",
          provider: "grok",
          reason: "probe-unexpected-body",
          classification: "user-action-required",
          probeUrl: "https://grok.com",
          finalUrl: "https://grok.com/",
          responseStatus: 200,
          envStatus: [],
          diagnostic: "linking an X account is still required",
          summary: "needs plan unlock",
        }),
      },
      invokes: {
        grok: async () => {
          throw new Error("grok invoke proof timed out after 240000ms.");
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("grok"),
      providers: ["grok"],
      outDir,
    });

    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "grok",
        blocker: "grok-account-action-required",
        classification: "user-action-required",
      }),
    );

    scheduleDeferredCleanup(outDir);
  });

  it("keeps Qwen as an internal failure when the soft-retry still returns a failing invoke result", async () => {
    const outDir = createTempOutDir();
    const spawnSync = createSpawnSyncMock({});

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    let invokeCount = 0;
    setState({
      storedRuntimeEnv: buildStoredRuntimeEnv("qwen"),
      storedSessions: {
        qwen: {
          state: "ready",
          accountLabel: "qwen:test",
        },
      },
      liveProofs: {
        qwen: async () => ({
          status: "success",
          provider: "qwen",
          probeUrl: "https://chat.qwen.ai",
          finalUrl: "https://chat.qwen.ai",
          responseStatus: 200,
          envStatus: [],
        }),
      },
      invokes: {
        qwen: async () => {
          invokeCount += 1;
          return invokeCount === 1
            ? {
                ok: true,
                outputText: "model not found for this qwen alias",
                providerMessageId: "qwen-msg-soft",
              }
            : {
                ok: false,
                errorCategory: "transport-error",
                failureStage: "invoke",
                message: "second pass still failed",
                suggestedAction: "retry later",
              };
        },
      },
    });

    const { runWebLoginLiveVerification } = await import(
      "../../../scripts/verify-web-login-live.mjs"
    );
    const results = await runWebLoginLiveVerification({
      env: createTestEnv("qwen"),
      providers: ["qwen"],
      outDir,
    });

    expect(invokeCount).toBe(2);
    expect(results[0]).toEqual(
      expect.objectContaining({
        status: "failure",
        provider: "qwen",
        reason: "invoke-failed",
        failureStage: "invoke",
      }),
    );

    scheduleDeferredCleanup(outDir);
  });
});
