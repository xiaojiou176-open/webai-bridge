import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("WebaiBridge docs and design governance drift contracts", () => {
  it("keeps public-plane truth aligned with fail-closed runtime wording", () => {
    const supportMatrix = read("docs/public-surface-support-matrix.md");
    const proofPack = read("docs/public-proof-pack.md");

    expect(supportMatrix).toContain("`API substrate first`");
    expect(supportMatrix).toContain("service/runtime");
    expect(supportMatrix).toContain("`HTTP/API` | `supported now`");
    expect(supportMatrix).toContain("`SDK/client` | `partial`");
    expect(supportMatrix).toContain("`CLI` | `partial`");
    expect(supportMatrix).toContain("`MCP` | `partial`");
    expect(supportMatrix).toContain("read-only");
    expect(supportMatrix).toContain("not an execution brain");
    expect(proofPack).toContain("shared provider runtime for AI apps");
    expect(proofPack).toContain("BYOK + Web/Login");
    expect(proofPack).toContain("partial thin compat");
    expect(proofPack).toContain("partial read-only MCP surface");
    expect(proofPack).toContain("## Forbidden Overclaims");
    expect(proofPack).toContain("`full Codex parity`");
    expect(proofPack).toContain("`full Claude Code parity`");
    expect(proofPack).toContain("`full OpenClaw parity`");
  });

  it("keeps design absorption pinned to the declared donor boundary", () => {
    const stitchDesign = read(".stitch/DESIGN.md");
    const designMaster = read("design-system/MASTER.md");
    const donorLedger = read("design-system/DONOR_ABSORPTION_LEDGER.md");
    const authPortalMaster = read("design-system/webai-bridge-auth-portal/MASTER.md");
    const debugWorkbenchMaster = read("design-system/webai-bridge-debug-cockpit/MASTER.md");

    expect(stitchDesign).toContain("Generated design output must follow:");
    expect(stitchDesign).toContain("`design-system/MASTER.md`");
    expect(stitchDesign).toContain("must not");
    expect(stitchDesign).not.toContain("private maintainer-only design mother strategy contract");

    expect(designMaster).toContain("## Surface Families");
    expect(designMaster).toContain("| Runtime shells | dense-but-calm operator shell |");
    expect(designMaster).toContain("| Public docs/help surfaces | answer-first editorial routing |");
    expect(designMaster).toContain("## Maintainer-Only Detail");
    expect(designMaster).not.toContain("private maintainer-only design mother strategy contract");
    expect(donorLedger).toContain("# WebaiBridge Public Donor Boundary Ledger");
    expect(donorLedger).toContain("| Runtime/operator shells |");
    expect(donorLedger).toContain("| Public docs/help surfaces |");
    expect(donorLedger).not.toContain("| Auth portal shell |");

    expect(authPortalMaster).toContain("| Page shell | `Linear` | dark operational shell, dense-but-calm grouping, border-led structure, sustained readability | no `Mintlify` page shell, no `Raycast` launcher feel as the full page identity |");
    expect(authPortalMaster).toContain("| Quick actions or command-like entrypoints | `Raycast` utility chrome only | keyboard hints, compact quick actions, transient command grammar | must stay secondary to the page shell, must not become the primary navigation model |");
    expect(authPortalMaster).toContain('no "Contact Sales" or "Learn More" style primary CTA');

    expect(debugWorkbenchMaster).toContain("| Page shell | `Linear` | dense-but-calm shell, evidence-first hierarchy, border-led grouping, long-session readability | no `Mintlify` shell, no `Raycast` launcher shell, no glossy cockpit theater |");
    expect(debugWorkbenchMaster).toContain("| Quick actions or overlays | `Raycast` utility chrome only | compact keyboard-first actions, transient overlays, launcher-like assistive controls | must stay subordinate to evidence flow, must not become the primary navigation model |");
    expect(debugWorkbenchMaster).toContain("read-only diagnosis bench");
  });

  it("keeps moved docs wrappers out of the public docs plane while preserving machine-readable routes", () => {
    const docsReadme = read("docs/README.md");
    const publicSurfaceCatalog = read("docs/public-surface-catalog.md");
    const faq = read("docs/faq.md");
    const rootReadme = read("README.md");
    const llms = read("llms.txt");

    expect(docsReadme).not.toContain("docs/builder-intent-router.md");
    expect(docsReadme).not.toContain("docs/builder-journeys.md");
    expect(docsReadme).not.toContain("docs/starter-pack-comparison.md");
    expect(docsReadme).not.toContain("docs/compat-target-catalog.md");
    expect(docsReadme).not.toContain("docs/mcp-tool-catalog.md");

    expect(rootReadme).not.toContain("docs/builder-intent-router.md");
    expect(rootReadme).not.toContain("docs/builder-journeys.md");
    expect(rootReadme).not.toContain("docs/compat-target-catalog.md");

    expect(publicSurfaceCatalog).toContain("catalogs/builder-intent-router.json");
    expect(publicSurfaceCatalog).toContain("catalogs/builder-journeys.json");
    expect(publicSurfaceCatalog).toContain("catalogs/starter-pack-comparison.json");
    expect(publicSurfaceCatalog).toContain("catalogs/compat-target-catalog.json");

    expect(faq).toContain("catalogs/builder-intent-router.json");
    expect(faq).toContain("catalogs/builder-journeys.json");
    expect(faq).toContain("catalogs/starter-pack-comparison.json");
    expect(faq).toContain("catalogs/compat-target-catalog.json");
    expect(faq).toContain("catalogs/mcp-tool-catalog.json");

    expect(llms).not.toContain("docs/builder-intent-router.md");
    expect(llms).not.toContain("docs/builder-journeys.md");
    expect(llms).not.toContain("docs/starter-pack-comparison.md");
    expect(llms).not.toContain("docs/compat-target-catalog.md");
    expect(llms).not.toContain("docs/mcp-tool-catalog.md");

    expect(llms).toContain("catalogs/public-surface-catalog.json");
    expect(llms).toContain("catalogs/provider-runtime-catalog.json");
    expect(llms).toContain("catalogs/discoverability-keyword-truth.json");

    expect(read("catalogs/builder-intent-router.schema.json")).toContain(
      "WebaiBridge Builder Intent Router",
    );
    expect(read("catalogs/builder-journeys.schema.json")).toContain(
      "WebaiBridge Builder Journeys",
    );
    expect(read("catalogs/starter-pack-comparison.schema.json")).toContain(
      "WebaiBridge Starter Pack Comparison",
    );
    expect(read("catalogs/compat-target-catalog.schema.json")).toContain(
      "WebaiBridge Compat Target Catalog",
    );
    expect(read("catalogs/mcp-tool-catalog.schema.json")).toContain(
      "WebaiBridge MCP Tool Catalog",
    );
  });
});
