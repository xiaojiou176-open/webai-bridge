import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";

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

describe("run-pre-push-gate script", () => {
  it("runs child processes without forwarding git hook control variables", async () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const originalGitDir = process.env.GIT_DIR;
    const originalGitWorkTree = process.env.GIT_WORK_TREE;
    process.env.GIT_DIR = "/tmp/webai-bridge-test.git";
    process.env.GIT_WORK_TREE = "/tmp/webai-bridge-test";

    try {
      const { run } = await import("../../../scripts/run-pre-push-gate.mjs");
      run("pnpm", ["typecheck"]);
    } finally {
      restoreOptionalEnv("GIT_DIR", originalGitDir);
      restoreOptionalEnv("GIT_WORK_TREE", originalGitWorkTree);
    }

    expect(spawnSync).toHaveBeenCalledWith(
      "pnpm",
      ["typecheck"],
      expect.objectContaining({
        stdio: ["ignore", "inherit", "inherit"],
        env: expect.not.objectContaining({
          GIT_DIR: expect.any(String),
          GIT_WORK_TREE: expect.any(String),
        }),
      }),
    );
  });

  it("waits for repo-owned vitest processes to drain", async () => {
    const repoRoot = process.cwd();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: `123 ${repoRoot} pnpm exec vitest run tests/unit/web/runtime-request-url.test.ts`,
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      });

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { waitForVitestDrain } = await import("../../../scripts/run-pre-push-gate.mjs");

    await expect(
      waitForVitestDrain({
        timeoutMs: 10,
        pollMs: 0,
      }),
    ).resolves.toBeUndefined();
  });

  it("exits with the child status when a pre-push command fails", async () => {
    const spawnSync = vi.fn(() => ({ status: 7 }));
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { run } = await import("../../../scripts/run-pre-push-gate.mjs");

    expect(() => run("pnpm", ["test"])).toThrow("EXIT:7");
    expect(processExit).toHaveBeenCalledWith(7);
  });

  it("throws the underlying spawn error when the child process cannot be started", async () => {
    const spawnSync = vi.fn(() => ({
      status: 1,
      error: new Error("spawn failed"),
    }));

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { run } = await import("../../../scripts/run-pre-push-gate.mjs");

    expect(() => run("pnpm", ["typecheck"])).toThrow(/spawn failed/i);
  });

  it("throws when repo-owned vitest processes never drain before the timeout", async () => {
    const repoRoot = process.cwd();
    const spawnSync = vi.fn(() => ({
      status: 0,
      stdout: `123 ${repoRoot} pnpm exec vitest run tests/unit/web/runtime-request-url.test.ts`,
    }));

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const { waitForVitestDrain } = await import("../../../scripts/run-pre-push-gate.mjs");

    await expect(
      waitForVitestDrain({
        timeoutMs: 0,
        pollMs: 0,
      }),
    ).rejects.toThrow(/lingering repo-owned Vitest processes/i);
  });

  it("executes the pre-push sequence when invoked as a script", async () => {
    const scriptPath = fileURLToPath(
      new URL("../../../scripts/run-pre-push-gate.mjs", import.meta.url),
    );
    const spawnSync = vi.fn((command: string) => {
      if (command === "pgrep") {
        return {
          status: 1,
          stdout: "",
        };
      }

      return { status: 0 };
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));

    const originalArgv = [...process.argv];
    process.argv[1] = scriptPath;

    try {
      await import(`${pathToFileURL(scriptPath).href}?ts=${Date.now()}`);
    } finally {
      process.argv = originalArgv;
    }

    expect(spawnSync.mock.calls.slice(0, 4)).toEqual([
      [
        "pnpm",
        ["typecheck"],
        expect.objectContaining({
          stdio: ["ignore", "inherit", "inherit"],
        }),
      ],
      [
        "pnpm",
        ["run", "test:coverage"],
        expect.objectContaining({
          stdio: ["ignore", "inherit", "inherit"],
        }),
      ],
      [
        "pnpm",
        ["test"],
        expect.objectContaining({
          stdio: ["ignore", "inherit", "inherit"],
        }),
      ],
      [
        "pnpm",
        ["build"],
        expect.objectContaining({
          stdio: ["ignore", "inherit", "inherit"],
        }),
      ],
    ]);
    expect(spawnSync).toHaveBeenLastCalledWith(
      "pgrep",
      ["-af", "pnpm exec vitest"],
      expect.objectContaining({
        encoding: "utf8",
      }),
    );
  });
});
