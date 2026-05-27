import { beforeEach, describe, expect, it, vi } from "vitest";

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
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("webai-bridge CLI starter", () => {
  it("resolves baseUrl from explicit flag, env override, and default port", async () => {
    const { resolveCliBaseUrl } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );

    expect(
      resolveCliBaseUrl(
        {
          WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:9999/",
          WEBAI_BRIDGE_SERVICE_PORT: "7777",
        },
        "http://127.0.0.1:5555/",
      ),
    ).toBe("http://127.0.0.1:5555");
    expect(
      resolveCliBaseUrl({
        WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:9999/",
        WEBAI_BRIDGE_SERVICE_PORT: "7777",
      }),
    ).toBe("http://127.0.0.1:9999");
    expect(
      resolveCliBaseUrl({
        WEBAI_BRIDGE_SERVICE_PORT: "7777",
      }),
    ).toBe("http://127.0.0.1:7777");
  });

  it("dispatches read-only provider commands through the shared service client", async () => {
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

    const { runWebaiBridgeCli } = await import("../../../scripts/webai-bridge-cli.mjs");

    const providers = await runWebaiBridgeCli(
      { command: "providers" },
      client,
    );
    const runtimeDoctor = await runWebaiBridgeCli(
      { command: "runtime-doctor" },
      client,
    );
    const runtimePlan = await runWebaiBridgeCli(
      {
        command: "runtime-plan",
        policyProfile: "official-api-first",
        requiredCapabilities: ["tool-calling"],
        allowWebLogin: false,
        requireOfficialApi: true,
        requireToolCalling: true,
      },
      client,
    );
    const doctor = await runWebaiBridgeCli(
      { command: "provider-doctor", provider: "chatgpt" },
      client,
    );
    const supportBundle = await runWebaiBridgeCli(
      { command: "provider-support-bundle", provider: "chatgpt" },
      client,
    );
    const diagnose = await runWebaiBridgeCli(
      { command: "provider-diagnose", provider: "chatgpt" },
      client,
    );
    const attachTarget = await runWebaiBridgeCli(
      { command: "provider-attach-target", provider: "chatgpt" },
      client,
    );
    const storeReadiness = await runWebaiBridgeCli(
      { command: "provider-store-readiness", provider: "chatgpt" },
      client,
    );
    const liveReadiness = await runWebaiBridgeCli(
      { command: "provider-live-readiness", provider: "chatgpt" },
      client,
    );
    const diagnoseLadder = await runWebaiBridgeCli(
      { command: "provider-diagnose-ladder", provider: "chatgpt" },
      client,
    );

    expect(providers).toEqual({
      command: "providers",
      result: [{ providerId: "chatgpt" }],
    });
    expect(runtimeDoctor).toEqual({
      command: "runtime-doctor",
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
    expect(runtimePlan).toEqual({
      command: "runtime-plan",
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
    expect(doctor).toEqual({
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
    expect(supportBundle).toEqual({
      command: "provider-support-bundle",
      provider: "chatgpt",
      result: expect.objectContaining({
        providerId: "chatgpt",
        attachTarget: { available: true },
        storeReadiness: { runtimeReadiness: "ready" },
        liveReadiness: { status: "live-blocked" },
        diagnoseLadder: [{ id: "check-store", status: "completed" }],
      }),
    });
    expect(diagnose).toEqual({
      command: "provider-diagnose",
      provider: "chatgpt",
      result: {
        providerId: "chatgpt",
        attachTarget: { available: true },
        storeReadiness: { runtimeReadiness: "ready" },
        liveReadiness: { status: "live-blocked" },
        diagnoseLadder: [{ id: "check-store", status: "completed" }],
      },
    });
    expect(attachTarget).toEqual({
      command: "provider-attach-target",
      provider: "chatgpt",
      result: { available: true },
    });
    expect(storeReadiness).toEqual({
      command: "provider-store-readiness",
      provider: "chatgpt",
      result: { runtimeReadiness: "ready" },
    });
    expect(liveReadiness).toEqual({
      command: "provider-live-readiness",
      provider: "chatgpt",
      result: { status: "live-blocked" },
    });
    expect(diagnoseLadder).toEqual({
      command: "provider-diagnose-ladder",
      provider: "chatgpt",
      result: [{ id: "check-store", status: "completed" }],
    });
    expect(client.listProviders).toHaveBeenCalledTimes(1);
    expect(client.runtimeDoctor).toHaveBeenCalledTimes(1);
    expect(client.runtimePlan).toHaveBeenCalledTimes(1);
    expect(client.runtimePlan).toHaveBeenCalledWith({
      policyProfile: "official-api-first",
      requiredCapabilities: ["tool-calling"],
      allowWebLogin: false,
      requireOfficialApi: true,
      requireToolCalling: true,
    });
    expect(client.providerDoctor).toHaveBeenCalledTimes(1);
    expect(client.providerDoctor).toHaveBeenCalledWith("chatgpt");
    expect(client.providerSupportBundle).toHaveBeenCalledTimes(6);
    expect(client.providerSupportBundle).toHaveBeenCalledWith("chatgpt");
  });

  it("rejects provider-scoped commands when provider is missing", async () => {
    const { runWebaiBridgeCli } = await import("../../../scripts/webai-bridge-cli.mjs");

    await expect(
      runWebaiBridgeCli({ command: "provider-status" }, client),
    ).rejects.toThrow("provider-status requires --provider <providerId>");
  });

  it("parses separators, provider flags, and json/base-url flags", async () => {
    const { parseCliArgs } = await import("../../../scripts/webai-bridge-cli.mjs");

    expect(
      parseCliArgs([
        "--",
        "provider-probe",
        "--provider",
        "chatgpt",
        "--target",
        "codex",
        "--base-url=http://127.0.0.1:4010/",
        "--json",
      ]),
    ).toEqual({
      command: "provider-probe",
      provider: "chatgpt",
      target: "codex",
      baseUrl: "http://127.0.0.1:4010/",
      policyProfile: undefined,
      requiredCapabilities: [],
      allowWebLogin: undefined,
      requireOfficialApi: false,
      requireToolCalling: false,
      json: true,
    });

    expect(
      parseCliArgs([
        "runtime-plan",
        "--profile",
        "official-api-first",
        "--capability",
        "tool-calling",
        "--no-web-login",
        "--require-official-api",
        "--require-tool-calling",
      ]),
    ).toEqual({
      command: "runtime-plan",
      provider: undefined,
      target: undefined,
      baseUrl: undefined,
      policyProfile: "official-api-first",
      requiredCapabilities: ["tool-calling"],
      allowWebLogin: false,
      requireOfficialApi: true,
      requireToolCalling: true,
      json: false,
    });
  });

  it("returns machine-readable outward catalogs for plugin and skills builders", async () => {
    const { runWebaiBridgeCli } = await import("../../../scripts/webai-bridge-cli.mjs");

    await expect(runWebaiBridgeCli({ command: "surface-catalog" }, client)).resolves.toEqual(
      expect.objectContaining({
        command: "surface-catalog",
        result: expect.objectContaining({
          publicSurfaces: expect.arrayContaining([
            expect.objectContaining({
              surface: "CLI",
              status: "partial",
              readOnly: true,
              commands: expect.arrayContaining([
                "builder-kits",
                "builder-kit",
                "skill-packs",
                "skill-pack",
                "skill-pack-routes",
                "skill-pack-routes-schema",
                "skill-pack-route",
                "host-playbooks",
                "host-playbook",
                "host-examples",
                "host-example",
                "builder-journeys",
                "builder-journey",
                "builder-intent-router",
                "builder-intent",
                "keyword-truth",
                "keyword-truth-schema",
                "keyword-entry",
                "starter-pack-chooser",
                "starter-pack-scenario",
                "starter-pack-comparison",
                "starter-pack-filter",
              ]),
            }),
            expect.objectContaining({
              surface: "MCP",
              status: "partial",
            }),
          ]),
          compatTargets: expect.arrayContaining([
            expect.objectContaining({
              target: "codex",
              status: "partial",
            }),
            expect.objectContaining({
              target: "claude-code",
              status: "partial",
            }),
            expect.objectContaining({
              target: "openclaw",
              status: "partial",
            }),
          ]),
        }),
      }),
    );

    await expect(runWebaiBridgeCli({ command: "surface-catalog-schema" }, client)).resolves.toEqual(
      expect.objectContaining({
        command: "surface-catalog-schema",
        result: expect.objectContaining({
          title: "WebaiBridge Public Surface Catalog",
          required: expect.arrayContaining([
            "publicSurfaces",
            "compatTargets",
            "builderKits",
            "skillPacks",
            "mcp",
          ]),
        }),
      }),
    );

    await expect(
      runWebaiBridgeCli({ command: "public-distribution-ledger" }, client),
    ).resolves.toEqual({
      command: "public-distribution-ledger",
      result: expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            target: "codex",
            officialPublicSurfaceExists: true,
          }),
          expect.objectContaining({
            target: "starter-packs",
            officialPublicSurfaceExists: false,
          }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "public-distribution-ledger-schema" }, client),
    ).resolves.toEqual({
      command: "public-distribution-ledger-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Public Distribution Ledger",
        required: expect.arrayContaining([
          "ledgerVersion",
          "entries",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "distribution-surfaces" }, client),
    ).resolves.toEqual({
      command: "distribution-surfaces",
      result: expect.arrayContaining([
        expect.objectContaining({ target: "codex" }),
        expect.objectContaining({ target: "claude-code" }),
        expect.objectContaining({ target: "openclaw" }),
        expect.objectContaining({ target: "mcp" }),
      ]),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "distribution-surface", target: "mcp" },
        client,
      ),
    ).resolves.toEqual({
      command: "distribution-surface",
      target: "mcp",
      result: expect.objectContaining({
        target: "mcp",
        officialPublicSurfaceExists: true,
        currentListingStatus: "official-surface-exists-unlisted",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "compat-targets" }, client)).resolves.toEqual({
      command: "compat-targets",
      result: expect.arrayContaining([
        expect.objectContaining({ target: "codex" }),
        expect.objectContaining({ target: "claude-code" }),
        expect.objectContaining({ target: "openclaw" }),
      ]),
    });

    await expect(runWebaiBridgeCli({ command: "compat-target-catalog" }, client)).resolves.toEqual({
      command: "compat-target-catalog",
      result: expect.objectContaining({
        targets: expect.arrayContaining([
          expect.objectContaining({ target: "codex", status: "partial" }),
          expect.objectContaining({ target: "claude-code", status: "partial" }),
          expect.objectContaining({ target: "openclaw", status: "partial" }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "compat-target-catalog-schema" }, client),
    ).resolves.toEqual({
      command: "compat-target-catalog-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Compat Target Catalog",
        required: expect.arrayContaining([
          "catalogVersion",
          "targets",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "builder-kits" }, client)).resolves.toEqual({
      command: "builder-kits",
      result: expect.arrayContaining([
        expect.objectContaining({
          target: "codex",
          requiredInputs: expect.any(Array),
          starterSteps: expect.any(Array),
          outputArtifacts: expect.any(Array),
          safeClaims: expect.any(Array),
        }),
        expect.objectContaining({ target: "claude-code" }),
        expect.objectContaining({ target: "openclaw" }),
        expect.objectContaining({ target: "mcp" }),
      ]),
    });

    await expect(runWebaiBridgeCli({ command: "builder-kit-catalog" }, client)).resolves.toEqual({
      command: "builder-kit-catalog",
      result: expect.objectContaining({
        kits: expect.arrayContaining([
          expect.objectContaining({ target: "codex", status: "partial" }),
          expect.objectContaining({ target: "claude-code", status: "partial" }),
          expect.objectContaining({ target: "openclaw", status: "partial" }),
          expect.objectContaining({ target: "mcp", status: "partial" }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "builder-kit-catalog-schema" }, client),
    ).resolves.toEqual({
      command: "builder-kit-catalog-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Builder Kit Catalog",
        required: expect.arrayContaining([
          "catalogVersion",
          "kits",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "compat-target", target: "codex" },
        client,
      ),
    ).resolves.toEqual({
      command: "compat-target",
      target: "codex",
      result: expect.objectContaining({
        target: "codex",
        status: "partial",
        transport: "responses",
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "builder-kit", target: "mcp" },
        client,
      ),
    ).resolves.toEqual({
      command: "builder-kit",
      target: "mcp",
      result: expect.objectContaining({
        target: "mcp",
        status: "partial",
        starterShape: "read-only-runtime-inspector",
        requiredInputs: expect.any(Array),
        starterSteps: expect.any(Array),
        outputArtifacts: expect.any(Array),
        safeClaims: expect.any(Array),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "skill-pack-catalog" }, client)).resolves.toEqual({
      command: "skill-pack-catalog",
      result: expect.objectContaining({
        packs: expect.arrayContaining([
          expect.objectContaining({ id: "runtime-diagnostics-pack", status: "partial" }),
          expect.objectContaining({ id: "docs-seo-sync-pack", status: "partial" }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "skill-pack-catalog-schema" }, client),
    ).resolves.toEqual({
      command: "skill-pack-catalog-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Skill Pack Catalog",
        required: expect.arrayContaining([
          "catalogVersion",
          "packs",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "skill-packs" }, client)).resolves.toEqual({
      command: "skill-packs",
      result: expect.arrayContaining([
        expect.objectContaining({
          id: "runtime-diagnostics-pack",
          requiredInputs: expect.any(Array),
          starterSteps: expect.any(Array),
          outputArtifacts: expect.any(Array),
          safeClaims: expect.any(Array),
        }),
        expect.objectContaining({
          id: "docs-seo-sync-pack",
        }),
      ]),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "skill-pack", target: "runtime-diagnostics-pack" },
        client,
      ),
    ).resolves.toEqual({
      command: "skill-pack",
      target: "runtime-diagnostics-pack",
      result: expect.objectContaining({
        id: "runtime-diagnostics-pack",
        status: "partial",
        requiredInputs: expect.any(Array),
        starterSteps: expect.any(Array),
        outputArtifacts: expect.any(Array),
        safeClaims: expect.any(Array),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "skill-pack-routes" }, client)).resolves.toEqual({
      command: "skill-pack-routes",
      result: expect.objectContaining({
        routes: expect.arrayContaining([
          expect.objectContaining({
            id: "runtime-diagnostics-pack",
            bestEntry: "pnpm run webai-bridge:cli -- skill-pack-route --target runtime-diagnostics-pack",
            recommendedMcpTools: expect.arrayContaining([
              "webai-bridge.catalog.skill_pack",
              "webai-bridge.provider.diagnose",
            ]),
          }),
          expect.objectContaining({
            id: "docs-seo-sync-pack",
            recommendedCliCommands: expect.arrayContaining([
              "pnpm run webai-bridge:cli -- keyword-truth --json",
            ]),
          }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "skill-pack-routes-schema" }, client),
    ).resolves.toEqual({
      command: "skill-pack-routes-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Skill Pack Routes",
        required: expect.arrayContaining([
          "routeVersion",
          "routes",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "skill-pack-route", target: "runtime-diagnostics-pack" },
        client,
      ),
    ).resolves.toEqual({
      command: "skill-pack-route",
      target: "runtime-diagnostics-pack",
      result: expect.objectContaining({
        id: "runtime-diagnostics-pack",
        packPath: "starter-packs/skills/runtime-diagnostics-pack",
        recommendedCliCommands: expect.arrayContaining([
          "pnpm run webai-bridge:cli -- provider-status --provider chatgpt --json",
          "pnpm run webai-bridge:cli -- provider-support-bundle --provider chatgpt --json",
        ]),
        recommendedMcpTools: expect.arrayContaining([
          "webai-bridge.catalog.skill_pack",
          "webai-bridge.provider.support_bundle",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "host-playbooks" }, client)).resolves.toEqual({
      command: "host-playbooks",
      result: expect.arrayContaining([
        expect.objectContaining({
          host: "codex",
          recommendedPack: "codex",
          relatedDocs: expect.any(Array),
        }),
        expect.objectContaining({
          host: "mcp",
          recommendedPack: "mcp",
        }),
      ]),
    });

    await expect(runWebaiBridgeCli({ command: "host-playbooks-schema" }, client)).resolves.toEqual({
      command: "host-playbooks-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Host Integration Playbooks",
        required: expect.arrayContaining([
          "playbookVersion",
          "playbooks",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "host-playbook", target: "codex" }, client),
    ).resolves.toEqual({
      command: "host-playbook",
      target: "codex",
      result: expect.objectContaining({
        host: "codex",
        recommendedPack: "codex",
        recommendedScenario: "codex-builder",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "host-examples" }, client)).resolves.toEqual({
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
    });

    await expect(runWebaiBridgeCli({ command: "host-examples-schema" }, client)).resolves.toEqual({
      command: "host-examples-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Host Integration Examples",
        required: expect.arrayContaining([
          "indexVersion",
          "hostExamples",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "host-example", target: "mcp" }, client),
    ).resolves.toEqual({
      command: "host-example",
      target: "mcp",
      result: expect.objectContaining({
        target: "mcp",
        hostShape: "stdio-client-config",
        bestEntry: "pnpm run webai-bridge:cli -- host-example --target mcp",
        smokeCommand: "pnpm run example:host-mcp",
        firstSuccessCheck: expect.any(String),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "builder-journeys" }, client)).resolves.toEqual({
      command: "builder-journeys",
      result: expect.objectContaining({
        journeys: expect.arrayContaining([
          expect.objectContaining({ id: "codex-first-success", recommendedPack: "codex" }),
          expect.objectContaining({ id: "docs-seo-truth-sync", recommendedPack: "docs-seo-sync-pack" }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "builder-journeys-schema" }, client)).resolves.toEqual({
      command: "builder-journeys-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Builder Journeys",
        required: expect.arrayContaining([
          "journeyVersion",
          "journeys",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "builder-journey", target: "codex-first-success" }, client),
    ).resolves.toEqual({
      command: "builder-journey",
      target: "codex-first-success",
      result: expect.objectContaining({
        id: "codex-first-success",
        recommendedPack: "codex",
        runnableCommand: "pnpm run example:host-codex",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "builder-intent-router" }, client)).resolves.toEqual({
      command: "builder-intent-router",
      result: expect.objectContaining({
        intents: expect.arrayContaining([
          expect.objectContaining({ id: "support-truth", firstHopDoc: "docs/public-surface-catalog.md" }),
          expect.objectContaining({ id: "inspect-read-only-mcp", firstHopDoc: "docs/mcp.md" }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "builder-intent-router-schema" }, client)).resolves.toEqual({
      command: "builder-intent-router-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Builder Intent Router",
        required: expect.arrayContaining([
          "routerVersion",
          "intents",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "builder-intent", target: "support-truth" }, client),
    ).resolves.toEqual({
      command: "builder-intent",
      target: "support-truth",
      result: expect.objectContaining({
        id: "support-truth",
        firstHopCli: "pnpm run webai-bridge:cli -- surface-catalog",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "keyword-truth" }, client)).resolves.toEqual({
      command: "keyword-truth",
      result: expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: "webai-bridge-shared-provider-runtime",
            truthStatus: "claimable-now",
          }),
          expect.objectContaining({
            id: "webai-bridge-mcp",
            truthStatus: "partial-with-label",
          }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "keyword-truth-schema" }, client)).resolves.toEqual({
      command: "keyword-truth-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Keyword Truth Table",
        required: expect.arrayContaining([
          "keywordVersion",
          "entries",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "keyword-entry", target: "webai-bridge-mcp" }, client),
    ).resolves.toEqual({
      command: "keyword-entry",
      target: "webai-bridge-mcp",
      result: expect.objectContaining({
        id: "webai-bridge-mcp",
        truthStatus: "partial-with-label",
        requiredLabels: expect.arrayContaining([
          "partial",
          "read-only MCP server",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "provider-catalog" }, client)).resolves.toEqual({
      command: "provider-catalog",
      result: expect.arrayContaining([
        expect.objectContaining({
          providerId: "chatgpt",
          lane: "web-login",
          capabilityMatrix: expect.any(Object),
          dispatchPolicy: expect.any(Object),
        }),
        expect.objectContaining({
          providerId: "openai",
          lane: "byok",
          capabilityMatrix: expect.any(Object),
          dispatchPolicy: expect.any(Object),
        }),
      ]),
    });

    await expect(runWebaiBridgeCli({ command: "provider-catalog-schema" }, client)).resolves.toEqual({
      command: "provider-catalog-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Provider Runtime Catalog",
        required: expect.arrayContaining([
          "catalogVersion",
          "providers",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "provider-entry", target: "chatgpt" },
        client,
      ),
    ).resolves.toEqual({
      command: "provider-entry",
      target: "chatgpt",
      result: expect.objectContaining({
        providerId: "chatgpt",
        stabilityTarget: "high-stability",
        capabilityMatrix: expect.objectContaining({
          "text-generation": true,
        }),
        dispatchPolicy: expect.objectContaining({
          kind: "single-lane-provider",
        }),
        doctorEntryPoints: expect.objectContaining({
          cliCommand:
            "pnpm run webai-bridge:cli -- provider-doctor --provider chatgpt --json",
        }),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "provider-entry", target: "gemini:web-login" },
        client,
      ),
    ).resolves.toEqual({
      command: "provider-entry",
      target: "gemini:web-login",
      result: expect.objectContaining({
        providerId: "gemini",
        lane: "web-login",
        stabilityTarget: "high-stability",
        dispatchPolicy: expect.objectContaining({
          kind: "credential-aware-auto-lane",
        }),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-manifests" }, client)).resolves.toEqual({
      command: "starter-manifests",
      result: expect.objectContaining({
        builderTemplates: expect.any(Array),
        skillTemplates: expect.any(Array),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-manifests-schema" }, client)).resolves.toEqual({
      command: "starter-manifests-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Starter Manifest Templates",
        required: expect.arrayContaining([
          "manifestVersion",
          "builderTemplates",
          "skillTemplates",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-examples" }, client)).resolves.toEqual({
      command: "starter-examples",
      result: expect.objectContaining({
        builderExamples: expect.any(Array),
        skillExamples: expect.any(Array),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-examples-schema" }, client)).resolves.toEqual({
      command: "starter-examples-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Starter Manifest Examples",
        required: expect.arrayContaining([
          "exampleVersion",
          "builderExamples",
          "skillExamples",
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-pack-index" }, client)).resolves.toEqual({
      command: "starter-pack-index",
      result: expect.objectContaining({
        builderPacks: expect.arrayContaining([
          expect.objectContaining({ target: "codex" }),
        ]),
        skillPacks: expect.arrayContaining([
          expect.objectContaining({ id: "runtime-diagnostics-pack" }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-pack-index-schema" }, client)).resolves.toEqual({
      command: "starter-pack-index-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Starter Pack Index",
        required: expect.arrayContaining([
          "indexVersion",
          "builderPacks",
          "skillPacks",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "starter-pack-entry", target: "codex" },
        client,
      ),
    ).resolves.toEqual({
      command: "starter-pack-entry",
      target: "codex",
      result: expect.objectContaining({
        kind: "builder",
        target: "codex",
        smokeCommand: "pnpm run starter-pack:codex",
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "starter-pack-entry", target: "runtime-diagnostics-pack" },
        client,
      ),
    ).resolves.toEqual({
      command: "starter-pack-entry",
      target: "runtime-diagnostics-pack",
      result: expect.objectContaining({
        kind: "skill",
        id: "runtime-diagnostics-pack",
        smokeCommand: "pnpm run starter-pack:runtime-diagnostics-pack",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-pack-chooser" }, client)).resolves.toEqual({
      command: "starter-pack-chooser",
      result: expect.objectContaining({
        questions: expect.any(Array),
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            id: "codex-builder",
            recommendedPack: "codex",
          }),
          expect.objectContaining({
            id: "docs-seo-sync-skill",
            recommendedPack: "docs-seo-sync-pack",
          }),
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "starter-pack-chooser-schema" }, client),
    ).resolves.toEqual({
      command: "starter-pack-chooser-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Starter Pack Chooser",
        required: expect.arrayContaining([
          "chooserVersion",
          "questions",
          "scenarios",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "starter-pack-scenario", target: "codex-builder" },
        client,
      ),
    ).resolves.toEqual({
      command: "starter-pack-scenario",
      target: "codex-builder",
      result: expect.objectContaining({
        id: "codex-builder",
        starterKind: "builder",
        recommendedPack: "codex",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-pack-comparison" }, client)).resolves.toEqual({
      command: "starter-pack-comparison",
      result: expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ id: "starter-kind" }),
          expect.objectContaining({ id: "read-only-truth" }),
        ]),
        comparisons: expect.arrayContaining([
          expect.objectContaining({ id: "codex-builder", recommendedPack: "codex" }),
          expect.objectContaining({ id: "docs-seo-sync-skill", recommendedPack: "docs-seo-sync-pack" }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "starter-pack-comparison-schema" }, client)).resolves.toEqual({
      command: "starter-pack-comparison-schema",
      result: expect.objectContaining({
        title: "WebaiBridge Starter Pack Comparison",
        required: expect.arrayContaining([
          "comparisonVersion",
          "filters",
          "comparisons",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "starter-pack-filter", target: "read-only-truth" },
        client,
      ),
    ).resolves.toEqual({
      command: "starter-pack-filter",
      target: "read-only-truth",
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
    });

    await expect(
      runWebaiBridgeCli(
        { command: "builder-template", target: "mcp" },
        client,
      ),
    ).resolves.toEqual({
      command: "builder-template",
      target: "mcp",
      result: expect.objectContaining({
        target: "mcp",
        status: "partial",
        templateShape: "read-only-runtime-inspector",
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "builder-example", target: "mcp" },
        client,
      ),
    ).resolves.toEqual({
      command: "builder-example",
      target: "mcp",
      result: expect.objectContaining({
        target: "mcp",
        exampleShape: "read-only-runtime-inspector",
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "skill-template", target: "runtime-diagnostics-pack" },
        client,
      ),
    ).resolves.toEqual({
      command: "skill-template",
      target: "runtime-diagnostics-pack",
      result: expect.objectContaining({
        id: "runtime-diagnostics-pack",
        status: "partial",
      }),
    });

    await expect(
      runWebaiBridgeCli(
        { command: "skill-example", target: "runtime-diagnostics-pack" },
        client,
      ),
    ).resolves.toEqual({
      command: "skill-example",
      target: "runtime-diagnostics-pack",
      result: expect.objectContaining({
        id: "runtime-diagnostics-pack",
        exampleShape: "read-only-runtime-diagnostics",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "mcp-status" }, client)).resolves.toEqual({
      command: "mcp-status",
      result: expect.objectContaining({
        status: "partial",
        readOnly: true,
        serverTransport: true,
        startupCommand: "pnpm run webai-bridge:mcp",
      }),
    });

    await expect(runWebaiBridgeCli({ command: "mcp-tools" }, client)).resolves.toEqual({
      command: "mcp-tools",
      result: expect.arrayContaining([
        expect.objectContaining({
          name: "webai-bridge.runtime.health",
          readOnlyHint: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.provider.support_bundle",
          providerScoped: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.catalog.starter_pack_chooser",
          readOnlyHint: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.catalog.host_playbooks",
          readOnlyHint: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.catalog.host_examples",
          readOnlyHint: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.catalog.keyword_truth",
          readOnlyHint: true,
        }),
        expect.objectContaining({
          name: "webai-bridge.catalog.builder_intent_router",
          readOnlyHint: true,
        }),
      ]),
    });

    await expect(runWebaiBridgeCli({ command: "mcp-tool-catalog" }, client)).resolves.toEqual({
      command: "mcp-tool-catalog",
      result: expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "webai-bridge.runtime.health" }),
          expect.objectContaining({ name: "webai-bridge.catalog.compat_target_catalog" }),
          expect.objectContaining({ name: "webai-bridge.catalog.mcp_tool_catalog" }),
        ]),
      }),
    });

    await expect(runWebaiBridgeCli({ command: "mcp-tool-catalog-schema" }, client)).resolves.toEqual({
      command: "mcp-tool-catalog-schema",
      result: expect.objectContaining({
        title: "WebaiBridge MCP Tool Catalog",
        required: expect.arrayContaining([
          "catalogVersion",
          "tools",
        ]),
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "mcp-tool", target: "webai-bridge.runtime.health" }, client),
    ).resolves.toEqual({
      command: "mcp-tool",
      target: "webai-bridge.runtime.health",
      result: expect.objectContaining({
        name: "webai-bridge.runtime.health",
        route: "/v1/runtime/health",
      }),
    });

    await expect(
      runWebaiBridgeCli({ command: "mcp-tool", target: "mystery.tool" }, client),
    ).rejects.toThrow('Unknown MCP tool "mystery.tool"');
  });

  it("rejects unknown compat targets", async () => {
    const { runWebaiBridgeCli } = await import("../../../scripts/webai-bridge-cli.mjs");

    await expect(
      runWebaiBridgeCli({ command: "compat-target", target: "mystery" }, client),
    ).rejects.toThrow('Unknown compat target "mystery"');
  });

  it("rejects unknown builder kits", async () => {
    const { runWebaiBridgeCli } = await import("../../../scripts/webai-bridge-cli.mjs");

    await expect(
      runWebaiBridgeCli({ command: "builder-kit", target: "mystery" }, client),
    ).rejects.toThrow('Unknown builder kit "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "skill-pack", target: "mystery" }, client),
    ).rejects.toThrow('Unknown skill pack "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "skill-pack-route", target: "mystery" }, client),
    ).rejects.toThrow('Unknown skill pack route "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "provider-entry", target: "mystery" }, client),
    ).rejects.toThrow('Unknown provider entry "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "provider-entry", target: "gemini" }, client),
    ).rejects.toThrow('Ambiguous provider entry "gemini"');

    await expect(
      runWebaiBridgeCli({ command: "provider-entry", target: "gemini:web-login:bogus" }, client),
    ).rejects.toThrow('Invalid provider entry "gemini:web-login:bogus"');

    await expect(
      runWebaiBridgeCli({ command: "builder-template", target: "mystery" }, client),
    ).rejects.toThrow('Unknown builder template "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "skill-template", target: "mystery" }, client),
    ).rejects.toThrow('Unknown skill template "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "builder-example", target: "mystery" }, client),
    ).rejects.toThrow('Unknown builder example "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "skill-example", target: "mystery" }, client),
    ).rejects.toThrow('Unknown skill example "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "host-playbook", target: "mystery" }, client),
    ).rejects.toThrow('Unknown host playbook "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "host-example", target: "mystery" }, client),
    ).rejects.toThrow('Unknown host example "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "starter-pack-scenario", target: "mystery" }, client),
    ).rejects.toThrow('Unknown starter pack scenario "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "starter-pack-filter", target: "mystery" }, client),
    ).rejects.toThrow('Unknown starter pack filter "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "builder-journey", target: "mystery" }, client),
    ).rejects.toThrow('Unknown builder journey "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "keyword-entry", target: "mystery" }, client),
    ).rejects.toThrow('Unknown keyword truth entry "mystery"');

    await expect(
      runWebaiBridgeCli({ command: "builder-intent", target: "mystery" }, client),
    ).rejects.toThrow('Unknown builder intent "mystery"');
  });

  it("covers health, auth-status, provider-status, probe, and remediation branches", async () => {
    client.health.mockResolvedValue({ totals: { total: 5 } });
    client.authStatus.mockResolvedValue({ blockingCount: 1 });
    client.providerStatus.mockResolvedValue({ providerId: "chatgpt" });
    client.providerProbe.mockResolvedValue({ providerId: "chatgpt", liveProof: null });
    client.providerRemediation.mockResolvedValue({ providerId: "chatgpt", remediation: [] });
    client.providerCurrentPage.mockResolvedValue({ status: "captured" });
    client.providerCurrentConsole.mockResolvedValue({ status: "unavailable" });
    client.providerCurrentNetwork.mockResolvedValue({ status: "limited" });
    client.providerSupportBundle.mockResolvedValue({
      storeReadiness: { runtimeReadiness: "degraded" },
      liveReadiness: { status: "live-blocked" },
      attachTarget: { available: true },
      diagnoseLadder: [{ id: "repair-session", status: "recommended" }],
    });

    const { runWebaiBridgeCli, renderCliPayload } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );

    await expect(runWebaiBridgeCli({ command: "health" }, client)).resolves.toEqual({
      command: "health",
      result: { totals: { total: 5 } },
    });
    await expect(runWebaiBridgeCli({ command: "auth-status" }, client)).resolves.toEqual({
      command: "auth-status",
      result: { blockingCount: 1 },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-status", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-status",
      provider: "chatgpt",
      result: { providerId: "chatgpt" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-probe", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-probe",
      provider: "chatgpt",
      result: { providerId: "chatgpt", liveProof: null },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-remediation", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-remediation",
      provider: "chatgpt",
      result: { providerId: "chatgpt", remediation: [] },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-current-page", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-current-page",
      provider: "chatgpt",
      result: { status: "captured" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-current-console", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-current-console",
      provider: "chatgpt",
      result: { status: "unavailable" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-current-network", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-current-network",
      provider: "chatgpt",
      result: { status: "limited" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-store-readiness", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-store-readiness",
      provider: "chatgpt",
      result: { runtimeReadiness: "degraded" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-live-readiness", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-live-readiness",
      provider: "chatgpt",
      result: { status: "live-blocked" },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-attach-target", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-attach-target",
      provider: "chatgpt",
      result: { available: true },
    });
    await expect(
      runWebaiBridgeCli({ command: "provider-diagnose-ladder", provider: "chatgpt" }, client),
    ).resolves.toEqual({
      command: "provider-diagnose-ladder",
      provider: "chatgpt",
      result: [{ id: "repair-session", status: "recommended" }],
    });

    expect(renderCliPayload({ ok: true })).toContain('"ok": true');
  });

  it("builds a readonly client and throws enriched HTTP errors", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: false,
      status: 503,
      async json() {
        return {
          error: {
            type: "provider-unavailable",
          },
        };
      },
    }));

    const { createReadonlyCliClient } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );
    const readonlyClient = createReadonlyCliClient({
      baseUrl: "http://127.0.0.1:4010",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(readonlyClient.authStatus()).rejects.toMatchObject({
      status: 503,
      payload: {
        error: {
          type: "provider-unavailable",
        },
      },
    });
  });

  it("covers readonly client success branches for provider routes", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      async json() {
        if (url.endsWith("/doctor")) {
          return {
            doctor: {
              summary: {
                blockingProviders: ["claude"],
              },
            },
          };
        }

        if (url.endsWith("/plan")) {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(
            JSON.stringify({
              policyProfile: "official-api-first",
              requiredCapabilities: ["tool-calling"],
              requireOfficialApi: true,
            }),
          );

          return {
            plan: {
              policyProfile: "official-api-first",
              recommended: {
                providerId: "chatgpt",
              },
            },
          };
        }

        if (url.endsWith("/providers")) {
          return {
            discovery: {
              providers: [{ providerId: "chatgpt" }],
            },
          };
        }

        if (url.endsWith("/auth-status")) {
          return {
            blockingCount: 0,
          };
        }

        if (url.endsWith("/health")) {
          return {
            lane: "web",
            totals: {
              total: 5,
              ready: 3,
              degraded: 1,
              userActionRequired: 1,
              unavailable: 0,
            },
            generatedAt: "2026-04-03T00:00:00.000Z",
          };
        }

        if (url.endsWith("/status")) {
          return {
            provider: { providerId: "chatgpt", state: "ready" },
          };
        }

        if (url.endsWith("/probe")) {
          return {
            probe: { providerId: "chatgpt", liveProof: null },
          };
        }

        if (url.endsWith("/remediation")) {
          return {
            remediation: { providerId: "chatgpt", items: [] },
          };
        }

        if (url.endsWith("/current-page")) {
          return {
            debug: { status: "captured", url: "https://chatgpt.com/" },
          };
        }

        if (url.endsWith("/current-console")) {
          return {
            debug: { status: "unavailable", entries: [] },
          };
        }

        if (url.endsWith("/current-network")) {
          return {
            debug: { status: "limited", entries: [] },
          };
        }

        return {
          debug: {
            providerId: "chatgpt",
            attachTarget: { available: true },
            storeReadiness: { runtimeReadiness: "ready" },
            liveReadiness: { status: "live-blocked" },
            diagnoseLadder: [{ id: "repair-session", status: "recommended" }],
          },
        };
      },
    }));

    const { createReadonlyCliClient } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );
    const readonlyClient = createReadonlyCliClient({
      baseUrl: "http://127.0.0.1:4010/",
      fetch: fetchMock as unknown as typeof fetch,
      headers: {
        authorization: "Bearer local",
      },
    });

    await expect(readonlyClient.listProviders()).resolves.toEqual([
      { providerId: "chatgpt" },
    ]);
    await expect(readonlyClient.authStatus()).resolves.toEqual({
      blockingCount: 0,
    });
    await expect(readonlyClient.health()).resolves.toEqual({
      lane: "web",
      totals: {
        total: 5,
        ready: 3,
        degraded: 1,
        userActionRequired: 1,
        unavailable: 0,
      },
      generatedAt: "2026-04-03T00:00:00.000Z",
    });
    await expect(readonlyClient.runtimeDoctor()).resolves.toEqual({
      summary: {
        blockingProviders: ["claude"],
      },
    });
    await expect(
      readonlyClient.runtimePlan({
        policyProfile: "official-api-first",
        requiredCapabilities: ["tool-calling"],
        requireOfficialApi: true,
      }),
    ).resolves.toEqual({
      policyProfile: "official-api-first",
      recommended: {
        providerId: "chatgpt",
      },
    });
    await expect(readonlyClient.providerStatus("chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      state: "ready",
    });
    await expect(readonlyClient.providerProbe("chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      liveProof: null,
    });
    await expect(readonlyClient.providerRemediation("chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      items: [],
    });
    await expect(readonlyClient.providerCurrentPage("chatgpt")).resolves.toEqual({
      status: "captured",
      url: "https://chatgpt.com/",
    });
    await expect(readonlyClient.providerCurrentConsole("chatgpt")).resolves.toEqual({
      status: "unavailable",
      entries: [],
    });
    await expect(readonlyClient.providerCurrentNetwork("chatgpt")).resolves.toEqual({
      status: "limited",
      entries: [],
    });
    await expect(readonlyClient.providerSupportBundle("chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      attachTarget: { available: true },
      storeReadiness: { runtimeReadiness: "ready" },
      liveReadiness: { status: "live-blocked" },
      diagnoseLadder: [{ id: "repair-session", status: "recommended" }],
    });
    await expect(readonlyClient.providerStoreReadiness("chatgpt")).resolves.toEqual({
      runtimeReadiness: "ready",
    });
    await expect(readonlyClient.providerLiveReadiness("chatgpt")).resolves.toEqual({
      status: "live-blocked",
    });
    await expect(readonlyClient.providerAttachTarget("chatgpt")).resolves.toEqual({
      available: true,
    });
    await expect(readonlyClient.providerDiagnoseLadder("chatgpt")).resolves.toEqual([
      { id: "repair-session", status: "recommended" },
    ]);
    await expect(readonlyClient.providerDiagnose("chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      attachTarget: { available: true },
      storeReadiness: { runtimeReadiness: "ready" },
      liveReadiness: { status: "live-blocked" },
      diagnoseLadder: [{ id: "repair-session", status: "recommended" }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4010/v1/runtime/providers/chatgpt/debug/support-bundle",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("rejects unknown commands and malformed CLI args", async () => {
    const { parseCliArgs, runWebaiBridgeCli } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );

    expect(() => parseCliArgs(["--weird"])).toThrow("Unknown argument");
    await expect(runWebaiBridgeCli({ command: "weird" }, client)).rejects.toThrow(
      'Unsupported command "weird"',
    );
  });

  it("covers the main execution path with a client override", async () => {
    const { runWebaiBridgeCliMain } = await import(
      "../../../scripts/webai-bridge-cli.mjs"
    );

    const output = await runWebaiBridgeCliMain(
      ["providers", "--base-url=http://127.0.0.1:5555"],
      {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:9999",
        WEBAI_BRIDGE_SERVICE_PORT: "4010",
      },
      {
        listProviders: async () => [{ providerId: "chatgpt" }],
      },
    );

    expect(JSON.parse(output)).toEqual({
      baseUrl: "http://127.0.0.1:5555",
      readOnly: true,
      command: "providers",
      result: [{ providerId: "chatgpt" }],
    });
  });
});
