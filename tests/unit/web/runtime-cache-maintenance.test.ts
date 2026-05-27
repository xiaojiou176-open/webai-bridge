import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

function createWorkspace() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "webai-bridge-runtime-cache-"));
  mkdirSync(join(workspaceRoot, ".runtime-cache"), {
    recursive: true,
  });
  return workspaceRoot;
}

function createMaintenanceEnv(workspaceRoot: string) {
  const externalCacheRoot = join(
    tmpdir(),
    `webai-bridge-external-cache-${workspaceRoot.split("/").at(-1) ?? "test"}`,
  );

  return {
    WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT: externalCacheRoot,
    WEBAI_BRIDGE_CHROME_USER_DATA_DIR: join(
      externalCacheRoot,
      "browser",
      "chrome-user-data",
    ),
    WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
  };
}

function writeRuntimeCacheFile(
  workspaceRoot: string,
  relativePath: string,
  contents = "payload",
) {
  const absolutePath = join(workspaceRoot, relativePath);
  mkdirSync(join(absolutePath, ".."), {
    recursive: true,
  });
  writeFileSync(absolutePath, contents, "utf8");
  return absolutePath;
}

function createBundle(workspaceRoot: string, name: string) {
  const bundlePath = join(
    workspaceRoot,
    ".runtime-cache/browser-debug/bundles",
    name,
  );
  mkdirSync(bundlePath, {
    recursive: true,
  });
  writeFileSync(join(bundlePath, "summary.json"), name, "utf8");
  return bundlePath;
}

function createTransientRuntimeWorkspace(
  workspaceRoot: string,
  prefix: string,
  fileName: string,
) {
  const workspacePath = mkdtempSync(join(workspaceRoot, ".runtime-cache", prefix));
  writeFileSync(join(workspacePath, fileName), "{}", "utf8");
  return workspacePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("runtime-cache maintenance script", () => {
  it("classifies audit entries and renders stable json/human payloads", async () => {
    const workspaceRoot = createWorkspace();
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
      "browser",
    );
    createBundle(workspaceRoot, "chatgpt-001");
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/browser-support/chatgpt-support-bundle.json",
      "{}",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/temp/web-login-live-proof-a/proof.txt",
      "proof",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/coverage-stable/report.json",
      "{}",
    );

    try {
      const {
        buildRuntimeCacheMaintenancePayload,
        renderRuntimeCacheMaintenancePayload,
      } = await import("../../../scripts/runtime-cache-maintenance.mjs");
      const payload = buildRuntimeCacheMaintenancePayload({
        command: "audit",
        repoRoot: workspaceRoot,
        env: createMaintenanceEnv(workspaceRoot),
      });

      expect(payload).toEqual(
        expect.objectContaining({
          repoRoot: workspaceRoot,
          runtimeCacheRoot: join(workspaceRoot, ".runtime-cache"),
          entries: expect.arrayContaining([
            expect.objectContaining({
              category: "managed-browser-profile",
              defaultAction: "protect",
              exists: true,
            }),
            expect.objectContaining({
              category: "debug-evidence",
              defaultAction: "prune",
              bundleCount: 1,
            }),
            expect.objectContaining({
              category: "support-bundles",
              defaultAction: "prune",
            }),
            expect.objectContaining({
              category: "disposable-generated",
              defaultAction: "delete",
            }),
            expect.objectContaining({
              category: "other-runtime-cache",
              defaultAction: "report-only",
              children: [".runtime-cache/coverage-stable"],
            }),
            expect.objectContaining({
              category: "protected-permanent-browser-root",
              defaultAction: "protect",
            }),
          ]),
          totals: expect.objectContaining({
            runtimeCacheBytes: expect.any(Number),
          }),
          wouldDelete: [],
          blockedReasons: [],
        }),
      );

      const rendered = renderRuntimeCacheMaintenancePayload(payload);
      expect(rendered).toContain("category");
      expect(rendered).toContain(".runtime-cache/webai-bridge-web-auth-browser");
      expect(JSON.parse(JSON.stringify(payload)).entries).toHaveLength(7);
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("parses pnpm-style separators in cleanup and audit invocations", async () => {
    const { parseRuntimeCacheMaintenanceArgs } = await import(
      "../../../scripts/runtime-cache-maintenance.mjs"
    );

    expect(
      parseRuntimeCacheMaintenanceArgs(["audit", "--", "--json"]),
    ).toEqual({
      command: "audit",
      json: true,
      apply: false,
      includeManagedBrowser: false,
    });
    expect(
      parseRuntimeCacheMaintenanceArgs([
        "cleanup",
        "--",
        "--dry-run",
        "--include-managed-browser",
      ]),
    ).toEqual({
      command: "cleanup",
      json: false,
      apply: false,
      includeManagedBrowser: true,
    });
  });

  it("reports cleanup dry-run without mutating temp or protected profile paths", async () => {
    const workspaceRoot = createWorkspace();
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
      "browser",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/temp/web-login-live-proof-a/proof.txt",
      "proof",
    );
    const serviceLogPath = writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/app-service-4020.log",
      "service log",
    );
    const realityGateReportPath = writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/reality-gate.out",
      "{\"status\":\"external-blocker\"}",
    );
    const readyWritebackPath = createTransientRuntimeWorkspace(
      workspaceRoot,
      "webai-bridge-chatgpt-ready-writeback-",
      "local-web-auth-store.json",
    );
    const storePreservePath = createTransientRuntimeWorkspace(
      workspaceRoot,
      "webai-bridge-store-preserve-",
      "verify-web-login-live.store.json",
    );

    for (let index = 0; index < 22; index += 1) {
      createBundle(workspaceRoot, `chatgpt-${`${index}`.padStart(3, "0")}`);
    }

    try {
      const { runRuntimeCacheMaintenance } = await import(
        "../../../scripts/runtime-cache-maintenance.mjs"
      );
      const payload = await runRuntimeCacheMaintenance({
        command: "cleanup",
        repoRoot: workspaceRoot,
        env: createMaintenanceEnv(workspaceRoot),
      });

      expect(payload.apply).toBe(false);
      expect(payload.wouldDelete).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "disposable-generated",
            path: ".runtime-cache/temp",
          }),
          expect.objectContaining({
            category: "disposable-generated",
            path: serviceLogPath.replace(`${workspaceRoot}/`, ""),
            reason: "cleanup-service-log",
          }),
          expect.objectContaining({
            category: "disposable-generated",
            path: realityGateReportPath.replace(`${workspaceRoot}/`, ""),
            reason: "cleanup-reality-gate-report",
          }),
          expect.objectContaining({
            category: "disposable-generated",
            path: readyWritebackPath.replace(`${workspaceRoot}/`, ""),
          }),
          expect.objectContaining({
            category: "disposable-generated",
            path: storePreservePath.replace(`${workspaceRoot}/`, ""),
          }),
        ]),
      );
      expect(
        payload.wouldDelete.filter(
          (entry: any) => entry.category === "debug-evidence",
        ),
      ).toHaveLength(2);
      expect(
        existsSync(join(workspaceRoot, ".runtime-cache/temp/web-login-live-proof-a/proof.txt")),
      ).toBe(true);
      expect(
        existsSync(
          join(
            workspaceRoot,
            ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("applies cleanup by deleting temp and pruning debug bundles while protecting the managed browser by default", async () => {
    const workspaceRoot = createWorkspace();
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
      "browser",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/temp/service-live-proof/apps/service/index.js",
      "compiled",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/browser-support/chatgpt-support-bundle.json",
      "{}",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      "outside-runtime-cache/should-stay.txt",
      "outside",
    );
    const serviceLogPath = writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/app-service-live.log",
      "service log",
    );
    const verifyWorkspacePath = createTransientRuntimeWorkspace(
      workspaceRoot,
      "webai-bridge-verify-web-login-test-",
      "local-web-auth-store.json",
    );

    for (let index = 0; index < 24; index += 1) {
      createBundle(workspaceRoot, `chatgpt-${`${index}`.padStart(3, "0")}`);
    }

    try {
      const { runRuntimeCacheMaintenance } = await import(
        "../../../scripts/runtime-cache-maintenance.mjs"
      );
      const payload = await runRuntimeCacheMaintenance({
        command: "cleanup",
        apply: true,
        repoRoot: workspaceRoot,
        env: createMaintenanceEnv(workspaceRoot),
      });

      expect(payload.deleted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "disposable-generated",
            path: ".runtime-cache/temp",
          }),
        ]),
      );
      expect(existsSync(join(workspaceRoot, ".runtime-cache/temp"))).toBe(false);
      expect(existsSync(serviceLogPath)).toBe(false);
      expect(existsSync(verifyWorkspacePath)).toBe(false);
      expect(
        readdirSync(join(workspaceRoot, ".runtime-cache/browser-debug/bundles")),
      ).toHaveLength(20);
      expect(
        existsSync(
          join(
            workspaceRoot,
            ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
          ),
        ),
      ).toBe(true);
      expect(existsSync(join(workspaceRoot, "outside-runtime-cache/should-stay.txt"))).toBe(
        true,
      );
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("fails closed when include-managed-browser is requested but a listener is still active", async () => {
    const workspaceRoot = createWorkspace();
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
      "browser",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/temp/web-login-live-proof-a/proof.txt",
      "proof",
    );

    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === "lsof" && args.includes("-iTCP:39222")) {
        return {
          status: 0,
          stdout: "Google Chrome 47004 yuyifeng 127u IPv4 *:39222 (LISTEN)\n",
        };
      }

      if (command === "lsof") {
        return {
          status: 1,
          stdout: "",
        };
      }

      if (command === "ps") {
        return {
          status: 0,
          stdout: "",
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));

    try {
      const { runRuntimeCacheMaintenance } = await import(
        "../../../scripts/runtime-cache-maintenance.mjs"
      );
      const payload = await runRuntimeCacheMaintenance({
        command: "cleanup",
        apply: true,
        includeManagedBrowser: true,
        repoRoot: workspaceRoot,
      });

      expect(payload.aborted).toBe(true);
      expect(payload.blockedReasons[0]).toContain("port 39222");
      expect(existsSync(join(workspaceRoot, ".runtime-cache/temp"))).toBe(true);
      expect(
        existsSync(
          join(
            workspaceRoot,
            ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("deletes the managed browser profile only when include-managed-browser is explicit and safety checks are clean", async () => {
    const workspaceRoot = createWorkspace();
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/webai-bridge-web-auth-browser/Default/Preferences",
      "browser",
    );
    writeRuntimeCacheFile(
      workspaceRoot,
      ".runtime-cache/temp/gemini-live-proof/packages/providers/output.js",
      "compiled",
    );

    const spawnSync = vi.fn((command: string) => {
      if (command === "lsof") {
        return {
          status: 1,
          stdout: "",
        };
      }

      if (command === "ps") {
        return {
          status: 0,
          stdout: "47004 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n",
        };
      }

      throw new Error(`Unexpected command: ${command}`);
    });

    vi.doMock("node:child_process", () => ({ spawnSync }));

    try {
      const { runRuntimeCacheMaintenance } = await import(
        "../../../scripts/runtime-cache-maintenance.mjs"
      );
      const payload = await runRuntimeCacheMaintenance({
        command: "cleanup",
        apply: true,
        includeManagedBrowser: true,
        repoRoot: workspaceRoot,
      });

      expect(payload.aborted).toBe(false);
      expect(
        payload.deleted.some(
          (entry: any) => entry.category === "managed-browser-profile",
        ),
      ).toBe(true);
      expect(
        existsSync(join(workspaceRoot, ".runtime-cache/webai-bridge-web-auth-browser")),
      ).toBe(false);
      expect(existsSync(join(workspaceRoot, ".runtime-cache/temp"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });
});
