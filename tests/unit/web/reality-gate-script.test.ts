import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function createRepoScopedArtifactDir(prefix: string) {
  const baseDir = join(process.cwd(), ".runtime-cache", "temp");
  mkdirSync(baseDir, {
    recursive: true,
  });
  return mkdtempSync(join(baseDir, prefix));
}

describe("run-reality-gate script", () => {
  it("does not auto-run when imported as a helper module", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-reality-gate.mjs", import.meta.url),
    );
    const spawnSync = vi.fn();
    const runGeminiLiveVerification = vi.fn();
    const runWebLoginLiveVerification = vi.fn();

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.doMock("../../../scripts/verify-gemini-live.mjs", () => ({
      runGeminiLiveVerification,
    }));
    vi.doMock("../../../scripts/verify-web-login-live.mjs", () => ({
      runWebLoginLiveVerification,
    }));

    const originalArgv = [...process.argv];
    process.argv[1] = join(process.cwd(), "tests", "helper-import.mjs");

    try {
      await import(pathToFileURL(scriptPath).href);
    } finally {
      process.argv = originalArgv;
    }

    expect(spawnSync).not.toHaveBeenCalled();
    expect(runGeminiLiveVerification).not.toHaveBeenCalled();
    expect(runWebLoginLiveVerification).not.toHaveBeenCalled();
  });

  it("fails closed inside CI before touching repo-owned commands", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-reality-gate.mjs", import.meta.url),
    );
    const spawnSync = vi.fn();

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const originalArgv = [...process.argv];
    const originalCi = process.env.CI;
    process.argv[1] = scriptPath;
    process.env.CI = "true";

    try {
      await expect(import(pathToFileURL(scriptPath).href)).rejects.toThrow(
        "credentialed-workstation only",
      );
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("CI", originalCi);
    }

    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("skips live verification when an internal gate step already failed", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-reality-gate.mjs", import.meta.url),
    );
    const runLightweightRuntimePrune = vi.fn();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 2 })
      .mockReturnValueOnce({ status: 0 });
    const runGeminiLiveVerification = vi.fn(async () => ({ status: "success" }));
    const runWebLoginLiveVerification = vi.fn(async () => [
      {
        status: "success",
        provider: "chatgpt",
      },
    ]);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);
    const artifactDir = createRepoScopedArtifactDir("webai-bridge-reality-gate-");

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.doMock("../../../scripts/verify-gemini-live.mjs", () => ({
      runGeminiLiveVerification,
    }));
    vi.doMock("../../../scripts/verify-web-login-live.mjs", () => ({
      runWebLoginLiveVerification,
    }));
    vi.doMock("../../../scripts/runtime-cache-maintenance.mjs", () => ({
      runLightweightRuntimePrune,
    }));

    const originalArgv = [...process.argv];
    const originalArtifactDir = process.env.WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR;
    const originalCi = process.env.CI;
    const originalGithubActions = process.env.GITHUB_ACTIONS;
    process.argv[1] = scriptPath;
    process.env.WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR = artifactDir;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;

    try {
      await expect(
        import(pathToFileURL(scriptPath).href),
      ).rejects.toThrow("EXIT:1");
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR", originalArtifactDir);
      restoreOptionalEnv("CI", originalCi);
      restoreOptionalEnv("GITHUB_ACTIONS", originalGithubActions);
      rmSync(artifactDir, {
        recursive: true,
        force: true,
      });
    }

    expect(runGeminiLiveVerification).not.toHaveBeenCalled();
    expect(runWebLoginLiveVerification).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["typecheck"],
      expect.objectContaining({
        cwd: expect.stringContaining("/WebaiBridge"),
        env: process.env,
        stdio: "inherit",
      }),
    );
    expect(runLightweightRuntimePrune).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRoot: expect.stringContaining("/WebaiBridge"),
        env: process.env,
      }),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"overallStatus": "failure"'),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"exitCode": 2'),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"reason": "internal-gate-failed"'),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"webLogin": []'),
    );
    expect(processExit).toHaveBeenCalledWith(1);
  });

  it("runs live verification and exits with external-blocker when internal gates pass", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-reality-gate.mjs", import.meta.url),
    );
    const runLightweightRuntimePrune = vi.fn();
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const runGeminiLiveVerification = vi.fn(async () => ({
      status: "external-blocker",
      provider: "gemini",
      blocker: "missing-gemini-api-key",
      classification: "session-material-missing",
      missingEnvNames: ["GEMINI_API_KEY"],
      rerunCommand: "pnpm exec node scripts/verify-gemini-live.mjs",
    }));
    const runWebLoginLiveVerification = vi.fn(async () => [
      {
        status: "success",
        provider: "chatgpt",
      },
      {
        status: "external-blocker",
        provider: "claude",
        blocker: "claude-blocked",
        classification: "session-incomplete",
        persistenceAudit: {
          workspaceClassification: "session-incomplete",
        },
      },
    ]);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);
    const artifactDir = createRepoScopedArtifactDir("webai-bridge-reality-gate-");

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.doMock("../../../scripts/verify-gemini-live.mjs", () => ({
      runGeminiLiveVerification,
    }));
    vi.doMock("../../../scripts/verify-web-login-live.mjs", () => ({
      runWebLoginLiveVerification,
    }));
    vi.doMock("../../../scripts/runtime-cache-maintenance.mjs", () => ({
      runLightweightRuntimePrune,
    }));

    const originalArgv = [...process.argv];
    const originalArtifactDir = process.env.WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR;
    const originalCi = process.env.CI;
    const originalGithubActions = process.env.GITHUB_ACTIONS;
    process.argv[1] = scriptPath;
    process.env.WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR = artifactDir;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;

    try {
      await expect(
        import(pathToFileURL(scriptPath).href),
      ).rejects.toThrow("EXIT:2");
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("WEBAI_BRIDGE_REALITY_GATE_ARTIFACT_DIR", originalArtifactDir);
      restoreOptionalEnv("CI", originalCi);
      restoreOptionalEnv("GITHUB_ACTIONS", originalGithubActions);
      rmSync(artifactDir, {
        recursive: true,
        force: true,
      });
    }

    expect(runGeminiLiveVerification).toHaveBeenCalledTimes(1);
    expect(runWebLoginLiveVerification).toHaveBeenCalledTimes(1);
    expect(runLightweightRuntimePrune).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        repoRoot: expect.stringContaining("/WebaiBridge"),
        env: process.env,
      }),
    );
    expect(runLightweightRuntimePrune).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        repoRoot: expect.stringContaining("/WebaiBridge"),
        env: process.env,
      }),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"overallStatus": "external-blocker"'),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"workspaceClassificationCounts"'),
    );
    expect(processExit).toHaveBeenCalledWith(2);
  });

  it("persists the final report and exit code into runtime-cache artifacts", async () => {
    const mkdirSync = vi.fn();
    const writeFileSync = vi.fn();

    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();

      return {
        ...actual,
        mkdirSync,
        writeFileSync,
      };
    });

    const { persistRealityGateReport } = await import(
      "../../../scripts/run-reality-gate.mjs"
    );

    persistRealityGateReport(
      {
        exitCode: 0,
        overallStatus: "success",
      },
      {},
    );

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".runtime-cache"),
      expect.objectContaining({ recursive: true }),
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("reality-gate.out"),
      expect.stringContaining('"overallStatus": "success"'),
      "utf8",
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("reality-gate.exit"),
      "0\n",
      "utf8",
    );
  });

  it("logs progress only for staged events and returns real web-login results", async () => {
    const { runWebLoginReality } = await import("../../../scripts/run-reality-gate.mjs");
    const logProgress = vi.fn();
    const runWebLoginLiveVerificationFn = vi.fn(async ({ onProgress }) => {
      onProgress({
        provider: "chatgpt",
      });
      onProgress({
        provider: "chatgpt",
        stage: "invoke-proof",
        summary: "assistant token observed",
      });

      return [
        {
          status: "success",
          provider: "chatgpt",
        },
      ];
    });

    const result = await runWebLoginReality({
      env: {},
      logProgress,
      runWebLoginLiveVerificationFn,
    });

    expect(runWebLoginLiveVerificationFn).toHaveBeenCalledTimes(1);
    expect(logProgress).toHaveBeenCalledTimes(1);
    expect(logProgress).toHaveBeenCalledWith(
      "[reality:gate] [web-login] [chatgpt] invoke-proof -> assistant token observed",
    );
    expect(result).toEqual([
      {
        status: "success",
        provider: "chatgpt",
      },
    ]);
  });

  it("logs staged events without inventing provider or summary labels", async () => {
    const { runWebLoginReality } = await import("../../../scripts/run-reality-gate.mjs");
    const logProgress = vi.fn();
    const runWebLoginLiveVerificationFn = vi.fn(async ({ onProgress }) => {
      onProgress({
        stage: "provider-start",
      });

      return [
        {
          status: "success",
          provider: "chatgpt",
        },
      ];
    });

    const result = await runWebLoginReality({
      env: {},
      logProgress,
      runWebLoginLiveVerificationFn,
    });

    expect(runWebLoginLiveVerificationFn).toHaveBeenCalledTimes(1);
    expect(logProgress).toHaveBeenCalledTimes(1);
    expect(logProgress).toHaveBeenCalledWith(
      "[reality:gate] [web-login] provider-start",
    );
    expect(result).toEqual([
      {
        status: "success",
        provider: "chatgpt",
      },
    ]);
  });

  it("maps aggregate web-login crashes into a fail-closed blocker-shaped result", async () => {
    const { runWebLoginReality } = await import("../../../scripts/run-reality-gate.mjs");

    const result = await runWebLoginReality({
      env: {},
      runWebLoginLiveVerificationFn: vi.fn(async () => {
        throw new Error("aggregate crash");
      }),
    });

    expect(result).toEqual([
      {
        status: "failure",
        provider: "web-login-aggregate",
        reason: "probe-request-failed",
        classification: "transport-instability",
        diagnostic: "aggregate crash",
        summary: "web-login aggregate reality rerun failed before producing a stable result.",
      },
    ]);
  });

  it("falls back to the default diagnostic when the aggregate crash is not an Error instance", async () => {
    const { runWebLoginReality } = await import("../../../scripts/run-reality-gate.mjs");

    const result = await runWebLoginReality({
      env: {},
      runWebLoginLiveVerificationFn: vi.fn(async () => {
        throw "aggregate crash";
      }),
    });

    expect(result).toEqual([
      {
        status: "failure",
        provider: "web-login-aggregate",
        reason: "probe-request-failed",
        classification: "transport-instability",
        diagnostic: "web-login aggregate reality rerun threw an unknown error.",
        summary: "web-login aggregate reality rerun failed before producing a stable result.",
      },
    ]);
  });

  it("throws child-process errors instead of swallowing them", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-reality-gate.mjs", import.meta.url),
    );
    const spawnSync = vi.fn(() => ({
      status: 0,
      error: new Error("spawn blew up"),
    }));
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);

    vi.doMock("node:child_process", () => ({ spawnSync }));
    vi.doMock("../../../scripts/runtime-cache-maintenance.mjs", () => ({
      runLightweightRuntimePrune: vi.fn(),
    }));

    const originalArgv = [...process.argv];
    const originalCi = process.env.CI;
    const originalGithubActions = process.env.GITHUB_ACTIONS;
    process.argv[1] = scriptPath;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;

    try {
      await expect(import(pathToFileURL(scriptPath).href)).rejects.toThrow(
        "spawn blew up",
      );
    } finally {
      process.argv = originalArgv;
      restoreOptionalEnv("CI", originalCi);
      restoreOptionalEnv("GITHUB_ACTIONS", originalGithubActions);
    }

    expect(processExit).not.toHaveBeenCalled();
  });
});
