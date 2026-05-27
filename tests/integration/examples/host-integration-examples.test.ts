import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

describe("host integration examples", () => {
  it("keeps host playbooks, host example assets, and public catalog entries aligned", () => {
    const catalog = readJson("catalogs/public-surface-catalog.json");
    const playbooks = readJson("catalogs/host-integration-playbooks.json");
    const playbookSchema = readJson("catalogs/host-integration-playbooks.schema.json");
    const hostIndex = readJson("examples/hosts/index.json");
    const hostIndexSchema = readJson("examples/hosts/index.schema.json");
    const ajv = new Ajv2020({ strict: false });

    expect(ajv.compile(playbookSchema)(playbooks)).toBe(true);
    expect(ajv.compile(hostIndexSchema)(hostIndex)).toBe(true);

    for (const target of ["codex", "claude-code", "openclaw", "mcp"]) {
      const playbook = playbooks.playbooks.find((item: { host: string }) => item.host === target);
      const hostExample = hostIndex.hostExamples.find((item: { target: string }) => item.target === target);
      const catalogEntry = catalog.hostExamples.find((item: { target: string }) => item.target === target);

      expect(playbook?.recommendedPack).toBe(target);
      expect(hostExample?.target).toBe(target);
      expect(catalogEntry?.target).toBe(target);
      expect(hostExample?.bestEntry).toBe(
        `pnpm run webai-bridge:cli -- host-example --target ${target}`,
      );
      expect(hostExample?.smokeCommand).toBe(
        `pnpm run example:host-${target}`,
      );
      expect(catalogEntry?.bestEntry).toBe(
        `pnpm run webai-bridge:cli -- host-example --target ${target}`,
      );
      expect(catalogEntry?.smokeCommand).toBe(
        `pnpm run example:host-${target}`,
      );
      expect(hostExample?.relatedDocs).toContain("docs/host-integration-examples.md");
      expect(catalogEntry?.relatedDocs).toContain("docs/host-integration-examples.md");
      expect(hostExample?.firstSuccessCheck).toEqual(expect.any(String));
      expect(catalogEntry?.firstSuccessCheck).toEqual(expect.any(String));

      expect(existsSync(resolve(repoRoot, `examples/hosts/${target}/README.md`))).toBe(true);
      expect(existsSync(resolve(repoRoot, `examples/hosts/${target}/config.example.json`))).toBe(true);
      expect(existsSync(resolve(repoRoot, `examples/hosts/${target}/smoke.mjs`))).toBe(true);
    }
  });
});
