import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("start-local-experience script helpers", () => {
  it("builds the local experience URLs from service and docs ports", async () => {
    const { buildExperienceUrls } = await import(
      "../../../scripts/start-local-experience.mjs"
    );

    expect(
      buildExperienceUrls({
        host: "127.0.0.1",
        servicePort: 4010,
        docsPort: 4185,
      }),
    ).toEqual({
      serviceBaseUrl: "http://127.0.0.1:4010",
      authPortalUrl: "http://127.0.0.1:4010/v1/runtime/auth-portal",
      runtimeDoctorUrl: "http://127.0.0.1:4010/v1/runtime/doctor",
      runtimePlanUrl: "http://127.0.0.1:4010/v1/runtime/plan",
      chatgptWorkbenchUrl:
        "http://127.0.0.1:4010/v1/runtime/providers/chatgpt/debug/workbench",
      docsFrontDoorUrl: "http://127.0.0.1:4185/",
      runtimeControlLedgerUrl: "http://127.0.0.1:4185/runtime-control-ledger.md",
    });
  });

  it("formats a doctor-first local control shell route list", async () => {
    const { buildExperienceUrls, formatReadyExperienceLines } = await import(
      "../../../scripts/start-local-experience.mjs"
    );

    expect(
      formatReadyExperienceLines(
        buildExperienceUrls({
          host: "127.0.0.1",
          servicePort: 4010,
          docsPort: 4185,
        }),
      ),
    ).toEqual([
      "  - Runtime WebUI: http://127.0.0.1:4010/v1/runtime/auth-portal",
      "  - Runtime doctor: http://127.0.0.1:4010/v1/runtime/doctor",
      "  - Runtime plan: http://127.0.0.1:4010/v1/runtime/plan",
      "  - ChatGPT workbench: http://127.0.0.1:4010/v1/runtime/providers/chatgpt/debug/workbench",
      "  - Docs front door: http://127.0.0.1:4185/",
      "  - Doctor-first control ledger: http://127.0.0.1:4185/runtime-control-ledger.md",
      "  - Press Ctrl+C to stop both local servers.",
    ]);
  });

  it("resolves static file paths inside the repo root while rejecting traversal", async () => {
    const { repoRoot, resolveStaticFilePath } = await import(
      "../../../scripts/start-local-experience.mjs"
    );

    expect(resolveStaticFilePath(repoRoot, "/docs/index.html")).toBeTruthy();
    expect(resolveStaticFilePath(repoRoot, "/")).toContain("/docs/index.html");
    expect(resolveStaticFilePath(repoRoot, "/README.md")).toContain("/docs/README.md");
    expect(resolveStaticFilePath(repoRoot, "/first-success.md")).toContain("/docs/first-success.md");
    expect(resolveStaticFilePath(repoRoot, "/public-proof-pack.md")).toContain(
      "/docs/public-proof-pack.md",
    );
    expect(resolveStaticFilePath(repoRoot, "/runtime-control-ledger.md")).toContain(
      "/runtime-control-ledger.md",
    );
    expect(resolveStaticFilePath(repoRoot, "/mcp.md")).toContain("/docs/mcp.md");
    expect(resolveStaticFilePath(repoRoot, "/viewer.html?doc=first-success.md")).toContain(
      "/docs/viewer.html",
    );
    expect(resolveStaticFilePath(repoRoot, "/docs/viewer.html?doc=first-success.md")).toContain(
      "/docs/viewer.html",
    );
    expect(resolveStaticFilePath(repoRoot, "/../package.json")).toBeNull();
  });

  it("mirrors GitHub Pages-style project-site root docs routes when the repo is mounted under a subpath", async () => {
    const { resolveStaticFilePath } = await import(
      "../../../scripts/start-local-experience.mjs"
    );

    const tempRoot = mkdtempSync(join(tmpdir(), "webai-bridge-project-site-"));
    const projectRoot = resolve(tempRoot, "WebaiBridge");
    symlinkSync(process.cwd(), projectRoot, "dir");

    try {
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/")).toContain(
        "/WebaiBridge/docs/index.html",
      );
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/README.md")).toContain(
        "/WebaiBridge/docs/README.md",
      );
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/first-success.md")).toContain(
        "/WebaiBridge/docs/first-success.md",
      );
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/public-proof-pack.md")).toContain(
        "/WebaiBridge/docs/public-proof-pack.md",
      );
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/runtime-control-ledger.md")).toContain(
        "/WebaiBridge/runtime-control-ledger.md",
      );
      expect(resolveStaticFilePath(tempRoot, "/WebaiBridge/mcp.md")).toContain(
        "/WebaiBridge/docs/mcp.md",
      );
    } finally {
      rmSync(tempRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("returns readable content types for docs front door assets", async () => {
    const { getContentType } = await import(
      "../../../scripts/start-local-experience.mjs"
    );

    expect(getContentType("docs/index.html")).toBe("text/html; charset=utf-8");
    expect(getContentType("catalogs/public-surface-catalog.json")).toBe(
      "application/json; charset=utf-8",
    );
    expect(getContentType("docs/first-success.md")).toBe(
      "text/markdown; charset=utf-8",
    );
  });
});
