import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const deferredCleanupPaths = new Set<string>();

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("verify-gemini-live script helpers", () => {
  it("loads the compiled live-proof module and forwards env through the exported runner", async () => {
    const outDir = join(tmpdir(), `webai-bridge-gemini-proof-${Date.now()}`);
    const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, "live-proof.js"),
      "export async function runGeminiLiveProof(env){ return { status: 'success', provider: 'gemini', sawFlag: env.TEST_GEMINI_FLAG === '1' }; }",
      "utf8",
    );

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: vi.fn(),
      };
    });
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({ status: 0 })),
    }));

    try {
      const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");
      const result = await runGeminiLiveVerification({
        outDir,
        env: {
          TEST_GEMINI_FLAG: "1",
        },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "success",
          provider: "gemini",
          sawFlag: true,
        }),
      );
    } finally {
      scheduleDeferredCleanup(outDir);
    }
  });

  it("throws when the compiled module does not export runGeminiLiveProof", async () => {
    const outDir = join(tmpdir(), `webai-bridge-gemini-proof-missing-${Date.now()}`);
    const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, "live-proof.js"),
      "export const notTheRightExport = true;",
      "utf8",
    );

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: vi.fn(),
      };
    });
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({ status: 0 })),
    }));

    try {
      const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");

      await expect(
        runGeminiLiveVerification({
          outDir,
          env: {},
        }),
      ).rejects.toThrow(/Missing runGeminiLiveProof export/i);
    } finally {
      scheduleDeferredCleanup(outDir);
    }
  });

  it("falls back to process.env when no explicit env override is provided", async () => {
    const outDir = join(tmpdir(), `webai-bridge-gemini-proof-default-${Date.now()}`);
    const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, "live-proof.js"),
      "export async function runGeminiLiveProof(env){ return { status: 'external-blocker', provider: 'gemini', sawProcessEnv: env.TEST_GEMINI_DEFAULT === '1' }; }",
      "utf8",
    );

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: vi.fn(),
      };
    });
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({ status: 0 })),
    }));

    process.env.TEST_GEMINI_DEFAULT = "1";

    try {
      const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");
      const result = await runGeminiLiveVerification({
        outDir,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "external-blocker",
          provider: "gemini",
          sawProcessEnv: true,
        }),
      );
    } finally {
      delete process.env.TEST_GEMINI_DEFAULT;
      scheduleDeferredCleanup(outDir);
    }
  });

  it("normalizes upstream reachability failures into external blockers", async () => {
    const outDir = join(tmpdir(), `webai-bridge-gemini-proof-network-${Date.now()}`);
    const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, "live-proof.js"),
      "export async function runGeminiLiveProof(){ return { status: 'failure', reason: 'invoke-failed', model: 'gemini/gemini-2.5-flash', envStatus: [{ name: 'WEBAI_BRIDGE_GEMINI_API_KEY', present: true }], envNameUsed: 'WEBAI_BRIDGE_GEMINI_API_KEY', requestUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%3Credacted%3E', diagnostics: [], rawSummary: 'fetch failed' }; }",
      "utf8",
    );

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: vi.fn(),
      };
    });
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({ status: 0 })),
    }));

    try {
      const { runGeminiLiveVerification } = await import(
        "../../../scripts/verify-gemini-live.mjs"
      );
      const result = await runGeminiLiveVerification({
        outDir,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "external-blocker",
          blocker: "gemini-provider-unavailable",
          classification: "provider-unavailable",
          rawSummary: "fetch failed",
          rerunCommand: "pnpm exec node scripts/verify-gemini-live.mjs",
        }),
      );
    } finally {
      scheduleDeferredCleanup(outDir);
    }
  });

  it("maps stable fetch failures with a configured Gemini key into external blockers", async () => {
    const outDir = join(tmpdir(), `webai-bridge-gemini-proof-fetch-blocker-${Date.now()}`);
    const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      join(moduleDir, "live-proof.js"),
      "export async function runGeminiLiveProof(){ return { status: 'failure', reason: 'invoke-failed', envStatus: [{ name: 'WEBAI_BRIDGE_GEMINI_API_KEY', present: true }], envNameUsed: 'WEBAI_BRIDGE_GEMINI_API_KEY', requestUrl: 'https://example.test', diagnostics: [], rawSummary: 'fetch failed' }; }",
      "utf8",
    );

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: vi.fn(),
      };
    });
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({ status: 0 })),
    }));

    try {
      const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");
      const result = await runGeminiLiveVerification({
        outDir,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "external-blocker",
          provider: "gemini",
          blocker: "gemini-provider-unavailable",
          classification: "provider-unavailable",
        }),
      );
    } finally {
      scheduleDeferredCleanup(outDir);
    }
  });



  it("throws when the compile step itself reports a spawn error", async () => {
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: 0,
        error: new Error("tsc missing"),
      })),
    }));

    const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");

    await expect(
      runGeminiLiveVerification({
        outDir: join(tmpdir(), `webai-bridge-gemini-proof-error-${Date.now()}`),
      }),
    ).rejects.toThrow(/tsc missing/i);
  });

  it("propagates non-zero compile exits through process.exit", async () => {
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn(() => ({
        status: 7,
      })),
    }));

    const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");

    await expect(
      runGeminiLiveVerification({
        outDir: join(tmpdir(), `webai-bridge-gemini-proof-exit-${Date.now()}`),
      }),
    ).rejects.toThrow("EXIT:7");
    expect(processExit).toHaveBeenCalledWith(7);
  });

  it("creates and cleans up an ephemeral compiled outDir when none is provided", async () => {
    const rmSyncMock = vi.fn();

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: rmSyncMock,
      };
    });
    vi.doMock("node:crypto", () => ({
      randomUUID: vi.fn(() => "fixed-proof-id"),
    }));
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn((command: string, args: string[]) => {
        const outDir = args[args.indexOf("--outDir") + 1];
        const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
        mkdirSync(moduleDir, { recursive: true });
        writeFileSync(
          join(moduleDir, "live-proof.js"),
          "export async function runGeminiLiveProof(){ return { status: 'success', provider: 'gemini', path: 'ephemeral' }; }",
          "utf8",
        );
        return { status: 0 };
      }),
    }));

    const { runGeminiLiveVerification } = await import("../../../scripts/verify-gemini-live.mjs");
    const result = await runGeminiLiveVerification();

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        provider: "gemini",
        path: "ephemeral",
      }),
    );
    expect(rmSyncMock).toHaveBeenCalledTimes(2);
    expect(rmSyncMock.mock.calls[0][0]).toContain("gemini-live-proof-");
    expect(rmSyncMock.mock.calls[1][0]).toContain("gemini-live-proof-");
  });

  it("refuses to run as a script inside CI", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/verify-gemini-live.mjs", import.meta.url),
    );

    vi.doMock("../../../scripts/runtime-cache-maintenance.mjs", () => ({
      runLightweightRuntimePrune: vi.fn(),
    }));

    const originalArgv = [...process.argv];
    const originalCi = process.env.CI;
    process.argv[1] = scriptPath;
    process.env.CI = "true";

    try {
      await expect(
        import(`${pathToFileURL(scriptPath).href}?ts=${Date.now()}`),
      ).rejects.toThrow(/credentialed-workstation only/i);
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("CI", originalCi);
    }
  });

  it("sets exitCode to 2 when the script-run live verification finds an external blocker", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/verify-gemini-live.mjs", import.meta.url),
    );
    const prune = vi.fn();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.doMock("../../../scripts/runtime-cache-maintenance.mjs", () => ({
      runLightweightRuntimePrune: prune,
    }));
    vi.doMock("../../../scripts/runtime-policy.mjs", () => ({
      isCiEnvironment: vi.fn(() => false),
    }));
    vi.doMock("node:crypto", () => ({
      randomUUID: vi.fn(() => "script-external-blocker"),
    }));
    vi.doMock("node:child_process", () => ({
      spawnSync: vi.fn((command: string, args: string[]) => {
        const outDir = args[args.indexOf("--outDir") + 1];
        const moduleDir = join(outDir, "packages/providers/byok/gemini/src");
        mkdirSync(moduleDir, { recursive: true });
        writeFileSync(
          join(moduleDir, "live-proof.js"),
          "export async function runGeminiLiveProof(){ return { status: 'external-blocker', provider: 'gemini', summary: 'blocked' }; }",
          "utf8",
        );
        return { status: 0 };
      }),
    }));

    const originalArgv = [...process.argv];
    const originalCi = process.env.CI;
    const originalExitCode = process.exitCode;
    let observedExitCode = 0;
    delete process.env.CI;
    process.exitCode = 0;
    process.argv[1] = scriptPath;

    try {
      await import(`${pathToFileURL(scriptPath).href}?ts=${Date.now()}`);
      observedExitCode = process.exitCode ?? 0;
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("CI", originalCi);
      process.exitCode = originalExitCode;
    }

    expect(prune).toHaveBeenCalledTimes(2);
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"status": "external-blocker"'),
    );
    expect(observedExitCode).toBe(2);
  });
});
