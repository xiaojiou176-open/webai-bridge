import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { launchChromiumForUiTest } from "../../support/chromium.js";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

const hanRegex = /[\p{Script=Han}]/u;

describe("WebaiBridge docs frontdoor contracts", () => {
  it("keeps the docs frontdoor focused on first-row routes while demoting deeper shelves", () => {
    const docsReadme = read("docs/README.md");

    expect(docsReadme).toContain("This is the public docs map for WebaiBridge.");
    expect(docsReadme).toContain("Treat it like an adoption desk, not a warehouse list");
    expect(docsReadme).toContain("The public first row stays intentionally narrow");
    expect(docsReadme).toContain("docs/api/service-http-reference.md");
    expect(docsReadme).toContain("docs/index.html");
    expect(docsReadme).toContain("docs/media/30-second-overview.md");
    expect(docsReadme).toContain("docs/first-success.md");
    expect(docsReadme).toContain("docs/public-proof-pack.md");
    expect(docsReadme).toContain("docs/public-distribution-ledger.md");
    expect(docsReadme).toContain("docs/runbooks/dev-bootstrap.md");
    expect(docsReadme).toContain("docs/media/README.md");
    expect(docsReadme).toContain("examples/README.md");
    expect(docsReadme).toContain("starter-packs/README.md");
    expect(docsReadme).toContain("docs/compat/README.md");
    expect(docsReadme).toContain("docs/public-surface-support-matrix.md");
    expect(docsReadme).toContain("Use the front row for");
    expect(docsReadme).toContain("Do **not** use this page to flatten:");
    expect(docsReadme).toContain("private maintainer-only shelf");
    expect(docsReadme).toContain("If a new reader cannot decide where to go within a few seconds");
    expect(docsReadme).toContain("use the repo");
    expect(docsReadme).toContain("tree or CLI surfaces");
    expect(docsReadme).not.toContain("docs/host-integration-examples.md");
    expect(docsReadme).not.toContain("docs/compat/codex.md");
    expect(docsReadme).not.toContain("docs/compat/claude-code.md");
    expect(docsReadme).not.toContain("docs/compat/openclaw.md");
    expect(docsReadme).not.toContain("docs/compare/byok-vs-web-login.md");
    expect(docsReadme).not.toContain("docs/compare/webai-bridge-vs-codex.md");
    expect(docsReadme).not.toContain("docs/compare/webai-bridge-vs-claude-code.md");
    expect(docsReadme).not.toContain("docs/compare/webai-bridge-vs-openclaw.md");
    expect(docsReadme).not.toContain("docs/public-surface-catalog.md");
    expect(docsReadme).not.toContain("catalogs/public-surface-catalog.schema.json");
    expect(docsReadme).not.toContain("catalogs/provider-runtime-catalog.json");
    expect(docsReadme).not.toContain("catalogs/compat-target-catalog.json");
    expect(docsReadme).not.toContain("catalogs/builder-kit-catalog.json");
    expect(docsReadme).not.toContain("catalogs/skill-pack-catalog.json");
    expect(docsReadme).not.toContain("catalogs/mcp-tool-catalog.json");
  });

  it("keeps the docs viewer base-path-safe and nested-list aware", () => {
    const viewer = read("docs/viewer.html");

    expect(viewer).toContain('import { mountViewer } from "./viewer-runtime.js";');
    expect(viewer).toContain("mountViewer({");
    expect(viewer).toContain("locationHref: window.location.href");
    expect(viewer).toContain("fetchImpl: window.fetch.bind(window)");
  });

  it("keeps viewer runtime helpers project-site safe and nested-list aware as executable logic", async () => {
    const moduleUrl = new URL("../../../docs/viewer-runtime.js", import.meta.url);
    const { resolveRepoAssetHref, resolveMarkdownHref, renderMarkdown, resolveDocPath, resolveFrontDoorHref } = await import(
      moduleUrl.href
    );

    const viewerHref = "http://127.0.0.1:4185/WebaiBridge/docs/viewer.html?doc=README.md";
    const rootViewerHref = "http://127.0.0.1:4185/WebaiBridge/viewer.html?doc=README.md";

    expect(resolveRepoAssetHref("docs/first-success.md", viewerHref)).toBe(
      "http://127.0.0.1:4185/WebaiBridge/docs/first-success.md",
    );
    expect(
      resolveMarkdownHref("./docs/runbooks/dev-bootstrap.md", "docs/README.md", viewerHref),
    ).toBe("./viewer.html?doc=docs%2Frunbooks%2Fdev-bootstrap.md");
    expect(resolveDocPath("?doc=README.md", viewerHref)).toBe("docs/README.md");
    expect(resolveRepoAssetHref("docs/first-success.md", rootViewerHref)).toBe(
      "http://127.0.0.1:4185/WebaiBridge/first-success.md",
    );
    expect(
      resolveMarkdownHref("./docs/runbooks/dev-bootstrap.md", "docs/README.md", rootViewerHref),
    ).toBe("./viewer.html?doc=runbooks%2Fdev-bootstrap.md");
    expect(resolveFrontDoorHref(rootViewerHref)).toBe("http://127.0.0.1:4185/WebaiBridge/");

    const rendered = renderMarkdown("- top\n  - child\n- next", "docs/README.md", viewerHref);
    expect(rendered).toContain("<ul><li>top<ul><li>child</li></ul></li><li>next</li></ul>");
  });

  it(
    "keeps the docs viewer working from a GitHub Pages-style project-site path",
    async () => {
      const tempRoot = mkdtempSync(resolve(tmpdir(), "webai-bridge-viewer-"));
      const projectRoot = resolve(tempRoot, "WebaiBridge");
      symlinkSync(repoRoot, projectRoot, "dir");

      const { startDocsStaticServer } = await import("../../../scripts/start-local-experience.mjs");
      const server = await startDocsStaticServer({
        rootDir: tempRoot,
        host: "127.0.0.1",
        port: 0,
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected docs viewer test server to expose a TCP port.");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const browser = await launchChromiumForUiTest();
        try {
          const page = await browser.newPage();
          await page.goto(
            `${baseUrl}/WebaiBridge/docs/viewer.html?doc=first-success.md`,
            { waitUntil: "networkidle" },
          );
          expect(await page.locator("#viewer-title").innerText()).toContain("First Success");
          await page.locator("#viewer-content a").first().click();
          await page.waitForLoadState("networkidle");
          expect(page.url()).toContain(
            "/WebaiBridge/docs/viewer.html?doc=docs%2Frunbooks%2Fdev-bootstrap.md",
          );
          expect(await page.locator("#viewer-title").innerText()).toContain("Dev Bootstrap");
        } finally {
          await browser.close();
        }
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it(
    "keeps the root viewer working from a GitHub Pages-style project-site path",
    async () => {
      const tempRoot = mkdtempSync(resolve(tmpdir(), "webai-bridge-root-viewer-"));
      const projectRoot = resolve(tempRoot, "WebaiBridge");
      symlinkSync(repoRoot, projectRoot, "dir");

      const { startDocsStaticServer } = await import("../../../scripts/start-local-experience.mjs");
      const server = await startDocsStaticServer({
        rootDir: tempRoot,
        host: "127.0.0.1",
        port: 0,
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected root viewer test server to expose a TCP port.");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const browser = await launchChromiumForUiTest();
        try {
          const page = await browser.newPage();
          await page.goto(
            `${baseUrl}/WebaiBridge/viewer.html?doc=first-success.md`,
            { waitUntil: "networkidle" },
          );
          expect(await page.locator("#viewer-title").innerText()).toContain("First Success");
          await page.locator("#viewer-content a").first().click();
          await page.waitForLoadState("networkidle");
          expect(page.url()).toContain(
            "/WebaiBridge/viewer.html?doc=runbooks%2Fdev-bootstrap.md",
          );
          expect(await page.locator("#viewer-title").innerText()).toContain("Dev Bootstrap");
          await page.locator("#frontdoor-link").click();
          await page.waitForLoadState("networkidle").catch(() => undefined);
          expect(page.url()).toContain("/WebaiBridge/");
          expect(await page.title()).toContain("WebaiBridge Docs Front Door");
        } finally {
          await browser.close();
        }
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it(
    "keeps the root docs front door working from a GitHub Pages-style project-site path",
    async () => {
      const tempRoot = mkdtempSync(resolve(tmpdir(), "webai-bridge-frontdoor-"));
      const projectRoot = resolve(tempRoot, "WebaiBridge");
      symlinkSync(repoRoot, projectRoot, "dir");

      const { startDocsStaticServer } = await import("../../../scripts/start-local-experience.mjs");
      const server = await startDocsStaticServer({
        rootDir: tempRoot,
        host: "127.0.0.1",
        port: 0,
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected frontdoor test server to expose a TCP port.");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const browser = await launchChromiumForUiTest();
        try {
          const page = await browser.newPage();
          await page.goto(
            `${baseUrl}/WebaiBridge/`,
            { waitUntil: "networkidle" },
          );
          expect(await page.title()).toContain("WebaiBridge Docs Front Door");

          await page.locator('a[href="./first-success.md"]').first().click();
          await page.waitForLoadState("networkidle").catch(() => undefined);
          expect(page.url()).toContain("/WebaiBridge/first-success.md");
          expect((await page.textContent("body")) ?? "").toContain("WebaiBridge Default First Success");

          await page.goto(
            `${baseUrl}/WebaiBridge/`,
            { waitUntil: "networkidle" },
          );
          await page.locator('a[href="./public-proof-pack.md"]').first().click();
          await page.waitForLoadState("networkidle").catch(() => undefined);
          expect(page.url()).toContain("/WebaiBridge/public-proof-pack.md");
          expect((await page.textContent("body")) ?? "").toContain("WebaiBridge Public Proof Pack");

          await page.goto(
            `${baseUrl}/WebaiBridge/`,
            { waitUntil: "networkidle" },
          );
          await page.locator('a[href="./README.md"]').first().click();
          await page.waitForLoadState("networkidle").catch(() => undefined);
          expect(page.url()).toContain("/WebaiBridge/README.md");
          expect((await page.textContent("body")) ?? "").toContain("WebaiBridge Public Docs");
        } finally {
          await browser.close();
        }
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it("keeps the primary public frontdoor English-first while allowing helper-page bilingual support", () => {
    const frontdoorFiles = [
      "README.md",
      "docs/README.md",
      "docs/index.html",
      "docs/media/30-second-overview.md",
      "docs/first-success.md",
      "docs/public-proof-pack.md",
      "docs/public-distribution-ledger.md",
      "docs/public-surface-support-matrix.md",
      "docs/public-surface-catalog.md",
      "docs/compat/README.md",
      "docs/compat/codex.md",
      "docs/compat/claude-code.md",
      "docs/compat/openclaw.md",
      "docs/mcp.md",
      "docs/starter-pack-chooser.md",
      "docs/host-integration-playbooks.md",
      "docs/host-integration-examples.md",
    ];

    for (const relativePath of frontdoorFiles) {
      expect(hanRegex.test(read(relativePath))).toBe(false);
    }

    const readme = read("README.md");
    const docsReadme = read("docs/README.md");
    const i18n = read("docs/i18n.md");

    expect(readme).toContain("English-first");
    expect(docsReadme).toContain("English-first");
    expect(i18n).toContain("English-first");
    expect(i18n).toContain("bilingual helper pages");
    expect(i18n).not.toContain("bilingual developer frontdoor");

    const docsIndex = read("docs/index.html");
    expect(docsIndex).toContain("WebaiBridge Public Docs");
    expect(docsIndex).toContain("Start with what WebaiBridge is, what is proved, and what to try next.");
    expect(docsIndex).toContain("Open first success");
    expect(docsIndex).toContain("Skip to main content");
    expect(docsIndex).toContain("Front door");
    expect(docsIndex).toContain('aria-current="page"');
    expect(docsIndex).not.toContain('href="../index.html"');
    expect(docsIndex).toContain("Support and bootstrap");
    expect(docsIndex).toContain("media shelf");
    expect(docsIndex).toContain('href="./README.md"');
    expect(docsIndex).toContain('href="./public-proof-pack.md"');
    expect(docsIndex).toContain('href="./public-distribution-ledger.md"');
    expect(docsIndex).toContain('href="./api/service-http-reference.md"');
  });

  it("keeps the bootstrap runbook visible but demoted across the public front door", () => {
    const readme = read("README.md");
    const docsReadme = read("docs/README.md");
    const docsIndex = read("docs/index.html");
    const proofPack = read("docs/public-proof-pack.md");
    const supportMatrix = read("docs/public-surface-support-matrix.md");
    const distributionLedger = read("docs/public-distribution-ledger.md");
    const firstSuccess = read("docs/first-success.md");

    expect(readme).toContain("docs/runbooks/dev-bootstrap.md");
    expect(docsReadme).toContain("docs/runbooks/dev-bootstrap.md");
    expect(docsReadme).toContain("Keep these public, but demoted one shelf deeper:");
    expect(docsIndex).toContain("Support and bootstrap");
    expect(docsIndex).toContain("dev bootstrap runbook");
    expect(docsIndex).toContain('href="./first-success.md"');
    expect(docsIndex).toContain('href="./public-proof-pack.md"');
    expect(docsIndex).toContain('href="./public-distribution-ledger.md"');
    expect(docsIndex).toContain('id="bootstrap-runbook"');
    expect(proofPack).toContain("docs/runbooks/dev-bootstrap.md");
    expect(supportMatrix).toContain("docs/runbooks/dev-bootstrap.md");
    expect(distributionLedger).toContain("docs/runbooks/dev-bootstrap.md");
    expect(firstSuccess).toContain("docs/runbooks/dev-bootstrap.md");
    expect(readme).toContain("pnpm run start:local-experience");
    expect(firstSuccess).toContain("pnpm run start:local-experience");
    expect(firstSuccess).toContain("docs front door");
    expect(firstSuccess).toContain("auth-portal");
    expect(firstSuccess).toContain("workbench");
    const faq = read("docs/faq.md");
    expect(faq).toContain("pnpm run start:local-experience");
  });

  it("keeps compat claims explicitly fail-closed instead of full support", () => {
    const codexCompat = read("docs/compat/codex.md");
    const claudeCodeCompat = read("docs/compat/claude-code.md");
    const openclawCompat = read("docs/compat/openclaw.md");
    const mcpDocs = read("docs/mcp.md");
    for (const document of [codexCompat, claudeCodeCompat, openclawCompat]) {
      expect(/`(planned|partial)`/.test(document)).toBe(true);
      expect(document).toContain("thin");
      expect(document.toLowerCase()).toContain("not supported yet");
      expect(document.toLowerCase()).not.toContain("supported now");
    }

    expect(mcpDocs).toContain("read-only stdio MCP server/tool surface on main");
    expect(mcpDocs).toContain("pnpm run webai-bridge:mcp");
  });

  it("keeps MCP docs aligned with the current read-only tool inventory and route map", () => {
    const mcpDocs = read("docs/mcp.md");
    const mcpApi = read("docs/api/mcp-readonly-server.md");
    const catalogJson = JSON.parse(read("catalogs/public-surface-catalog.json")) as {
      mcp: { tools: Array<{ name: string }> };
    };
    const mcpToolNames = catalogJson.mcp.tools.map((tool) => tool.name);

    expect(mcpDocs).toContain("webai-bridge.catalog.starter_pack_index");
    expect(mcpDocs).toContain("webai-bridge.catalog.starter_pack_comparison");
    expect(mcpDocs).toContain("webai-bridge.catalog.starter_pack_chooser");
    expect(mcpDocs).toContain("webai-bridge.catalog.host_playbooks");
    expect(mcpDocs).toContain("webai-bridge.catalog.host_playbook");
    expect(mcpDocs).toContain("webai-bridge.catalog.host_example");
    expect(mcpDocs).toContain("webai-bridge.catalog.host_examples_schema");
    expect(mcpDocs).toContain("webai-bridge.catalog.builder_journeys");
    expect(mcpDocs).toContain("webai-bridge.catalog.keyword_truth");
    expect(mcpDocs).toContain("webai-bridge.catalog.keyword_entry");
    expect(mcpDocs).toContain("webai-bridge.catalog.mcp_tools");
    expect(mcpDocs).toContain("Fastest Route By Question");
    expect(mcpDocs).toContain("read-only");
    expect(mcpDocs).toContain("not an execution brain");

    expect(mcpApi).toContain("webai-bridge.catalog.starter_pack_index");
    expect(mcpApi).toContain("webai-bridge.catalog.starter_pack_comparison_schema");
    expect(mcpApi).toContain("webai-bridge.catalog.starter_pack_chooser");
    expect(mcpApi).toContain("webai-bridge.catalog.host_playbooks");
    expect(mcpApi).toContain("webai-bridge.catalog.host_playbook");
    expect(mcpApi).toContain("webai-bridge.catalog.host_example");
    expect(mcpApi).toContain("webai-bridge.catalog.host_examples_schema");
    expect(mcpApi).toContain("webai-bridge.catalog.builder_journeys_schema");
    expect(mcpApi).toContain("webai-bridge.catalog.keyword_truth_schema");
    expect(mcpApi).toContain("webai-bridge.catalog.keyword_entry");
    expect(mcpApi).toContain("webai-bridge.catalog.mcp_status");
    expect(mcpApi).toContain("webai-bridge.catalog.mcp_tools");
    expect(mcpApi).toContain("Fastest Route By Question");
    expect(mcpApi).toContain("read-only");
    expect(mcpApi).toContain("partial");

    for (const toolName of mcpToolNames) {
      expect(mcpApi).toContain(toolName);
    }
  });

  it("keeps llms.txt pointing at the current docs frontdoor and truth tables", () => {
    const llms = read("llms.txt");

    expect(llms).toContain("docs/README.md");
    expect(llms).toContain("docs/media/30-second-overview.md");
    expect(llms).toContain("docs/first-success.md");
    expect(llms).toContain("docs/public-proof-pack.md");
    expect(llms).toContain("docs/api/service-http-reference.md");
    expect(llms).toContain("docs/api/openapi.yaml");
    expect(llms).toContain("docs/api/sdk-quickstart.md");
    expect(llms).toContain("docs/api/mcp-readonly-server.md");
    expect(llms).toContain("docs/api/error-diagnostics-reference.md");
    expect(llms).toContain("docs/api/web-login-acquisition.md");
    expect(llms).toContain("docs/compat/README.md");
    expect(llms).toContain("docs/public-surface-catalog.md");
    expect(llms).toContain("catalogs/public-surface-catalog.json");
    expect(llms).toContain("examples/README.md");
    expect(llms).toContain("starter-packs/README.md");
    expect(llms).toContain("docs/starter-pack-chooser.md");
    expect(llms).toContain("docs/host-integration-playbooks.md");
    expect(llms).toContain("examples/hosts/index.json");
    expect(llms).toContain("catalogs/provider-runtime-catalog.json");
    expect(llms).toContain("docs/mcp.md");
    expect(llms).toContain("docs/i18n.md");
    expect(llms).toContain("docs/discoverability-keyword-truth.md");
    expect(llms).toContain("catalogs/discoverability-keyword-truth.json");
    expect(llms).not.toContain("docs/host-integration-examples.md");
    expect(llms).not.toContain("design-system/DONOR_ABSORPTION_LEDGER.md");
    expect(llms).not.toContain(".stitch/DESIGN.md");
    expect(llms).toContain(
      "Live verification depends on local end-user credentials and browser session materials",
    );
  });

  it("keeps the README developer frontdoor aligned with truthful compatibility and docs links", () => {
    const readme = read("README.md");

    expect(readme).toContain("One shared provider runtime for AI apps.");
    expect(readme).toContain("English-first");
    expect(readme).toContain("docs/media/30-second-overview.md");
    expect(readme).toContain("docs/media/README.md");
    expect(readme).toContain("docs/first-success.md");
    expect(readme).toContain("docs/public-proof-pack.md");
    expect(readme).toContain("docs/api/service-http-reference.md");
    expect(readme).toContain("docs/api/openapi.yaml");
    expect(readme).toContain("docs/api/mcp-readonly-server.md");
    expect(readme).toContain("docs/api/web-login-acquisition.md");
    expect(readme).toContain("private local maintainer shelf");
    expect(readme).toContain("pnpm run test:coverage");
    expect(readme).toContain("shared provider runtime");
    expect(readme).toContain("read-only MCP descriptor");
    expect(readme).toContain("runtime-diagnostics");
    expect(readme).toContain("Artifact-ready still does **not** mean listed-live");
    expect(readme).toContain("proof / runbook truth");
    expect(readme).toContain("single public router");
    expect(readme).toContain("docs/public-surface-support-matrix.md");
    expect(readme).toContain("examples/README.md");
    expect(readme).toContain("starter-packs/README.md");
    expect(readme).toContain("docs/host-integration-playbooks.md");
    expect(readme).toContain("examples/hosts/README.md");
    expect(readme).toContain("[docs/index.html](./docs/index.html)");
    expect(readme).toContain("private local maintainer shelf");
    expect(readme).not.toContain("docs/shared-provider-runtime.md");
    expect(readme).not.toContain("catalogs/public-surface-catalog.schema.json");
    expect(readme).not.toContain("docs/starter-manifest-examples.md");
    expect(readme).not.toContain("catalogs/starter-manifest-examples.schema.json");
    expect(readme).not.toContain("docs/starter-pack-chooser.md");
    expect(readme).not.toContain("catalogs/starter-pack-comparison.json");
    expect(readme).not.toContain("docs/public-surface-catalog.md");
    expect(readme).not.toContain("docs/compat/README.md");
    expect(readme).not.toContain("docs/mcp.md");
    expect(readme).not.toContain("docs/faq.md");
    expect(readme).not.toContain("docs/glossary.md");
    expect(readme).not.toContain("docs/i18n.md");
    expect(readme).not.toContain("docs/provider-runtime-catalog.md");
    expect(readme).not.toContain("catalogs/provider-runtime-catalog.json");
    expect(readme).not.toContain("catalogs/provider-runtime-catalog.schema.json");
    expect(readme).not.toContain("docs/compat-target-catalog.md");
    expect(readme).not.toContain("catalogs/compat-target-catalog.json");
    expect(readme).not.toContain("catalogs/compat-target-catalog.schema.json");
    expect(readme).not.toContain("catalogs/builder-kit-catalog.json");
    expect(readme).not.toContain("catalogs/builder-kit-catalog.schema.json");
    expect(readme).not.toContain("catalogs/skill-pack-catalog.json");
    expect(readme).not.toContain("catalogs/skill-pack-catalog.schema.json");
    expect(readme).not.toContain("catalogs/discoverability-keyword-truth.json");
    expect(readme).not.toContain("catalogs/discoverability-keyword-truth.schema.json");
    expect(readme).not.toContain("fresh `verify:service-live` 当前停在 `Gemini = user-action-required`");
    expect(readme).not.toContain("workspace external blocker pack");
    expect(readme).not.toContain("bilingual developer frontdoor");
  });

  it("keeps blocker wording and default service port aligned across frontdoor docs", () => {
    const readme = read("README.md");
    const proofPack = read("docs/public-proof-pack.md");
    const openapi = read("docs/api/openapi.yaml");
    const serviceReference = read("docs/api/service-http-reference.md");
    const sdkQuickstart = read("docs/api/sdk-quickstart.md");
    const webLoginAcquisition = read("docs/api/web-login-acquisition.md");

    expect(readme).toContain("Live/browser outcomes are important");
    expect(readme).not.toContain("`Gemini / Grok`");
    expect(proofPack).toContain("workstation-specific");
    expect(proofPack).not.toContain("`Claude`");
    expect(proofPack).not.toContain("current workspace external blocker pack");
    expect(openapi).toContain("http://127.0.0.1:4010");
    expect(openapi).not.toContain("http://127.0.0.1:4317");
    expect(serviceReference).toContain("http://127.0.0.1:4010");
    expect(sdkQuickstart).toContain("http://127.0.0.1:4010");
    expect(webLoginAcquisition).toContain("http://127.0.0.1:4010");
  });

  it("keeps a machine-readable outward catalog linked from frontdoor docs", () => {
    const compatReadme = read("docs/compat/README.md");
    const faq = read("docs/faq.md");
    const catalogJson = JSON.parse(read("catalogs/public-surface-catalog.json"));
    const catalogSchema = JSON.parse(read("catalogs/public-surface-catalog.schema.json"));
    const starterTemplatesJson = JSON.parse(read("catalogs/starter-manifest-templates.json"));
    const starterTemplatesSchema = JSON.parse(read("catalogs/starter-manifest-templates.schema.json"));
    const starterExamplesJson = JSON.parse(read("catalogs/starter-manifest-examples.json"));
    const starterExamplesSchema = JSON.parse(read("catalogs/starter-manifest-examples.schema.json"));
    const starterPackIndexJson = JSON.parse(read("starter-packs/index.json"));
    const starterPackIndexSchema = JSON.parse(read("starter-packs/index.schema.json"));
    const starterPackChooserDoc = read("docs/starter-pack-chooser.md");
    const starterPackChooserJson = JSON.parse(read("catalogs/starter-pack-chooser.json"));
    const starterPackChooserSchema = JSON.parse(read("catalogs/starter-pack-chooser.schema.json"));
    const starterPackComparisonJson = JSON.parse(read("catalogs/starter-pack-comparison.json"));
    const starterPackComparisonSchema = JSON.parse(read("catalogs/starter-pack-comparison.schema.json"));
    const builderJourneysJson = JSON.parse(read("catalogs/builder-journeys.json"));
    const builderJourneysSchema = JSON.parse(read("catalogs/builder-journeys.schema.json"));
    const builderIntentRouterJson = JSON.parse(read("catalogs/builder-intent-router.json"));
    const builderIntentRouterSchema = JSON.parse(read("catalogs/builder-intent-router.schema.json"));
    const publicSurfaceCatalogDoc = read("docs/public-surface-catalog.md");
    const providerRuntimeCatalogDoc = read("docs/provider-runtime-catalog.md");
    const providerRuntimeCatalogJson = JSON.parse(read("catalogs/provider-runtime-catalog.json"));
    const providerRuntimeCatalogSchema = JSON.parse(read("catalogs/provider-runtime-catalog.schema.json"));
    const compatTargetCatalogJson = JSON.parse(read("catalogs/compat-target-catalog.json"));
    const compatTargetCatalogSchema = JSON.parse(read("catalogs/compat-target-catalog.schema.json"));
    const builderKitCatalogJson = JSON.parse(read("catalogs/builder-kit-catalog.json"));
    const builderKitCatalogSchema = JSON.parse(read("catalogs/builder-kit-catalog.schema.json"));
    const skillPackCatalogJson = JSON.parse(read("catalogs/skill-pack-catalog.json"));
    const skillPackCatalogSchema = JSON.parse(read("catalogs/skill-pack-catalog.schema.json"));
    const skillPackRoutesJson = JSON.parse(read("catalogs/skill-pack-routes.json"));
    const skillPackRoutesSchema = JSON.parse(read("catalogs/skill-pack-routes.schema.json"));
    const mcpDocs = read("docs/mcp.md");
    const mcpToolCatalogJson = JSON.parse(read("catalogs/mcp-tool-catalog.json"));
    const mcpToolCatalogSchema = JSON.parse(read("catalogs/mcp-tool-catalog.schema.json"));
    const keywordTruthDoc = read("docs/discoverability-keyword-truth.md");
    const keywordTruthJson = JSON.parse(read("catalogs/discoverability-keyword-truth.json"));
    const keywordTruthSchema = JSON.parse(read("catalogs/discoverability-keyword-truth.schema.json"));
    const hostPlaybooksDoc = read("docs/host-integration-playbooks.md");
    const hostPlaybooksJson = JSON.parse(read("catalogs/host-integration-playbooks.json"));
    const hostPlaybooksSchema = JSON.parse(read("catalogs/host-integration-playbooks.schema.json"));
    const hostExamplesDoc = read("docs/host-integration-examples.md");
    const hostExamplesJson = JSON.parse(read("examples/hosts/index.json"));
    const hostExamplesSchema = JSON.parse(read("examples/hosts/index.schema.json"));

    expect(compatReadme).toContain("docs/compat/codex.md");
    expect(compatReadme).toContain("docs/compat/claude-code.md");
    expect(compatReadme).toContain("docs/compat/openclaw.md");
    expect(compatReadme).toContain("docs/public-distribution-ledger.md");
    expect(compatReadme).toContain("docs/public-surface-catalog.md");
    expect(compatReadme).toContain("docs/README.md");
    expect(compatReadme).toContain("pnpm run webai-bridge:cli -- public-distribution-ledger");
    expect(compatReadme).toContain("pnpm run webai-bridge:cli -- surface-catalog");
    expect(compatReadme).toContain("pnpm run webai-bridge:cli -- compat-target-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- surface-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- surface-catalog-schema");
    expect(faq).toContain("pnpm run webai-bridge:cli -- builder-kits");
    expect(faq).toContain("pnpm run webai-bridge:cli -- skill-packs");
    expect(faq).toContain("pnpm run webai-bridge:cli -- provider-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- provider-catalog-schema");
    expect(faq).toContain("pnpm run webai-bridge:cli -- compat-target-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- compat-target-catalog-schema");
    expect(faq).toContain("catalogs/compat-target-catalog.json");
    expect(faq).toContain("catalogs/compat-target-catalog.schema.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- builder-kit-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- builder-kit-catalog-schema");
    expect(faq).toContain("catalogs/builder-kit-catalog.json");
    expect(faq).toContain("catalogs/builder-kit-catalog.schema.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- skill-pack-catalog");
    expect(faq).toContain("pnpm run webai-bridge:cli -- skill-pack-catalog-schema");
    expect(faq).toContain("catalogs/skill-pack-catalog.json");
    expect(faq).toContain("catalogs/skill-pack-catalog.schema.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-manifests");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-manifests-schema");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-examples");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-examples-schema");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-pack-chooser");
    expect(faq).toContain("catalogs/starter-pack-chooser.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- starter-pack-comparison");
    expect(faq).toContain("catalogs/starter-pack-comparison.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- builder-journeys");
    expect(faq).toContain("catalogs/builder-journeys.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- builder-intent-router");
    expect(faq).toContain("webai-bridge.catalog.builder_intent_router");
    expect(faq).toContain("docs/starter-pack-chooser.md");
    expect(faq).toContain("pnpm run webai-bridge:cli -- keyword-truth");
    expect(faq).toContain("pnpm run webai-bridge:cli -- keyword-truth-schema");
    expect(faq).toContain("pnpm run webai-bridge:cli -- keyword-entry --target webai-bridge-mcp");
    expect(faq).toContain("catalogs/discoverability-keyword-truth.json");
    expect(faq).toContain("catalogs/discoverability-keyword-truth.schema.json");
    expect(faq).toContain("catalogs/builder-intent-router.json");
    expect(faq).toContain("catalogs/builder-intent-router.schema.json");
    expect(providerRuntimeCatalogDoc).toContain("catalogs/provider-runtime-catalog.json");
    expect(providerRuntimeCatalogDoc).toContain("catalogs/provider-runtime-catalog.schema.json");
    expect(providerRuntimeCatalogDoc).toContain("pnpm run webai-bridge:cli -- provider-catalog-schema");
    expect(providerRuntimeCatalogDoc).toContain("webai-bridge.catalog.provider_catalog_schema");
    expect(providerRuntimeCatalogDoc).toContain("providerId + lane");
    expect(providerRuntimeCatalogDoc).toContain("providerId:lane");
    expect(compatReadme).toContain("catalogs/compat-target-catalog.json");
    expect(compatReadme).toContain("catalogs/compat-target-catalog.schema.json");
    expect(compatReadme).toContain("pnpm run webai-bridge:cli -- compat-target-catalog");
    expect(compatReadme).toContain("webai-bridge.catalog.compat_target_catalog");
    expect(compatReadme).toContain("fail-closed");
    expect(mcpDocs).toContain("pnpm run webai-bridge:cli -- mcp-tool-catalog");
    expect(mcpDocs).toContain("catalogs/mcp-tool-catalog.json");
    expect(mcpDocs).toContain("pnpm run webai-bridge:cli -- skill-pack-routes");
    expect(mcpDocs).toContain("webai-bridge.catalog.skill_pack");
    expect(publicSurfaceCatalogDoc).toContain("catalogs/builder-intent-router.json");
    expect(publicSurfaceCatalogDoc).toContain("pnpm run webai-bridge:cli -- builder-intent-router");
    expect(hostPlaybooksDoc).toContain("pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack");
    expect(hostPlaybooksDoc).toContain("webai-bridge.catalog.skill_pack --target runtime-diagnostics-pack");
    expect(hostPlaybooksDoc).toContain("examples/hosts/README.md");
    expect(starterPackChooserDoc).toContain("Use-Case Skill Packs");
    expect(starterPackChooserDoc).not.toContain("current planned pack-local scaffolds");
    expect(starterPackChooserDoc).not.toContain("planned starter shapes");

    for (const entry of [
      {
        scenarioId: "chat-app-runtime-skill",
        comparisonId: "chat-app-runtime-skill",
        packId: "chat-app-runtime-pack",
      },
      {
        scenarioId: "research-copilot-skill",
        comparisonId: "research-copilot-skill",
        packId: "research-copilot-pack",
      },
      {
        scenarioId: "compare-runtime-skill",
        comparisonId: "compare-runtime-skill",
        packId: "compare-runtime-pack",
      },
      {
        scenarioId: "byok-first-safe-skill",
        comparisonId: "byok-first-safe-skill",
        packId: "byok-first-safe-pack",
      },
    ]) {
      expect(starterPackChooserDoc).toContain(entry.packId);
      expect(starterPackChooserDoc).toContain(
        `pnpm run webai-bridge:cli -- skill-pack-route --target ${entry.packId}`,
      );
      expect(hostPlaybooksDoc).toContain(
        `pnpm run webai-bridge:cli -- skill-pack-route --target ${entry.packId}`,
      );
      expect(hostPlaybooksDoc).toContain(
        `webai-bridge.catalog.skill_pack --target ${entry.packId}`,
      );
      expect(starterPackChooserJson.scenarios).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: entry.scenarioId,
            status: "partial",
            recommendedPack: entry.packId,
            bestEntry: `pnpm run webai-bridge:cli -- skill-pack-route --target ${entry.packId}`,
            recommendedDocs: expect.arrayContaining(["docs/host-integration-playbooks.md"]),
          }),
        ]),
      );
      expect(starterPackComparisonJson.comparisons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: entry.comparisonId,
            status: "partial",
            recommendedPack: entry.packId,
            recommendedDocs: expect.arrayContaining(["docs/host-integration-playbooks.md"]),
          }),
        ]),
      );
    }

    expect(starterPackComparisonJson.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "use-case-skill-packs",
          values: expect.arrayContaining([
            expect.objectContaining({
              id: "use-case-skill-pack",
              comparisonIds: expect.arrayContaining([
                "chat-app-runtime-skill",
                "research-copilot-skill",
                "compare-runtime-skill",
                "byok-first-safe-skill",
              ]),
            }),
          ]),
        }),
      ]),
    );
    expect(faq).toContain("webai-bridge.catalog.keyword_truth");
    expect(keywordTruthDoc).toContain("catalogs/discoverability-keyword-truth.json");
    expect(keywordTruthDoc).toContain("pnpm run webai-bridge:cli -- keyword-truth");
    expect(keywordTruthDoc).toContain("webai-bridge.catalog.keyword_truth");
    expect(faq).toContain("pnpm run webai-bridge:cli -- host-playbooks");
    expect(faq).toContain("catalogs/host-integration-playbooks.json");
    expect(faq).toContain("pnpm run webai-bridge:cli -- host-examples");
    expect(faq).toContain("pnpm run webai-bridge:cli -- host-example --target mcp");
    expect(faq).toContain("examples/hosts/index.json");
    expect(hostExamplesDoc).toContain("examples/hosts/index.json");
    expect(hostExamplesDoc).toContain("pnpm run webai-bridge:cli -- host-example --target codex");
    expect(hostExamplesDoc).toContain("examples/hosts/README.md");
    const ajv = new Ajv2020({
      strict: false,
    });
    const validate = ajv.compile(catalogSchema);
    expect(validate(catalogJson)).toBe(true);
    const validateStarterTemplates = ajv.compile(starterTemplatesSchema);
    expect(validateStarterTemplates(starterTemplatesJson)).toBe(true);
    const validateStarterExamples = ajv.compile(starterExamplesSchema);
    expect(validateStarterExamples(starterExamplesJson)).toBe(true);
    const validateStarterPackIndex = ajv.compile(starterPackIndexSchema);
    expect(validateStarterPackIndex(starterPackIndexJson)).toBe(true);
    const validateStarterPackChooser = ajv.compile(starterPackChooserSchema);
    expect(validateStarterPackChooser(starterPackChooserJson)).toBe(true);
    const validateStarterPackComparison = ajv.compile(starterPackComparisonSchema);
    expect(validateStarterPackComparison(starterPackComparisonJson)).toBe(true);
    const validateBuilderJourneys = ajv.compile(builderJourneysSchema);
    expect(validateBuilderJourneys(builderJourneysJson)).toBe(true);
    const validateBuilderIntentRouter = ajv.compile(builderIntentRouterSchema);
    expect(validateBuilderIntentRouter(builderIntentRouterJson)).toBe(true);
    const validateProviderRuntimeCatalog = ajv.compile(providerRuntimeCatalogSchema);
    expect(validateProviderRuntimeCatalog(providerRuntimeCatalogJson)).toBe(true);
    const validateCompatTargetCatalog = ajv.compile(compatTargetCatalogSchema);
    expect(validateCompatTargetCatalog(compatTargetCatalogJson)).toBe(true);
    const validateBuilderKitCatalog = ajv.compile(builderKitCatalogSchema);
    expect(validateBuilderKitCatalog(builderKitCatalogJson)).toBe(true);
    const validateSkillPackCatalog = ajv.compile(skillPackCatalogSchema);
    expect(validateSkillPackCatalog(skillPackCatalogJson)).toBe(true);
    const validateSkillPackRoutes = ajv.compile(skillPackRoutesSchema);
    expect(validateSkillPackRoutes(skillPackRoutesJson)).toBe(true);
    const validateKeywordTruth = ajv.compile(keywordTruthSchema);
    expect(validateKeywordTruth(keywordTruthJson)).toBe(true);
    const validateHostPlaybooks = ajv.compile(hostPlaybooksSchema);
    expect(validateHostPlaybooks(hostPlaybooksJson)).toBe(true);
    const validateHostExamples = ajv.compile(hostExamplesSchema);
    expect(validateHostExamples(hostExamplesJson)).toBe(true);
    expect(catalogJson.publicSurfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "CLI",
          status: "partial",
          commands: expect.arrayContaining([
            "surface-catalog-schema",
            "compat-target-catalog",
            "compat-target-catalog-schema",
            "builder-kit-catalog",
            "builder-kit-catalog-schema",
            "skill-pack-catalog",
            "skill-pack-catalog-schema",
            "skill-pack-routes",
            "skill-pack-routes-schema",
            "skill-pack-route",
            "provider-catalog",
            "starter-manifests",
            "starter-manifests-schema",
            "starter-examples",
            "starter-examples-schema",
            "starter-pack-index",
            "starter-pack-index-schema",
            "starter-pack-entry",
            "host-playbooks",
            "host-playbooks-schema",
            "host-playbook",
            "host-examples",
            "host-examples-schema",
            "host-example",
            "starter-pack-chooser",
            "starter-pack-chooser-schema",
            "starter-pack-scenario",
            "starter-pack-comparison",
            "starter-pack-comparison-schema",
            "starter-pack-filter",
            "builder-journeys",
            "builder-journeys-schema",
            "builder-journey",
            "builder-intent-router",
            "builder-intent-router-schema",
            "builder-intent",
            "keyword-truth",
            "keyword-truth-schema",
            "keyword-entry",
            "provider-catalog-schema",
            "mcp-tool-catalog",
            "mcp-tool-catalog-schema",
            "mcp-tool",
            "builder-template",
            "builder-example",
            "skill-template",
            "skill-example",
          ]),
        }),
        expect.objectContaining({ surface: "MCP", status: "partial" }),
      ]),
    );
    expect(catalogJson.builderKits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "codex", copyReadyPackPath: "starter-packs/builders/codex" }),
        expect.objectContaining({ target: "claude-code", copyReadyPackPath: "starter-packs/builders/claude-code" }),
        expect.objectContaining({ target: "openclaw", copyReadyPackPath: "starter-packs/builders/openclaw" }),
        expect.objectContaining({ target: "mcp", copyReadyPackPath: "starter-packs/builders/mcp" }),
      ]),
    );
    expect(catalogJson.skillPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime-diagnostics-pack",
          copyReadyPackPath: "starter-packs/skills/runtime-diagnostics-pack",
          routeCommand: "pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack",
        }),
        expect.objectContaining({
          id: "docs-seo-sync-pack",
          copyReadyPackPath: "starter-packs/skills/docs-seo-sync-pack",
          routeMcpTool: "webai-bridge.catalog.skill_pack",
        }),
      ]),
    );
    expect(catalogJson.hostExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "codex",
          examplePath: "examples/hosts/codex",
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target codex",
          smokeCommand: "pnpm run example:host-codex",
          firstSuccessCheck: expect.any(String),
        }),
        expect.objectContaining({ target: "claude-code", examplePath: "examples/hosts/claude-code" }),
        expect.objectContaining({ target: "openclaw", examplePath: "examples/hosts/openclaw" }),
        expect.objectContaining({
          target: "mcp",
          examplePath: "examples/hosts/mcp",
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target mcp",
          smokeCommand: "pnpm run example:host-mcp",
          firstSuccessCheck: expect.any(String),
        }),
      ]),
    );
    expect(catalogJson.providerCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: "chatgpt", lane: "web-login" }),
        expect.objectContaining({ providerId: "openai", lane: "byok" }),
      ]),
    );
    expect(providerRuntimeCatalogJson.providers).toEqual(catalogJson.providerCatalog);
    expect(catalogJson.compatTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "codex", status: "partial" }),
        expect.objectContaining({ target: "claude-code", status: "partial" }),
        expect.objectContaining({ target: "openclaw", status: "partial" }),
      ]),
    );
    expect(compatTargetCatalogJson.targets).toEqual(catalogJson.compatTargets);
    expect(builderKitCatalogJson.kits).toEqual(catalogJson.builderKits);
    expect(skillPackCatalogJson.packs).toEqual(catalogJson.skillPacks);
    expect(catalogJson.mcp.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "webai-bridge.catalog.compat_target_catalog" }),
        expect.objectContaining({ name: "webai-bridge.catalog.compat_target_catalog_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_kit_catalog" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_kit_catalog_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.skill_pack_catalog" }),
        expect.objectContaining({ name: "webai-bridge.catalog.skill_pack_catalog_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_manifests_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_examples_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_index" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_entry" }),
        expect.objectContaining({ name: "webai-bridge.catalog.host_playbooks" }),
        expect.objectContaining({ name: "webai-bridge.catalog.host_playbook" }),
        expect.objectContaining({ name: "webai-bridge.catalog.host_examples" }),
        expect.objectContaining({ name: "webai-bridge.catalog.host_example" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_chooser" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_scenario" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_comparison" }),
        expect.objectContaining({ name: "webai-bridge.catalog.starter_pack_filter" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_journeys" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_journey" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_intent_router" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_intent_router_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.builder_intent" }),
        expect.objectContaining({ name: "webai-bridge.catalog.keyword_truth" }),
        expect.objectContaining({ name: "webai-bridge.catalog.keyword_truth_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.keyword_entry" }),
        expect.objectContaining({ name: "webai-bridge.catalog.provider_catalog_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.mcp_tool_catalog" }),
        expect.objectContaining({ name: "webai-bridge.catalog.mcp_tool_catalog_schema" }),
        expect.objectContaining({ name: "webai-bridge.catalog.mcp_tool" }),
      ]),
    );
    const validateMcpToolCatalog = ajv.compile(mcpToolCatalogSchema);
    expect(validateMcpToolCatalog(mcpToolCatalogJson)).toBe(true);
    expect(mcpToolCatalogJson.tools).toEqual(catalogJson.mcp.tools);
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.compat_targets")
        ?.route,
    ).toBe("catalogs/compat-target-catalog.json#targets");
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.compat_target")
        ?.route,
    ).toBe("catalogs/compat-target-catalog.json#targets[target]");
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.builder_kits")
        ?.route,
    ).toBe("catalogs/builder-kit-catalog.json#kits");
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.builder_kit")
        ?.route,
    ).toBe("catalogs/builder-kit-catalog.json#kits[target]");
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.skill_packs")
        ?.route,
    ).toBe("catalogs/skill-pack-catalog.json#packs");
    expect(
      mcpToolCatalogJson.tools.find((tool: { name: string; route: string }) => tool.name === "webai-bridge.catalog.skill_pack")
        ?.route,
    ).toBe("catalogs/skill-pack-catalog.json#packs[id]");
    expect(new Set(mcpToolCatalogJson.tools.map((tool: { name: string }) => tool.name)).size).toBe(
      mcpToolCatalogJson.tools.length,
    );
    expect(skillPackRoutesJson.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime-diagnostics-pack",
          packPath: "starter-packs/skills/runtime-diagnostics-pack",
          recommendedMcpTools: expect.arrayContaining([
            "webai-bridge.catalog.skill_pack",
            "webai-bridge.provider.support_bundle",
          ]),
        }),
        expect.objectContaining({
          id: "docs-seo-sync-pack",
          recommendedCliCommands: expect.arrayContaining([
            "pnpm run webai-bridge:cli -- keyword-truth --json",
          ]),
        }),
      ]),
    );
    expect(builderIntentRouterJson.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "support-truth", firstHopDoc: "docs/public-surface-catalog.md" }),
        expect.objectContaining({ id: "keyword-claim-truth", firstHopDoc: "docs/discoverability-keyword-truth.md" }),
        expect.objectContaining({ id: "inspect-read-only-mcp", firstHopDoc: "docs/mcp.md" }),
        expect.objectContaining({
          id: "pick-use-case-skill-pack",
          firstHopDoc: "docs/starter-pack-chooser.md",
          firstHopCli: "pnpm run webai-bridge:cli -- starter-pack-chooser",
          firstHopMcp: "webai-bridge.catalog.starter_pack_chooser",
          relatedDocs: expect.arrayContaining([
            "docs/host-integration-playbooks.md",
            "catalogs/starter-pack-comparison.json",
          ]),
        }),
        expect.objectContaining({
          id: "activate-skill-pack",
          firstHopCli: "pnpm run webai-bridge:cli -- skill-pack-routes",
          firstHopMcp: "webai-bridge.catalog.skill_packs",
        }),
      ]),
    );
    expect(keywordTruthJson.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "webai-bridge-shared-provider-runtime", truthStatus: "claimable-now" }),
        expect.objectContaining({ id: "byok", truthStatus: "claimable-now" }),
        expect.objectContaining({ id: "web-login", truthStatus: "claimable-now" }),
        expect.objectContaining({ id: "service-first-ai-runtime", truthStatus: "claimable-now" }),
        expect.objectContaining({ id: "api-substrate-first", truthStatus: "claimable-now" }),
        expect.objectContaining({ id: "webai-bridge-mcp", truthStatus: "partial-with-label" }),
        expect.objectContaining({
          id: "webai-bridge-mcp",
          requiredLabels: expect.arrayContaining([
            "not full Codex / Claude Code backend parity",
          ]),
        }),
        expect.objectContaining({ id: "mcp-execution-backend", truthStatus: "not-claimable" }),
      ]),
    );
    expect(starterPackIndexJson.builderPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "codex", kind: "builder" }),
        expect.objectContaining({ target: "mcp", kind: "builder" }),
      ]),
    );
    expect(starterPackIndexJson.skillPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "runtime-diagnostics-pack", kind: "skill" }),
        expect.objectContaining({ id: "docs-seo-sync-pack", kind: "skill" }),
      ]),
    );
    expect(starterPackChooserJson.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "codex-builder", recommendedPack: "codex" }),
        expect.objectContaining({ id: "mcp-inspector", recommendedPack: "mcp" }),
      ]),
    );
    expect(starterPackComparisonJson.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "thin-runtime-bridges" }),
        expect.objectContaining({ id: "read-only-truth" }),
      ]),
    );
    expect(starterPackComparisonJson.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "codex-builder", recommendedPack: "codex" }),
        expect.objectContaining({ id: "docs-seo-sync-skill", recommendedPack: "docs-seo-sync-pack" }),
      ]),
    );
    expect(builderJourneysJson.journeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "codex-first-success", runnableCommand: "pnpm run example:host-codex" }),
        expect.objectContaining({ id: "docs-seo-truth-sync", runnableCommand: "pnpm run starter-pack:docs-seo-sync-pack" }),
      ]),
    );
    expect(hostPlaybooksJson.playbooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: "codex", recommendedPack: "codex" }),
        expect.objectContaining({ host: "mcp", recommendedPack: "mcp" }),
      ]),
    );
    expect(hostExamplesJson.hostExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "codex", examplePath: "examples/hosts/codex" }),
        expect.objectContaining({ target: "mcp", examplePath: "examples/hosts/mcp" }),
      ]),
    );
  });
});
