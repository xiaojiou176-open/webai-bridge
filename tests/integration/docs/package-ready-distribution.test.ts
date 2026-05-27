import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function readJson<T>(relativePath: string) {
  return JSON.parse(read(relativePath)) as T;
}

describe("package-ready public distribution surfaces", () => {
  it("keeps the public distribution ledger linked from the frontdoor docs", () => {
    const rootReadme = read("README.md");
    const docsReadme = read("docs/README.md");
    const publicSurfaceCatalog = read("docs/public-surface-catalog.md");
    const compatReadme = read("docs/compat/README.md");

    expect(rootReadme).toContain("docs/public-distribution-ledger.md");
    expect(docsReadme).toContain("docs/public-distribution-ledger.md");
    expect(publicSurfaceCatalog).toContain("public-distribution-ledger");
    expect(compatReadme).toContain("public-distribution-ledger");
  });

  it("keeps homepage metadata aligned with the Pages-first public roots", () => {
    const rootManifest = readJson<{ homepage: string }>("package.json");
    const codexManifest = readJson<{ homepage: string }>("packages/consumers/codex/package.json");
    const claudeManifest = readJson<{ homepage: string }>(
      "packages/consumers/claude-code/package.json",
    );
    const openclawManifest = readJson<{ homepage: string }>(
      "packages/consumers/openclaw/package.json",
    );
    const mcpManifest = readJson<{ homepage: string }>("packages/surfaces/mcp/package.json");
    const issueTemplateConfig = read(".github/ISSUE_TEMPLATE/config.yml");

    expect(rootManifest.homepage).toBe("https://xiaojiou176-open.github.io/webai-bridge/");
    expect(codexManifest.homepage).toBe(
      "https://xiaojiou176-open.github.io/webai-bridge/compat/codex.md",
    );
    expect(claudeManifest.homepage).toBe(
      "https://xiaojiou176-open.github.io/webai-bridge/compat/claude-code.md",
    );
    expect(openclawManifest.homepage).toBe(
      "https://xiaojiou176-open.github.io/webai-bridge/compat/openclaw.md",
    );
    expect(mcpManifest.homepage).toBe(
      "https://xiaojiou176-open.github.io/webai-bridge/mcp.md",
    );
    expect(issueTemplateConfig).toContain(
      "https://xiaojiou176-open.github.io/webai-bridge/public-proof-pack.md",
    );
  });

  it("ships package-ready metadata for consumer and MCP surfaces without overclaiming registry publication", () => {
    const packages = [
      {
        path: "packages/consumers/codex/package.json",
        readme: "packages/consumers/codex/README.md",
        name: "@webai-bridge/consumer-codex",
        main: "./dist/packages/consumers/codex/src/index.js",
      },
      {
        path: "packages/consumers/claude-code/package.json",
        readme: "packages/consumers/claude-code/README.md",
        name: "@webai-bridge/consumer-claude-code",
        main: "./dist/packages/consumers/claude-code/src/index.js",
      },
      {
        path: "packages/consumers/openclaw/package.json",
        readme: "packages/consumers/openclaw/README.md",
        name: "@webai-bridge/consumer-openclaw",
        main: "./dist/packages/consumers/openclaw/src/index.js",
      },
      {
        path: "packages/surfaces/mcp/package.json",
        readme: "packages/surfaces/mcp/README.md",
        name: "@webai-bridge/surface-mcp",
        main: "./dist/packages/surfaces/mcp/src/index.js",
      },
    ] as const;

    for (const entry of packages) {
      const manifest = readJson<Record<string, unknown>>(entry.path);
      const packageReadme = read(entry.readme);

      expect(manifest.private).not.toBe(true);
      expect(manifest.publishConfig).toEqual(
        expect.objectContaining({
          access: "public",
        }),
      );
      expect(manifest.main).toBe(entry.main);
      expect(manifest.types).toBe("./src/index.ts");
      expect(manifest.files).toEqual(
        expect.arrayContaining(["dist", "src", "README.md"]),
      );
      expect(packageReadme).toContain(entry.name);
      expect(packageReadme.toLowerCase()).toContain("partial");
      expect(packageReadme.toLowerCase()).toContain("no npm publish claimed yet");
    }

    const mcpManifest = readJson<Record<string, unknown>>(
      "packages/surfaces/mcp/package.json",
    );
    const mcpServerJson = readJson<Record<string, unknown>>(
      "packages/surfaces/mcp/server.json",
    );
    expect(mcpManifest.bin).toEqual(
      expect.objectContaining({
        "webai-bridge-mcp": "./dist/packages/surfaces/mcp/src/cli.js",
      }),
    );
    expect(mcpManifest.mcpName).toBe("io.github.xiaojiou176-open/webai-bridge-mcp");
    expect(existsSync(resolve(repoRoot, "packages/surfaces/mcp/src/cli.ts"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "packages/surfaces/mcp/server.json"))).toBe(true);
    expect(mcpServerJson).toEqual(
      expect.objectContaining({
        name: "io.github.xiaojiou176-open/webai-bridge-mcp",
        title: "WebaiBridge MCP",
        version: "0.1.0",
        repository: expect.objectContaining({
          url: "https://github.com/xiaojiou176-open/webai-bridge",
          source: "github",
        }),
        packages: expect.arrayContaining([
          expect.objectContaining({
            registryType: "npm",
            identifier: "@webai-bridge/surface-mcp",
            version: "0.1.0",
            transport: expect.objectContaining({
              type: "stdio",
            }),
          }),
        ]),
      }),
    );
  });

  it("keeps keyword truth aligned with package-ready names and not-yet-published wording", () => {
    const keywordTruth = readJson<{
      entries: Array<{ term: string; truthStatus: string }>;
    }>("catalogs/discoverability-keyword-truth.json");

    expect(keywordTruth.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: "@webai-bridge/consumer-codex",
          truthStatus: "partial-with-label",
        }),
        expect.objectContaining({
          term: "@webai-bridge/consumer-claude-code",
          truthStatus: "partial-with-label",
        }),
        expect.objectContaining({
          term: "@webai-bridge/consumer-openclaw",
          truthStatus: "partial-with-label",
        }),
        expect.objectContaining({
          term: "@webai-bridge/surface-mcp",
          truthStatus: "partial-with-label",
        }),
        expect.objectContaining({
          term: "@webai-bridge/consumer-codex available on npm now",
          truthStatus: "not-claimable",
        }),
        expect.objectContaining({
          term: "@webai-bridge/surface-mcp available on npm now",
          truthStatus: "not-claimable",
        }),
      ]),
    );

    const distributionLedger = read("docs/public-distribution-ledger.md");
    expect(distributionLedger).toContain("@webai-bridge/consumer-codex");
    expect(distributionLedger).toContain("@webai-bridge/consumer-claude-code");
    expect(distributionLedger).toContain("@webai-bridge/consumer-openclaw");
    expect(distributionLedger).toContain("@webai-bridge/surface-mcp");
    expect(distributionLedger).toContain("no npm publish claimed yet");
    expect(distributionLedger).toContain("packages/surfaces/mcp/server.json");
  });

  it("ships a machine-readable distribution ledger with official-surface-vs-unlisted truth", () => {
    const ledger = readJson<{
      entries: Array<{
        target: string;
        officialPublicSurfaceExists: boolean;
        currentListingStatus: string;
        officialSources: string[];
      }>;
    }>("catalogs/public-distribution-ledger.json");
    const schema = readJson<{
      title: string;
      required: string[];
    }>("catalogs/public-distribution-ledger.schema.json");

    expect(schema.title).toBe("WebaiBridge Public Distribution Ledger");
    expect(schema.required).toEqual(
      expect.arrayContaining(["ledgerVersion", "entries"]),
    );
    expect(ledger.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "codex",
          officialPublicSurfaceExists: true,
          currentListingStatus: "official-surface-exists-unlisted",
          officialSources: expect.arrayContaining([
            "https://developers.openai.com/codex/plugins/build",
          ]),
        }),
        expect.objectContaining({
          target: "claude-code",
          officialPublicSurfaceExists: true,
          currentListingStatus: "official-surface-exists-unlisted",
        }),
        expect.objectContaining({
          target: "openclaw",
          officialPublicSurfaceExists: true,
          currentListingStatus: "official-surface-exists-unlisted",
        }),
        expect.objectContaining({
          target: "mcp",
          officialPublicSurfaceExists: true,
          currentListingStatus: "official-surface-exists-unlisted",
        }),
        expect.objectContaining({
          target: "starter-packs",
          officialPublicSurfaceExists: false,
          currentListingStatus: "public-repo-frontdoor",
        }),
      ]),
    );
  });

  it("ships a marketplace-compatible builder bundle without claiming official listing", () => {
    const marketplaceReadme = read("distribution/claude-marketplace/README.md");
    const marketplace = readJson<{
      name: string;
      plugins: Array<{ source: string; name: string }>;
    }>("distribution/claude-marketplace/.claude-plugin/marketplace.json");
    const pluginManifest = readJson<{
      name: string;
      keywords: string[];
    }>(
      "distribution/claude-marketplace/plugins/webai-bridge-builder-suite/.claude-plugin/plugin.json",
    );
    const pluginReadme = read(
      "distribution/claude-marketplace/plugins/webai-bridge-builder-suite/README.md",
    );
    const runtimeSkill = read(
      "distribution/claude-marketplace/plugins/webai-bridge-builder-suite/skills/runtime-diagnostics/SKILL.md",
    );
    const docsSkill = read(
      "distribution/claude-marketplace/plugins/webai-bridge-builder-suite/skills/docs-seo-sync/SKILL.md",
    );

    expect(marketplaceReadme.toLowerCase()).toContain("marketplace-compatible bundle");
    expect(marketplaceReadme.toLowerCase()).toContain("no official listing claimed yet");
    expect(marketplace.name).toBe("webai-bridge-builder-marketplace");
    expect(marketplace.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "./plugins/webai-bridge-builder-suite",
          name: "webai-bridge-builder-suite",
        }),
      ]),
    );
    expect(pluginManifest).toEqual(
      expect.objectContaining({
        name: "webai-bridge-builder-suite",
        keywords: expect.arrayContaining(["webai-bridge", "claude-code", "openclaw"]),
      }),
    );
    expect(pluginReadme.toLowerCase()).toContain("marketplace-compatible bundle artifact: yes");
    expect(pluginReadme.toLowerCase()).toContain("official listing claimed now: no");
    expect(runtimeSkill).toContain("docs/public-distribution-ledger.md");
    expect(docsSkill).toContain("docs/public-distribution-ledger.md");
  });

  it("ships MCP registry submission materials without overclaiming live listing", () => {
    const mcpManifest = readJson<Record<string, unknown>>("packages/surfaces/mcp/package.json");
    const serverManifest = readJson<{
      name: string;
      packages: Array<{ registryType: string; identifier: string; transport: { type: string } }>;
    }>("packages/surfaces/mcp/server.json");
    const mcpReadme = read("packages/surfaces/mcp/README.md");

    expect(mcpManifest.mcpName).toBe("io.github.xiaojiou176-open/webai-bridge-mcp");
    expect(serverManifest.name).toBe("io.github.xiaojiou176-open/webai-bridge-mcp");
    expect(serverManifest.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          registryType: "npm",
          identifier: "@webai-bridge/surface-mcp",
          transport: expect.objectContaining({
            type: "stdio",
          }),
        }),
      ]),
    );
    expect(mcpReadme.toLowerCase()).toContain("registry submission artifact landed");
    expect(mcpReadme.toLowerCase()).toContain("no npm publish claimed yet");
  });
});
