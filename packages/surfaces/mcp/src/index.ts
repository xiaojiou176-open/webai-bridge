import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  createWebaiBridgeServiceClient,
  type WebaiBridgeServiceClient,
  type WebaiBridgeServiceClientOptions,
} from "../../sdk-client/src/index.js";

export interface WebaiBridgeMcpCliOptions {
  baseUrl?: string;
}

const sourceDir = dirname(fileURLToPath(import.meta.url));
const publicSurfaceCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/public-surface-catalog.json",
);
const publicSurfaceCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/public-surface-catalog.schema.json",
);
const publicDistributionLedgerPath = resolve(
  sourceDir,
  "../../../../catalogs/public-distribution-ledger.json",
);
const publicDistributionLedgerSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/public-distribution-ledger.schema.json",
);
const starterManifestTemplatesPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-manifest-templates.json",
);
const starterManifestTemplatesSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-manifest-templates.schema.json",
);
const starterManifestExamplesPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-manifest-examples.json",
);
const starterManifestExamplesSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-manifest-examples.schema.json",
);
const starterPackIndexPath = resolve(
  sourceDir,
  "../../../../starter-packs/index.json",
);
const starterPackIndexSchemaPath = resolve(
  sourceDir,
  "../../../../starter-packs/index.schema.json",
);
const starterPackChooserPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-pack-chooser.json",
);
const starterPackChooserSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-pack-chooser.schema.json",
);
const starterPackComparisonPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-pack-comparison.json",
);
const starterPackComparisonSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/starter-pack-comparison.schema.json",
);
const hostIntegrationPlaybooksPath = resolve(
  sourceDir,
  "../../../../catalogs/host-integration-playbooks.json",
);
const hostIntegrationPlaybooksSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/host-integration-playbooks.schema.json",
);
const hostIntegrationExamplesPath = resolve(
  sourceDir,
  "../../../../examples/hosts/index.json",
);
const hostIntegrationExamplesSchemaPath = resolve(
  sourceDir,
  "../../../../examples/hosts/index.schema.json",
);
const builderJourneysPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-journeys.json",
);
const builderJourneysSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-journeys.schema.json",
);
const builderIntentRouterPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-intent-router.json",
);
const builderIntentRouterSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-intent-router.schema.json",
);
const compatTargetCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/compat-target-catalog.json",
);
const compatTargetCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/compat-target-catalog.schema.json",
);
const builderKitCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-kit-catalog.json",
);
const builderKitCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/builder-kit-catalog.schema.json",
);
const skillPackCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/skill-pack-catalog.json",
);
const skillPackCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/skill-pack-catalog.schema.json",
);
const providerRuntimeCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/provider-runtime-catalog.json",
);
const providerRuntimeCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/provider-runtime-catalog.schema.json",
);
const keywordTruthPath = resolve(
  sourceDir,
  "../../../../catalogs/discoverability-keyword-truth.json",
);
const keywordTruthSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/discoverability-keyword-truth.schema.json",
);
const mcpToolCatalogPath = resolve(
  sourceDir,
  "../../../../catalogs/mcp-tool-catalog.json",
);
const mcpToolCatalogSchemaPath = resolve(
  sourceDir,
  "../../../../catalogs/mcp-tool-catalog.schema.json",
);

type WebaiBridgeProviderId = Parameters<WebaiBridgeServiceClient["providerStatus"]>[0];

export interface WebaiBridgeMcpToolPayload {
  [key: string]: unknown;
  readOnly: true;
  command: string;
  provider?: string;
  result: unknown;
}

type WebaiBridgeMcpToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: Record<string, z.ZodTypeAny>;
  readonly execute: (
    client: WebaiBridgeServiceClient,
    args: Record<string, unknown> | undefined,
  ) => Promise<WebaiBridgeMcpToolPayload>;
};

const PROVIDER_INPUT_SCHEMA = {
  provider: z.string().trim().min(1).describe("WebaiBridge provider id."),
};
const TARGET_INPUT_SCHEMA = {
  target: z.string().trim().min(1).describe("Catalog target id."),
};
const RUNTIME_PLAN_INPUT_SCHEMA = {
  policyProfile: z.string().trim().min(1).optional(),
  requiredCapabilities: z.array(z.string().trim().min(1)).optional(),
  allowWebLogin: z.boolean().optional(),
  requireOfficialApi: z.boolean().optional(),
  requireToolCalling: z.boolean().optional(),
};

type PublicSurfaceCatalog = {
  publicSurfaces: unknown[];
  compatTargets: Array<{ target: string } & Record<string, unknown>>;
  builderKits: Array<{ target: string } & Record<string, unknown>>;
  skillPacks: Array<{ id: string } & Record<string, unknown>>;
  providerCatalog: Array<{ providerId: string } & Record<string, unknown>>;
  mcp: { tools?: unknown[] } & Record<string, unknown>;
};

type CompatTargetCatalog = {
  targets: Array<{ target: string } & Record<string, unknown>>;
} & Record<string, unknown>;

type PublicDistributionLedger = {
  entries: Array<{ target: string } & Record<string, unknown>>;
} & Record<string, unknown>;

type BuilderKitCatalog = {
  kits: Array<{ target: string } & Record<string, unknown>>;
} & Record<string, unknown>;

type SkillPackCatalog = {
  packs: Array<{ id: string } & Record<string, unknown>>;
} & Record<string, unknown>;

type StarterManifestTemplates = {
  builderTemplates: Array<{ target: string } & Record<string, unknown>>;
  skillTemplates: Array<{ id: string } & Record<string, unknown>>;
};

type StarterManifestExamples = {
  builderExamples: Array<{ target: string } & Record<string, unknown>>;
  skillExamples: Array<{ id: string } & Record<string, unknown>>;
};

function readJsonFile<T>(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readPublicSurfaceCatalog(): PublicSurfaceCatalog {
  return readJsonFile<PublicSurfaceCatalog>(publicSurfaceCatalogPath);
}

function readPublicSurfaceCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(publicSurfaceCatalogSchemaPath);
}

function readPublicDistributionLedger() {
  return readJsonFile<PublicDistributionLedger>(publicDistributionLedgerPath);
}

function readPublicDistributionLedgerSchema() {
  return readJsonFile<Record<string, unknown>>(publicDistributionLedgerSchemaPath);
}

function readStarterManifestTemplates() {
  return readJsonFile<StarterManifestTemplates>(starterManifestTemplatesPath);
}

function readStarterManifestTemplatesSchema() {
  return readJsonFile<Record<string, unknown>>(starterManifestTemplatesSchemaPath);
}

function readStarterManifestExamples() {
  return readJsonFile<StarterManifestExamples>(starterManifestExamplesPath);
}

function readStarterManifestExamplesSchema() {
  return readJsonFile<Record<string, unknown>>(starterManifestExamplesSchemaPath);
}

function readStarterPackIndex() {
  return readJsonFile<Record<string, unknown>>(starterPackIndexPath);
}

function readStarterPackIndexSchema() {
  return readJsonFile<Record<string, unknown>>(starterPackIndexSchemaPath);
}

function readStarterPackChooser() {
  return readJsonFile<{
    scenarios: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(starterPackChooserPath);
}

function readStarterPackChooserSchema() {
  return readJsonFile<Record<string, unknown>>(starterPackChooserSchemaPath);
}

function readStarterPackComparison() {
  return readJsonFile<{
    filters: Array<{ id: string } & Record<string, unknown>>;
    rows: Array<Record<string, unknown>>;
  } & Record<string, unknown>>(starterPackComparisonPath);
}

function readStarterPackComparisonSchema() {
  return readJsonFile<Record<string, unknown>>(starterPackComparisonSchemaPath);
}

function readHostIntegrationPlaybooks() {
  return readJsonFile<{
    playbooks: Array<{ host: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(hostIntegrationPlaybooksPath);
}

function readHostIntegrationPlaybooksSchema() {
  return readJsonFile<Record<string, unknown>>(hostIntegrationPlaybooksSchemaPath);
}

function readHostIntegrationExamples() {
  return readJsonFile<{
    hostExamples: Array<{ target: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(hostIntegrationExamplesPath);
}

function readHostIntegrationExamplesSchema() {
  return readJsonFile<Record<string, unknown>>(hostIntegrationExamplesSchemaPath);
}

function readBuilderJourneys() {
  return readJsonFile<{
    journeys: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(builderJourneysPath);
}

function readBuilderJourneysSchema() {
  return readJsonFile<Record<string, unknown>>(builderJourneysSchemaPath);
}

function readBuilderIntentRouter() {
  return readJsonFile<{
    intents: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(builderIntentRouterPath);
}

function readBuilderIntentRouterSchema() {
  return readJsonFile<Record<string, unknown>>(builderIntentRouterSchemaPath);
}

function readCompatTargetCatalog() {
  return readJsonFile<CompatTargetCatalog>(compatTargetCatalogPath);
}

function readCompatTargetCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(compatTargetCatalogSchemaPath);
}

function readBuilderKitCatalog() {
  return readJsonFile<BuilderKitCatalog>(builderKitCatalogPath);
}

function readBuilderKitCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(builderKitCatalogSchemaPath);
}

function readSkillPackCatalog() {
  return readJsonFile<SkillPackCatalog>(skillPackCatalogPath);
}

function readSkillPackCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(skillPackCatalogSchemaPath);
}

function readProviderRuntimeCatalog() {
  return readJsonFile<{
    providers: Array<{ providerId: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(providerRuntimeCatalogPath);
}

function readProviderRuntimeCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(providerRuntimeCatalogSchemaPath);
}

function readKeywordTruth() {
  return readJsonFile<{
    entries: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(keywordTruthPath);
}

function readKeywordTruthSchema() {
  return readJsonFile<Record<string, unknown>>(keywordTruthSchemaPath);
}

function readMcpToolCatalog() {
  return readJsonFile<{
    tools: Array<{ name: string } & Record<string, unknown>>;
  } & Record<string, unknown>>(mcpToolCatalogPath);
}

function readMcpToolCatalogSchema() {
  return readJsonFile<Record<string, unknown>>(mcpToolCatalogSchemaPath);
}

function requireTargetArg(
  args: Record<string, unknown> | undefined,
  toolName: string,
) {
  const target = typeof args?.target === "string" ? args.target.trim() : "";

  if (!target) {
    throw new Error(`${toolName} requires a non-empty target.`);
  }

  return target;
}

function requireCatalogTarget<T extends { target: string }>(
  entries: readonly T[],
  target: string,
  toolName: string,
) {
  const result = entries.find((entry) => entry.target === target);

  if (!result) {
    throw new Error(
      `${toolName} requires a known target. Use one of: ${entries
        .map((entry) => entry.target)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireIdEntry(
  entries: readonly ({ id: string } & Record<string, unknown>)[],
  target: string,
  toolName: string,
  entryLabel: string,
) {
  const result = entries.find((entry) => entry.id === target);

  if (!result) {
    throw new Error(
      `${toolName} requires a known ${entryLabel}. Use one of: ${entries
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireProviderCatalogEntry(
  entries: readonly ({ providerId: string } & Record<string, unknown>)[],
  target: string,
  toolName: string,
) {
  const parts = target.split(":");
  if (parts.length > 2) {
    throw new Error(
      `${toolName} requires a target shaped like "<providerId>" or "<providerId>:<lane>".`,
    );
  }

  const [providerIdPart, lanePart] = parts;
  const providerId = providerIdPart?.trim() ?? "";
  const lane = lanePart?.trim() ?? "";
  const candidates = entries.filter((entry) => entry.providerId === providerId);

  if (lane) {
    const result = candidates.find((entry) => entry.lane === lane);
    if (!result) {
      throw new Error(
        `${toolName} requires a known provider entry. Use one of: ${entries
          .map((entry) => `${entry.providerId}:${entry.lane}`)
          .join(", ")}.`,
      );
    }
    return result;
  }

  if (parts.length === 2 && !lane) {
    throw new Error(
      `${toolName} requires a target shaped like "<providerId>" or "<providerId>:<lane>".`,
    );
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    throw new Error(
      `${toolName} requires an unambiguous provider entry. Use one of: ${candidates
        .map((entry) => `${entry.providerId}:${entry.lane}`)
        .join(", ")}.`,
      );
  }

  throw new Error(
    `${toolName} requires a known provider entry. Use one of: ${entries
      .map((entry) => `${entry.providerId}:${entry.lane}`)
      .join(", ")}.`,
  );
}

function requireNamedToolEntry(
  entries: readonly ({ name: string } & Record<string, unknown>)[],
  target: string,
  toolName: string,
) {
  const candidates = entries.filter((entry) => entry.name === target);

  if (candidates.length > 1) {
    throw new Error(
      `${toolName} requires an unambiguous MCP tool. The MCP tool catalog must keep unique tool names.`,
    );
  }

  const result = candidates[0];

  if (!result) {
    throw new Error(
      `${toolName} requires a known MCP tool. Use one of: ${entries
        .map((entry) => entry.name)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireStarterPackEntry(
  indexDocument: {
    builderPacks: Array<{ target: string } & Record<string, unknown>>;
    skillPacks: Array<{ id: string } & Record<string, unknown>>;
  },
  target: string,
  toolName: string,
) {
  const builder = indexDocument.builderPacks.find((entry) => entry.target === target);
  if (builder) {
    return builder;
  }

  const skill = indexDocument.skillPacks.find((entry) => entry.id === target);
  if (skill) {
    return skill;
  }

  throw new Error(
    `${toolName} requires a known starter pack. Use one of: ${[
      ...indexDocument.builderPacks.map((entry) => entry.target),
      ...indexDocument.skillPacks.map((entry) => entry.id),
    ].join(", ")}.`,
  );
}

function requireHostPlaybook(
  playbookDocument: {
    playbooks: Array<{ host: string } & Record<string, unknown>>;
  },
  target: string,
  toolName: string,
) {
  const result = playbookDocument.playbooks.find((entry) => entry.host === target);

  if (!result) {
    throw new Error(
      `${toolName} requires a known host playbook. Use one of: ${playbookDocument.playbooks
        .map((entry) => entry.host)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireHostExample(
  exampleDocument: {
    hostExamples: Array<{ target: string } & Record<string, unknown>>;
  },
  target: string,
  toolName: string,
) {
  const result = exampleDocument.hostExamples.find((entry) => entry.target === target);

  if (!result) {
    throw new Error(
      `${toolName} requires a known host example. Use one of: ${exampleDocument.hostExamples
        .map((entry) => entry.target)
        .join(", ")}.`,
    );
  }

  return result;
}

function stripTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function buildPayload(
  command: string,
  result: unknown,
  provider?: string,
): WebaiBridgeMcpToolPayload {
  return {
    readOnly: true,
    command,
    provider,
    result,
  };
}

function requireProvider(
  args: Record<string, unknown> | undefined,
  toolName: string,
): WebaiBridgeProviderId {
  const provider = typeof args?.provider === "string" ? args.provider.trim() : "";

  if (!provider) {
    throw new Error(`${toolName} requires a non-empty provider.`);
  }

  return provider as WebaiBridgeProviderId;
}

async function providerSupportProjection(
  client: WebaiBridgeServiceClient,
  args: Record<string, unknown> | undefined,
  toolName: string,
  command: string,
  project: (
    bundle: Awaited<ReturnType<WebaiBridgeServiceClient["providerSupportBundle"]>>,
  ) => unknown,
) {
  const provider = requireProvider(args, toolName);
  const bundle = await client.providerSupportBundle(provider);

  return buildPayload(command, project(bundle), provider);
}

export const WEBAI_BRIDGE_MCP_TOOL_DEFINITIONS: ReadonlyArray<WebaiBridgeMcpToolDefinition> = [
  {
    name: "webai-bridge.runtime.bootstrap",
    description: "Read the current WebaiBridge runtime bootstrap payload.",
    async execute(client) {
      return buildPayload("runtime-bootstrap", await client.bootstrap());
    },
  },
  {
    name: "webai-bridge.providers.list",
    description: "List the current WebaiBridge runtime provider catalog.",
    async execute(client) {
      return buildPayload("providers", await client.listProviders());
    },
  },
  {
    name: "webai-bridge.runtime.health",
    description: "Read the current WebaiBridge runtime health summary.",
    async execute(client) {
      return buildPayload("health", await client.health());
    },
  },
  {
    name: "webai-bridge.runtime.doctor",
    description: "Read the current aggregated runtime doctor receipt.",
    async execute(client) {
      return buildPayload("runtime-doctor", await client.runtimeDoctor());
    },
  },
  {
    name: "webai-bridge.runtime.plan",
    description: "Read the current default task-centric runtime plan.",
    inputSchema: RUNTIME_PLAN_INPUT_SCHEMA,
    async execute(client, args) {
      return buildPayload("runtime-plan", await client.runtimePlan(args ?? {}));
    },
  },
  {
    name: "webai-bridge.auth.status",
    description: "Read the current WebaiBridge auth-status summary.",
    async execute(client) {
      return buildPayload("auth-status", await client.authStatus());
    },
  },
  {
    name: "webai-bridge.provider.status",
    description: "Read the current provider runtime status for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.status");
      return buildPayload(
        "provider-status",
        await client.providerStatus(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.doctor",
    description:
      "Read the unified provider doctor receipt for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.doctor");
      return buildPayload(
        "provider-doctor",
        await client.providerDoctor(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.probe",
    description: "Read the current provider probe result for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.probe");
      return buildPayload(
        "provider-probe",
        await client.providerProbe(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.remediation",
    description: "Read the current remediation summary for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.remediation");
      return buildPayload(
        "provider-remediation",
        await client.providerRemediation(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.current_page",
    description: "Read the current captured page summary for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.current_page");
      return buildPayload(
        "provider-current-page",
        await client.providerCurrentPage(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.current_console",
    description: "Read the current captured console summary for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.current_console");
      return buildPayload(
        "provider-current-console",
        await client.providerCurrentConsole(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.current_network",
    description: "Read the current captured network summary for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.current_network");
      return buildPayload(
        "provider-current-network",
        await client.providerCurrentNetwork(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.store_readiness",
    description: "Read the store-readiness slice from a provider support bundle.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    execute(client, args) {
      return providerSupportProjection(
        client,
        args,
        "webai-bridge.provider.store_readiness",
        "provider-store-readiness",
        (bundle) => bundle.storeReadiness,
      );
    },
  },
  {
    name: "webai-bridge.provider.live_readiness",
    description: "Read the live-readiness slice from a provider support bundle.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    execute(client, args) {
      return providerSupportProjection(
        client,
        args,
        "webai-bridge.provider.live_readiness",
        "provider-live-readiness",
        (bundle) => bundle.liveReadiness,
      );
    },
  },
  {
    name: "webai-bridge.provider.attach_target",
    description: "Read the attach-target slice from a provider support bundle.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    execute(client, args) {
      return providerSupportProjection(
        client,
        args,
        "webai-bridge.provider.attach_target",
        "provider-attach-target",
        (bundle) => bundle.attachTarget,
      );
    },
  },
  {
    name: "webai-bridge.provider.diagnose_ladder",
    description: "Read the diagnose ladder slice from a provider support bundle.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    execute(client, args) {
      return providerSupportProjection(
        client,
        args,
        "webai-bridge.provider.diagnose_ladder",
        "provider-diagnose-ladder",
        (bundle) => bundle.diagnoseLadder,
      );
    },
  },
  {
    name: "webai-bridge.provider.support_bundle",
    description: "Read the full support bundle for a single provider.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.support_bundle");
      return buildPayload(
        "provider-support-bundle",
        await client.providerSupportBundle(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.provider.diagnose",
    description: "Alias for the full provider support bundle used by diagnose-oriented tooling.",
    inputSchema: PROVIDER_INPUT_SCHEMA,
    async execute(client, args) {
      const provider = requireProvider(args, "webai-bridge.provider.diagnose");
      return buildPayload(
        "provider-diagnose",
        await client.providerDiagnose(provider),
        provider,
      );
    },
  },
  {
    name: "webai-bridge.catalog.surface_catalog",
    description: "Read the full machine-readable WebaiBridge outward surface catalog.",
    async execute() {
      return buildPayload("surface-catalog", readPublicSurfaceCatalog());
    },
  },
  {
    name: "webai-bridge.catalog.surface_catalog_schema",
    description: "Read the JSON schema that validates the outward surface catalog.",
    async execute() {
      return buildPayload("surface-catalog-schema", readPublicSurfaceCatalogSchema());
    },
  },
  {
    name: "webai-bridge.catalog.public_distribution_ledger",
    description: "Read the machine-readable public distribution ledger.",
    async execute() {
      return buildPayload(
        "public-distribution-ledger",
        readPublicDistributionLedger(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.public_distribution_ledger_schema",
    description: "Read the JSON schema for the public distribution ledger.",
    async execute() {
      return buildPayload(
        "public-distribution-ledger-schema",
        readPublicDistributionLedgerSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.distribution_surfaces",
    description: "Read the current public distribution surface entries.",
    async execute() {
      return buildPayload(
        "distribution-surfaces",
        readPublicDistributionLedger().entries,
      );
    },
  },
  {
    name: "webai-bridge.catalog.distribution_surface",
    description: "Read one public distribution surface record.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const catalog = readPublicDistributionLedger();
      const target = requireTargetArg(args, "webai-bridge.catalog.distribution_surface");
      return buildPayload(
        "distribution-surface",
        requireCatalogTarget(
          catalog.entries,
          target,
          "webai-bridge.catalog.distribution_surface",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.provider_catalog",
    description: "Read the current provider runtime catalog.",
    async execute() {
      return buildPayload(
        "provider-catalog",
        readProviderRuntimeCatalog().providers,
      );
    },
  },
  {
    name: "webai-bridge.catalog.provider_catalog_schema",
    description: "Read the JSON schema for the provider runtime catalog.",
    async execute() {
      return buildPayload(
        "provider-catalog-schema",
        readProviderRuntimeCatalogSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.provider_entry",
    description: "Read one provider runtime record from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const catalog = readProviderRuntimeCatalog();
      const target = requireTargetArg(args, "webai-bridge.catalog.provider_entry");
      return buildPayload(
        "provider-entry",
        requireProviderCatalogEntry(
          catalog.providers,
          target,
          "webai-bridge.catalog.provider_entry",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.compat_target_catalog",
    description: "Read the dedicated compat target catalog document.",
    async execute() {
      return buildPayload("compat-target-catalog", readCompatTargetCatalog());
    },
  },
  {
    name: "webai-bridge.catalog.compat_target_catalog_schema",
    description: "Read the dedicated compat target catalog schema.",
    async execute() {
      return buildPayload(
        "compat-target-catalog-schema",
        readCompatTargetCatalogSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.compat_targets",
    description: "Read the current compat target catalog.",
    async execute() {
      return buildPayload(
        "compat-targets",
        readCompatTargetCatalog().targets,
      );
    },
  },
  {
    name: "webai-bridge.catalog.compat_target",
    description: "Read one compat target record from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const catalog = readCompatTargetCatalog();
      const target = requireTargetArg(args, "webai-bridge.catalog.compat_target");
      return buildPayload(
        "compat-target",
        requireCatalogTarget(catalog.targets, target, "webai-bridge.catalog.compat_target"),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_kit_catalog",
    description: "Read the dedicated builder kit catalog document.",
    async execute() {
      return buildPayload("builder-kit-catalog", readBuilderKitCatalog());
    },
  },
  {
    name: "webai-bridge.catalog.builder_kit_catalog_schema",
    description: "Read the dedicated builder kit catalog schema.",
    async execute() {
      return buildPayload(
        "builder-kit-catalog-schema",
        readBuilderKitCatalogSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_kits",
    description: "Read the current builder kit starter catalog.",
    async execute() {
      return buildPayload(
        "builder-kits",
        readBuilderKitCatalog().kits,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_kit",
    description: "Read one builder kit starter recipe from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const catalog = readBuilderKitCatalog();
      const target = requireTargetArg(args, "webai-bridge.catalog.builder_kit");
      return buildPayload(
        "builder-kit",
        requireCatalogTarget(catalog.kits, target, "webai-bridge.catalog.builder_kit"),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.skill_pack_catalog",
    description: "Read the dedicated skill pack catalog document.",
    async execute() {
      return buildPayload("skill-pack-catalog", readSkillPackCatalog());
    },
  },
  {
    name: "webai-bridge.catalog.skill_pack_catalog_schema",
    description: "Read the dedicated skill pack catalog schema.",
    async execute() {
      return buildPayload(
        "skill-pack-catalog-schema",
        readSkillPackCatalogSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.skill_packs",
    description: "Read the current skills pack starter catalog.",
    async execute() {
      return buildPayload(
        "skill-packs",
        readSkillPackCatalog().packs,
      );
    },
  },
  {
    name: "webai-bridge.catalog.skill_pack",
    description: "Read one skills pack starter recipe from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const catalog = readSkillPackCatalog();
      const target = requireTargetArg(args, "webai-bridge.catalog.skill_pack");
      return buildPayload(
        "skill-pack",
        requireIdEntry(
          catalog.packs,
          target,
          "webai-bridge.catalog.skill_pack",
          "skill pack",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_playbooks",
    description: "Read the current host integration playbooks.",
    async execute() {
      return buildPayload(
        "host-playbooks",
        readHostIntegrationPlaybooks().playbooks,
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_playbooks_schema",
    description: "Read the JSON schema for host integration playbooks.",
    async execute() {
      return buildPayload(
        "host-playbooks-schema",
        readHostIntegrationPlaybooksSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_playbook",
    description: "Read one host integration playbook.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const playbooks = readHostIntegrationPlaybooks();
      const target = requireTargetArg(args, "webai-bridge.catalog.host_playbook");
      return buildPayload(
        "host-playbook",
        requireHostPlaybook(
          playbooks,
          target,
          "webai-bridge.catalog.host_playbook",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_examples",
    description: "Read the current host integration examples.",
    async execute() {
      return buildPayload(
        "host-examples",
        readHostIntegrationExamples().hostExamples,
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_examples_schema",
    description: "Read the JSON schema for host integration examples.",
    async execute() {
      return buildPayload(
        "host-examples-schema",
        readHostIntegrationExamplesSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.host_example",
    description: "Read one host integration example.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const examples = readHostIntegrationExamples();
      const target = requireTargetArg(args, "webai-bridge.catalog.host_example");
      return buildPayload(
        "host-example",
        requireHostExample(
          examples,
          target,
          "webai-bridge.catalog.host_example",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_journeys",
    description: "Read the current builder journey index.",
    async execute() {
      return buildPayload(
        "builder-journeys",
        readBuilderJourneys(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_journeys_schema",
    description: "Read the JSON schema for the builder journey index.",
    async execute() {
      return buildPayload(
        "builder-journeys-schema",
        readBuilderJourneysSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_journey",
    description: "Read one builder journey record.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const journeys = readBuilderJourneys();
      const target = requireTargetArg(args, "webai-bridge.catalog.builder_journey");
      return buildPayload(
        "builder-journey",
        requireIdEntry(
          journeys.journeys,
          target,
          "webai-bridge.catalog.builder_journey",
          "builder journey",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_intent_router",
    description: "Read the current builder intent router.",
    async execute() {
      return buildPayload(
        "builder-intent-router",
        readBuilderIntentRouter(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_intent_router_schema",
    description: "Read the JSON schema for the builder intent router.",
    async execute() {
      return buildPayload(
        "builder-intent-router-schema",
        readBuilderIntentRouterSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_intent",
    description: "Read one builder intent router entry.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const router = readBuilderIntentRouter();
      const target = requireTargetArg(args, "webai-bridge.catalog.builder_intent");
      return buildPayload(
        "builder-intent",
        requireIdEntry(
          router.intents,
          target,
          "webai-bridge.catalog.builder_intent",
          "builder intent",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.keyword_truth",
    description: "Read the current discoverability keyword truth table.",
    async execute() {
      return buildPayload(
        "keyword-truth",
        readKeywordTruth(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.keyword_truth_schema",
    description: "Read the JSON schema for the keyword truth table.",
    async execute() {
      return buildPayload(
        "keyword-truth-schema",
        readKeywordTruthSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.keyword_entry",
    description: "Read one keyword truth entry.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const keywordTruth = readKeywordTruth();
      const target = requireTargetArg(args, "webai-bridge.catalog.keyword_entry");
      return buildPayload(
        "keyword-entry",
        requireIdEntry(
          keywordTruth.entries,
          target,
          "webai-bridge.catalog.keyword_entry",
          "keyword truth entry",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_manifests",
    description: "Read the current starter manifest template catalog.",
    async execute() {
      return buildPayload(
        "starter-manifests",
        readStarterManifestTemplates(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_manifests_schema",
    description: "Read the JSON schema for starter manifest templates.",
    async execute() {
      return buildPayload(
        "starter-manifests-schema",
        readStarterManifestTemplatesSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_examples",
    description: "Read the current starter example catalog.",
    async execute() {
      return buildPayload(
        "starter-examples",
        readStarterManifestExamples(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_examples_schema",
    description: "Read the JSON schema for starter manifest examples.",
    async execute() {
      return buildPayload(
        "starter-examples-schema",
        readStarterManifestExamplesSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_index",
    description: "Read the machine-readable starter pack index.",
    async execute() {
      return buildPayload(
        "starter-pack-index",
        readStarterPackIndex(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_index_schema",
    description: "Read the JSON schema for the starter pack index.",
    async execute() {
      return buildPayload(
        "starter-pack-index-schema",
        readStarterPackIndexSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_entry",
    description: "Read one starter pack entry from the current index.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const indexDocument = readStarterPackIndex() as {
        builderPacks: Array<{ target: string } & Record<string, unknown>>;
        skillPacks: Array<{ id: string } & Record<string, unknown>>;
      };
      const target = requireTargetArg(args, "webai-bridge.catalog.starter_pack_entry");
      return buildPayload(
        "starter-pack-entry",
        requireStarterPackEntry(
          indexDocument,
          target,
          "webai-bridge.catalog.starter_pack_entry",
        ),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_chooser",
    description: "Read the machine-readable starter pack chooser.",
    async execute() {
      return buildPayload(
        "starter-pack-chooser",
        readStarterPackChooser(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_chooser_schema",
    description: "Read the JSON schema for the starter pack chooser.",
    async execute() {
      return buildPayload(
        "starter-pack-chooser-schema",
        readStarterPackChooserSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_scenario",
    description: "Read one starter pack chooser scenario.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const chooser = readStarterPackChooser();
      const target = requireTargetArg(args, "webai-bridge.catalog.starter_pack_scenario");
      return buildPayload(
        "starter-pack-scenario",
        requireIdEntry(
          chooser.scenarios,
          target,
          "webai-bridge.catalog.starter_pack_scenario",
          "starter pack scenario",
        ),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_comparison",
    description: "Read the machine-readable starter pack comparison matrix.",
    async execute() {
      return buildPayload(
        "starter-pack-comparison",
        readStarterPackComparison(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_comparison_schema",
    description: "Read the JSON schema for the starter pack comparison matrix.",
    async execute() {
      return buildPayload(
        "starter-pack-comparison-schema",
        readStarterPackComparisonSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.starter_pack_filter",
    description: "Read one starter pack comparison filter group.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const comparison = readStarterPackComparison();
      const target = requireTargetArg(args, "webai-bridge.catalog.starter_pack_filter");
      return buildPayload(
        "starter-pack-filter",
        requireIdEntry(
          comparison.filters,
          target,
          "webai-bridge.catalog.starter_pack_filter",
          "starter pack filter",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_template",
    description: "Read one builder template manifest from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const templates = readStarterManifestTemplates();
      const target = requireTargetArg(args, "webai-bridge.catalog.builder_template");
      return buildPayload(
        "builder-template",
        requireCatalogTarget(
          templates.builderTemplates,
          target,
          "webai-bridge.catalog.builder_template",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.builder_example",
    description: "Read one builder example payload from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const examples = readStarterManifestExamples();
      const target = requireTargetArg(args, "webai-bridge.catalog.builder_example");
      return buildPayload(
        "builder-example",
        requireCatalogTarget(
          examples.builderExamples,
          target,
          "webai-bridge.catalog.builder_example",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.skill_template",
    description: "Read one skill template manifest from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const templates = readStarterManifestTemplates();
      const target = requireTargetArg(args, "webai-bridge.catalog.skill_template");
      return buildPayload(
        "skill-template",
        requireIdEntry(
          templates.skillTemplates,
          target,
          "webai-bridge.catalog.skill_template",
          "skill template",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.skill_example",
    description: "Read one skill example payload from the current catalog.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const examples = readStarterManifestExamples();
      const target = requireTargetArg(args, "webai-bridge.catalog.skill_example");
      return buildPayload(
        "skill-example",
        requireIdEntry(
          examples.skillExamples,
          target,
          "webai-bridge.catalog.skill_example",
          "skill example",
        ),
        undefined,
      );
    },
  },
  {
    name: "webai-bridge.catalog.mcp_status",
    description: "Read the current MCP truth block from the outward surface catalog.",
    async execute() {
      return buildPayload("mcp-status", readPublicSurfaceCatalog().mcp);
    },
  },
  {
    name: "webai-bridge.catalog.mcp_tools",
    description: "Read the current MCP tool inventory from the dedicated MCP tool catalog.",
    async execute() {
      return buildPayload(
        "mcp-tools",
        readMcpToolCatalog().tools,
      );
    },
  },
  {
    name: "webai-bridge.catalog.mcp_tool_catalog",
    description: "Read the dedicated MCP tool catalog.",
    async execute() {
      return buildPayload(
        "mcp-tool-catalog",
        readMcpToolCatalog(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.mcp_tool_catalog_schema",
    description: "Read the JSON schema for the dedicated MCP tool catalog.",
    async execute() {
      return buildPayload(
        "mcp-tool-catalog-schema",
        readMcpToolCatalogSchema(),
      );
    },
  },
  {
    name: "webai-bridge.catalog.mcp_tool",
    description: "Read one MCP tool catalog entry.",
    inputSchema: TARGET_INPUT_SCHEMA,
    async execute(_client, args) {
      const target = requireTargetArg(args, "webai-bridge.catalog.mcp_tool");
      return buildPayload(
        "mcp-tool",
        requireNamedToolEntry(
          readMcpToolCatalog().tools,
          target,
          "webai-bridge.catalog.mcp_tool",
        ),
      );
    },
  },
];

export function resolveMcpBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  explicitBaseUrl?: string,
) {
  const override = explicitBaseUrl?.trim();

  if (override) {
    return stripTrailingSlashes(override);
  }

  const envBaseUrl = env.WEBAI_BRIDGE_RUNTIME_BASE_URL?.trim();

  if (envBaseUrl) {
    return stripTrailingSlashes(envBaseUrl);
  }

  const port = env.WEBAI_BRIDGE_SERVICE_PORT?.trim() || "4010";
  return `http://127.0.0.1:${port}`;
}

export function parseMcpArgs(argv = process.argv.slice(2)): WebaiBridgeMcpCliOptions {
  const options: WebaiBridgeMcpCliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runWebaiBridgeMcpTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
  client: WebaiBridgeServiceClient,
) {
  const definition = WEBAI_BRIDGE_MCP_TOOL_DEFINITIONS.find(
    (candidate) => candidate.name === toolName,
  );

  if (!definition) {
    throw new Error(`Unsupported MCP tool "${toolName}".`);
  }

  return definition.execute(client, args);
}

export function registerWebaiBridgeReadonlyMcpTools(
  server: Pick<McpServer, "registerTool">,
  client: WebaiBridgeServiceClient,
) {
  for (const definition of WEBAI_BRIDGE_MCP_TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      async (args, _extra) => {
        const payload = await definition.execute(
          client,
          args as Record<string, unknown> | undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
          structuredContent: payload,
        };
      },
    );
  }
}

export interface WebaiBridgeMcpServerOptions
  extends WebaiBridgeServiceClientOptions {
  serverName?: string;
  serverVersion?: string;
}

export function createWebaiBridgeMcpServer(
  options: WebaiBridgeMcpServerOptions,
) {
  const client = createWebaiBridgeServiceClient(options);
  const server = new McpServer(
    {
      name: options.serverName ?? "webai-bridge-readonly-mcp",
      version: options.serverVersion ?? "0.1.0",
    },
    {},
  );

  registerWebaiBridgeReadonlyMcpTools(server, client);

  return {
    server,
    client,
  };
}

export async function runWebaiBridgeMcpStdioServer(
  options: WebaiBridgeMcpServerOptions,
) {
  const { server, client } = createWebaiBridgeMcpServer(options);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  return {
    server,
    client,
    transport,
  };
}
