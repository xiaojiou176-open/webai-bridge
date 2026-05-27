import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const client = {
  listProviders: vi.fn(),
  health: vi.fn(),
  runtimeDoctor: vi.fn(),
  runtimePlan: vi.fn(),
  authStatus: vi.fn(),
  providerStatus: vi.fn(),
  providerDoctor: vi.fn(),
  providerProbe: vi.fn(),
  providerRemediation: vi.fn(),
  providerCurrentPage: vi.fn(),
  providerCurrentConsole: vi.fn(),
  providerCurrentNetwork: vi.fn(),
  providerSupportBundle: vi.fn(),
  providerDiagnose: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("webai-bridge MCP surface", () => {
  it("resolves baseUrl from explicit flag, env override, and default port", async () => {
    const { resolveMcpBaseUrl } = await import(
      "../../../packages/surfaces/mcp/src/index.js"
    );

    expect(
      resolveMcpBaseUrl(
        {
          WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:9999/",
          WEBAI_BRIDGE_SERVICE_PORT: "7777",
        },
        "http://127.0.0.1:5555/",
      ),
    ).toBe("http://127.0.0.1:5555");
    expect(
      resolveMcpBaseUrl({
        WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:9999/",
        WEBAI_BRIDGE_SERVICE_PORT: "7777",
      }),
    ).toBe("http://127.0.0.1:9999");
    expect(
      resolveMcpBaseUrl({
        WEBAI_BRIDGE_SERVICE_PORT: "7777",
      }),
    ).toBe("http://127.0.0.1:7777");
  });

  it("parses only the supported base-url flag", async () => {
    const { parseMcpArgs } = await import(
      "../../../packages/surfaces/mcp/src/index.js"
    );

    expect(parseMcpArgs(["--base-url=http://127.0.0.1:4010/"])).toEqual({
      baseUrl: "http://127.0.0.1:4010/",
    });
    expect(parseMcpArgs(["--", "--base-url", "http://127.0.0.1:5000"])).toEqual({
      baseUrl: "http://127.0.0.1:5000",
    });
  });

  it("dispatches read-only runtime tools through the shared service client", async () => {
    client.listProviders.mockResolvedValue([{ providerId: "chatgpt" }]);
    client.runtimeDoctor.mockResolvedValue({
      doctor: {
        activePolicyPack: {
          id: "low-friction",
          label: "Low Friction",
        },
        summary: {
          blockingProviders: ["claude"],
        },
      },
    });
    client.runtimePlan.mockResolvedValue({
      plan: {
        activePolicyPack: {
          id: "official-api-first",
          label: "Official API First",
        },
        policyProfile: "low-friction",
        recommended: {
          providerId: "chatgpt",
        },
      },
    });
    client.providerDoctor.mockResolvedValue({
      doctor: {
        activePolicyPack: {
          id: "low-friction",
          label: "Low Friction",
        },
        providerId: "chatgpt",
        alignment: {
          story: "blocked",
        },
      },
    });
    client.providerSupportBundle.mockResolvedValue({
      providerId: "chatgpt",
      attachTarget: { available: true },
      storeReadiness: { runtimeReadiness: "ready" },
      liveReadiness: { status: "live-blocked" },
      diagnoseLadder: [{ id: "check-store", status: "completed" }],
    });
    client.providerDiagnose.mockResolvedValue({
      providerId: "chatgpt",
      summary: "bundle",
    });

    const { runWebaiBridgeMcpTool } = await import(
      "../../../packages/surfaces/mcp/src/index.js"
    );

    await expect(
      runWebaiBridgeMcpTool("webai-bridge.providers.list", undefined, client as never),
    ).resolves.toEqual({
      readOnly: true,
      command: "providers",
      provider: undefined,
      result: [{ providerId: "chatgpt" }],
    });

    client.health.mockResolvedValue({ totals: { total: 5 } });
    await expect(
      runWebaiBridgeMcpTool("webai-bridge.runtime.health", undefined, client as never),
    ).resolves.toEqual({
      readOnly: true,
      command: "health",
      provider: undefined,
      result: { totals: { total: 5 } },
    });

    await expect(
      runWebaiBridgeMcpTool("webai-bridge.runtime.doctor", undefined, client as never),
    ).resolves.toEqual({
      readOnly: true,
      command: "runtime-doctor",
      provider: undefined,
      result: {
        doctor: {
          activePolicyPack: {
            id: "low-friction",
            label: "Low Friction",
          },
          summary: {
            blockingProviders: ["claude"],
          },
        },
      },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.runtime.plan",
        {
          policyProfile: "official-api-first",
          requiredCapabilities: ["tool-calling"],
          allowWebLogin: false,
        },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "runtime-plan",
      provider: undefined,
      result: {
        plan: {
          activePolicyPack: {
            id: "official-api-first",
            label: "Official API First",
          },
          policyProfile: "low-friction",
          recommended: {
            providerId: "chatgpt",
          },
        },
      },
    });
    expect(client.runtimePlan).toHaveBeenCalledWith({
      policyProfile: "official-api-first",
      requiredCapabilities: ["tool-calling"],
      allowWebLogin: false,
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.doctor",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-doctor",
      provider: "chatgpt",
      result: {
        doctor: {
          activePolicyPack: {
            id: "low-friction",
            label: "Low Friction",
          },
          providerId: "chatgpt",
          alignment: {
            story: "blocked",
          },
        },
      },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.attach_target",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-attach-target",
      provider: "chatgpt",
      result: { available: true },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.store_readiness",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-store-readiness",
      provider: "chatgpt",
      result: { runtimeReadiness: "ready" },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.live_readiness",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-live-readiness",
      provider: "chatgpt",
      result: { status: "live-blocked" },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.diagnose_ladder",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-diagnose-ladder",
      provider: "chatgpt",
      result: [{ id: "check-store", status: "completed" }],
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.diagnose",
        { provider: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual({
      readOnly: true,
      command: "provider-diagnose",
      provider: "chatgpt",
      result: { providerId: "chatgpt", summary: "bundle" },
    });

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.public_distribution_ledger",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "public-distribution-ledger",
        result: expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ target: "codex", officialPublicSurfaceExists: true }),
            expect.objectContaining({ target: "skill-packs", officialPublicSurfaceExists: false }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.public_distribution_ledger_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "public-distribution-ledger-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Public Distribution Ledger",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.distribution_surfaces",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "distribution-surfaces",
        result: expect.arrayContaining([
          expect.objectContaining({ target: "codex" }),
          expect.objectContaining({ target: "mcp" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.distribution_surface",
        { target: "codex" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "distribution-surface",
        result: expect.objectContaining({
          target: "codex",
          officialPublicSurfaceExists: true,
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_kits",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-kits",
        result: expect.arrayContaining([
          expect.objectContaining({ target: "codex" }),
          expect.objectContaining({ target: "mcp" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_kit_catalog",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-kit-catalog",
        result: expect.objectContaining({
          kits: expect.arrayContaining([
            expect.objectContaining({ target: "codex", status: "partial" }),
            expect.objectContaining({ target: "mcp", status: "partial" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_kit_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-kit-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Builder Kit Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_packs",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-packs",
        result: expect.arrayContaining([
          expect.objectContaining({ id: "runtime-diagnostics-pack" }),
          expect.objectContaining({ id: "docs-seo-sync-pack" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_pack_catalog",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-pack-catalog",
        result: expect.objectContaining({
          packs: expect.arrayContaining([
            expect.objectContaining({ id: "runtime-diagnostics-pack", status: "partial" }),
            expect.objectContaining({ id: "docs-seo-sync-pack", status: "partial" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_pack_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-pack-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Skill Pack Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.compat_target_catalog",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "compat-target-catalog",
        result: expect.objectContaining({
          targets: expect.arrayContaining([
            expect.objectContaining({ target: "codex", status: "partial" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.compat_target_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "compat-target-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Compat Target Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.compat_target",
        { target: "codex" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "compat-target",
        result: expect.objectContaining({
          target: "codex",
          status: "partial",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_playbooks",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-playbooks",
        result: expect.arrayContaining([
          expect.objectContaining({ host: "codex", recommendedPack: "codex" }),
          expect.objectContaining({ host: "mcp", recommendedPack: "mcp" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_playbooks_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-playbooks-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Host Integration Playbooks",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_playbook",
        { target: "mcp" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-playbook",
        result: expect.objectContaining({
          host: "mcp",
          recommendedPack: "mcp",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_examples",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-examples",
        result: expect.arrayContaining([
          expect.objectContaining({
            target: "codex",
            hostShape: "responses-client-config",
            smokeCommand: "pnpm run example:host-codex",
            firstSuccessCheck: expect.any(String),
          }),
          expect.objectContaining({
            target: "mcp",
            hostShape: "stdio-client-config",
            smokeCommand: "pnpm run example:host-mcp",
            firstSuccessCheck: expect.any(String),
          }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_examples_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-examples-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Host Integration Examples",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_example",
        { target: "codex" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "host-example",
        result: expect.objectContaining({
          target: "codex",
          hostShape: "responses-client-config",
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target codex",
          smokeCommand: "pnpm run example:host-codex",
          firstSuccessCheck: expect.any(String),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_journeys",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-journeys",
        result: expect.objectContaining({
          journeys: expect.arrayContaining([
            expect.objectContaining({ id: "codex-first-success", recommendedPack: "codex" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_journeys_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-journeys-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Builder Journeys",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_journey",
        { target: "mcp-read-only-first-success" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-journey",
        result: expect.objectContaining({
          id: "mcp-read-only-first-success",
          runnableCommand: "pnpm run example:host-mcp",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_intent_router",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-intent-router",
        result: expect.objectContaining({
          intents: expect.arrayContaining([
            expect.objectContaining({ id: "support-truth" }),
            expect.objectContaining({ id: "inspect-read-only-mcp" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_intent_router_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-intent-router-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Builder Intent Router",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_intent",
        { target: "support-truth" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-intent",
        result: expect.objectContaining({
          id: "support-truth",
          firstHopMcp: "webai-bridge.catalog.surface_catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.keyword_truth",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "keyword-truth",
        result: expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ id: "webai-bridge-shared-provider-runtime" }),
            expect.objectContaining({ id: "webai-bridge-mcp", truthStatus: "partial-with-label" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.keyword_truth_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "keyword-truth-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Keyword Truth Table",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.keyword_entry",
        { target: "webai-bridge-mcp" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "keyword-entry",
        result: expect.objectContaining({
          id: "webai-bridge-mcp",
          requiredLabels: expect.arrayContaining([
            "partial",
            "read-only MCP server",
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.surface_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "surface-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Public Surface Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_catalog",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "provider-catalog",
        result: expect.arrayContaining([
          expect.objectContaining({ providerId: "chatgpt" }),
          expect.objectContaining({ providerId: "openai" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "provider-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Provider Runtime Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_entry",
        { target: "chatgpt" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "provider-entry",
        result: expect.objectContaining({
          providerId: "chatgpt",
          lane: "web-login",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_entry",
        { target: "gemini:web-login" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "provider-entry",
        result: expect.objectContaining({
          providerId: "gemini",
          lane: "web-login",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_manifests",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-manifests",
        result: expect.objectContaining({
          builderTemplates: expect.arrayContaining([
            expect.objectContaining({ target: "mcp" }),
          ]),
          skillTemplates: expect.arrayContaining([
            expect.objectContaining({ id: "runtime-diagnostics-pack" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_manifests_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-manifests-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Starter Manifest Templates",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_examples",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-examples",
        result: expect.objectContaining({
          builderExamples: expect.arrayContaining([
            expect.objectContaining({ target: "mcp" }),
          ]),
          skillExamples: expect.arrayContaining([
            expect.objectContaining({ id: "runtime-diagnostics-pack" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_examples_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-examples-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Starter Manifest Examples",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_index",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-index",
        result: expect.objectContaining({
          builderPacks: expect.any(Array),
          skillPacks: expect.any(Array),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_index_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-index-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Starter Pack Index",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_entry",
        { target: "codex" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-entry",
        result: expect.objectContaining({
          kind: "builder",
          target: "codex",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_chooser",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-chooser",
        result: expect.objectContaining({
          scenarios: expect.arrayContaining([
            expect.objectContaining({ id: "codex-builder", recommendedPack: "codex" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_chooser_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-chooser-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Starter Pack Chooser",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_scenario",
        { target: "mcp-inspector" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-scenario",
        result: expect.objectContaining({
          id: "mcp-inspector",
          starterKind: "builder",
          recommendedPack: "mcp",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_comparison",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-comparison",
        result: expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({ id: "starter-kind" }),
            expect.objectContaining({ id: "read-only-truth" }),
          ]),
          comparisons: expect.arrayContaining([
            expect.objectContaining({ id: "codex-builder", recommendedPack: "codex" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_comparison_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-comparison-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Starter Pack Comparison",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_filter",
        { target: "read-only-truth" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "starter-pack-filter",
        result: expect.objectContaining({
          id: "read-only-truth",
          values: expect.arrayContaining([
            expect.objectContaining({
              id: "true",
              comparisonIds: expect.arrayContaining([
                "mcp-inspector",
                "runtime-diagnostics-skill",
              ]),
            }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_template",
        { target: "mcp" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-template",
        result: expect.objectContaining({
          target: "mcp",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_example",
        { target: "mcp" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "builder-example",
        result: expect.objectContaining({
          target: "mcp",
          exampleShape: "read-only-runtime-inspector",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_template",
        { target: "runtime-diagnostics-pack" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-template",
        result: expect.objectContaining({
          id: "runtime-diagnostics-pack",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_example",
        { target: "runtime-diagnostics-pack" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-example",
        result: expect.objectContaining({
          id: "runtime-diagnostics-pack",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_tools",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "mcp-tools",
        result: expect.arrayContaining([
          expect.objectContaining({ name: "webai-bridge.runtime.health" }),
        ]),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_tool_catalog",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "mcp-tool-catalog",
        result: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: "webai-bridge.runtime.health" }),
            expect.objectContaining({ name: "webai-bridge.catalog.mcp_tool_catalog" }),
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_tool_catalog_schema",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "mcp-tool-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge MCP Tool Catalog",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_tool",
        { target: "webai-bridge.runtime.health" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "mcp-tool",
        result: expect.objectContaining({
          name: "webai-bridge.runtime.health",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_tool",
        { target: "mystery.tool" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.mcp_tool requires a known MCP tool");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.mcp_status",
        undefined,
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "mcp-status",
        result: expect.objectContaining({
          status: "partial",
          readOnly: true,
        }),
      }),
    );
  });

  it("fails closed when provider-scoped tools are missing provider ids", async () => {
    const { runWebaiBridgeMcpTool } = await import(
      "../../../packages/surfaces/mcp/src/index.js"
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.provider.status",
        undefined,
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.provider.status requires a non-empty provider");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_kit",
        undefined,
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.builder_kit requires a non-empty target");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_entry",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.provider_entry requires a known provider entry");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_entry",
        { target: "gemini" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.provider_entry requires an unambiguous provider entry");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.provider_entry",
        { target: "gemini:web-login:bogus" },
        client as never,
      ),
    ).rejects.toThrow('webai-bridge.catalog.provider_entry requires a target shaped like "<providerId>" or "<providerId>:<lane>".');

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_pack",
        { target: "runtime-diagnostics-pack" },
        client as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        readOnly: true,
        command: "skill-pack",
        result: expect.objectContaining({
          id: "runtime-diagnostics-pack",
          routeCommand: "pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack",
          routeMcpTool: "webai-bridge.catalog.skill_pack",
        }),
      }),
    );

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.skill_pack",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.skill_pack requires a known skill pack");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_playbook",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.host_playbook requires a known host playbook");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.host_example",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.host_example requires a known host example");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_scenario",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.starter_pack_scenario requires a known starter pack scenario");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.starter_pack_filter",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.starter_pack_filter requires a known starter pack filter");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_journey",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.builder_journey requires a known builder journey");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.keyword_entry",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.keyword_entry requires a known keyword truth entry");

    await expect(
      runWebaiBridgeMcpTool(
        "webai-bridge.catalog.builder_intent",
        { target: "mystery" },
        client as never,
      ),
    ).rejects.toThrow("webai-bridge.catalog.builder_intent requires a known builder intent");
  });

  it("registers the read-only WebaiBridge toolset on an MCP server", async () => {
    const registered = new Map<
      string,
      {
        config: { description?: string; inputSchema?: unknown };
        handler: (args?: Record<string, unknown>) => Promise<unknown>;
      }
    >();
    const server = {
      registerTool(
        name: string,
        config: { description?: string; inputSchema?: unknown },
        handler: (args?: Record<string, unknown>) => Promise<unknown>,
      ) {
        registered.set(name, { config, handler });
      },
    };

    client.health.mockResolvedValue({ totals: { total: 5 } });

    const { registerWebaiBridgeReadonlyMcpTools } = await import(
      "../../../packages/surfaces/mcp/src/index.js"
    );

    registerWebaiBridgeReadonlyMcpTools(server as never, client as never);

    expect(registered.has("webai-bridge.runtime.health")).toBe(true);
    expect(registered.has("webai-bridge.provider.support_bundle")).toBe(true);
    expect(registered.has("webai-bridge.catalog.provider_catalog")).toBe(true);
    expect(registered.has("webai-bridge.catalog.provider_catalog_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.compat_target_catalog")).toBe(true);
    expect(registered.has("webai-bridge.catalog.compat_target_catalog_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_examples")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_manifests_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_examples_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_index")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_entry")).toBe(true);
    expect(registered.has("webai-bridge.catalog.host_playbooks")).toBe(true);
    expect(registered.has("webai-bridge.catalog.host_playbook")).toBe(true);
    expect(registered.has("webai-bridge.catalog.host_examples")).toBe(true);
    expect(registered.has("webai-bridge.catalog.host_example")).toBe(true);
    expect(registered.has("webai-bridge.catalog.builder_journeys")).toBe(true);
    expect(registered.has("webai-bridge.catalog.builder_journey")).toBe(true);
    expect(registered.has("webai-bridge.catalog.builder_intent_router")).toBe(true);
    expect(registered.has("webai-bridge.catalog.builder_intent_router_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.builder_intent")).toBe(true);
    expect(registered.has("webai-bridge.catalog.keyword_truth")).toBe(true);
    expect(registered.has("webai-bridge.catalog.keyword_truth_schema")).toBe(true);
    expect(registered.has("webai-bridge.catalog.keyword_entry")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_chooser")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_scenario")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_comparison")).toBe(true);
    expect(registered.has("webai-bridge.catalog.starter_pack_filter")).toBe(true);
    expect(registered.has("webai-bridge.catalog.skill_packs")).toBe(true);

    const result = await registered.get("webai-bridge.runtime.health")?.handler();

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              readOnly: true,
              command: "health",
              provider: undefined,
              result: { totals: { total: 5 } },
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        readOnly: true,
        command: "health",
        provider: undefined,
        result: { totals: { total: 5 } },
      },
    });
  });

  it(
    "serves a real stdio MCP roundtrip for read-only health inspection",
    async () => {
      const requests: string[] = [];
      const service = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.setHeader("content-type", "application/json");

        if (request.url === "/v1/runtime/health") {
          response.end(
            JSON.stringify({
              lane: "web",
              generatedAt: "2026-04-04T00:00:00.000Z",
              totals: {
                total: 5,
                ready: 5,
                degraded: 0,
                userActionRequired: 0,
                unavailable: 0,
              },
            }),
          );
          return;
        }

        response.statusCode = 404;
        response.end(JSON.stringify({ error: "not-found" }));
      });

      service.listen(0, "127.0.0.1");
      await once(service, "listening");

      const address = service.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected the MCP smoke test server to bind a TCP port.");
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;
      const transport = new StdioClientTransport({
        command: "pnpm",
        args: ["run", "webai-bridge:mcp", "--", "--base-url", baseUrl],
        cwd: repoRoot,
        stderr: "pipe",
      });
      const mcpClient = new Client({
        name: "webai-bridge-mcp-roundtrip-test",
        version: "0.0.0",
      });

      try {
        await mcpClient.connect(transport);
        const tools = await mcpClient.listTools();
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.runtime.health",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.provider_catalog",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.provider_catalog_schema",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.compat_target_catalog",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.compat_target_catalog_schema",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.starter_manifests_schema",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.starter_pack_index",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.starter_pack_chooser",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.builder_example",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.skill_packs",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.host_playbooks",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.host_examples",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.builder_journeys",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.builder_intent_router",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.keyword_truth",
        );
        expect(tools.tools.map((tool) => tool.name)).toContain(
          "webai-bridge.catalog.starter_pack_comparison",
        );

        const result = await mcpClient.callTool({
          name: "webai-bridge.runtime.health",
        });
        const structured = result.structuredContent as {
          readOnly: boolean;
          command: string;
          result: {
            totals: {
              ready: number;
            };
          };
        };

        expect(structured).toEqual(
          expect.objectContaining({
            readOnly: true,
            command: "health",
            result: expect.objectContaining({
              totals: expect.objectContaining({
                ready: 5,
              }),
            }),
          }),
        );

        const catalogResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.skill_packs",
        });
        const catalogStructured = catalogResult.structuredContent as {
          command: string;
          result: Array<{ id: string }>;
        };

        expect(catalogStructured).toEqual(
          expect.objectContaining({
            command: "skill-packs",
            result: expect.arrayContaining([
              expect.objectContaining({ id: "runtime-diagnostics-pack" }),
            ]),
          }),
        );

        const skillPackResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.skill_pack",
          arguments: { target: "runtime-diagnostics-pack" },
        });
        const skillPackStructured = skillPackResult.structuredContent as {
          command: string;
          result: {
            id: string;
            routeCommand: string;
            routeMcpTool: string;
          };
        };

        expect(skillPackStructured).toEqual(
          expect.objectContaining({
            command: "skill-pack",
            result: expect.objectContaining({
              id: "runtime-diagnostics-pack",
              routeCommand: "pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack",
              routeMcpTool: "webai-bridge.catalog.skill_pack",
            }),
          }),
        );

        const schemaResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.starter_examples_schema",
        });
        const schemaStructured = schemaResult.structuredContent as {
          command: string;
          result: { title: string };
        };

        expect(schemaStructured).toEqual(
          expect.objectContaining({
            command: "starter-examples-schema",
            result: expect.objectContaining({
              title: "WebaiBridge Starter Manifest Examples",
            }),
          }),
        );

        const starterPackResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.starter_pack_entry",
          arguments: { target: "mcp" },
        });
        const starterPackStructured = starterPackResult.structuredContent as {
          command: string;
          result: { kind: string; target: string };
        };

        expect(starterPackStructured).toEqual(
          expect.objectContaining({
            command: "starter-pack-entry",
            result: expect.objectContaining({
              kind: "builder",
              target: "mcp",
            }),
          }),
        );

        const chooserScenarioResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.starter_pack_scenario",
          arguments: { target: "mcp-inspector" },
        });
        const chooserScenarioStructured = chooserScenarioResult.structuredContent as {
          command: string;
          result: {
            id: string;
            recommendedPack: string;
          };
        };

        expect(chooserScenarioStructured).toEqual(
          expect.objectContaining({
            command: "starter-pack-scenario",
            result: expect.objectContaining({
              id: "mcp-inspector",
              recommendedPack: "mcp",
            }),
          }),
        );

        const comparisonResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.starter_pack_comparison",
        });
        const comparisonStructured = comparisonResult.structuredContent as {
          command: string;
          result: {
            filters: Array<{ id: string }>;
          };
        };

        expect(comparisonStructured).toEqual(
          expect.objectContaining({
            command: "starter-pack-comparison",
            result: expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({ id: "thin-runtime-bridges" }),
              ]),
            }),
          }),
        );

        const hostPlaybookResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.host_playbook",
          arguments: { target: "codex" },
        });
        const hostPlaybookStructured = hostPlaybookResult.structuredContent as {
          command: string;
          result: {
            host: string;
            recommendedPack: string;
          };
        };

        expect(hostPlaybookStructured).toEqual(
          expect.objectContaining({
            command: "host-playbook",
            result: expect.objectContaining({
              host: "codex",
              recommendedPack: "codex",
            }),
          }),
        );

        const hostExampleResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.host_example",
          arguments: { target: "mcp" },
        });
        const hostExampleStructured = hostExampleResult.structuredContent as {
          command: string;
          result: {
            target: string;
            hostShape: string;
          };
        };

        expect(hostExampleStructured).toEqual(
          expect.objectContaining({
            command: "host-example",
            result: expect.objectContaining({
              target: "mcp",
              hostShape: "stdio-client-config",
              bestEntry: "pnpm run webai-bridge:cli -- host-example --target mcp",
              smokeCommand: "pnpm run example:host-mcp",
              firstSuccessCheck: expect.any(String),
            }),
          }),
        );

        const builderJourneyResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.builder_journey",
          arguments: { target: "codex-first-success" },
        });
        const builderJourneyStructured = builderJourneyResult.structuredContent as {
          command: string;
          result: {
            id: string;
            runnableCommand: string;
          };
        };

        expect(builderJourneyStructured).toEqual(
          expect.objectContaining({
            command: "builder-journey",
            result: expect.objectContaining({
              id: "codex-first-success",
              runnableCommand: "pnpm run example:host-codex",
            }),
          }),
        );

        const builderIntentResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.builder_intent",
          arguments: { target: "support-truth" },
        });
        const builderIntentStructured = builderIntentResult.structuredContent as {
          command: string;
          result: {
            id: string;
            firstHopDoc: string;
          };
        };

        expect(builderIntentStructured).toEqual(
          expect.objectContaining({
            command: "builder-intent",
            result: expect.objectContaining({
              id: "support-truth",
              firstHopDoc: "docs/public-surface-catalog.md",
            }),
          }),
        );

        const keywordTruthResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.keyword_truth",
        });
        const keywordTruthStructured = keywordTruthResult.structuredContent as {
          command: string;
          result: {
            entries: Array<{ id: string; truthStatus: string }>;
          };
        };

        expect(keywordTruthStructured).toEqual(
          expect.objectContaining({
            command: "keyword-truth",
            result: expect.objectContaining({
              entries: expect.arrayContaining([
                expect.objectContaining({
                  id: "webai-bridge-shared-provider-runtime",
                  truthStatus: "claimable-now",
                }),
              ]),
            }),
          }),
        );

        const builderExampleResult = await mcpClient.callTool({
          name: "webai-bridge.catalog.builder_example",
          arguments: { target: "mcp" },
        });
        const builderExampleStructured = builderExampleResult.structuredContent as {
          command: string;
          result: {
            target: string;
            exampleShape: string;
          };
        };

        expect(builderExampleStructured).toEqual(
          expect.objectContaining({
            command: "builder-example",
            result: expect.objectContaining({
              target: "mcp",
              exampleShape: "read-only-runtime-inspector",
            }),
          }),
        );
        expect(requests).toContain("GET /v1/runtime/health");
      } finally {
        await mcpClient.close().catch(() => undefined);
        await new Promise<void>((resolveClose) =>
          service.close(() => resolveClose()),
        );
      }
    },
    15_000,
  );
});
