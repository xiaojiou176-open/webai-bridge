import type {
  ProviderRegistration,
  RuntimeLaneExecutors,
  WebaiBridgeRuntime,
} from "../../../packages/kernel/src/index.js";
import {
  createProviderRegistry,
  createWebaiBridgeRuntime,
} from "../../../packages/kernel/src/index.js";
import type {
  AuthMode,
  CapabilityId,
  CredentialState as RuntimeCredentialState,
  LaneId,
  ProviderId,
  RuntimeRequest,
  RuntimePolicyProfileId,
} from "../../../packages/contracts/src/index.js";
import type { ByokProviderRegistry } from "../../../packages/lanes/byok/src/index.js";
import type {
  ProviderStatusView,
  RuntimeInvocationRequest,
  WebProviderId,
  WebProviderRuntime,
  WebProviderRegistry,
  WebLaneContext,
  WebLoginLane,
} from "../../../packages/lanes/web/src/index.js";
import { hasRequiredCredential } from "../../../packages/providers/byok/shared/provider-factory.js";
import type { GenerateTextRequest } from "../../../packages/surfaces/sdk-client/src/index.js";
import {
  SERVICE_AUTH_PORTAL_METADATA,
  SERVICE_SURFACE_METADATA,
  buildServiceAuthStatusView,
  buildServiceProviderRemediationView,
  buildServiceRouteCatalog,
} from "../../../packages/surfaces/http/src/service-language.js";
import type {
  ServiceInvokeResult,
  ServiceSurfaceResponse,
} from "../../../packages/surfaces/http/src/service-invoke-contract.js";

export interface ServiceInvokePayload {
  provider: string;
  model: string;
  input: string;
  lane?: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  stream?: boolean;
}

function toServiceInvokePayload(
  body: Record<string, unknown>,
): ServiceInvokePayload | undefined {
  if (
    typeof body.provider !== "string" ||
    typeof body.model !== "string" ||
    typeof body.input !== "string"
  ) {
    return undefined;
  }

  return {
    provider: body.provider,
    model: body.model,
    input: body.input,
    lane: typeof body.lane === "string" ? body.lane : undefined,
    system: typeof body.system === "string" ? body.system : undefined,
    maxOutputTokens:
      typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : undefined,
    temperature:
      typeof body.temperature === "number" ? body.temperature : undefined,
    stream: body.stream === true,
  };
}

export const SERVICE_RUNTIME_LANE_ORDER = Object.freeze([
  "web-login",
  "byok",
] as const satisfies readonly LaneId[]);

export interface ServiceRuntimePolicyProfile {
  readonly id: RuntimePolicyProfileId;
  readonly label: string;
  readonly summary: string;
}

export const SERVICE_RUNTIME_POLICY_PROFILES = Object.freeze([
  {
    id: "reliability-first",
    label: "Reliability First",
    summary:
      "Prefer the most dependable runtime path, biasing toward BYOK when it exists.",
  },
  {
    id: "official-api-first",
    label: "Official API First",
    summary:
      "Prefer providers that satisfy official-api capability and stay on the BYOK lane when possible.",
  },
  {
    id: "web-ok",
    label: "Web OK",
    summary:
      "Treat Web/Login as an explicitly acceptable runtime path and prefer it when it is ready.",
  },
  {
    id: "low-friction",
    label: "Low Friction",
    summary:
      "Take the easiest currently dispatchable lane without hiding blockers or widening support claims.",
  },
  {
    id: "strict-fail-closed",
    label: "Strict Fail Closed",
    summary:
      "Only recommend lanes that look fully ready right now, refusing degraded shortcuts.",
  },
] as const satisfies readonly ServiceRuntimePolicyProfile[]);

export interface ServiceRuntimePolicyHints {
  readonly policyProfile: RuntimePolicyProfileId;
  readonly preferredLane?: LaneId;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly allowWebLogin: boolean;
  readonly strictReadyOnly: boolean;
}

export function resolveServiceRuntimePolicyProfile(
  profile?: string,
): RuntimePolicyProfileId {
  if (
    profile === "reliability-first" ||
    profile === "official-api-first" ||
    profile === "web-ok" ||
    profile === "strict-fail-closed"
  ) {
    return profile;
  }

  return "low-friction";
}

function toByokAuthModes(): readonly AuthMode[] {
  return ["api-key"] as const;
}

function toWebAuthModes(runtime: WebProviderRuntime): readonly AuthMode[] {
  return runtime.descriptor.authProfile.mode === "oauth"
    ? (["oauth", "web-login"] as const)
    : (["session", "web-login"] as const);
}

function toByokRegistration(registration: {
  provider: string;
  lane: "byok";
  displayName: string;
  modelCatalog: {
    defaultModel?: string;
    recommendedModel?: string;
  };
  capabilities: {
    textGeneration: boolean;
    streaming: boolean;
    toolCalling: boolean;
    imageInput: boolean;
    fileInput: boolean;
    officialApi: boolean;
  };
}): ProviderRegistration {
  return {
    providerId: registration.provider,
    laneId: registration.lane,
    displayName: registration.displayName,
    authModes: toByokAuthModes(),
    defaultModel: registration.modelCatalog.defaultModel
      ? `${registration.provider}/${registration.modelCatalog.defaultModel}`
      : undefined,
    recommendedModel: registration.modelCatalog.recommendedModel
      ? `${registration.provider}/${registration.modelCatalog.recommendedModel}`
      : undefined,
    capabilities: {
      "text-generation": registration.capabilities.textGeneration,
      streaming: registration.capabilities.streaming,
      "tool-calling": registration.capabilities.toolCalling,
      "image-input": registration.capabilities.imageInput,
      "file-input": registration.capabilities.fileInput,
      "official-api": registration.capabilities.officialApi,
      "web-login": false,
    },
    diagnosticsStatus: "healthy",
    catalogSource: "static",
  };
}

function toWebRegistration(runtime: WebProviderRuntime): ProviderRegistration {
  const defaultModel = runtime.descriptor.models[0]?.id;

  return {
    providerId: runtime.descriptor.provider,
    laneId: runtime.descriptor.lane,
    displayName: runtime.descriptor.displayName,
    authModes: toWebAuthModes(runtime),
    defaultModel: defaultModel
      ? `${runtime.descriptor.provider}/${defaultModel}`
      : undefined,
    recommendedModel: defaultModel
      ? `${runtime.descriptor.provider}/${defaultModel}`
      : undefined,
    capabilities: {
      "text-generation": runtime.descriptor.capabilities.textGeneration,
      streaming: runtime.descriptor.capabilities.streaming,
      "tool-calling": runtime.descriptor.capabilities.toolCalling,
      "image-input": runtime.descriptor.capabilities.imageInput,
      "file-input": false,
      "official-api": runtime.descriptor.capabilities.officialApi,
      "web-login": runtime.descriptor.capabilities.webLogin,
    },
    diagnosticsStatus: "healthy",
    catalogSource: "static",
  };
}

export function createServiceRuntimeKernel(options: {
  byokRegistry: ByokProviderRegistry;
  webRegistry: WebProviderRegistry;
}): WebaiBridgeRuntime {
  const registrations = [
    ...options.byokRegistry.list().map(toByokRegistration),
    ...options.webRegistry.list().map(toWebRegistration),
  ];

  return createWebaiBridgeRuntime({
    registry: createProviderRegistry(registrations),
    laneOrder: SERVICE_RUNTIME_LANE_ORDER,
  });
}

function mapWebCredentialStateToRuntimeCredentialState(
  state: ProviderStatusView["credentialState"] | undefined,
): RuntimeCredentialState | undefined {
  switch (state) {
    case "ready":
      return "configured";
    case "expiring":
    case "refreshable-but-degraded":
      return "refreshable-degraded";
    case "missing":
      return "missing";
    case "expired":
      return "expired";
    case "provider-unavailable":
      return "invalid";
    case "user-action-required":
      return "user-action-required";
    default:
      return undefined;
  }
}

function isByokLaneReady(
  providerId: ProviderId,
  byokRegistry: ByokProviderRegistry,
  env: Record<string, string | undefined>,
): boolean {
  const registration = byokRegistry.get(providerId as never);

  if (!registration) {
    return false;
  }

  return hasRequiredCredential(env, registration.credential);
}

export function resolveServiceRuntimeCredentialStates(options: {
  providerId: ProviderId;
  byokRegistry: ByokProviderRegistry;
  webProviderStatuses: readonly ProviderStatusView[];
  env: Record<string, string | undefined>;
}): Partial<Record<LaneId, RuntimeCredentialState>> {
  const credentialStates: Partial<Record<LaneId, RuntimeCredentialState>> = {};

  if (options.byokRegistry.get(options.providerId as never)) {
    credentialStates.byok = isByokLaneReady(
      options.providerId,
      options.byokRegistry,
      options.env,
    )
      ? "configured"
      : "missing";
  }

  const webStatus = options.webProviderStatuses.find(
    (provider) => provider.provider === (options.providerId as WebProviderId),
  );
  const webCredentialState = mapWebCredentialStateToRuntimeCredentialState(
    webStatus?.credentialState,
  );

  if (webCredentialState) {
    credentialStates["web-login"] = webCredentialState;
  }

  return credentialStates;
}

export function suggestServicePreferredLane(options: {
  providerId: ProviderId;
  byokRegistry: ByokProviderRegistry;
  webProviderStatuses: readonly ProviderStatusView[];
  env: Record<string, string | undefined>;
}): LaneId | undefined {
  const credentialStates = resolveServiceRuntimeCredentialStates(options);
  const byokState = credentialStates.byok;
  const webState = credentialStates["web-login"];
  const byokReady =
    byokState === "configured" || byokState === "refreshable-degraded";
  const webReady =
    webState === "configured" || webState === "refreshable-degraded";
  const webKnown = webState !== undefined;

  if (webReady && !byokReady) {
    return "web-login";
  }

  if (byokReady && !webReady) {
    return "byok";
  }

  if (webReady && byokReady) {
    return "web-login";
  }

  if (webKnown && !webReady && byokReady) {
    return "byok";
  }

  if (webKnown && !webReady && !byokReady) {
    return undefined;
  }

  if (byokReady) {
    return "byok";
  }

  if (webReady) {
    return "web-login";
  }

  if (options.webProviderStatuses.some(
    (provider) => provider.provider === (options.providerId as WebProviderId),
  )) {
    return undefined;
  }

  if (options.byokRegistry.get(options.providerId as never)) {
    return "byok";
  }

  return undefined;
}

export function buildServiceRuntimePolicyHints(options: {
  providerId: ProviderId;
  policyProfile?: string;
  byokRegistry: ByokProviderRegistry;
  webProviderStatuses: readonly ProviderStatusView[];
  env: Record<string, string | undefined>;
}): ServiceRuntimePolicyHints {
  const policyProfile = resolveServiceRuntimePolicyProfile(options.policyProfile);
  const suggestedLane = suggestServicePreferredLane(options);
  const hasByok = Boolean(options.byokRegistry.get(options.providerId as never));
  const hasWeb = options.webProviderStatuses.some(
    (provider) => provider.provider === (options.providerId as WebProviderId),
  );

  switch (policyProfile) {
    case "reliability-first":
      return {
        policyProfile,
        preferredLane: hasByok ? "byok" : suggestedLane,
        requiredCapabilities: ["text-generation"],
        allowWebLogin: true,
        strictReadyOnly: false,
      };
    case "official-api-first":
      return {
        policyProfile,
        preferredLane: hasByok ? "byok" : suggestedLane,
        requiredCapabilities: ["text-generation", "official-api"],
        allowWebLogin: false,
        strictReadyOnly: false,
      };
    case "web-ok":
      return {
        policyProfile,
        preferredLane: hasWeb ? "web-login" : suggestedLane,
        requiredCapabilities: ["text-generation"],
        allowWebLogin: true,
        strictReadyOnly: false,
      };
    case "strict-fail-closed":
      return {
        policyProfile,
        preferredLane: hasByok ? "byok" : suggestedLane,
        requiredCapabilities: ["text-generation"],
        allowWebLogin: true,
        strictReadyOnly: true,
      };
    default:
      return {
        policyProfile: "low-friction",
        preferredLane: suggestedLane,
        requiredCapabilities: ["text-generation"],
        allowWebLogin: true,
        strictReadyOnly: false,
      };
  }
}

function jsonResponse(status: number, body: unknown): ServiceSurfaceResponse {
  return {
    status,
    body,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  };
}

function mapWebFailureStatus(failure: {
  errorCategory:
    | "provider-unavailable"
    | "model-resolution-error"
    | "routing-error"
    | string;
}): number {
  switch (failure.errorCategory) {
    case "provider-unavailable":
      return 503;
    case "model-resolution-error":
    case "routing-error":
      return 400;
    default:
      return 409;
  }
}

function createByokExecutor(options: {
  byokClient: {
    generateText(request: GenerateTextRequest): Promise<{
      ok: boolean;
      text?: string;
      diagnostics: Array<{ code: string; message: string }>;
      prepared?: unknown;
    }>;
  };
}): RuntimeLaneExecutors<ServiceInvokePayload, ServiceInvokeResult>["byok"] {
  return {
    execute: async ({ plan, input }) => {
      const payload = input;
      const result = await options.byokClient.generateText({
        model: `${plan.selection.providerId}/${plan.selection.model.modelId}`,
        prompt: payload.input,
        system:
          typeof payload.system === "string" ? payload.system : undefined,
        maxOutputTokens:
          typeof payload.maxOutputTokens === "number"
            ? payload.maxOutputTokens
            : undefined,
        temperature:
          typeof payload.temperature === "number"
            ? payload.temperature
            : undefined,
        stream: payload.stream === true,
      });

      if (!result.ok) {
        const primaryDiagnostic = result.diagnostics[0];
        const type = primaryDiagnostic?.code ?? "provider-unavailable";
        const status =
          type === "model-resolution-error"
            ? 400
            : type === "missing-credential"
              ? 409
              : 503;

        return {
          ok: false,
          laneId: "byok",
          providerId: plan.selection.providerId,
          modelId: plan.selection.model.modelId,
          httpStatus: status,
          errorType: type,
          message:
            primaryDiagnostic?.message ??
            "BYOK invocation failed without a structured diagnostic.",
          diagnostics: result.diagnostics,
          details: {
            routes: buildServiceRouteCatalog(),
          },
        };
      }

      return {
        ok: true,
        laneId: "byok",
        providerId: plan.selection.providerId,
        modelId: plan.selection.model.modelId,
        outputText: result.text ?? "",
        diagnostics: result.diagnostics,
        details: {
          prepared: result.prepared,
        },
      };
    },
  };
}

function createWebExecutor(options: {
  webLane: WebLoginLane;
  context: WebLaneContext;
  ownerUserId: string;
}): RuntimeLaneExecutors<ServiceInvokePayload, ServiceInvokeResult>["web-login"] {
  return {
    execute: async ({ plan, input }) => {
      const request: RuntimeInvocationRequest = {
        provider: plan.selection.providerId as WebProviderId,
        model: plan.selection.model.modelId,
        input: input.input,
        lane:
          plan.selection.laneId === "web-login" || input.lane === "web"
            ? "web"
            : undefined,
        intent: "text-generation",
        stream: input.stream === true,
      };

      const result = await options.webLane.invoke(request, options.context);

      if (!result.ok) {
        const providers = await options.webLane.authStatus(options.context);
        const runtimeProvider = providers.find(
          (entry) => entry.provider === result.provider,
        );
        const auth = runtimeProvider
          ? buildServiceAuthStatusView(
              [runtimeProvider],
              options.ownerUserId,
            ).providers[0]
          : undefined;

        return {
          ok: false,
          laneId: "web-login",
          providerId: plan.selection.providerId,
          modelId: plan.selection.model.modelId,
          httpStatus: mapWebFailureStatus(result),
          errorType: result.errorCategory,
          message: result.message,
          diagnostics: result.diagnostics,
          suggestedAction: result.suggestedAction,
          details: {
            authPortal: SERVICE_AUTH_PORTAL_METADATA,
            routes: buildServiceRouteCatalog(),
            auth,
            remediation: runtimeProvider
              ? buildServiceProviderRemediationView(
                  runtimeProvider,
                  options.ownerUserId,
                )
              : undefined,
          },
        };
      }

      return {
        ok: true,
        laneId: "web-login",
        providerId: plan.selection.providerId,
        modelId: plan.selection.model.modelId,
        outputText: result.outputText,
        diagnostics: result.diagnostics,
        details: {
          result,
        },
      };
    },
  };
}

export function createServiceRuntimeInvoker(options: {
  runtime: WebaiBridgeRuntime;
  byokClient: {
    generateText(request: GenerateTextRequest): Promise<{
      ok: boolean;
      text?: string;
      diagnostics: Array<{ code: string; message: string }>;
      prepared?: unknown;
    }>;
  };
  webLane: WebLoginLane;
  context: WebLaneContext;
  ownerUserId: string;
}) {
  const executors: RuntimeLaneExecutors<
    ServiceInvokePayload,
    ServiceInvokeResult
  > = {
    byok: createByokExecutor({
      byokClient: options.byokClient,
    }),
    "web-login": createWebExecutor({
      webLane: options.webLane,
      context: options.context,
      ownerUserId: options.ownerUserId,
    }),
  };

  return async (args: {
    request: RuntimeRequest;
    body: Record<string, unknown>;
  }): Promise<ServiceInvokeResult | ServiceSurfaceResponse> =>
  {
    const payload = toServiceInvokePayload(args.body);

    if (!payload) {
      return jsonResponse(400, {
        error: {
          message: "provider, model, and input are required string fields.",
          type: "invalid_request_error",
        },
      });
    }

    return options.runtime.invoke(args.request, executors, {
      byok: payload,
      "web-login": payload,
    });
  };
}
