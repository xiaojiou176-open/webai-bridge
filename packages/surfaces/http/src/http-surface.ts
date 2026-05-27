import type { IncomingMessage, ServerResponse } from "node:http";

import type { GenerateTextRequest } from "../../sdk-client/src/index.js";
import { CAPABILITY_IDS } from "../../../contracts/src/index.js";
import {
  WebaiBridgeContractError,
} from "../../../contracts/src/index.js";
import type {
  CapabilityId,
  RuntimePolicyProfileId,
  CredentialState as RuntimeCredentialState,
  RuntimeRequest,
} from "../../../contracts/src/index.js";
import type {
  ServiceInvokeFailure,
  ServiceInvokeResult,
  ServiceInvokeSuccess,
  ServiceSurfaceResponse,
} from "./service-invoke-contract.js";
import {
  type AuthPortalCard,
  buildAuthPortalShellModel,
  renderAuthPortalShell,
} from "./auth-portal-shell.js";
import { renderProviderDebugWorkbench } from "./provider-debug-workbench.js";
import type {
  ProviderStatusView,
  RuntimeInvocationFailure,
  RuntimeInvocationRequest,
  WebLiveProofResult,
  WebProviderId,
  WebSessionSnapshot,
} from "../../../lanes/web/src/index.js";
import type { WebLaneContext } from "../../../lanes/web/src/index.js";
import { WebLoginLane } from "../../../lanes/web/src/index.js";
import type { LaneId, ProviderId } from "../../../contracts/src/index.js";
import type { WebaiBridgeRuntime } from "../../../kernel/src/index.js";
import {
  SERVICE_AUTH_PORTAL_METADATA,
  SERVICE_SURFACE_METADATA,
  applyServicePolicyProfileToDispatchPlan,
  buildServiceInvokeReceiptView,
  buildRuntimeBootstrapView,
  buildServiceAuthStatusView,
  buildServiceDispatchPlanVerdict,
  buildServiceProviderDoctorAlignment,
  buildServiceProviderDoctorReceipt,
  buildServiceProviderDebugSupportView,
  buildServiceProviderPolicyView,
  buildServiceProviderRouteRefs,
  buildServiceDiscoveryViews,
  buildServiceProviderProbeView,
  buildServiceProviderRemediationView,
  buildServiceRuntimePolicyPackCatalog,
  buildServiceRuntimePolicyPackView,
  buildServiceRemediationSummary,
  buildServiceRouteCatalog,
  type ServiceProviderDoctorView,
  type ServiceRuntimeDoctorView,
  type ServiceRuntimeDispatchPlanView,
  type ServiceRuntimePlanView,
  buildServiceRuntimeDoctorView,
} from "./service-language.js";

export interface WebaiBridgeHttpSurfaceOptions {
  webLane: WebLoginLane;
  context?: WebLaneContext;
  runtime?: WebaiBridgeRuntime;
  invokeRuntime?: (args: {
    request: RuntimeRequest;
    body: Record<string, unknown>;
  }) => Promise<ServiceInvokeResult | ServiceSurfaceResponse>;
  resolvePreferredLane?: (
    providerId: ProviderId,
  ) => Promise<"byok" | "web-login" | undefined>;
  resolveCredentialStates?: (
    providerId: ProviderId,
  ) => Promise<Partial<Record<"byok" | "web-login", RuntimeCredentialState>> | undefined>;
  resolvePolicyHints?: (
    providerId: ProviderId,
    policyProfile?: string,
  ) => Promise<{
    policyProfile: RuntimePolicyProfileId;
    preferredLane?: LaneId;
    requiredCapabilities: readonly CapabilityId[];
    allowWebLogin: boolean;
    strictReadyOnly: boolean;
  }>;
  availablePolicyProfiles?: readonly RuntimePolicyProfileId[];
  serviceName?: string;
  ownerUserId?: string;
  byokClient?: {
    registry?: unknown;
    generateText(request: GenerateTextRequest): Promise<{
      ok: boolean;
      text?: string;
      diagnostics: Array<{ code: string; message: string }>;
      prepared?: unknown;
    }>;
  };
  liveProofRunners?: Partial<Record<WebProviderId, () => Promise<WebLiveProofResult>>>;
  debugSupportRunners?: Partial<
    Record<
      WebProviderId,
      (provider: ProviderStatusView) => Promise<ReturnType<typeof buildServiceProviderDebugSupportView>>
    >
  >;
  acquisitionRunners?: Partial<
    Record<
      WebProviderId,
      {
        start(request?: AcquisitionRequestBody): Promise<unknown>;
        capture(request?: AcquisitionRequestBody): Promise<unknown>;
      }
    >
  >;
}

export type SurfaceResponse = ServiceSurfaceResponse;

type AcquisitionRequestBody = {
  mode?:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  existingChromeProfile?: {
    userDataDir?: string;
    browserPath?: string;
    cdpUrl?: string;
  };
  existingBrowserSession?: {
    sessionUrl?: string;
  };
};

function jsonResponse(status: number, body: unknown): SurfaceResponse {
  return {
    status,
    body,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  };
}

function htmlResponse(status: number, html: string): SurfaceResponse {
  return {
    status,
    body: html,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  };
}

function isServiceSurfaceResponse(
  value: ServiceInvokeResult | ServiceSurfaceResponse,
): value is ServiceSurfaceResponse {
  return "status" in value;
}

function renderInvokeSuccess(result: ServiceInvokeSuccess): SurfaceResponse {
  if (result.laneId === "byok") {
    return jsonResponse(200, {
      surface: SERVICE_SURFACE_METADATA,
      lane: "byok",
      provider: result.providerId,
      model: result.modelId,
      text: result.outputText,
      diagnostics: result.diagnostics,
      prepared: result.details?.prepared,
    });
  }

  const webResult =
    (result.details?.result as Record<string, unknown> | undefined) ?? {};

  return jsonResponse(200, {
    surface: SERVICE_SURFACE_METADATA,
    ...webResult,
  });
}

function renderInvokeFailure(result: ServiceInvokeFailure): SurfaceResponse {
  if (result.laneId === "byok") {
    return jsonResponse(result.httpStatus, {
      surface: SERVICE_SURFACE_METADATA,
      routes: result.details?.routes ?? buildServiceRouteCatalog(),
      lane: "byok",
      error: {
        message: result.message,
        type: result.errorType,
        diagnostics: result.diagnostics,
      },
    });
  }

  return jsonResponse(result.httpStatus, {
    surface: SERVICE_SURFACE_METADATA,
    authPortal: result.details?.authPortal ?? SERVICE_AUTH_PORTAL_METADATA,
    routes: result.details?.routes ?? buildServiceRouteCatalog(),
    error: {
      message: result.message,
      type: result.errorType,
      suggestedAction: result.suggestedAction,
      diagnostics: result.diagnostics,
    },
    auth: result.details?.auth,
    remediation: result.details?.remediation,
  });
}

function renderInvokeResult(
  result: ServiceInvokeResult | ServiceSurfaceResponse,
): SurfaceResponse {
  if (isServiceSurfaceResponse(result)) {
    return result;
  }

  return result.ok ? renderInvokeSuccess(result) : renderInvokeFailure(result);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeProviderPath(
  pathname: string,
): { provider?: WebProviderId; action?: "status" | "probe" | "remediation" } {
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length === 5 &&
    parts[0] === "v1" &&
    parts[1] === "runtime" &&
    parts[2] === "providers" &&
    ["status", "probe", "remediation"].includes(parts[4] ?? "")
  ) {
    return {
      provider: parts[3] as WebProviderId,
      action: parts[4] as "status" | "probe" | "remediation",
    };
  }

  return {};
}

function normalizeProviderDoctorPath(
  pathname: string,
): { provider?: ProviderId } {
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length === 5 &&
    parts[0] === "v1" &&
    parts[1] === "runtime" &&
    parts[2] === "providers" &&
    parts[4] === "doctor"
  ) {
    return {
      provider: parts[3] as ProviderId,
    };
  }

  return {};
}

function normalizeAcquisitionPath(
  pathname: string,
): { provider?: WebProviderId; action?: "start" | "capture" } {
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length === 6 &&
    parts[0] === "v1" &&
    parts[1] === "runtime" &&
    parts[2] === "providers" &&
    parts[4] === "acquisition" &&
    ["start", "capture"].includes(parts[5] ?? "")
  ) {
    return {
      provider: parts[3] as WebProviderId,
      action: parts[5] as "start" | "capture",
    };
  }

  return {};
}

function normalizeProviderDebugPath(
  pathname: string,
): {
  provider?: WebProviderId;
  action?:
    | "current-page"
    | "current-console"
    | "current-network"
    | "support-bundle"
    | "workbench";
} {
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length === 6 &&
    parts[0] === "v1" &&
    parts[1] === "runtime" &&
    parts[2] === "providers" &&
    parts[4] === "debug" &&
    ["current-page", "current-console", "current-network", "support-bundle", "workbench"].includes(parts[5] ?? "")
  ) {
    return {
      provider: parts[3] as WebProviderId,
      action: parts[5] as
        | "current-page"
        | "current-console"
        | "current-network"
        | "support-bundle"
        | "workbench",
    };
  }

  return {};
}

function mapFailureStatus(failure: RuntimeInvocationFailure): number {
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

function authStatusBody(providers: ProviderStatusView[], ownerUserId: string) {
  return {
    lane: "web",
    ...buildServiceAuthStatusView(providers, ownerUserId),
  };
}

function normalizeAcquisitionRequestBody(body: unknown): AcquisitionRequestBody | undefined {
  if (!isObject(body)) {
    return undefined;
  }

  const request: AcquisitionRequestBody = {};

  if (
    body.mode === "managed-browser" ||
    body.mode === "isolated-chrome-root" ||
    body.mode === "existing-chrome-profile" ||
    body.mode === "existing-browser-session"
  ) {
    request.mode = body.mode;
  }

  if (isObject(body.existingChromeProfile)) {
    request.existingChromeProfile = {
      userDataDir:
        typeof body.existingChromeProfile.userDataDir === "string"
          ? body.existingChromeProfile.userDataDir
          : undefined,
      browserPath:
        typeof body.existingChromeProfile.browserPath === "string"
          ? body.existingChromeProfile.browserPath
          : undefined,
      cdpUrl:
        typeof body.existingChromeProfile.cdpUrl === "string"
          ? body.existingChromeProfile.cdpUrl
          : undefined,
    };
  }

  if (isObject(body.existingBrowserSession)) {
    request.existingBrowserSession = {
      sessionUrl:
        typeof body.existingBrowserSession.sessionUrl === "string"
          ? body.existingBrowserSession.sessionUrl
          : undefined,
    };
  }

  return request;
}

function normalizePolicyProfile(value: unknown): RuntimePolicyProfileId {
  if (value === undefined || value === null) {
    return "low-friction";
  }

  if (
    value === "reliability-first" ||
    value === "official-api-first" ||
    value === "web-ok" ||
    value === "strict-fail-closed" ||
    value === "low-friction"
  ) {
    return value;
  }

  throw new WebaiBridgeContractError(
    "routing-failed",
    `Unknown policyProfile "${String(value)}". Supported values: reliability-first, official-api-first, web-ok, low-friction, strict-fail-closed.`,
  );
}

function normalizeRequestedCapabilities(value: unknown): CapabilityId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is CapabilityId =>
    typeof entry === "string" &&
    (CAPABILITY_IDS as readonly string[]).includes(entry),
  );
}

export class WebaiBridgeHttpSurface {
  private readonly webLane: WebLoginLane;
  private readonly context: WebLaneContext;
  private readonly runtime?: WebaiBridgeRuntime;
  private readonly invokeRuntime?: WebaiBridgeHttpSurfaceOptions["invokeRuntime"];
  private readonly resolvePreferredLane?: WebaiBridgeHttpSurfaceOptions["resolvePreferredLane"];
  private readonly resolveCredentialStates?: WebaiBridgeHttpSurfaceOptions["resolveCredentialStates"];
  private readonly resolvePolicyHints?: WebaiBridgeHttpSurfaceOptions["resolvePolicyHints"];
  private readonly availablePolicyProfiles: readonly RuntimePolicyProfileId[];
  private readonly serviceName: string;
  private readonly ownerUserId: string;
  private readonly byokClient?: WebaiBridgeHttpSurfaceOptions["byokClient"];
  private readonly liveProofRunners: Partial<
    Record<WebProviderId, () => Promise<WebLiveProofResult>>
  >;
  private readonly debugSupportRunners: Partial<
    Record<
      WebProviderId,
      (provider: ProviderStatusView) => Promise<ReturnType<typeof buildServiceProviderDebugSupportView>>
    >
  >;
  private readonly acquisitionRunners: Partial<
    Record<
      WebProviderId,
      {
        start(request?: AcquisitionRequestBody): Promise<unknown>;
        capture(request?: AcquisitionRequestBody): Promise<unknown>;
      }
    >
  >;

  constructor(options: WebaiBridgeHttpSurfaceOptions) {
    this.webLane = options.webLane;
    this.context = options.context ?? {};
    this.runtime = options.runtime;
    this.invokeRuntime = options.invokeRuntime;
    this.resolvePreferredLane = options.resolvePreferredLane;
    this.resolveCredentialStates = options.resolveCredentialStates;
    this.resolvePolicyHints = options.resolvePolicyHints;
    this.availablePolicyProfiles = options.availablePolicyProfiles ?? [
      "reliability-first",
      "official-api-first",
      "web-ok",
      "low-friction",
      "strict-fail-closed",
    ];
    this.serviceName = options.serviceName ?? "webai-bridge-service";
    this.ownerUserId = options.ownerUserId ?? "local-user";
    this.byokClient = options.byokClient;
    this.liveProofRunners = options.liveProofRunners ?? {};
    this.debugSupportRunners = options.debugSupportRunners ?? {};
    this.acquisitionRunners = options.acquisitionRunners ?? {};
  }

  private mapContractErrorStatus(error: WebaiBridgeContractError): number {
    switch (error.diagnostic.code) {
      case "missing-credential":
      case "credential-invalid":
      case "session-expired":
      case "user-action-required":
        return 409;
      case "provider-unavailable":
        return 503;
      default:
        return 400;
    }
  }

  private renderContractErrorResponse(
    error: WebaiBridgeContractError,
    request?: RuntimeRequest,
    explicitLane?: "byok" | "web-login",
  ): SurfaceResponse {
    const lane = explicitLane ?? request?.preferredLane;

    if (lane === "byok") {
      return jsonResponse(this.mapContractErrorStatus(error), {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        lane: "byok",
        error: {
          message: error.message,
          type: error.diagnostic.code,
          diagnostics: [error.diagnostic],
        },
      });
    }

    if (
      lane === "web-login" ||
      request?.credentialStates?.["web-login"] !== undefined
    ) {
      return jsonResponse(this.mapContractErrorStatus(error), {
        surface: SERVICE_SURFACE_METADATA,
        authPortal: SERVICE_AUTH_PORTAL_METADATA,
        routes: buildServiceRouteCatalog(),
        error: {
          message: error.message,
          type: error.diagnostic.code,
          diagnostics: [error.diagnostic],
        },
      });
    }

    return jsonResponse(this.mapContractErrorStatus(error), {
      surface: SERVICE_SURFACE_METADATA,
      routes: buildServiceRouteCatalog(),
      error: {
        message: error.message,
        type: error.diagnostic.code,
        diagnostics: [error.diagnostic],
      },
    });
  }

  private async buildRuntimeRequest(
    body: Record<string, unknown>,
    preferredLaneOverride?: "byok" | "web-login",
  ): Promise<RuntimeRequest | undefined> {
    if (!this.runtime) {
      return undefined;
    }

    const provider = body.provider;
    const model = body.model;
    const lane = body.lane;
    const registeredLanes =
      this.runtime && typeof this.runtime.listProviders === "function"
        ? this.runtime
            .listProviders()
            .filter((entry) => entry.providerId === (provider as ProviderId))
            .map((entry) => entry.laneId)
        : [];

    if (typeof provider !== "string" || typeof model !== "string") {
      return undefined;
    }

    const policyProfile = normalizePolicyProfile(body.policyProfile);
    const requestedCapabilities = normalizeRequestedCapabilities(
      body.requiredCapabilities,
    );
    const policyHints =
      this.resolvePolicyHints
        ? await this.resolvePolicyHints(provider as ProviderId, policyProfile)
        : {
            policyProfile,
            preferredLane: undefined,
            requiredCapabilities: ["text-generation"] as const,
            allowWebLogin: true,
            strictReadyOnly: false,
          };

    const preferredLane =
      preferredLaneOverride ??
      (lane === "byok"
        ? "byok"
        : lane === "web"
          ? "web-login"
          : policyHints.preferredLane);
    const shouldAttachCredentialStates =
      !preferredLane && registeredLanes.length > 1;
    const credentialStates =
      shouldAttachCredentialStates && this.resolveCredentialStates
        ? await this.resolveCredentialStates(provider as ProviderId)
        : undefined;

    return {
      surface: "service",
      providerId: provider as ProviderId,
      modelReference: `${provider}/${model}`,
      preferredLane:
        preferredLane ??
        (this.resolvePreferredLane
          ? await this.resolvePreferredLane(provider as ProviderId)
          : undefined),
      credentialStates,
      requiredCapabilities: Array.from(
        new Set([
          ...policyHints.requiredCapabilities,
          ...requestedCapabilities,
        ]),
      ),
      policyProfile: policyHints.policyProfile,
    };
  }

  private buildDispatchPlanView(
    request: RuntimeRequest,
    selection?: {
      readonly laneId: "byok" | "web-login";
      readonly candidateLanes: readonly ("byok" | "web-login")[];
      readonly reason: ServiceRuntimeDispatchPlanView["dispatchReason"];
      readonly modelReference?: string;
    },
    options: {
      credentialStates?: Partial<Record<"byok" | "web-login", RuntimeCredentialState>>;
      provider?: ProviderStatusView;
      policyProfile?: RuntimePolicyProfileId;
    } = {},
  ): ServiceRuntimeDispatchPlanView {
    const providerId = request.providerId ?? "unknown-provider";
    const requestedModel =
      typeof selection?.modelReference === "string"
        ? selection.modelReference
        : typeof request.modelReference === "string"
        ? request.modelReference.includes("/")
          ? request.modelReference
          : `${providerId}/${request.modelReference}`
        : `${providerId}/unknown-model`;
    const registeredLanes =
      this.runtime && typeof this.runtime.listProviders === "function"
        ? this.runtime
            .listProviders()
            .filter((provider) => provider.providerId === providerId)
            .map((provider) => provider.laneId as "byok" | "web-login")
            .sort((left, right) => {
              const leftIndex =
                this.runtime?.laneOrder.indexOf(left) ?? Number.MAX_SAFE_INTEGER;
              const rightIndex =
                this.runtime?.laneOrder.indexOf(right) ?? Number.MAX_SAFE_INTEGER;
              return leftIndex - rightIndex;
            })
        : [];

    const credentialStates = {
      ...(options.credentialStates ?? request.credentialStates ?? {}),
    };
    const verdict = buildServiceDispatchPlanVerdict({
      selectedLane: selection?.laneId,
      credentialStates,
      provider: options.provider,
    });

    const dispatchPlan = {
      providerId,
      requestedModel,
      policyProfile: options.policyProfile ?? request.policyProfile,
      selectedLane: selection?.laneId,
      preferredLane: request.preferredLane,
      dispatchReason: selection?.reason,
      candidateLanes: [...(selection?.candidateLanes ?? registeredLanes)],
      credentialStates,
      dispatchable: verdict.dispatchable,
      blocked: verdict.blocked,
      runtimeCanInvoke: verdict.runtimeCanInvoke,
      remediationState: verdict.remediationState,
      blockerClassification: verdict.blockerClassification,
      blockerSummary: verdict.blockerSummary,
    };
    const appliedDispatchPlan = applyServicePolicyProfileToDispatchPlan({
      policyProfile: dispatchPlan.policyProfile ?? "low-friction",
      dispatchPlan,
    });

    return {
      ...appliedDispatchPlan,
      activePolicyPack: buildServiceRuntimePolicyPackView(
        appliedDispatchPlan.policyProfile ?? "low-friction",
        {
          preferredLaneBias:
            request.preferredLane === "byok" || request.preferredLane === "web-login"
              ? request.preferredLane
              : undefined,
          requiresOfficialApi: request.requiredCapabilities?.includes("official-api"),
          allowWebLogin:
            request.preferredLane === "byok" ? false : undefined,
          strictReadyOnly:
            appliedDispatchPlan.policyProfile === "strict-fail-closed",
          requiredCapabilities: request.requiredCapabilities
            ? [...request.requiredCapabilities]
            : undefined,
        },
      ),
    };
  }

  private async buildProviderDoctorRequest(
    providerId: ProviderId,
    options: {
      policyProfile?: RuntimePolicyProfileId;
      requiredCapabilities?: readonly CapabilityId[];
    } = {},
  ): Promise<RuntimeRequest | undefined> {
    if (!this.runtime) {
      return undefined;
    }

    const policyHints =
      this.resolvePolicyHints
        ? await this.resolvePolicyHints(providerId, options.policyProfile)
        : {
            policyProfile: normalizePolicyProfile(options.policyProfile),
            preferredLane: undefined,
            requiredCapabilities: ["text-generation"] as const,
            allowWebLogin: true,
            strictReadyOnly: false,
          };

    return {
      surface: "service",
      providerId,
      preferredLane:
        policyHints.preferredLane ??
        (this.resolvePreferredLane
          ? await this.resolvePreferredLane(providerId)
          : undefined),
      credentialStates: this.resolveCredentialStates
        ? await this.resolveCredentialStates(providerId)
        : undefined,
      requiredCapabilities: Array.from(
        new Set([
          ...policyHints.requiredCapabilities,
          ...(options.requiredCapabilities ?? []),
        ]),
      ),
      policyProfile: policyHints.policyProfile,
    };
  }

  private async loadProviderDebugSupport(provider: ProviderStatusView) {
    return this.debugSupportRunners[provider.provider]
      ? await this.debugSupportRunners[provider.provider]!(provider)
      : buildServiceProviderDebugSupportView(provider, this.ownerUserId);
  }

  private async buildProviderDoctorView(
    providerId: ProviderId,
    options: {
      policyProfile?: RuntimePolicyProfileId;
      requiredCapabilities?: readonly CapabilityId[];
    } = {},
  ): Promise<ServiceProviderDoctorView | undefined> {
    if (!this.runtime) {
      return undefined;
    }

    const registeredEntries = this.runtime
      .listProviders()
      .filter((entry) => entry.providerId === providerId)
      .map((entry) => ({
        displayName: entry.displayName,
        laneId: entry.laneId as "byok" | "web-login",
        authModes: entry.authModes,
        defaultModel: entry.defaultModel?.canonical,
        recommendedModel: entry.recommendedModel?.canonical,
        capabilityMatrix: entry.capabilities,
        diagnosticsStatus: entry.diagnosticsStatus,
        catalogSource: entry.catalogSource,
      }));

    const providers = await this.webLane.authStatus(this.context);
    const provider = providers.find(
      (entry) => entry.provider === (providerId as WebProviderId),
    );

    if (registeredEntries.length === 0 && !provider) {
      return undefined;
    }

    const displayName =
      provider?.displayName ??
      registeredEntries[0]?.displayName ??
      providerId;
    const policy = buildServiceProviderPolicyView({
      providerId,
      displayName: provider?.displayName ?? displayName,
      registeredEntries,
      runtimeLaneOrder: this.runtime.laneOrder as readonly ("byok" | "web-login")[],
    });
    const doctorRequest = await this.buildProviderDoctorRequest(providerId, options);
    const credentialStates = doctorRequest?.credentialStates;
    let dispatchPlan = doctorRequest
      ? this.buildDispatchPlanView(doctorRequest, undefined, {
          credentialStates,
          provider,
          policyProfile: doctorRequest.policyProfile,
        })
      : undefined;

    if (doctorRequest) {
      try {
        const plan = this.runtime.prepareInvocation(doctorRequest);
        dispatchPlan = this.buildDispatchPlanView(
          doctorRequest,
          {
            laneId: plan.selection.laneId,
            candidateLanes: plan.dispatch.candidateLanes as readonly (
              | "byok"
              | "web-login"
            )[],
            reason: plan.dispatch.reason,
            modelReference: plan.selection.model.canonical,
          },
          {
            credentialStates,
            provider,
            policyProfile: doctorRequest.policyProfile,
          },
        );
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("diagnostic" in error)
        ) {
          throw error;
        }
      }
    }

    const probe = provider
      ? buildServiceProviderProbeView(provider, this.ownerUserId)
      : undefined;
    const remediation = provider
      ? buildServiceProviderRemediationView(provider, this.ownerUserId)
      : undefined;
    const diagnose = provider
      ? await this.loadProviderDebugSupport(provider)
      : undefined;

    if (!dispatchPlan) {
      return undefined;
    }

    const alignment = buildServiceProviderDoctorAlignment({
      dispatchPlan,
      probe,
      remediation,
      diagnose,
    });

    return {
      providerId,
      displayName: provider?.displayName ?? displayName,
      activePolicyProfile: doctorRequest?.policyProfile,
      availablePolicyProfiles: [...this.availablePolicyProfiles],
      activePolicyPack: buildServiceRuntimePolicyPackView(
        doctorRequest?.policyProfile ?? "low-friction",
      ),
      availablePolicyPacks: buildServiceRuntimePolicyPackCatalog(
        this.availablePolicyProfiles,
      ),
      policy,
      dispatchPlan,
      alignment,
      receipt: buildServiceProviderDoctorReceipt({
        providerId,
        alignment,
        policy,
        routes: buildServiceProviderRouteRefs(
          providerId as WebProviderId,
        ),
        hasDiagnose: Boolean(diagnose),
      }),
      probe,
      remediation,
      diagnose,
      routes: buildServiceProviderRouteRefs(
        providerId as WebProviderId,
      ),
    };
  }

  private async buildRuntimeDoctorView(
    policyProfile: RuntimePolicyProfileId = "low-friction",
  ): Promise<ServiceRuntimeDoctorView | undefined> {
    if (!this.runtime) {
      return undefined;
    }

    const providerIds = Array.from(
      new Set(this.runtime.listProviders().map((entry) => entry.providerId)),
    ) as ProviderId[];
    const providers = (
      await Promise.all(
        providerIds.map((providerId) =>
          this.buildProviderDoctorView(providerId, {
            policyProfile,
          }),
        ),
      )
    ).filter(Boolean) as ServiceProviderDoctorView[];

    return buildServiceRuntimeDoctorView({
      activePolicyProfile: policyProfile,
      availablePolicyProfiles: [...this.availablePolicyProfiles],
      providers,
    });
  }

  private scorePlannedDoctor(args: {
    doctor: ServiceProviderDoctorView;
    policyProfile: RuntimePolicyProfileId;
    preferHighStability: boolean;
    requireOfficialApi: boolean;
  }) {
    const selectedBinding = args.doctor.policy.laneBindings.find(
      (binding) => binding.laneId === args.doctor.dispatchPlan.selectedLane,
    );
    let score = args.doctor.alignment.story === "dispatchable" ? 100 : 10;
    const reasons = [];

    if (args.doctor.alignment.story === "dispatchable") {
      reasons.push("dispatchable-now");
    } else {
      reasons.push("currently-blocked");
    }

    if (selectedBinding?.capabilityMatrix["official-api"]?.supported) {
      score += 20;
      reasons.push("official-api");
    }

    if (selectedBinding?.laneId === "byok") {
      score += 10;
      reasons.push("byok-lane");
    }

    if (args.policyProfile === "web-ok" && selectedBinding?.laneId === "web-login") {
      score += 15;
      reasons.push("web-ok-profile");
    }

    if (
      args.policyProfile === "official-api-first" &&
      selectedBinding?.capabilityMatrix["official-api"]?.supported
    ) {
      score += 25;
      reasons.push("official-api-first-profile");
    }

    if (
      args.policyProfile === "reliability-first" &&
      selectedBinding?.laneId === "byok"
    ) {
      score += 15;
      reasons.push("reliability-first-profile");
    }

    if (args.policyProfile === "strict-fail-closed" && args.doctor.dispatchPlan.dispatchable) {
      score += 10;
      reasons.push("strict-fail-closed");
    }

    if (
      args.preferHighStability &&
      args.doctor.probe?.stabilityTarget === "high"
    ) {
      score += 10;
      reasons.push("high-stability");
    }

    if (
      args.requireOfficialApi &&
      !selectedBinding?.capabilityMatrix["official-api"]?.supported
    ) {
      score -= 50;
    }

    return { score, reasons };
  }

  private async buildRuntimePlanView(
    body: Record<string, unknown>,
  ): Promise<ServiceRuntimePlanView | undefined> {
    if (!this.runtime) {
      return undefined;
    }

    const policyProfile = normalizePolicyProfile(body.policyProfile);
    const requiredCapabilities = normalizeRequestedCapabilities(
      body.requiredCapabilities,
    );
    const requireToolCalling = body.requireToolCalling === true;
    const requireOfficialApi = body.requireOfficialApi === true;
    const allowWebLogin = body.allowWebLogin !== false;
    const preferHighStability = body.preferStability === "high-stability";
    const mergedCapabilities = Array.from(
      new Set([
        ...requiredCapabilities,
        ...(requireToolCalling ? (["tool-calling"] as CapabilityId[]) : []),
        ...(requireOfficialApi ? (["official-api"] as CapabilityId[]) : []),
      ]),
    );
    const providerIds = Array.from(
      new Set(this.runtime.listProviders().map((entry) => entry.providerId)),
    ) as ProviderId[];
    const blockers: string[] = [];
    const recommendations = (
      await Promise.all(
        providerIds.map(async (providerId) => {
          const doctor = await this.buildProviderDoctorView(providerId, {
            policyProfile,
            requiredCapabilities: mergedCapabilities,
          });

          if (!doctor) {
            return undefined;
          }

          const selectedBinding = doctor.policy.laneBindings.find(
            (binding) => binding.laneId === doctor.dispatchPlan.selectedLane,
          );

          if (!allowWebLogin && doctor.dispatchPlan.selectedLane === "web-login") {
            blockers.push(
              `${providerId}: web-login is disallowed by the current planner request.`,
            );
            return undefined;
          }

          if (!selectedBinding) {
            blockers.push(`${providerId}: no selected lane binding was resolved.`);
            return undefined;
          }

          const { score, reasons } = this.scorePlannedDoctor({
            doctor,
            policyProfile,
            preferHighStability,
            requireOfficialApi,
          });

          return {
            providerId,
            displayName: doctor.displayName,
            laneId: selectedBinding.laneId,
            modelId:
              selectedBinding.recommendedModel?.split("/").slice(1).join("/") ??
              selectedBinding.defaultModel?.split("/").slice(1).join("/") ??
              doctor.dispatchPlan.requestedModel.split("/").slice(1).join("/") ??
              "unknown-model",
            dispatchable: doctor.dispatchPlan.dispatchable,
            score,
            reasons,
            doctorRoute: doctor.policy.doctorEntryPoints.serviceRoute,
          };
        }),
      )
    ).filter(Boolean) as ServiceRuntimePlanView["recommendations"];

    recommendations.sort((left, right) => right.score - left.score);

    return {
      policyProfile,
      activePolicyPack: buildServiceRuntimePolicyPackView(policyProfile, {
        requiresOfficialApi: requireOfficialApi,
        allowWebLogin,
        strictReadyOnly: policyProfile === "strict-fail-closed",
        requiredCapabilities: Array.from(
          new Set([
            ...buildServiceRuntimePolicyPackView(policyProfile).requiredCapabilities,
            ...mergedCapabilities,
          ]),
        ),
      }),
      requiredCapabilities: mergedCapabilities,
      recommendations,
      blockers,
      recommended: recommendations[0],
    };
  }

  private async renderInvokeResultWithReceipt(
    result: ServiceInvokeResult | ServiceSurfaceResponse,
    request: RuntimeRequest,
  ): Promise<SurfaceResponse> {
    if (isServiceSurfaceResponse(result)) {
      return result;
    }

    const rendered = renderInvokeResult(result);
    const doctor = request.providerId
      ? await this.buildProviderDoctorView(request.providerId, {
          policyProfile: request.policyProfile,
          requiredCapabilities: request.requiredCapabilities,
        })
      : undefined;

    if (!doctor || typeof rendered.body !== "object" || rendered.body === null) {
      return rendered;
    }

    return {
      ...rendered,
      body: {
        ...(rendered.body as Record<string, unknown>),
        receipt: buildServiceInvokeReceiptView({
          policyProfile: request.policyProfile ?? "low-friction",
          dispatchPlan: doctor.dispatchPlan,
          doctorRoute: doctor.policy.doctorEntryPoints.serviceRoute,
          suggestedNextStep: doctor.receipt.recommendedCliCommands[0],
        }),
      },
    };
  }

  private async handleByokInvoke(
    body: Record<string, unknown>,
    selectionOverride?: {
      readonly providerId: string;
      readonly modelId: string;
    },
  ) {
    if (!this.byokClient) {
      return jsonResponse(503, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        lane: "byok",
        error: {
          message: "BYOK service invoke is not configured in the current runtime.",
          type: "provider-unavailable",
        },
      });
    }

    const provider =
      selectionOverride?.providerId ?? body.provider;
    const model = selectionOverride?.modelId ?? body.model;
    const input = body.input;
    const system = body.system;
    const maxOutputTokens = body.maxOutputTokens;
    const temperature = body.temperature;

    if (
      typeof provider !== "string" ||
      typeof model !== "string" ||
      typeof input !== "string"
    ) {
      return jsonResponse(400, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        lane: "byok",
        error: {
          message:
            "provider, model, and input are required string fields for BYOK invocation.",
          type: "invalid_request_error",
        },
      });
    }

    const result = await this.byokClient.generateText({
      model: `${provider}/${model}`,
      prompt: input,
      system: typeof system === "string" ? system : undefined,
      maxOutputTokens: typeof maxOutputTokens === "number" ? maxOutputTokens : undefined,
      temperature: typeof temperature === "number" ? temperature : undefined,
      stream: body.stream === true,
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

      return jsonResponse(status, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        lane: "byok",
        error: {
          message:
            primaryDiagnostic?.message ??
            "BYOK invocation failed without a structured diagnostic.",
          type,
          diagnostics: result.diagnostics,
        },
      });
    }

    return jsonResponse(200, {
      surface: SERVICE_SURFACE_METADATA,
      lane: "byok",
      provider,
      model,
      text: result.text,
      diagnostics: result.diagnostics,
      prepared: result.prepared,
    });
  }

  private async handleWebInvoke(
    body: Record<string, unknown>,
    selectionOverride?: {
      readonly providerId: string;
      readonly modelId: string;
      readonly laneId: "web-login";
    },
  ) {
    const provider = selectionOverride?.providerId ?? body.provider;
    const model = selectionOverride?.modelId ?? body.model;
    const input = body.input;

    if (
      typeof provider !== "string" ||
      typeof model !== "string" ||
      typeof input !== "string"
    ) {
      return jsonResponse(400, {
        error: {
          message: "provider, model, and input are required string fields.",
          type: "invalid_request_error",
        },
      });
    }

    const request: RuntimeInvocationRequest = {
      provider: provider as WebProviderId,
      model,
      input,
      lane:
        selectionOverride?.laneId === "web-login" || body.lane === "web"
          ? "web"
          : undefined,
      intent: "text-generation",
      stream: body.stream === true,
    };

    const result = await this.webLane.invoke(request, this.context);

    if (!result.ok) {
      const providers = await this.webLane.authStatus(this.context);
      const runtimeProvider = providers.find((entry) => entry.provider === result.provider);
      const auth = runtimeProvider
        ? buildServiceAuthStatusView([runtimeProvider], this.ownerUserId).providers[0]
        : undefined;

      return jsonResponse(mapFailureStatus(result), {
        surface: SERVICE_SURFACE_METADATA,
        authPortal: SERVICE_AUTH_PORTAL_METADATA,
        routes: buildServiceRouteCatalog(),
        error: {
          message: result.message,
          type: result.errorCategory,
          suggestedAction: result.suggestedAction,
          diagnostics: result.diagnostics,
        },
        auth,
        remediation: runtimeProvider
          ? buildServiceProviderRemediationView(runtimeProvider, this.ownerUserId)
          : undefined,
      });
    }

    return jsonResponse(200, {
      surface: SERVICE_SURFACE_METADATA,
      ...result,
    });
  }

  private async buildAuthPortalHtml() {
    const providers = await this.webLane.authStatus(this.context);
    const defaultModel = buildAuthPortalShellModel({
      userId: this.ownerUserId,
      routeCatalog: {
        authPortal: buildServiceRouteCatalog().authPortal,
        providerStatusTemplate: buildServiceRouteCatalog().providerStatusTemplate,
        providerAcquisitionStartTemplate:
          buildServiceRouteCatalog().providerAcquisitionStartTemplate,
        providerAcquisitionCaptureTemplate:
          buildServiceRouteCatalog().providerAcquisitionCaptureTemplate,
        providerDebugWorkbenchTemplate:
          buildServiceRouteCatalog().providerDebugWorkbenchTemplate,
      },
    });
    const byokSection = defaultModel.sections.find((section) => section.id === "byok");
    const webSection = defaultModel.sections.find((section) => section.id === "web-login");
    const webAuth = buildServiceAuthStatusView(providers, this.ownerUserId);
    const webCards = await Promise.all(
      webAuth.providers.map(async (card): Promise<AuthPortalCard> => {
        const provider = providers.find((entry) => entry.provider === card.providerId);
        const debugRunner = provider ? this.debugSupportRunners[provider.provider] : undefined;

        if (!provider || !debugRunner) {
          return card;
        }

        try {
          const debugSupport = await debugRunner(provider);

          if (debugSupport.currentPage.status !== "captured") {
            return card;
          }

          return {
            ...card,
            currentBrowser: {
              source: "live-browser-inspection",
              status: debugSupport.currentPage.status,
              liveStatus: debugSupport.liveReadiness.status,
              classification: debugSupport.currentPage.classification,
              summary: debugSupport.currentPage.diagnostic,
              title: debugSupport.currentPage.title,
              url: debugSupport.currentPage.url,
              attachTargetLabel: debugSupport.attachTarget.label,
            },
          };
        } catch {
          return card;
        }
      }),
    );

    return renderAuthPortalShell({
      ...defaultModel,
      sections: [
        ...(byokSection ? [byokSection] : []),
        {
          id: "web-login",
          title: webSection?.title ?? "Web/Login",
          description:
            webSection?.description ??
            "User signs in with a browser, OAuth flow, or subscription-backed web session.",
          cards: webCards,
        },
      ],
    });
  }

  private async buildAcquisitionResponse(
    providerId: WebProviderId,
    acquisition: Record<string, unknown>,
  ) {
    if (typeof acquisition.runtimeEnv === "object" && acquisition.runtimeEnv) {
      this.context.env = {
        ...(this.context.env ?? {}),
        ...(acquisition.runtimeEnv as Record<string, string | undefined>),
      };
    }

    if (typeof acquisition.session === "object" && acquisition.session) {
      this.context.sessions = {
        ...(this.context.sessions ?? {}),
        [providerId]: acquisition.session as WebSessionSnapshot,
      };
    }

    const providers = await this.webLane.authStatus(this.context);
    const provider = providers.find((entry) => entry.provider === providerId);

    return {
      surface: SERVICE_SURFACE_METADATA,
      authPortal: SERVICE_AUTH_PORTAL_METADATA,
      routes: buildServiceRouteCatalog(),
      acquisition: {
        status: acquisition.status,
        provider: acquisition.provider,
        providerDisplayName: acquisition.providerDisplayName,
        mode: acquisition.mode,
        modeLabel: acquisition.modeLabel,
        advanced: acquisition.advanced,
        supported: acquisition.supported,
        summary: acquisition.summary,
        loginUrl: acquisition.loginUrl,
        instructions: acquisition.instructions,
        availableModes: acquisition.availableModes,
        browserTarget: acquisition.browserTarget,
        captureRequest: acquisition.captureRequest,
        captureUrl: acquisition.captureUrl,
        storePath: acquisition.storePath,
        blocker: acquisition.blocker,
        cdpUrl: acquisition.cdpUrl,
        browser: acquisition.browser,
      },
      auth: provider
        ? buildServiceAuthStatusView([provider], this.ownerUserId).providers[0]
        : undefined,
      probe: provider
        ? buildServiceProviderProbeView(provider, this.ownerUserId)
        : undefined,
    };
  }

  private buildByokDiscoveryPayload() {
    const providers = this.runtime?.listProviders({ laneId: "byok" }) ?? [];

    return {
      surface: SERVICE_SURFACE_METADATA,
      routes: buildServiceRouteCatalog(),
      discovery: {
        lane: "byok",
        providers: providers.map((provider) => ({
          providerId: provider.providerId,
          lane: provider.laneId,
          displayName: provider.displayName,
          authModes: provider.authModes,
          defaultModel: provider.defaultModel?.canonical,
          recommendedModel: provider.recommendedModel?.canonical,
          capabilities: provider.capabilities,
          diagnosticsStatus: provider.diagnosticsStatus,
        })),
      },
    };
  }

  async handle(method: string, pathname: string, body?: unknown): Promise<SurfaceResponse> {
    if (method === "GET" && pathname === "/v1/runtime/auth-portal") {
      return htmlResponse(200, await this.buildAuthPortalHtml());
    }

    if (method === "GET" && pathname === "/v1/runtime/providers") {
      const providers = await this.webLane.discover(this.context);
      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        discovery: {
          lane: "web",
          providers: buildServiceDiscoveryViews(providers),
        },
      });
    }

    if (method === "GET" && pathname === "/v1/runtime/byok/providers") {
      return jsonResponse(200, this.buildByokDiscoveryPayload());
    }

    if (method === "GET" && pathname === "/v1/runtime/auth-status") {
      const providers = await this.webLane.authStatus(this.context);
      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        authPortal: SERVICE_AUTH_PORTAL_METADATA,
        routes: buildServiceRouteCatalog(),
        ...authStatusBody(providers, this.ownerUserId),
      });
    }

    if (method === "GET" && pathname === "/v1/runtime/health") {
      const health = await this.webLane.health(this.context);
      const providers = health.providers;
      const auth = buildServiceAuthStatusView(providers, this.ownerUserId);
      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        service: this.serviceName,
        routes: buildServiceRouteCatalog(),
        lane: health.lane,
        generatedAt: health.generatedAt,
        totals: health.totals,
        authSummary: {
          blockingCount: auth.blockingCount,
          warningCount: auth.warningCount,
          categories: auth.categories,
          workflowSummary: auth.workflowSummary,
        },
        remediation: buildServiceRemediationSummary(providers, this.ownerUserId),
      });
    }

    if (method === "GET" && pathname === "/v1/runtime/doctor") {
      const doctor = await this.buildRuntimeDoctorView();

      if (!doctor) {
        return jsonResponse(503, {
          surface: SERVICE_SURFACE_METADATA,
          routes: buildServiceRouteCatalog(),
          error: {
            message: "Runtime doctor is not configured in the current service.",
            type: "provider-unavailable",
          },
        });
      }

      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        doctor,
      });
    }

    if (
      method === "GET" &&
      (pathname === "/v1/runtime/bootstrap" || pathname === "/v1/runtime/entrypoint")
    ) {
      const providers = await this.webLane.discover(this.context);
      const health = await this.webLane.health(this.context);
      return jsonResponse(
        200,
        buildRuntimeBootstrapView(providers, health, this.serviceName, this.ownerUserId),
      );
    }

    if (method === "POST" && pathname === "/v1/runtime/dispatch-plan") {
      if (!isObject(body)) {
        return jsonResponse(400, {
          error: {
            message: "Expected a JSON object request body.",
            type: "invalid_request_error",
          },
        });
      }

      let runtimeRequest: RuntimeRequest | undefined;

      try {
        runtimeRequest = await this.buildRuntimeRequest(body);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code === "string"
        ) {
          return this.renderContractErrorResponse(error as WebaiBridgeContractError);
        }

        throw error;
      }

      if (!this.runtime || !runtimeRequest) {
        return jsonResponse(503, {
          surface: SERVICE_SURFACE_METADATA,
          routes: buildServiceRouteCatalog(),
          error: {
            message: "Runtime lane planning is not configured in the current service.",
            type: "provider-unavailable",
          },
        });
      }

      const providerId = runtimeRequest.providerId;
      const providers = providerId
        ? await this.webLane.authStatus(this.context)
        : [];
      const provider =
        providerId
          ? providers.find((entry) => entry.provider === (providerId as WebProviderId))
          : undefined;
      const credentialStates = providerId && this.resolveCredentialStates
        ? await this.resolveCredentialStates(providerId)
        : runtimeRequest.credentialStates;

      try {
        const plan = this.runtime.prepareInvocation(runtimeRequest);

        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          routes: buildServiceRouteCatalog(),
          dispatchPlan: this.buildDispatchPlanView(runtimeRequest, {
            laneId: plan.selection.laneId,
            candidateLanes: plan.dispatch.candidateLanes as readonly ("byok" | "web-login")[],
            reason: plan.dispatch.reason,
          }, {
            credentialStates,
            provider,
            policyProfile: runtimeRequest.policyProfile,
          }),
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code === "string"
        ) {
          const contractError = error as WebaiBridgeContractError;

          return jsonResponse(this.mapContractErrorStatus(contractError), {
            surface: SERVICE_SURFACE_METADATA,
            routes: buildServiceRouteCatalog(),
            dispatchPlan: this.buildDispatchPlanView(runtimeRequest, undefined, {
              credentialStates,
              provider,
              policyProfile: runtimeRequest.policyProfile,
            }),
            error: {
              message: contractError.message,
              type: contractError.diagnostic.code,
              diagnostics: [contractError.diagnostic],
            },
          });
        }

        throw error;
      }
    }

    if (method === "POST" && pathname === "/v1/runtime/plan") {
      if (!isObject(body)) {
        return jsonResponse(400, {
          error: {
            message: "Expected a JSON object request body.",
            type: "invalid_request_error",
          },
        });
      }

      let plan: ServiceRuntimePlanView | undefined;

      try {
        plan = await this.buildRuntimePlanView(body);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code === "string"
        ) {
          return this.renderContractErrorResponse(error as WebaiBridgeContractError);
        }

        throw error;
      }

      if (!plan) {
        return jsonResponse(503, {
          surface: SERVICE_SURFACE_METADATA,
          routes: buildServiceRouteCatalog(),
          error: {
            message: "Runtime planner is not configured in the current service.",
            type: "provider-unavailable",
          },
        });
      }

      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        plan,
      });
    }

    const providerDoctorPath = normalizeProviderDoctorPath(pathname);
    if (method === "GET" && providerDoctorPath.provider) {
      const doctor = await this.buildProviderDoctorView(providerDoctorPath.provider);

      if (!doctor) {
        return jsonResponse(404, {
          error: {
            message: `Unknown provider: ${providerDoctorPath.provider}`,
            type: "not_found",
          },
        });
      }

      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        routes: buildServiceRouteCatalog(),
        doctor,
      });
    }

    const providerPath = normalizeProviderPath(pathname);
    if (method === "GET" && providerPath.action && providerPath.provider) {
      const providers = await this.webLane.authStatus(this.context);
      const provider = providers.find((entry) => entry.provider === providerPath.provider);

      if (!provider) {
        return jsonResponse(404, {
          error: {
            message: `Unknown provider: ${providerPath.provider}`,
            type: "not_found",
          },
        });
      }

      if (providerPath.action === "status") {
        const auth = buildServiceAuthStatusView([provider], this.ownerUserId);
        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          authPortal: SERVICE_AUTH_PORTAL_METADATA,
          provider: auth.providers[0],
        });
      }

      if (providerPath.action === "probe") {
        const liveProof = this.liveProofRunners[provider.provider]
          ? await this.liveProofRunners[provider.provider]!()
          : undefined;

        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          probe: buildServiceProviderProbeView(provider, this.ownerUserId, liveProof),
        });
      }

      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        authPortal: SERVICE_AUTH_PORTAL_METADATA,
        remediation: buildServiceProviderRemediationView(provider, this.ownerUserId),
      });
    }

    const providerDebugPath = normalizeProviderDebugPath(pathname);
    if (method === "GET" && providerDebugPath.action && providerDebugPath.provider) {
      const providers = await this.webLane.authStatus(this.context);
      const provider = providers.find((entry) => entry.provider === providerDebugPath.provider);

      if (!provider) {
        return jsonResponse(404, {
          error: {
            message: `Unknown provider: ${providerDebugPath.provider}`,
            type: "not_found",
          },
        });
      }

      const debugSupport = await this.loadProviderDebugSupport(provider);

      if (providerDebugPath.action === "current-page") {
        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          debug: debugSupport.currentPage,
        });
      }

      if (providerDebugPath.action === "current-console") {
        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          debug: debugSupport.currentConsole,
        });
      }

      if (providerDebugPath.action === "current-network") {
        return jsonResponse(200, {
          surface: SERVICE_SURFACE_METADATA,
          debug: debugSupport.currentNetwork,
        });
      }

      if (providerDebugPath.action === "workbench") {
        return htmlResponse(
          200,
          renderProviderDebugWorkbench(debugSupport, buildServiceRouteCatalog().authPortal),
        );
      }

      return jsonResponse(200, {
        surface: SERVICE_SURFACE_METADATA,
        debug: debugSupport,
      });
    }

    const acquisitionPath = normalizeAcquisitionPath(pathname);
    if (method === "POST" && acquisitionPath.action && acquisitionPath.provider) {
      const runner = this.acquisitionRunners[acquisitionPath.provider];
      const acquisitionRequest = normalizeAcquisitionRequestBody(body);

      if (!runner) {
        return jsonResponse(404, {
          error: {
            message: `No acquisition runner registered for ${acquisitionPath.provider}.`,
            type: "not_found",
          },
        });
      }

      const result = (
        acquisitionPath.action === "start"
          ? await runner.start(acquisitionRequest)
          : await runner.capture(acquisitionRequest)
      ) as Record<string, unknown>;

      const payload = await this.buildAcquisitionResponse(acquisitionPath.provider, {
        ...result,
        captureUrl:
          acquisitionPath.action === "start"
            ? buildServiceRouteCatalog().providerAcquisitionCaptureTemplate.replace(
                "{providerId}",
                acquisitionPath.provider,
              )
            : undefined,
      });

      return jsonResponse(200, payload);
    }

    if (method === "POST" && pathname === "/v1/runtime/byok/invoke") {
      if (!isObject(body)) {
        return jsonResponse(400, {
          error: {
            message: "Expected a JSON object request body.",
            type: "invalid_request_error",
          },
        });
      }

      let runtimeRequest: RuntimeRequest | undefined;

      try {
        runtimeRequest = await this.buildRuntimeRequest(body, "byok");
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code === "string"
        ) {
          return this.renderContractErrorResponse(
            error as WebaiBridgeContractError,
            undefined,
            "byok",
          );
        }

        throw error;
      }

      if (!this.runtime || !runtimeRequest || !this.invokeRuntime) {
        return this.handleByokInvoke({
          ...body,
          lane: "byok",
        });
      }

      try {
        return this.renderInvokeResultWithReceipt(
          await this.invokeRuntime({
            request: runtimeRequest,
            body: {
              ...body,
              lane: "byok",
            },
          }),
          runtimeRequest,
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code ===
            "string"
        ) {
          const contractError = error as WebaiBridgeContractError;
          return this.renderContractErrorResponse(contractError, runtimeRequest, "byok");
        }

        throw error;
      }
    }

    if (method === "POST" && pathname === "/v1/runtime/invoke") {
      if (!isObject(body)) {
        return jsonResponse(400, {
          error: {
            message: "Expected a JSON object request body.",
            type: "invalid_request_error",
          },
        });
      }

      let runtimeRequest: RuntimeRequest | undefined;

      try {
        runtimeRequest = await this.buildRuntimeRequest(body);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code === "string"
        ) {
          return this.renderContractErrorResponse(error as WebaiBridgeContractError);
        }

        throw error;
      }

      try {
        if (this.runtime && runtimeRequest && this.invokeRuntime) {
          return this.renderInvokeResultWithReceipt(
            await this.invokeRuntime({
              request: runtimeRequest,
              body,
            }),
            runtimeRequest,
          );
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "diagnostic" in error &&
          typeof (error as { diagnostic?: { code?: string } }).diagnostic?.code ===
            "string"
        ) {
          const contractError = error as WebaiBridgeContractError;
          const webProviders = runtimeRequest?.providerId
            ? await this.webLane.authStatus(this.context)
            : [];
          const webProvider =
            runtimeRequest?.providerId
              ? webProviders.find(
                  (entry) => entry.provider === (runtimeRequest.providerId as WebProviderId),
                )
              : undefined;

          if (webProvider && runtimeRequest?.credentialStates?.["web-login"] !== undefined) {
            const auth = buildServiceAuthStatusView(
              [webProvider],
              this.ownerUserId,
            ).providers[0];

            return jsonResponse(this.mapContractErrorStatus(contractError), {
              surface: SERVICE_SURFACE_METADATA,
              authPortal: SERVICE_AUTH_PORTAL_METADATA,
              routes: buildServiceRouteCatalog(),
              error: {
                message: contractError.message,
                type: contractError.diagnostic.code,
                suggestedAction: webProvider.recommendedAction,
                diagnostics: webProvider.diagnostics,
              },
              auth,
              remediation: buildServiceProviderRemediationView(
                webProvider,
                this.ownerUserId,
              ),
            });
          }

          return this.renderContractErrorResponse(contractError, runtimeRequest);
        }

        throw error;
      }

      return this.handleWebInvoke(body);
    }

    return jsonResponse(404, {
      error: {
        message: `Unknown route: ${method} ${pathname}`,
        type: "not_found",
      },
    });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createNodeHttpHandler(surface: WebaiBridgeHttpSurface) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    try {
      const body =
        req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : undefined;
      const response = await surface.handle(req.method ?? "GET", url.pathname, body);
      res.statusCode = response.status;
      for (const [name, value] of Object.entries(
        response.headers ?? {
          "content-type": "application/json; charset=utf-8",
        },
      )) {
        res.setHeader(name, value);
      }
      res.end(
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body, null, 2),
      );
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : "Unknown internal error.",
            type: "internal_error",
          },
        }),
      );
    }
  };
}
