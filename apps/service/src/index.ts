import { createServer, type Server } from "node:http";

import {
  buildStoredWebProviderSessions,
  buildStoredWebRuntimeEnv,
} from "../../../packages/credentials/src/index.js";
import type { WebProviderId, WebSessionSnapshot } from "../../../packages/lanes/web/src/index.js";
import { createWebaiBridgeSdkClient } from "../../../packages/surfaces/sdk-client/src/index.js";
import {
  WebaiBridgeHttpSurface,
  createNodeHttpHandler,
  buildServiceRouteCatalog,
  type ServiceRuntimeRouteCatalog,
} from "../../../packages/surfaces/http/src/index.js";

import { createDefaultWebLane } from "./default-web-lane.js";
import {
  createDefaultWebAcquisitionRunners,
  type WebAcquisitionRunnerMap,
} from "./web-auth-acquisition.js";
import {
  createDefaultWebDebugSupportRunners,
  type WebDebugSupportRunner,
} from "./browser-debug-support.js";
import {
  createDefaultWebLiveProofRunners,
  type WebLiveProofRunner,
} from "./default-web-live-proofs.js";
import {
  buildServiceRuntimePolicyHints,
  createServiceRuntimeKernel,
  createServiceRuntimeInvoker,
  resolveServiceRuntimeCredentialStates,
  SERVICE_RUNTIME_POLICY_PROFILES,
  suggestServicePreferredLane,
} from "./runtime-kernel.js";
import {
  loadLocalEnvFiles,
  loadProviderSessionsFromEnv,
  loadServicePort,
} from "./env.js";

loadLocalEnvFiles();

export interface WebaiBridgeServiceOptions {
  providerSessions?: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>>;
  runtimeEnv?: Record<string, string | undefined>;
  liveProofRunners?: Partial<Record<WebProviderId, WebLiveProofRunner>>;
  debugSupportRunners?: Partial<Record<WebProviderId, WebDebugSupportRunner>>;
  liveProofEnv?: Record<string, string | undefined>;
  acquisitionRunners?: WebAcquisitionRunnerMap;
  liveProofFetch?: typeof fetch;
  port?: number;
  serviceName?: string;
  ownerUserId?: string;
  useLocalWebAuthStore?: boolean;
}

export interface StartedWebaiBridgeService {
  server: Server;
  port: number;
  baseUrl: string;
  bootstrapUrl: string;
  routes: ServiceRuntimeRouteCatalog;
  close(): Promise<void>;
}

function mergeProviderSessions(
  ...sources: Array<Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> | undefined>
): Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> {
  const merged: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [provider, session] of Object.entries(source) as Array<
      [WebProviderId, Partial<WebSessionSnapshot> | undefined]
    >) {
      if (!session) {
        continue;
      }

      merged[provider] = {
        ...(merged[provider] ?? {}),
        ...session,
      };
    }
  }

  return merged;
}

function mergeRuntimeEnv(
  ...sources: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  return Object.assign({}, ...sources.filter(Boolean));
}

function deriveRuntimeRoutingEnvFromProviderSessions(
  providerSessions: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>>,
  runtimeEnv: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const nextEnv = { ...runtimeEnv };
  const sessions = Object.values(providerSessions).filter(Boolean) as Array<
    Partial<WebSessionSnapshot>
  >;
  const isolatedCapture = sessions.find((session) => {
    const browserMode =
      session.captureProvenance?.browserMode ?? session.acquisitionMode;

    return (
      browserMode === "isolated-chrome-root" ||
      browserMode === "existing-chrome-profile"
    );
  });

  if (!isolatedCapture?.captureProvenance) {
    return nextEnv;
  }

  const provenance = isolatedCapture.captureProvenance;
  const derivedCdpUrl = provenance.cdpUrl?.trim();
  const derivedUserDataDir = provenance.userDataDir?.trim();
  const derivedProfileName = provenance.profileName?.trim();

  nextEnv.WEBAI_BRIDGE_BROWSER_MODE ??= "isolated-chrome-root";
  nextEnv.WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE ??= "isolated-chrome-root";

  if (derivedCdpUrl) {
    nextEnv.WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL ??= derivedCdpUrl;
    nextEnv.WEBAI_BRIDGE_WEB_AUTH_CDP_URL ??= derivedCdpUrl;
    nextEnv.WEBAI_BRIDGE_WEB_GEMINI_CDP_URL ??= derivedCdpUrl;
  }

  if (derivedUserDataDir) {
    nextEnv.WEBAI_BRIDGE_CHROME_USER_DATA_DIR ??= derivedUserDataDir;
    nextEnv.WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR ??= derivedUserDataDir;
  }

  if (derivedProfileName) {
    nextEnv.WEBAI_BRIDGE_CHROME_PROFILE_NAME ??= derivedProfileName;
  }

  return nextEnv;
}

function applyRuntimeBrowserModeToProviderSessions(
  providerSessions: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>>,
  runtimeEnv: Record<string, string | undefined>,
): Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> {
  const activeMode =
    runtimeEnv.WEBAI_BRIDGE_BROWSER_MODE ?? runtimeEnv.WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE;

  if (activeMode !== "isolated-chrome-root") {
    return providerSessions;
  }

  const nextSessions: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> = {};

  for (const [provider, session] of Object.entries(providerSessions) as Array<
    [WebProviderId, Partial<WebSessionSnapshot> | undefined]
  >) {
    if (!session) {
      continue;
    }

    const currentMode = session.acquisitionMode;
    const shouldNormalizeToIsolatedRoot =
      currentMode === undefined ||
      currentMode === "managed-browser" ||
      currentMode === "existing-chrome-profile" ||
      currentMode === "isolated-chrome-root";

    nextSessions[provider] = {
      ...session,
      acquisitionMode: shouldNormalizeToIsolatedRoot
        ? "isolated-chrome-root"
        : currentMode,
    };
  }

  return nextSessions;
}

export function createWebaiBridgeService(options: WebaiBridgeServiceOptions = {}) {
  const shouldUseLocalWebAuthStore = options.useLocalWebAuthStore !== false;
  const storedProviderSessions = shouldUseLocalWebAuthStore
    ? (buildStoredWebProviderSessions(process.env) as Partial<
        Record<WebProviderId, Partial<WebSessionSnapshot>>
      >)
    : {};
  const storedRuntimeEnv = shouldUseLocalWebAuthStore
    ? buildStoredWebRuntimeEnv(process.env)
    : {};
  const providerSessions = mergeProviderSessions(
    loadProviderSessionsFromEnv(process.env),
    storedProviderSessions,
    options.providerSessions,
  );
  const baseRuntimeEnv = mergeRuntimeEnv(
    process.env,
    storedRuntimeEnv,
    options.runtimeEnv,
    options.liveProofEnv,
  );
  const baseLiveProofEnv = mergeRuntimeEnv(
    process.env,
    storedRuntimeEnv,
    options.runtimeEnv,
    options.liveProofEnv,
  );
  const runtimeEnv = deriveRuntimeRoutingEnvFromProviderSessions(
    providerSessions,
    baseRuntimeEnv,
  );
  const liveProofEnv = deriveRuntimeRoutingEnvFromProviderSessions(
    providerSessions,
    baseLiveProofEnv,
  );
  const effectiveProviderSessions = applyRuntimeBrowserModeToProviderSessions(
    providerSessions,
    runtimeEnv,
  );
  const byokClient = createWebaiBridgeSdkClient({
    env: runtimeEnv,
    fetch: options.liveProofFetch,
  });
  const { lane, context } = createDefaultWebLane({
    providerSessions: effectiveProviderSessions,
    runtimeEnv,
  });
  const runtime =
    "registry" in byokClient &&
    byokClient.registry &&
    "registry" in lane &&
    lane.registry
      ? createServiceRuntimeKernel({
          byokRegistry: byokClient.registry,
          webRegistry: lane.registry,
        })
      : undefined;
  const surface = new WebaiBridgeHttpSurface({
    webLane: lane,
    context,
    runtime,
    invokeRuntime:
      runtime &&
      "registry" in byokClient &&
      byokClient.registry
        ? createServiceRuntimeInvoker({
            runtime,
            byokClient,
            webLane: lane,
            context,
            ownerUserId: options.ownerUserId ?? "local-user",
          })
        : undefined,
    resolvePreferredLane:
      "registry" in byokClient &&
      byokClient.registry &&
      "registry" in lane &&
      lane.registry
        ? async (providerId) =>
            suggestServicePreferredLane({
              providerId,
              byokRegistry: byokClient.registry,
              webProviderStatuses: await lane.authStatus(context),
              env: runtimeEnv,
            })
        : undefined,
    resolveCredentialStates:
      "registry" in byokClient &&
      byokClient.registry &&
      "registry" in lane &&
      lane.registry
        ? async (providerId) =>
            resolveServiceRuntimeCredentialStates({
              providerId,
              byokRegistry: byokClient.registry,
              webProviderStatuses: await lane.authStatus(context),
              env: runtimeEnv,
            })
        : undefined,
    resolvePolicyHints:
      "registry" in byokClient &&
      byokClient.registry &&
      "registry" in lane &&
      lane.registry
        ? async (providerId, policyProfile) =>
            buildServiceRuntimePolicyHints({
              providerId,
              policyProfile,
              byokRegistry: byokClient.registry,
              webProviderStatuses: await lane.authStatus(context),
              env: runtimeEnv,
            })
        : undefined,
    availablePolicyProfiles: SERVICE_RUNTIME_POLICY_PROFILES.map(
      (profile) => profile.id,
    ),
    byokClient,
    serviceName: options.serviceName,
    ownerUserId: options.ownerUserId,
    liveProofRunners: {
      ...createDefaultWebLiveProofRunners({
        env: liveProofEnv,
        fetchFn: options.liveProofFetch,
      }),
      ...options.liveProofRunners,
    },
    debugSupportRunners: {
      ...createDefaultWebDebugSupportRunners(runtimeEnv),
      ...options.debugSupportRunners,
    },
    acquisitionRunners: {
      ...createDefaultWebAcquisitionRunners(runtimeEnv),
      ...options.acquisitionRunners,
    },
  });

  return {
    lane,
    context,
    runtime,
    surface,
    handler: createNodeHttpHandler(surface),
    bootstrapPath: buildServiceRouteCatalog().bootstrap,
    routes: buildServiceRouteCatalog(),
  };
}

export async function startWebaiBridgeService(
  options: WebaiBridgeServiceOptions = {},
): Promise<StartedWebaiBridgeService> {
  const app = createWebaiBridgeService(options);
  const server = createServer(app.handler);
  const requestedPort = options.port ?? 0;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const baseUrl = `http://127.0.0.1:${port}`;
  const routes = buildServiceRouteCatalog(baseUrl);

  return {
    server,
    port,
    baseUrl,
    bootstrapUrl: routes.bootstrap,
    routes,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

export function startFromProcessEnv() {
  return startWebaiBridgeService({
    port: loadServicePort(process.env),
    serviceName: "webai-bridge-local-service",
  });
}
