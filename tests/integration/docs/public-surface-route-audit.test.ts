import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const publicSurfaceCases = [
  {
    label: "frontdoor-root",
    path: "/",
    expectedContentType: "text/html",
    expectedSnippet: "WebaiBridge Docs Front Door",
  },
  {
    label: "docs-atlas",
    path: "/README.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Docs",
  },
  {
    label: "first-success",
    path: "/first-success.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Default First Success",
  },
  {
    label: "proof-pack",
    path: "/public-proof-pack.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Proof Pack",
  },
  {
    label: "distribution-ledger",
    path: "/public-distribution-ledger.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Distribution Ledger",
  },
  {
    label: "support-matrix",
    path: "/public-surface-support-matrix.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Surface Support Matrix",
  },
  {
    label: "api-reference",
    path: "/api/service-http-reference.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Service HTTP Reference",
  },
  {
    label: "sdk-quickstart",
    path: "/api/sdk-quickstart.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge SDK Quickstart",
  },
  {
    label: "mcp-readonly-server",
    path: "/api/mcp-readonly-server.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Read-only MCP Server",
  },
  {
    label: "web-login-acquisition",
    path: "/api/web-login-acquisition.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "Web/Login Acquisition API",
  },
  {
    label: "error-diagnostics",
    path: "/api/error-diagnostics-reference.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Error and Diagnostics Reference",
  },
  {
    label: "openapi",
    path: "/api/openapi.yaml",
    expectedContentType: "yaml",
    expectedSnippet: "openapi: 3.1.0",
  },
  {
    label: "codex-compat",
    path: "/compat/codex.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge for Codex",
  },
  {
    label: "claude-code-compat",
    path: "/compat/claude-code.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge for Claude Code",
  },
  {
    label: "openclaw-compat",
    path: "/compat/openclaw.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge for OpenClaw",
  },
  {
    label: "mcp-frontdoor",
    path: "/mcp.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge MCP Status",
  },
  {
    label: "compat-hub",
    path: "/compat/README.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Compatibility Matrix",
  },
  {
    label: "30-second-overview",
    path: "/media/30-second-overview.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge 30-Second Overview",
  },
  {
    label: "media-shelf",
    path: "/media/README.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Media Shelf",
  },
  {
    label: "bootstrap-runbook",
    path: "/runbooks/dev-bootstrap.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Dev Bootstrap",
  },
  {
    label: "faq",
    path: "/faq.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge FAQ",
  },
  {
    label: "glossary",
    path: "/glossary.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Glossary",
  },
  {
    label: "i18n",
    path: "/i18n.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Language Strategy",
  },
  {
    label: "host-playbooks",
    path: "/host-integration-playbooks.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Builder Integration Hub",
  },
  {
    label: "host-examples",
    path: "/host-integration-examples.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Host Example Foyer",
  },
  {
    label: "provider-runtime-catalog",
    path: "/provider-runtime-catalog.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Provider Runtime Directory",
  },
  {
    label: "public-surface-catalog",
    path: "/public-surface-catalog.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Public Surface Catalog",
  },
  {
    label: "starter-pack-chooser",
    path: "/starter-pack-chooser.md",
    expectedContentType: "text/markdown",
    expectedSnippet: "WebaiBridge Starter Pack Chooser",
  },
  {
    label: "viewer-first-success",
    path: "/viewer.html?doc=first-success.md",
    expectedContentType: "text/html",
    expectedSnippet: "WebaiBridge Docs Viewer",
  },
  {
    label: "viewer-docs-atlas",
    path: "/viewer.html?doc=README.md",
    expectedContentType: "text/html",
    expectedSnippet: "WebaiBridge Docs Viewer",
  },
] as const;

describe("public surface route audit", () => {
  it(
    "keeps root-path and project-site public docs routes reachable and non-empty",
    async () => {
      const { startDocsStaticServer } = await import("../../../scripts/start-local-experience.mjs");

      const rootServer = await startDocsStaticServer({
        rootDir: repoRoot,
        host: "127.0.0.1",
        port: 4185,
      });

      const tempRoot = mkdtempSync(resolve(tmpdir(), "webai-bridge-public-surface-"));
      const projectRoot = resolve(tempRoot, "WebaiBridge");
      symlinkSync(repoRoot, projectRoot, "dir");

      const projectSiteServer = await startDocsStaticServer({
        rootDir: tempRoot,
        host: "127.0.0.1",
        port: 4186,
      });

      const checkPath = async (
        baseUrl: string,
        path: string,
        expectedContentType: string,
        expectedSnippet: string,
      ) => {
        const response = await fetch(`${baseUrl}${path}`);
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type") ?? "").toContain(expectedContentType);
        expect(body).toContain(expectedSnippet);
      };

      try {
        for (const testCase of publicSurfaceCases) {
          await checkPath(
            "http://127.0.0.1:4185",
            testCase.path,
            testCase.expectedContentType,
            testCase.expectedSnippet,
          );
          await checkPath(
            "http://127.0.0.1:4186",
            `/WebaiBridge${testCase.path === "/" ? "/" : testCase.path}`,
            testCase.expectedContentType,
            testCase.expectedSnippet,
          );
        }
      } finally {
        await new Promise<void>((resolveClose) => rootServer.close(() => resolveClose()));
        await new Promise<void>((resolveClose) => projectSiteServer.close(() => resolveClose()));
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
