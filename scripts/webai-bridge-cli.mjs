import "./load-local-env.mjs";
import {
  buildRuntimeRequestUrl,
  encodeRuntimePathSegment,
  resolveRuntimeBaseUrlFromEnv,
} from "./runtime-request-url.mjs";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const publicSurfaceCatalogPath = resolve(
  repoRoot,
  "catalogs/public-surface-catalog.json",
);
const publicSurfaceCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/public-surface-catalog.schema.json",
);
const publicDistributionLedgerPath = resolve(
  repoRoot,
  "catalogs/public-distribution-ledger.json",
);
const publicDistributionLedgerSchemaPath = resolve(
  repoRoot,
  "catalogs/public-distribution-ledger.schema.json",
);
const starterManifestTemplatesPath = resolve(
  repoRoot,
  "catalogs/starter-manifest-templates.json",
);
const starterManifestTemplatesSchemaPath = resolve(
  repoRoot,
  "catalogs/starter-manifest-templates.schema.json",
);
const starterManifestExamplesPath = resolve(
  repoRoot,
  "catalogs/starter-manifest-examples.json",
);
const starterManifestExamplesSchemaPath = resolve(
  repoRoot,
  "catalogs/starter-manifest-examples.schema.json",
);
const starterPackIndexPath = resolve(
  repoRoot,
  "starter-packs/index.json",
);
const starterPackIndexSchemaPath = resolve(
  repoRoot,
  "starter-packs/index.schema.json",
);
const starterPackChooserPath = resolve(
  repoRoot,
  "catalogs/starter-pack-chooser.json",
);
const starterPackChooserSchemaPath = resolve(
  repoRoot,
  "catalogs/starter-pack-chooser.schema.json",
);
const starterPackComparisonPath = resolve(
  repoRoot,
  "catalogs/starter-pack-comparison.json",
);
const starterPackComparisonSchemaPath = resolve(
  repoRoot,
  "catalogs/starter-pack-comparison.schema.json",
);
const hostIntegrationPlaybooksPath = resolve(
  repoRoot,
  "catalogs/host-integration-playbooks.json",
);
const hostIntegrationPlaybooksSchemaPath = resolve(
  repoRoot,
  "catalogs/host-integration-playbooks.schema.json",
);
const hostIntegrationExamplesPath = resolve(
  repoRoot,
  "examples/hosts/index.json",
);
const hostIntegrationExamplesSchemaPath = resolve(
  repoRoot,
  "examples/hosts/index.schema.json",
);
const builderJourneysPath = resolve(
  repoRoot,
  "catalogs/builder-journeys.json",
);
const builderJourneysSchemaPath = resolve(
  repoRoot,
  "catalogs/builder-journeys.schema.json",
);
const builderIntentRouterPath = resolve(
  repoRoot,
  "catalogs/builder-intent-router.json",
);
const builderIntentRouterSchemaPath = resolve(
  repoRoot,
  "catalogs/builder-intent-router.schema.json",
);
const compatTargetCatalogPath = resolve(
  repoRoot,
  "catalogs/compat-target-catalog.json",
);
const compatTargetCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/compat-target-catalog.schema.json",
);
const builderKitCatalogPath = resolve(
  repoRoot,
  "catalogs/builder-kit-catalog.json",
);
const builderKitCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/builder-kit-catalog.schema.json",
);
const skillPackCatalogPath = resolve(
  repoRoot,
  "catalogs/skill-pack-catalog.json",
);
const skillPackCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/skill-pack-catalog.schema.json",
);
const skillPackRoutesPath = resolve(
  repoRoot,
  "catalogs/skill-pack-routes.json",
);
const skillPackRoutesSchemaPath = resolve(
  repoRoot,
  "catalogs/skill-pack-routes.schema.json",
);
const providerRuntimeCatalogPath = resolve(
  repoRoot,
  "catalogs/provider-runtime-catalog.json",
);
const providerRuntimeCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/provider-runtime-catalog.schema.json",
);
const keywordTruthPath = resolve(
  repoRoot,
  "catalogs/discoverability-keyword-truth.json",
);
const keywordTruthSchemaPath = resolve(
  repoRoot,
  "catalogs/discoverability-keyword-truth.schema.json",
);
const mcpToolCatalogPath = resolve(
  repoRoot,
  "catalogs/mcp-tool-catalog.json",
);
const mcpToolCatalogSchemaPath = resolve(
  repoRoot,
  "catalogs/mcp-tool-catalog.schema.json",
);

const COMMAND_HELP =
  "providers, health, runtime-doctor, runtime-plan, auth-status, provider-status, provider-doctor, provider-probe, provider-remediation, provider-current-page, provider-current-console, provider-current-network, provider-store-readiness, provider-live-readiness, provider-attach-target, provider-diagnose-ladder, provider-support-bundle, provider-diagnose, surface-catalog, surface-catalog-schema, public-distribution-ledger, public-distribution-ledger-schema, distribution-surfaces, distribution-surface, compat-target-catalog, compat-target-catalog-schema, compat-targets, compat-target, builder-kit-catalog, builder-kit-catalog-schema, builder-kits, builder-kit, skill-pack-catalog, skill-pack-catalog-schema, skill-packs, skill-pack, skill-pack-routes, skill-pack-routes-schema, skill-pack-route, host-playbooks, host-playbooks-schema, host-playbook, host-examples, host-examples-schema, host-example, builder-journeys, builder-journeys-schema, builder-journey, builder-intent-router, builder-intent-router-schema, builder-intent, keyword-truth, keyword-truth-schema, keyword-entry, starter-manifests, starter-manifests-schema, starter-examples, starter-examples-schema, starter-pack-index, starter-pack-index-schema, starter-pack-entry, starter-pack-chooser, starter-pack-chooser-schema, starter-pack-scenario, starter-pack-comparison, starter-pack-comparison-schema, starter-pack-filter, builder-template, builder-example, skill-template, skill-example, provider-catalog, provider-catalog-schema, provider-entry, mcp-status, mcp-tools, mcp-tool-catalog, mcp-tool-catalog-schema, mcp-tool";

export function resolveCliBaseUrl(env = process.env, explicitBaseUrl) {
  const override = explicitBaseUrl?.trim();
  if (override) {
    return buildRuntimeRequestUrl(override, "/").toString().replace(/\/$/, "");
  }

  return resolveRuntimeBaseUrlFromEnv(env);
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {
    command: undefined,
    provider: undefined,
    target: undefined,
    baseUrl: undefined,
    policyProfile: undefined,
    requiredCapabilities: [],
    allowWebLogin: undefined,
    requireOfficialApi: false,
    requireToolCalling: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!options.command && !arg.startsWith("--")) {
      options.command = arg;
      continue;
    }

    if (arg === "--") {
      continue;
    }

    if (arg === "--provider") {
      options.provider = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      options.provider = arg.slice("--provider=".length);
      continue;
    }

    if (arg === "--target") {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
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

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--profile") {
      options.policyProfile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.policyProfile = arg.slice("--profile=".length);
      continue;
    }

    if (arg === "--capability") {
      options.requiredCapabilities.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--capability=")) {
      options.requiredCapabilities.push(arg.slice("--capability=".length));
      continue;
    }

    if (arg === "--allow-web-login") {
      options.allowWebLogin = true;
      continue;
    }

    if (arg === "--no-web-login") {
      options.allowWebLogin = false;
      continue;
    }

    if (arg === "--require-official-api") {
      options.requireOfficialApi = true;
      continue;
    }

    if (arg === "--require-tool-calling") {
      options.requireToolCalling = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.command) {
    throw new Error(`Missing command. Use one of: ${COMMAND_HELP}.`);
  }

  return options;
}

function withBaseUrl(baseUrl, path) {
  return buildRuntimeRequestUrl(baseUrl, path);
}

function readPublicSurfaceCatalog() {
  return JSON.parse(readFileSync(publicSurfaceCatalogPath, "utf8"));
}

function readPublicDistributionLedger() {
  return JSON.parse(readFileSync(publicDistributionLedgerPath, "utf8"));
}

function readPublicDistributionLedgerSchema() {
  return JSON.parse(readFileSync(publicDistributionLedgerSchemaPath, "utf8"));
}

function readStarterManifestTemplates() {
  return JSON.parse(readFileSync(starterManifestTemplatesPath, "utf8"));
}

function readStarterManifestTemplatesSchema() {
  return JSON.parse(readFileSync(starterManifestTemplatesSchemaPath, "utf8"));
}

function readStarterManifestExamples() {
  return JSON.parse(readFileSync(starterManifestExamplesPath, "utf8"));
}

function readStarterManifestExamplesSchema() {
  return JSON.parse(readFileSync(starterManifestExamplesSchemaPath, "utf8"));
}

function readStarterPackIndex() {
  return JSON.parse(readFileSync(starterPackIndexPath, "utf8"));
}

function readStarterPackIndexSchema() {
  return JSON.parse(readFileSync(starterPackIndexSchemaPath, "utf8"));
}

function readStarterPackChooser() {
  return JSON.parse(readFileSync(starterPackChooserPath, "utf8"));
}

function readStarterPackChooserSchema() {
  return JSON.parse(readFileSync(starterPackChooserSchemaPath, "utf8"));
}

function readStarterPackComparison() {
  return JSON.parse(readFileSync(starterPackComparisonPath, "utf8"));
}

function readStarterPackComparisonSchema() {
  return JSON.parse(readFileSync(starterPackComparisonSchemaPath, "utf8"));
}

function readHostIntegrationPlaybooks() {
  return JSON.parse(readFileSync(hostIntegrationPlaybooksPath, "utf8"));
}

function readHostIntegrationPlaybooksSchema() {
  return JSON.parse(readFileSync(hostIntegrationPlaybooksSchemaPath, "utf8"));
}

function readHostIntegrationExamples() {
  return JSON.parse(readFileSync(hostIntegrationExamplesPath, "utf8"));
}

function readHostIntegrationExamplesSchema() {
  return JSON.parse(readFileSync(hostIntegrationExamplesSchemaPath, "utf8"));
}

function readBuilderJourneys() {
  return JSON.parse(readFileSync(builderJourneysPath, "utf8"));
}

function readBuilderJourneysSchema() {
  return JSON.parse(readFileSync(builderJourneysSchemaPath, "utf8"));
}

function readBuilderIntentRouter() {
  return JSON.parse(readFileSync(builderIntentRouterPath, "utf8"));
}

function readBuilderIntentRouterSchema() {
  return JSON.parse(readFileSync(builderIntentRouterSchemaPath, "utf8"));
}

function readCompatTargetCatalog() {
  return JSON.parse(readFileSync(compatTargetCatalogPath, "utf8"));
}

function readCompatTargetCatalogSchema() {
  return JSON.parse(readFileSync(compatTargetCatalogSchemaPath, "utf8"));
}

function readBuilderKitCatalog() {
  return JSON.parse(readFileSync(builderKitCatalogPath, "utf8"));
}

function readBuilderKitCatalogSchema() {
  return JSON.parse(readFileSync(builderKitCatalogSchemaPath, "utf8"));
}

function readSkillPackCatalog() {
  return JSON.parse(readFileSync(skillPackCatalogPath, "utf8"));
}

function readSkillPackCatalogSchema() {
  return JSON.parse(readFileSync(skillPackCatalogSchemaPath, "utf8"));
}

function readSkillPackRoutes() {
  return JSON.parse(readFileSync(skillPackRoutesPath, "utf8"));
}

function readSkillPackRoutesSchema() {
  return JSON.parse(readFileSync(skillPackRoutesSchemaPath, "utf8"));
}

function readProviderRuntimeCatalog() {
  return JSON.parse(readFileSync(providerRuntimeCatalogPath, "utf8"));
}

function readProviderRuntimeCatalogSchema() {
  return JSON.parse(readFileSync(providerRuntimeCatalogSchemaPath, "utf8"));
}

function readKeywordTruth() {
  return JSON.parse(readFileSync(keywordTruthPath, "utf8"));
}

function readKeywordTruthSchema() {
  return JSON.parse(readFileSync(keywordTruthSchemaPath, "utf8"));
}

function readMcpToolCatalog() {
  return JSON.parse(readFileSync(mcpToolCatalogPath, "utf8"));
}

function readMcpToolCatalogSchema() {
  return JSON.parse(readFileSync(mcpToolCatalogSchemaPath, "utf8"));
}

function readPublicSurfaceCatalogSchema() {
  return JSON.parse(readFileSync(publicSurfaceCatalogSchemaPath, "utf8"));
}

function requireTarget(target, command) {
  const value = target?.trim();
  if (!value) {
    throw new Error(`${command} requires --target <targetId>.`);
  }

  return value;
}

function requireStarterPackEntry(indexDocument, target, command) {
  const value = requireTarget(target, command);
  const builder = indexDocument.builderPacks.find((entry) => entry.target === value);
  if (builder) {
    return builder;
  }

  const skill = indexDocument.skillPacks.find((entry) => entry.id === value);
  if (skill) {
    return skill;
  }

  const knownTargets = [
    ...indexDocument.builderPacks.map((entry) => entry.target),
    ...indexDocument.skillPacks.map((entry) => entry.id),
  ];
  throw new Error(`Unknown starter pack "${value}". Use one of: ${knownTargets.join(", ")}.`);
}

function requireStarterPackScenario(chooserDocument, target, command) {
  const value = requireTarget(target, command);
  const result = chooserDocument.scenarios.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown starter pack scenario "${value}". Use one of: ${chooserDocument.scenarios
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireStarterPackFilter(comparisonDocument, target, command) {
  const value = requireTarget(target, command);
  const result = comparisonDocument.filters.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown starter pack filter "${value}". Use one of: ${comparisonDocument.filters
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireBuilderJourney(journeyDocument, target, command) {
  const value = requireTarget(target, command);
  const result = journeyDocument.journeys.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown builder journey "${value}". Use one of: ${journeyDocument.journeys
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireBuilderIntent(routerDocument, target, command) {
  const value = requireTarget(target, command);
  const result = routerDocument.intents.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown builder intent "${value}". Use one of: ${routerDocument.intents
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireSkillPackRoute(routeDocument, target, command) {
  const value = requireTarget(target, command);
  const result = routeDocument.routes.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown skill pack route "${value}". Use one of: ${routeDocument.routes
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireKeywordTruthEntry(keywordTruthDocument, target, command) {
  const value = requireTarget(target, command);
  const result = keywordTruthDocument.entries.find((entry) => entry.id === value);

  if (!result) {
    throw new Error(
      `Unknown keyword truth entry "${value}". Use one of: ${keywordTruthDocument.entries
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireProviderRuntimeCatalogEntry(providerCatalogDocument, target, command) {
  const value = requireTarget(target, command);
  const parts = value.split(":");
  if (parts.length > 2) {
    throw new Error(
      `Invalid provider entry "${value}". Use "<providerId>" or "<providerId>:<lane>".`,
    );
  }

  const [providerIdPart, lanePart] = parts;
  const providerId = providerIdPart?.trim() ?? "";
  const lane = lanePart?.trim() ?? "";
  const candidates = providerCatalogDocument.providers.filter(
    (entry) => entry.providerId === providerId,
  );

  if (lane) {
    const result = candidates.find((entry) => entry.lane === lane);
    if (!result) {
      throw new Error(
        `Unknown provider entry "${value}". Use one of: ${providerCatalogDocument.providers
          .map((entry) => `${entry.providerId}:${entry.lane}`)
          .join(", ")}.`,
      );
    }
    return result;
  }

  if (parts.length === 2 && !lane) {
    throw new Error(
      `Invalid provider entry "${value}". Use "<providerId>" or "<providerId>:<lane>".`,
    );
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous provider entry "${value}". Use one of: ${candidates
        .map((entry) => `${entry.providerId}:${entry.lane}`)
        .join(", ")}.`,
      );
  }

  throw new Error(
    `Unknown provider entry "${value}". Use one of: ${providerCatalogDocument.providers
      .map((entry) => `${entry.providerId}:${entry.lane}`)
      .join(", ")}.`,
  );
}

function requireMcpToolEntry(mcpToolCatalogDocument, target, command) {
  const value = requireTarget(target, command);
  const candidates = mcpToolCatalogDocument.tools.filter((entry) => entry.name === value);

  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous MCP tool "${value}". The MCP tool catalog must keep unique tool names.`,
    );
  }

  const result = candidates[0];

  if (!result) {
    throw new Error(
      `Unknown MCP tool "${value}". Use one of: ${mcpToolCatalogDocument.tools
        .map((entry) => entry.name)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireHostPlaybook(playbookDocument, target, command) {
  const value = requireTarget(target, command);
  const result = playbookDocument.playbooks.find((entry) => entry.host === value);

  if (!result) {
    throw new Error(
      `Unknown host playbook "${value}". Use one of: ${playbookDocument.playbooks
        .map((entry) => entry.host)
        .join(", ")}.`,
    );
  }

  return result;
}

function requireHostExample(exampleDocument, target, command) {
  const value = requireTarget(target, command);
  const result = exampleDocument.hostExamples.find((entry) => entry.target === value);

  if (!result) {
    throw new Error(
      `Unknown host example "${value}". Use one of: ${exampleDocument.hostExamples
        .map((entry) => entry.target)
        .join(", ")}.`,
    );
  }

  return result;
}

export function createReadonlyCliClient(options) {
  const baseUrl = options.baseUrl;
  const fetchFn = options.fetch ?? fetch;
  const defaultHeaders = options.headers ?? {};

  async function request(path, init = {}) {
    const response = await fetchFn(withBaseUrl(baseUrl, path), {
      headers: new Headers(defaultHeaders),
      ...init,
    });
    const payload = await response.json();

    if (!response.ok) {
      const error = new Error(`WebaiBridge CLI request failed with HTTP ${response.status} at ${path}.`);
      Object.assign(error, {
        status: response.status,
        payload,
      });
      throw error;
    }

    return payload;
  }

  return {
    normalizeProvider(provider) {
      return encodeRuntimePathSegment(provider, "WebaiBridge CLI provider id");
    },
    listProviders() {
      return request("/v1/runtime/providers").then((payload) => payload.discovery.providers);
    },
    authStatus() {
      return request("/v1/runtime/auth-status");
    },
    health() {
      return request("/v1/runtime/health");
    },
    runtimeDoctor() {
      return request("/v1/runtime/doctor").then((payload) => payload.doctor);
    },
    runtimePlan(requestBody = {}) {
      return request("/v1/runtime/plan", {
        method: "POST",
        body: JSON.stringify(requestBody),
      }).then((payload) => payload.plan);
    },
    providerStatus(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/status`).then((payload) => payload.provider);
    },
    providerProbe(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/probe`).then((payload) => payload.probe);
    },
    providerRemediation(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/remediation`).then((payload) => payload.remediation);
    },
    providerCurrentPage(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/debug/current-page`).then((payload) => payload.debug);
    },
    providerCurrentConsole(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/debug/current-console`).then((payload) => payload.debug);
    },
    providerCurrentNetwork(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/debug/current-network`).then((payload) => payload.debug);
    },
    providerSupportBundle(provider) {
      const normalizedProvider = this.normalizeProvider(provider);
      return request(`/v1/runtime/providers/${normalizedProvider}/debug/support-bundle`).then((payload) => payload.debug);
    },
    providerStoreReadiness(provider) {
      return this.providerSupportBundle(provider).then((bundle) => bundle.storeReadiness);
    },
    providerLiveReadiness(provider) {
      return this.providerSupportBundle(provider).then((bundle) => bundle.liveReadiness);
    },
    providerAttachTarget(provider) {
      return this.providerSupportBundle(provider).then((bundle) => bundle.attachTarget);
    },
    providerDiagnoseLadder(provider) {
      return this.providerSupportBundle(provider).then((bundle) => bundle.diagnoseLadder);
    },
    providerDiagnose(provider) {
      return this.providerSupportBundle(provider);
    },
  };
}

function requireProvider(provider, command) {
  const value = provider?.trim();
  if (!value) {
    throw new Error(`${command} requires --provider <providerId>.`);
  }
  return value;
}

async function projectProviderSupportBundle(options, client, selector, projectedMethod) {
  const provider = requireProvider(options.provider, options.command);
  const result =
    projectedMethod && client[projectedMethod]
      ? await client[projectedMethod](provider)
      : selector(await client.providerSupportBundle(provider));

  return {
    command: options.command,
    provider,
    result,
  };
}

export async function runWebaiBridgeCli(options, client) {
  const command = options.command;
  const catalog = readPublicSurfaceCatalog();
  const templates = readStarterManifestTemplates();
  const templatesSchema = readStarterManifestTemplatesSchema();
  const examples = readStarterManifestExamples();
  const examplesSchema = readStarterManifestExamplesSchema();
  const starterPackIndex = readStarterPackIndex();
  const starterPackIndexSchema = readStarterPackIndexSchema();
  const starterPackChooser = readStarterPackChooser();
  const starterPackChooserSchema = readStarterPackChooserSchema();
  const starterPackComparison = readStarterPackComparison();
  const starterPackComparisonSchema = readStarterPackComparisonSchema();
  const hostPlaybooks = readHostIntegrationPlaybooks();
  const hostPlaybooksSchema = readHostIntegrationPlaybooksSchema();
  const hostExamples = readHostIntegrationExamples();
  const hostExamplesSchema = readHostIntegrationExamplesSchema();
  const builderJourneys = readBuilderJourneys();
  const builderJourneysSchema = readBuilderJourneysSchema();
  const builderIntentRouter = readBuilderIntentRouter();
  const builderIntentRouterSchema = readBuilderIntentRouterSchema();
  const compatTargetCatalog = readCompatTargetCatalog();
  const compatTargetCatalogSchema = readCompatTargetCatalogSchema();
  const publicDistributionLedger = readPublicDistributionLedger();
  const publicDistributionLedgerSchema = readPublicDistributionLedgerSchema();
  const builderKitCatalog = readBuilderKitCatalog();
  const builderKitCatalogSchema = readBuilderKitCatalogSchema();
  const skillPackCatalog = readSkillPackCatalog();
  const skillPackCatalogSchema = readSkillPackCatalogSchema();
  const skillPackRoutes = readSkillPackRoutes();
  const skillPackRoutesSchema = readSkillPackRoutesSchema();
  const providerRuntimeCatalog = readProviderRuntimeCatalog();
  const providerRuntimeCatalogSchema = readProviderRuntimeCatalogSchema();
  const keywordTruth = readKeywordTruth();
  const keywordTruthSchema = readKeywordTruthSchema();
  const mcpToolCatalog = readMcpToolCatalog();
  const mcpToolCatalogSchema = readMcpToolCatalogSchema();
  const catalogSchema = readPublicSurfaceCatalogSchema();

  switch (command) {
    case "surface-catalog":
      return {
        command,
        result: catalog,
      };
    case "surface-catalog-schema":
      return {
        command,
        result: catalogSchema,
      };
    case "public-distribution-ledger":
      return {
        command,
        result: publicDistributionLedger,
      };
    case "public-distribution-ledger-schema":
      return {
        command,
        result: publicDistributionLedgerSchema,
      };
    case "distribution-surfaces":
      return {
        command,
        result: publicDistributionLedger.entries,
      };
    case "distribution-surface": {
      const target = requireTarget(options.target, command);
      const result = publicDistributionLedger.entries.find(
        (entry) => entry.target === target,
      );

      if (!result) {
        throw new Error(
          `Unknown distribution surface "${target}". Use one of: ${publicDistributionLedger.entries
            .map((entry) => entry.target)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "compat-target-catalog":
      return {
        command,
        result: compatTargetCatalog,
      };
    case "compat-target-catalog-schema":
      return {
        command,
        result: compatTargetCatalogSchema,
      };
    case "builder-kit-catalog":
      return {
        command,
        result: builderKitCatalog,
      };
    case "builder-kit-catalog-schema":
      return {
        command,
        result: builderKitCatalogSchema,
      };
    case "skill-pack-catalog":
      return {
        command,
        result: skillPackCatalog,
      };
    case "skill-pack-catalog-schema":
      return {
        command,
        result: skillPackCatalogSchema,
      };
    case "compat-targets":
      return {
        command,
        result: compatTargetCatalog.targets,
      };
    case "compat-target": {
      const target = requireTarget(options.target, command);
      const result = compatTargetCatalog.targets.find(
        (entry) => entry.target === target,
      );

      if (!result) {
        throw new Error(
          `Unknown compat target "${target}". Use one of: ${compatTargetCatalog.targets
            .map((entry) => entry.target)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "builder-kits":
      return {
        command,
        result: builderKitCatalog.kits,
      };
    case "builder-kit": {
      const target = requireTarget(options.target, command);
      const result = builderKitCatalog.kits.find(
        (entry) => entry.target === target,
      );

      if (!result) {
        throw new Error(
          `Unknown builder kit "${target}". Use one of: ${builderKitCatalog.kits
            .map((entry) => entry.target)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "skill-packs":
      return {
        command,
        result: skillPackCatalog.packs,
      };
    case "skill-pack": {
      const target = requireTarget(options.target, command);
      const result = skillPackCatalog.packs.find(
        (entry) => entry.id === target,
      );

      if (!result) {
        throw new Error(
          `Unknown skill pack "${target}". Use one of: ${skillPackCatalog.packs
            .map((entry) => entry.id)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "skill-pack-routes":
      return {
        command,
        result: skillPackRoutes,
      };
    case "skill-pack-routes-schema":
      return {
        command,
        result: skillPackRoutesSchema,
      };
    case "skill-pack-route": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireSkillPackRoute(skillPackRoutes, target, command),
      };
    }
    case "host-playbooks":
      return {
        command,
        result: hostPlaybooks.playbooks,
      };
    case "host-playbooks-schema":
      return {
        command,
        result: hostPlaybooksSchema,
      };
    case "host-playbook": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireHostPlaybook(hostPlaybooks, target, command),
      };
    }
    case "host-examples":
      return {
        command,
        result: hostExamples.hostExamples,
      };
    case "host-examples-schema":
      return {
        command,
        result: hostExamplesSchema,
      };
    case "host-example": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireHostExample(hostExamples, target, command),
      };
    }
    case "builder-journeys":
      return {
        command,
        result: builderJourneys,
      };
    case "builder-journeys-schema":
      return {
        command,
        result: builderJourneysSchema,
      };
    case "builder-journey": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireBuilderJourney(builderJourneys, target, command),
      };
    }
    case "builder-intent-router":
      return {
        command,
        result: builderIntentRouter,
      };
    case "builder-intent-router-schema":
      return {
        command,
        result: builderIntentRouterSchema,
      };
    case "builder-intent": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireBuilderIntent(builderIntentRouter, target, command),
      };
    }
    case "keyword-truth":
      return {
        command,
        result: keywordTruth,
      };
    case "keyword-truth-schema":
      return {
        command,
        result: keywordTruthSchema,
      };
    case "keyword-entry": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireKeywordTruthEntry(keywordTruth, target, command),
      };
    }
    case "starter-manifests":
      return {
        command,
        result: templates,
      };
    case "starter-manifests-schema":
      return {
        command,
        result: templatesSchema,
      };
    case "starter-examples":
      return {
        command,
        result: examples,
      };
    case "starter-examples-schema":
      return {
        command,
        result: examplesSchema,
      };
    case "starter-pack-index":
      return {
        command,
        result: starterPackIndex,
      };
    case "starter-pack-index-schema":
      return {
        command,
        result: starterPackIndexSchema,
      };
    case "starter-pack-entry": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireStarterPackEntry(starterPackIndex, target, command),
      };
    }
    case "starter-pack-chooser":
      return {
        command,
        result: starterPackChooser,
      };
    case "starter-pack-chooser-schema":
      return {
        command,
        result: starterPackChooserSchema,
      };
    case "starter-pack-scenario": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireStarterPackScenario(starterPackChooser, target, command),
      };
    }
    case "starter-pack-comparison":
      return {
        command,
        result: starterPackComparison,
      };
    case "starter-pack-comparison-schema":
      return {
        command,
        result: starterPackComparisonSchema,
      };
    case "starter-pack-filter": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireStarterPackFilter(starterPackComparison, target, command),
      };
    }
    case "builder-template": {
      const target = requireTarget(options.target, command);
      const result = templates.builderTemplates.find(
        (entry) => entry.target === target,
      );

      if (!result) {
        throw new Error(
          `Unknown builder template "${target}". Use one of: ${templates.builderTemplates
            .map((entry) => entry.target)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "builder-example": {
      const target = requireTarget(options.target, command);
      const result = examples.builderExamples.find(
        (entry) => entry.target === target,
      );

      if (!result) {
        throw new Error(
          `Unknown builder example "${target}". Use one of: ${examples.builderExamples
            .map((entry) => entry.target)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "skill-template": {
      const target = requireTarget(options.target, command);
      const result = templates.skillTemplates.find(
        (entry) => entry.id === target,
      );

      if (!result) {
        throw new Error(
          `Unknown skill template "${target}". Use one of: ${templates.skillTemplates
            .map((entry) => entry.id)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "skill-example": {
      const target = requireTarget(options.target, command);
      const result = examples.skillExamples.find(
        (entry) => entry.id === target,
      );

      if (!result) {
        throw new Error(
          `Unknown skill example "${target}". Use one of: ${examples.skillExamples
            .map((entry) => entry.id)
            .join(", ")}.`,
        );
      }

      return {
        command,
        target,
        result,
      };
    }
    case "provider-catalog":
      return {
        command,
        result: providerRuntimeCatalog.providers,
      };
    case "provider-catalog-schema":
      return {
        command,
        result: providerRuntimeCatalogSchema,
      };
    case "provider-entry": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireProviderRuntimeCatalogEntry(providerRuntimeCatalog, target, command),
      };
    }
    case "mcp-status":
      return {
        command,
        result: catalog.mcp,
      };
    case "mcp-tools":
      return {
        command,
        result: mcpToolCatalog.tools,
      };
    case "mcp-tool-catalog":
      return {
        command,
        result: mcpToolCatalog,
      };
    case "mcp-tool-catalog-schema":
      return {
        command,
        result: mcpToolCatalogSchema,
      };
    case "mcp-tool": {
      const target = requireTarget(options.target, command);
      return {
        command,
        target,
        result: requireMcpToolEntry(mcpToolCatalog, target, command),
      };
    }
    case "providers":
      return {
        command,
        result: await client.listProviders(),
      };
    case "auth-status":
      return {
        command,
        result: await client.authStatus(),
      };
    case "health":
      return {
        command,
        result: await client.health(),
      };
    case "runtime-doctor":
      return {
        command,
        result: await client.runtimeDoctor(),
      };
    case "runtime-plan":
      return {
        command,
        result: await client.runtimePlan({
          ...(options.policyProfile
            ? { policyProfile: options.policyProfile }
            : {}),
          ...(options.requiredCapabilities.length > 0
            ? { requiredCapabilities: options.requiredCapabilities }
            : {}),
          ...(typeof options.allowWebLogin === "boolean"
            ? { allowWebLogin: options.allowWebLogin }
            : {}),
          ...(options.requireOfficialApi
            ? { requireOfficialApi: true }
            : {}),
          ...(options.requireToolCalling
            ? { requireToolCalling: true }
            : {}),
        }),
      };
    case "provider-status": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerStatus(provider),
      };
    }
    case "provider-doctor": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerDoctor(provider),
      };
    }
    case "provider-probe": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerProbe(provider),
      };
    }
    case "provider-remediation": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerRemediation(provider),
      };
    }
    case "provider-current-page": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerCurrentPage(provider),
      };
    }
    case "provider-current-console": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerCurrentConsole(provider),
      };
    }
    case "provider-current-network": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerCurrentNetwork(provider),
      };
    }
    case "provider-store-readiness":
      return projectProviderSupportBundle(
        options,
        client,
        (bundle) => bundle.storeReadiness,
        "providerStoreReadiness",
      );
    case "provider-live-readiness":
      return projectProviderSupportBundle(
        options,
        client,
        (bundle) => bundle.liveReadiness,
        "providerLiveReadiness",
      );
    case "provider-attach-target":
      return projectProviderSupportBundle(
        options,
        client,
        (bundle) => bundle.attachTarget,
        "providerAttachTarget",
      );
    case "provider-diagnose-ladder":
      return projectProviderSupportBundle(
        options,
        client,
        (bundle) => bundle.diagnoseLadder,
        "providerDiagnoseLadder",
      );
    case "provider-support-bundle": {
      const provider = requireProvider(options.provider, command);
      return {
        command,
        provider,
        result: await client.providerSupportBundle(provider),
      };
    }
    case "provider-diagnose": {
      return projectProviderSupportBundle(
        options,
        client,
        (bundle) => bundle,
        "providerDiagnose",
      );
    }
    default:
      throw new Error(`Unsupported command "${command}". Use one of: ${COMMAND_HELP}.`);
  }
}

export function renderCliPayload(payload) {
  return JSON.stringify(payload, null, 2);
}

export async function runWebaiBridgeCliMain(
  argv = process.argv.slice(2),
  env = process.env,
  clientOverride,
) {
  const options = parseCliArgs(argv);
  const baseUrl = resolveCliBaseUrl(env, options.baseUrl);
  const client = clientOverride ?? createReadonlyCliClient({ baseUrl });
  const payload = await runWebaiBridgeCli(options, client);

  return renderCliPayload({
    baseUrl,
    readOnly: true,
    ...payload,
  });
}

async function main() {
  console.log(await runWebaiBridgeCliMain());
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
