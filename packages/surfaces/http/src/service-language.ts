import {
  createCredentialRecord,
  type CredentialHealthFacts,
  type CredentialLifecycleStage,
  type CredentialMaterialKind
} from '../../../credentials/src/index.js';
import {
  buildAuthRuntimeView,
  summarizeAuthRuntimeViews,
  type AuthRuntimeSummary,
  type AuthRuntimeView
} from '../../../diagnostics/src/index.js';
import type {
  CapabilityMatrix,
  CapabilityId,
  CredentialState as RuntimeCredentialState,
  RuntimePolicyProfileId,
  RuntimeDispatchReason,
} from '../../../contracts/src/index.js';
import type {
  DiagnosticRecord,
  ProviderStatusView,
  WebLiveProofResult,
  WebLaneSnapshot,
  WebSessionSnapshot
} from '../../../lanes/web/src/index.js';

export interface ServiceSurfaceMetadata {
  id: 'service-http';
  role: 'first-party-integration-entry';
  runtimeShape: 'runtime-first';
  localFirst: true;
  consumerCompatIncluded: false;
}

export interface ServiceAuthPortalMetadata {
  mode: 'local-first';
  controlPlane: false;
  capabilities: ['login', 'status', 're-auth'];
}

export interface ServiceRuntimeRouteCatalog {
  authPortal: string;
  bootstrap: string;
  entrypoint: string;
  providers: string;
  byokProviders: string;
  authStatus: string;
  health: string;
  runtimeDoctor: string;
  runtimePlan: string;
  invoke: string;
  byokInvoke: string;
  dispatchPlan: string;
  providerDoctorTemplate: string;
  providerStatusTemplate: string;
  providerProbeTemplate: string;
  providerRemediationTemplate: string;
  providerAcquisitionStartTemplate: string;
  providerAcquisitionCaptureTemplate: string;
  providerDebugCurrentPageTemplate: string;
  providerDebugCurrentConsoleTemplate: string;
  providerDebugCurrentNetworkTemplate: string;
  providerDebugSupportBundleTemplate: string;
  providerDebugWorkbenchTemplate: string;
}

export interface ServiceProviderRouteRefs {
  doctor: string;
  status: string;
  probe: string;
  remediation: string;
  acquisitionStart: string;
  acquisitionCapture: string;
  debugCurrentPage: string;
  debugCurrentConsole: string;
  debugCurrentNetwork: string;
  debugSupportBundle: string;
  debugWorkbench: string;
}

export interface ServiceRuntimePolicyPackView {
  id: RuntimePolicyProfileId;
  label: string;
  summary: string;
  preferredLaneBias: "byok" | "web-login" | "auto";
  requiresOfficialApi: boolean;
  allowWebLogin: boolean;
  strictReadyOnly: boolean;
  requiredCapabilities: CapabilityId[];
}

export const SERVICE_RUNTIME_POLICY_PACKS = Object.freeze([
  {
    id: "reliability-first",
    label: "Reliability First",
    summary:
      "Prefer the most dependable runtime path, biasing toward BYOK when it exists.",
    preferredLaneBias: "byok",
    requiresOfficialApi: false,
    allowWebLogin: true,
    strictReadyOnly: false,
    requiredCapabilities: ["text-generation"],
  },
  {
    id: "official-api-first",
    label: "Official API First",
    summary:
      "Prefer providers that satisfy official-api capability and stay on the BYOK lane when possible.",
    preferredLaneBias: "byok",
    requiresOfficialApi: true,
    allowWebLogin: false,
    strictReadyOnly: false,
    requiredCapabilities: ["text-generation", "official-api"],
  },
  {
    id: "web-ok",
    label: "Web OK",
    summary:
      "Treat Web/Login as an explicitly acceptable runtime path and prefer it when it is ready.",
    preferredLaneBias: "web-login",
    requiresOfficialApi: false,
    allowWebLogin: true,
    strictReadyOnly: false,
    requiredCapabilities: ["text-generation"],
  },
  {
    id: "low-friction",
    label: "Low Friction",
    summary:
      "Take the easiest currently dispatchable lane without hiding blockers or widening support claims.",
    preferredLaneBias: "auto",
    requiresOfficialApi: false,
    allowWebLogin: true,
    strictReadyOnly: false,
    requiredCapabilities: ["text-generation"],
  },
  {
    id: "strict-fail-closed",
    label: "Strict Fail Closed",
    summary:
      "Only recommend lanes that look fully ready right now, refusing degraded shortcuts.",
    preferredLaneBias: "byok",
    requiresOfficialApi: false,
    allowWebLogin: true,
    strictReadyOnly: true,
    requiredCapabilities: ["text-generation"],
  },
] as const satisfies readonly ServiceRuntimePolicyPackView[]);

export function buildServiceRuntimePolicyPackView(
  profileId: RuntimePolicyProfileId = "low-friction",
  overrides: Partial<
    Pick<
      ServiceRuntimePolicyPackView,
      | "preferredLaneBias"
      | "requiresOfficialApi"
      | "allowWebLogin"
      | "strictReadyOnly"
      | "requiredCapabilities"
    >
  > = {},
): ServiceRuntimePolicyPackView {
  const basePolicyPack =
    SERVICE_RUNTIME_POLICY_PACKS.find((policyPack) => policyPack.id === profileId) ??
    SERVICE_RUNTIME_POLICY_PACKS.find((policyPack) => policyPack.id === "low-friction")!;

  return {
    ...basePolicyPack,
    ...overrides,
    requiredCapabilities: [
      ...(overrides.requiredCapabilities ?? basePolicyPack.requiredCapabilities),
    ],
  };
}

export function buildServiceRuntimePolicyPackCatalog(
  profileIds: readonly RuntimePolicyProfileId[],
): ServiceRuntimePolicyPackView[] {
  return profileIds.map((profileId) => buildServiceRuntimePolicyPackView(profileId));
}

export interface ServiceDiscoveryView {
  providerId: ProviderStatusView['provider'];
  providerDisplayName: ProviderStatusView['displayName'];
  lane: ProviderStatusView['lane'];
  authMode: ProviderStatusView['authMode'];
  stabilityTarget: ProviderStatusView['stabilityTarget'];
  models: ProviderStatusView['models'];
  available: boolean;
  routes: ServiceProviderRouteRefs;
}

export interface ServiceProviderAuthView extends AuthRuntimeView {
  lane: ProviderStatusView['lane'];
  session: ProviderStatusView['session'];
  models: ProviderStatusView['models'];
  mode?:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  modeLabel?: string;
  browserTarget?: {
    kind: string;
    label: string;
    summary: string;
  };
  transportHint?: string;
  availableModes?: ReadonlyArray<{
    id:
      | "managed-browser"
      | "isolated-chrome-root"
      | "existing-chrome-profile"
      | "existing-browser-session";
    label: string;
    description: string;
    advanced: boolean;
    default: boolean;
  }>;
  routes: ServiceProviderRouteRefs;
}

export interface ServiceAuthStatusView extends AuthRuntimeSummary {
  providers: ServiceProviderAuthView[];
}

export interface ServiceProviderRuntimeView {
  available: ProviderStatusView['available'];
  canInvoke: boolean;
  runtimeReadiness: ProviderStatusView['runtimeReadiness'];
  credentialState: ProviderStatusView['credentialState'];
  sessionPresence: ProviderStatusView['sessionPresence'];
  degradedInvocationPolicy: ProviderStatusView['degradedInvocationPolicy'];
}

export interface ServiceRuntimeDispatchPlanView {
  providerId: string;
  requestedModel: string;
  policyProfile?: RuntimePolicyProfileId;
  activePolicyPack?: ServiceRuntimePolicyPackView;
  selectedLane?: "byok" | "web-login";
  preferredLane?: "byok" | "web-login";
  dispatchReason?: RuntimeDispatchReason;
  candidateLanes: Array<"byok" | "web-login">;
  credentialStates: Partial<Record<"byok" | "web-login", RuntimeCredentialState>>;
  dispatchable: boolean;
  blocked: boolean;
  runtimeCanInvoke?: boolean;
  remediationState?: string;
  blockerClassification?: string;
  blockerSummary?: string;
}

export interface ServiceProviderPolicyLaneBindingView {
  laneId: "byok" | "web-login";
  authModes: string[];
  defaultModel?: string;
  recommendedModel?: string;
  capabilityMatrix: CapabilityMatrix;
  diagnosticsStatus: string;
  catalogSource: string;
}

export interface ServiceProviderPolicyView {
  providerId: string;
  displayName: string;
  registeredLanes: Array<"byok" | "web-login">;
  laneBindings: ServiceProviderPolicyLaneBindingView[];
  dispatchPolicy: {
    kind: "single-lane-provider" | "credential-aware-auto-lane";
    laneOrder: Array<"byok" | "web-login">;
    defaultLane?: "byok" | "web-login";
    requiresCredentialStateMap: boolean;
    autoDispatches: boolean;
  };
  doctorEntryPoints: {
    serviceRoute: string;
    cliCommand: string;
    mcpTool: string;
    providerCatalogTarget: string;
  };
}

export interface ServiceProviderDoctorAlignmentView {
  story: "dispatchable" | "blocked";
  runtimeCanInvoke: boolean;
  remediationState?: string;
  blockerClassification?: string;
  blockerSummary?: string;
  liveReadiness?: "live-ready" | "live-blocked" | "unknown";
}

export interface ServiceProviderDoctorReceiptView {
  summary: string;
  recommendedCliCommands: string[];
  recommendedMcpTools: string[];
  remediationWorkflow: ServiceRemediationWorkflowView;
}

export interface ServiceProviderDoctorView {
  providerId: string;
  displayName: string;
  activePolicyProfile?: RuntimePolicyProfileId;
  availablePolicyProfiles?: RuntimePolicyProfileId[];
  activePolicyPack?: ServiceRuntimePolicyPackView;
  availablePolicyPacks?: ServiceRuntimePolicyPackView[];
  policy: ServiceProviderPolicyView;
  dispatchPlan: ServiceRuntimeDispatchPlanView;
  alignment: ServiceProviderDoctorAlignmentView;
  receipt: ServiceProviderDoctorReceiptView;
  probe?: ServiceProviderProbeView;
  remediation?: ServiceProviderRemediationView;
  diagnose?: ServiceProviderDebugSupportView;
  routes: ServiceProviderRouteRefs;
}

export interface ServiceRemediationWorkflowStepView {
  id: string;
  label: string;
  cliCommand?: string;
  mcpTool?: string;
  route?: string;
}

export interface ServiceRemediationWorkflowView {
  providerId: string;
  story: "dispatchable" | "blocked";
  summary: string;
  steps: ServiceRemediationWorkflowStepView[];
}

export interface ServiceRuntimeControlLedgerProviderView {
  providerId: string;
  displayName: string;
  selectedLane?: "byok" | "web-login";
  doctorRoute: string;
  blockerClassification?: string;
  summary: string;
}

export interface ServiceRuntimeDoctorView {
  generatedAt: string;
  activePolicyProfile: RuntimePolicyProfileId;
  availablePolicyProfiles: RuntimePolicyProfileId[];
  activePolicyPack: ServiceRuntimePolicyPackView;
  availablePolicyPacks: ServiceRuntimePolicyPackView[];
  summary: {
    totalProviders: number;
    dispatchableCount: number;
    blockingCount: number;
    blockingProviders: string[];
    readyProviders: string[];
  };
  strongestNextSteps: string[];
  controlLedger: {
    routes: Pick<
      ServiceRuntimeRouteCatalog,
      "runtimeDoctor" | "runtimePlan" | "invoke" | "authPortal"
    >;
    dispatchableProviders: ServiceRuntimeControlLedgerProviderView[];
    blockedProviders: ServiceRuntimeControlLedgerProviderView[];
    remediationWorkflows: ServiceRemediationWorkflowView[];
  };
  providers: ServiceProviderDoctorView[];
}

export interface ServiceRuntimePlanCandidateView {
  providerId: string;
  displayName: string;
  laneId: "byok" | "web-login";
  modelId: string;
  dispatchable: boolean;
  score: number;
  reasons: string[];
  doctorRoute: string;
}

export interface ServiceRuntimePlanView {
  policyProfile: RuntimePolicyProfileId;
  activePolicyPack: ServiceRuntimePolicyPackView;
  requiredCapabilities: CapabilityId[];
  recommendations: ServiceRuntimePlanCandidateView[];
  blockers: string[];
  recommended?: ServiceRuntimePlanCandidateView;
}

export interface ServiceInvokeReceiptView {
  policyProfile: RuntimePolicyProfileId;
  activePolicyPack: ServiceRuntimePolicyPackView;
  providerId: string;
  laneId: "byok" | "web-login";
  modelId: string;
  requestedModel: string;
  dispatchReason?: RuntimeDispatchReason;
  doctorRoute: string;
  readinessSnapshot: {
    dispatchable: boolean;
    remediationState?: string;
    blockerClassification?: string;
  };
  lineage: {
    runtimeDoctorRoute: string;
    runtimePlanRoute: string;
    dispatchPlanRoute: string;
    providerDoctorRoute: string;
  };
  remediationWorkflow: ServiceRemediationWorkflowView;
  suggestedNextStep?: string;
}

export interface ServiceProviderProbeView {
  providerId: ProviderStatusView['provider'];
  providerDisplayName: ProviderStatusView['displayName'];
  lane: ProviderStatusView['lane'];
  authMode: ProviderStatusView['authMode'];
  stabilityTarget: ProviderStatusView['stabilityTarget'];
  models: ProviderStatusView['models'];
  session: ProviderStatusView['session'];
  runtime: ServiceProviderRuntimeView;
  diagnostics: DiagnosticRecord[];
  transportHint?: string;
  liveProof?: WebLiveProofResult;
  auth: ServiceProviderAuthView;
  routes: ServiceProviderRouteRefs;
}

export interface ServiceProviderAttachTargetView {
  mode?: WebSessionSnapshot["acquisitionMode"];
  label: string;
  cdpUrl?: string;
  userDataDir?: string;
  source: "runtime-env" | "default" | "missing";
  available: boolean;
  note: string;
}

export interface ServiceProviderCurrentPageView {
  status: "captured" | "unavailable";
  url?: string;
  title?: string;
  snippet?: string;
  hasComposerSurface?: boolean;
  classification?:
    | "workspace-ready"
    | "session-incomplete"
    | "login-required"
    | "provider-adjacent"
    | "provider-unavailable"
    | "human-verification-required"
    | "account-action-required"
    | "permission-gated"
    | "unknown";
  diagnostic: string;
}

export interface ServiceProviderConsoleEntryView {
  type: string;
  text: string;
}

export interface ServiceProviderCurrentConsoleView {
  status: "captured" | "unavailable";
  entries: ServiceProviderConsoleEntryView[];
  diagnostic: string;
}

export interface ServiceProviderNetworkEntryView {
  name: string;
  initiatorType?: string;
  duration?: number;
  method?: string;
  outcome?: "finished" | "failed";
  status?: number;
  errorText?: string;
  url?: string;
  resourceType?: string;
  source?: "request-observer" | "resource-timing";
}

export interface ServiceProviderCurrentNetworkView {
  status: "captured" | "limited" | "unavailable";
  entries: ServiceProviderNetworkEntryView[];
  diagnostic: string;
}

export interface ServiceProviderDiagnoseStepView {
  id:
    | "check-store"
    | "check-attach-target"
    | "inspect-current-page"
    | "inspect-console-network"
    | "rerun-provider-live-proof"
    | "repair-session";
  status: "completed" | "recommended" | "blocked";
  summary: string;
  command?: string;
}

export interface ServiceProviderDebugSupportView {
  providerId: ProviderStatusView["provider"];
  providerDisplayName: ProviderStatusView["displayName"];
  auth: ServiceProviderAuthView;
  runtime: ServiceProviderRuntimeView;
  storeReadiness: {
    credentialState: ProviderStatusView["credentialState"];
    runtimeReadiness: ProviderStatusView["runtimeReadiness"];
    validationState?: WebSessionSnapshot["validationState"];
    note: string;
  };
  captureProvenance?: WebSessionSnapshot["captureProvenance"];
  persistenceAudit?: WebSessionSnapshot["persistenceAudit"];
  liveReadiness: {
    status: "live-ready" | "live-blocked" | "unknown";
    diagnostic: string;
  };
  attachTarget: ServiceProviderAttachTargetView;
  currentPage: ServiceProviderCurrentPageView;
  currentConsole: ServiceProviderCurrentConsoleView;
  currentNetwork: ServiceProviderCurrentNetworkView;
  diagnoseLadder: ServiceProviderDiagnoseStepView[];
  routes: ServiceProviderRouteRefs;
}

export interface ServiceProviderRemediationView extends ServiceProviderAuthView {
  runtime: ServiceProviderRuntimeView;
  diagnostics: DiagnosticRecord[];
}

export interface ServiceRemediationSummaryView {
  counts: {
    blocking: number;
    degraded: number;
    ready: number;
  };
  blockingProviders: ServiceProviderRemediationView[];
  degradedProviders: ServiceProviderRemediationView[];
}

export interface RuntimeBootstrapView {
  surface: ServiceSurfaceMetadata;
  authPortal: ServiceAuthPortalMetadata;
  bootstrap: {
    serviceName: string;
    lane: 'web';
    consumption: 'service-first';
    routeCatalog: ServiceRuntimeRouteCatalog;
  };
  discovery: {
    lane: 'web';
    providers: ServiceDiscoveryView[];
  };
  auth: ServiceAuthStatusView;
  health: {
    lane: WebLaneSnapshot['lane'];
    generatedAt: WebLaneSnapshot['generatedAt'];
    totals: WebLaneSnapshot['totals'];
  };
  remediation: ServiceRemediationSummaryView;
}

export const SERVICE_SURFACE_METADATA: ServiceSurfaceMetadata = {
  id: 'service-http',
  role: 'first-party-integration-entry',
  runtimeShape: 'runtime-first',
  localFirst: true,
  consumerCompatIncluded: false
};

export const SERVICE_AUTH_PORTAL_METADATA: ServiceAuthPortalMetadata = {
  mode: 'local-first',
  controlPlane: false,
  capabilities: ['login', 'status', 're-auth']
};

export const SERVICE_RUNTIME_ROUTE_TEMPLATES: ServiceRuntimeRouteCatalog = {
  authPortal: '/v1/runtime/auth-portal',
  bootstrap: '/v1/runtime/bootstrap',
  entrypoint: '/v1/runtime/entrypoint',
  providers: '/v1/runtime/providers',
  byokProviders: '/v1/runtime/byok/providers',
  authStatus: '/v1/runtime/auth-status',
  health: '/v1/runtime/health',
  runtimeDoctor: '/v1/runtime/doctor',
  runtimePlan: '/v1/runtime/plan',
  invoke: '/v1/runtime/invoke',
  byokInvoke: '/v1/runtime/byok/invoke',
  dispatchPlan: '/v1/runtime/dispatch-plan',
  providerDoctorTemplate: '/v1/runtime/providers/{providerId}/doctor',
  providerStatusTemplate: '/v1/runtime/providers/{providerId}/status',
  providerProbeTemplate: '/v1/runtime/providers/{providerId}/probe',
  providerRemediationTemplate: '/v1/runtime/providers/{providerId}/remediation',
  providerAcquisitionStartTemplate: '/v1/runtime/providers/{providerId}/acquisition/start',
  providerAcquisitionCaptureTemplate: '/v1/runtime/providers/{providerId}/acquisition/capture',
  providerDebugCurrentPageTemplate: '/v1/runtime/providers/{providerId}/debug/current-page',
  providerDebugCurrentConsoleTemplate: '/v1/runtime/providers/{providerId}/debug/current-console',
  providerDebugCurrentNetworkTemplate: '/v1/runtime/providers/{providerId}/debug/current-network',
  providerDebugSupportBundleTemplate: '/v1/runtime/providers/{providerId}/debug/support-bundle',
  providerDebugWorkbenchTemplate: '/v1/runtime/providers/{providerId}/debug/workbench'
};

const WEB_ACQUISITION_MODES = [
  {
    id: "isolated-chrome-root",
    label: "Use Isolated Chrome Root",
    description:
      "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile for login and capture.",
    advanced: true,
    default: true,
  },
  {
    id: "managed-browser",
    label: "Managed Browser",
    description:
      "Let WebaiBridge launch or reattach its dedicated fallback onboarding browser for login and capture.",
    advanced: false,
    default: false,
  },
  {
    id: "existing-browser-session",
    label: "Attach Existing Browser Session",
    description:
      "Attach to a browser session that is already exposing a reusable browser-session URL.",
    advanced: true,
    default: false,
  },
] as const;

function getAcquisitionModeView(mode: string | undefined) {
  if (mode === "existing-chrome-profile") {
    return WEB_ACQUISITION_MODES.find((entry) => entry.id === "isolated-chrome-root");
  }

  return WEB_ACQUISITION_MODES.find((entry) => entry.id === mode);
}

function withBaseUrl(path: string, baseUrl?: string): string {
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export function buildServiceRouteCatalog(baseUrl?: string): ServiceRuntimeRouteCatalog {
  return {
    authPortal: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.authPortal, baseUrl),
    bootstrap: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.bootstrap, baseUrl),
    entrypoint: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.entrypoint, baseUrl),
    providers: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.providers, baseUrl),
    byokProviders: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.byokProviders, baseUrl),
    authStatus: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.authStatus, baseUrl),
    health: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.health, baseUrl),
    runtimeDoctor: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.runtimeDoctor, baseUrl),
    runtimePlan: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.runtimePlan, baseUrl),
    invoke: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.invoke, baseUrl),
    byokInvoke: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.byokInvoke, baseUrl),
    dispatchPlan: withBaseUrl(SERVICE_RUNTIME_ROUTE_TEMPLATES.dispatchPlan, baseUrl),
    providerDoctorTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDoctorTemplate,
      baseUrl
    ),
    providerStatusTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerStatusTemplate,
      baseUrl
    ),
    providerProbeTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerProbeTemplate,
      baseUrl
    ),
    providerRemediationTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerRemediationTemplate,
      baseUrl
    ),
    providerAcquisitionStartTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerAcquisitionStartTemplate,
      baseUrl
    ),
    providerAcquisitionCaptureTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerAcquisitionCaptureTemplate,
      baseUrl
    ),
    providerDebugCurrentPageTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDebugCurrentPageTemplate,
      baseUrl
    ),
    providerDebugCurrentConsoleTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDebugCurrentConsoleTemplate,
      baseUrl
    ),
    providerDebugCurrentNetworkTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDebugCurrentNetworkTemplate,
      baseUrl
    ),
    providerDebugSupportBundleTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDebugSupportBundleTemplate,
      baseUrl
    ),
    providerDebugWorkbenchTemplate: withBaseUrl(
      SERVICE_RUNTIME_ROUTE_TEMPLATES.providerDebugWorkbenchTemplate,
      baseUrl
    )
  };
}

export function buildServiceProviderRouteRefs(
  providerId: ProviderStatusView['provider'],
  baseUrl?: string
): ServiceProviderRouteRefs {
  return {
    doctor: withBaseUrl(`/v1/runtime/providers/${providerId}/doctor`, baseUrl),
    status: withBaseUrl(`/v1/runtime/providers/${providerId}/status`, baseUrl),
    probe: withBaseUrl(`/v1/runtime/providers/${providerId}/probe`, baseUrl),
    remediation: withBaseUrl(`/v1/runtime/providers/${providerId}/remediation`, baseUrl),
    acquisitionStart: withBaseUrl(`/v1/runtime/providers/${providerId}/acquisition/start`, baseUrl),
    acquisitionCapture: withBaseUrl(`/v1/runtime/providers/${providerId}/acquisition/capture`, baseUrl),
    debugCurrentPage: withBaseUrl(`/v1/runtime/providers/${providerId}/debug/current-page`, baseUrl),
    debugCurrentConsole: withBaseUrl(
      `/v1/runtime/providers/${providerId}/debug/current-console`,
      baseUrl
    ),
    debugCurrentNetwork: withBaseUrl(
      `/v1/runtime/providers/${providerId}/debug/current-network`,
      baseUrl
    ),
    debugSupportBundle: withBaseUrl(
      `/v1/runtime/providers/${providerId}/debug/support-bundle`,
      baseUrl
    ),
    debugWorkbench: withBaseUrl(
      `/v1/runtime/providers/${providerId}/debug/workbench`,
      baseUrl
    ),
  };
}

function getLifecycleStage(state: WebSessionSnapshot['state']): CredentialLifecycleStage {
  switch (state) {
    case 'missing':
      return 'acquire';
    case 'refreshable-but-degraded':
      return 'refresh-renew';
    case 'expired':
      return 'expire-degrade';
    case 'user-action-required':
      return 're-auth';
    case 'ready':
    case 'expiring':
    case 'provider-unavailable':
      return 'check';
  }
}

function getMaterialKind(
  session: WebSessionSnapshot,
  authMode: ProviderStatusView['authMode']
): CredentialMaterialKind {
  if (session.sessionSource?.toLowerCase().includes('oauth') || authMode === 'oauth') {
    return 'oauth-session';
  }

  return 'browser-session';
}

function getCredentialHealthFacts(session: WebSessionSnapshot): CredentialHealthFacts {
  return {
    hasMaterial: session.state !== 'missing',
    providerAvailable: session.state !== 'provider-unavailable',
    refreshEligible:
      session.refreshEligible ?? session.state === 'refreshable-but-degraded',
    expiringSoon: session.state === 'expiring',
    expired: session.state === 'expired',
    degraded: session.state === 'refreshable-but-degraded',
    userActionRequired: session.state === 'user-action-required',
    lastCheckedAt: session.lastValidatedAt,
    expiresAt: session.expiresAt
  };
}

export function buildServiceDiscoveryViews(
  providers: readonly ProviderStatusView[]
): ServiceDiscoveryView[] {
  return providers.map((provider) => ({
    providerId: provider.provider,
    providerDisplayName: provider.displayName,
    lane: provider.lane,
    authMode: provider.authMode,
    stabilityTarget: provider.stabilityTarget,
    models: provider.models,
    available: provider.available,
    routes: buildServiceProviderRouteRefs(provider.provider)
  }));
}

export function buildServiceProviderAuthView(
  provider: ProviderStatusView,
  ownerUserId = 'local-user'
): ServiceProviderAuthView {
  const record = createCredentialRecord({
    userId: ownerUserId,
    providerId: provider.provider,
    authModeId: 'web-login',
    accountId: provider.session.accountLabel ?? `${provider.provider}-local-slot`,
    accountLabel: provider.session.accountLabel,
    lifecycleStage: getLifecycleStage(provider.session.state),
    materialKind: getMaterialKind(provider.session, provider.authMode),
    status: getCredentialHealthFacts(provider.session),
    notes: provider.session.note ? [provider.session.note] : []
  });
  const view = buildAuthRuntimeView(record);
  const acquisitionMode = getAcquisitionModeView(provider.session.acquisitionMode);

  return {
    ...view,
    available: provider.available,
    lane: provider.lane,
    session: provider.session,
    models: provider.models,
    mode: acquisitionMode?.id,
    modeLabel: acquisitionMode?.label,
    browserTarget: acquisitionMode
      ? {
          kind:
            acquisitionMode.id === "managed-browser"
              ? "managed-onboarding-browser"
              : acquisitionMode.id === "isolated-chrome-root"
                ? "isolated-chrome-root"
                : "attached-browser-session",
          label: acquisitionMode.label,
          summary: acquisitionMode.description,
        }
      : undefined,
    transportHint: provider.recommendedAction,
    availableModes: WEB_ACQUISITION_MODES,
    routes: buildServiceProviderRouteRefs(provider.provider)
  };
}

export function buildServiceAuthStatusView(
  providers: readonly ProviderStatusView[],
  ownerUserId = 'local-user'
): ServiceAuthStatusView {
  const views = providers.map((provider) => buildServiceProviderAuthView(provider, ownerUserId));
  const summary = summarizeAuthRuntimeViews(views);

  return {
    ...summary,
    providers: views
  };
}

export function buildServiceProviderRuntimeView(
  provider: ProviderStatusView
): ServiceProviderRuntimeView {
  return {
    available: provider.available,
    canInvoke: provider.available,
    runtimeReadiness: provider.runtimeReadiness,
    credentialState: provider.credentialState,
    sessionPresence: provider.sessionPresence,
    degradedInvocationPolicy: provider.degradedInvocationPolicy
  };
}

function mapByokDispatchBlockerClassification(
  state: RuntimeCredentialState | undefined,
) {
  switch (state) {
    case "missing":
      return "missing-credential";
    case "expired":
      return "session-expired";
    case "invalid":
      return "credential-invalid";
    case "user-action-required":
      return "user-action-required";
    case "refreshable-degraded":
      return "refreshable-degraded";
    default:
      return undefined;
  }
}

function mapWebDispatchBlockerClassification(provider: ProviderStatusView): string | undefined {
  const workspaceClassification = provider.session.persistenceAudit?.workspaceClassification;

  if (
    workspaceClassification === "session-incomplete" ||
    workspaceClassification === "human-verification-required" ||
    workspaceClassification === "account-action-required" ||
    workspaceClassification === "permission-gated"
  ) {
    return workspaceClassification;
  }

  const detailText = [
    provider.session.requiredUserAction,
    provider.session.degradedReason,
    provider.recommendedAction,
    ...provider.diagnostics.map((diagnostic) => diagnostic.message),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    detailText.includes("past due") ||
    detailText.includes("payment") ||
    detailText.includes("invoice")
  ) {
    return "account-action-required";
  }

  switch (provider.credentialState) {
    case "missing":
      return "missing-credential";
    case "expired":
      return "session-expired";
    case "user-action-required":
      return "user-action-required";
    case "refreshable-but-degraded":
    case "expiring":
      return "refreshable-degraded";
    case "provider-unavailable":
      return "provider-unavailable";
    default:
      return undefined;
  }
}

export function buildServiceDispatchPlanVerdict(args: {
  selectedLane?: "byok" | "web-login";
  credentialStates: Partial<Record<"byok" | "web-login", RuntimeCredentialState>>;
  provider?: ProviderStatusView;
}) {
  if (args.selectedLane === "byok") {
    const byokState = args.credentialStates.byok;
    const dispatchable =
      byokState === "configured" || byokState === "refreshable-degraded";

    return {
      dispatchable,
      blocked: !dispatchable,
      runtimeCanInvoke: dispatchable,
      remediationState: byokState,
      blockerClassification: dispatchable
        ? undefined
        : mapByokDispatchBlockerClassification(byokState),
      blockerSummary: dispatchable
        ? undefined
        : byokState === "missing"
          ? "The BYOK lane is missing the required credential material."
          : byokState === "expired"
            ? "The BYOK lane has expired credential material."
            : byokState === "invalid"
              ? "The BYOK lane credential material is invalid."
              : byokState === "user-action-required"
                ? "The BYOK lane requires an explicit user action before dispatch can continue."
                : byokState === "refreshable-degraded"
                  ? undefined
                  : "The BYOK lane is not currently dispatchable.",
    };
  }

  if (args.provider) {
    const dispatchable = args.provider.available;
    const primaryDiagnostic = args.provider.diagnostics[0];

    return {
      dispatchable,
      blocked: !dispatchable,
      runtimeCanInvoke: args.provider.available,
      remediationState: args.provider.credentialState,
      blockerClassification: dispatchable
        ? undefined
        : mapWebDispatchBlockerClassification(args.provider),
      blockerSummary: dispatchable
        ? undefined
        : args.provider.recommendedAction ??
          primaryDiagnostic?.recoveryHint ??
          primaryDiagnostic?.message,
    };
  }

  const fallbackState = args.credentialStates["web-login"] ?? args.credentialStates.byok;
  const fallbackDispatchable =
    fallbackState === "configured" || fallbackState === "refreshable-degraded";

  return {
    dispatchable: fallbackDispatchable,
    blocked: !fallbackDispatchable,
    runtimeCanInvoke: fallbackDispatchable,
    remediationState: fallbackState,
    blockerClassification: fallbackDispatchable
      ? undefined
      : mapByokDispatchBlockerClassification(fallbackState),
    blockerSummary: fallbackDispatchable
      ? undefined
      : "The selected lane is not currently dispatchable.",
  };
}

export function buildServiceProviderPolicyView(args: {
  providerId: string;
  displayName: string;
  registeredEntries: Array<{
    laneId: "byok" | "web-login";
    authModes: readonly string[];
    defaultModel?: string;
    recommendedModel?: string;
    capabilityMatrix: CapabilityMatrix;
    diagnosticsStatus: string;
    catalogSource: string;
  }>;
  runtimeLaneOrder: readonly ("byok" | "web-login")[];
  baseUrl?: string;
}): ServiceProviderPolicyView {
  const laneIndex = new Map(
    args.runtimeLaneOrder.map((laneId, index) => [laneId, index]),
  );
  const laneBindings = [...args.registeredEntries].sort(
    (left, right) =>
      (laneIndex.get(left.laneId) ?? Number.MAX_SAFE_INTEGER) -
      (laneIndex.get(right.laneId) ?? Number.MAX_SAFE_INTEGER),
  );
  const registeredLanes = laneBindings.map((entry) => entry.laneId);
  const dispatchKind =
    registeredLanes.length > 1
      ? "credential-aware-auto-lane"
      : "single-lane-provider";
  const providerCatalogTarget =
    laneBindings.length > 1
      ? `${args.providerId}:${laneBindings[0]?.laneId ?? "web-login"}`
      : args.providerId;

  return {
    providerId: args.providerId,
    displayName: args.displayName,
    registeredLanes,
    laneBindings: laneBindings.map((entry) => ({
      laneId: entry.laneId,
      authModes: [...entry.authModes],
      defaultModel: entry.defaultModel,
      recommendedModel: entry.recommendedModel,
      capabilityMatrix: entry.capabilityMatrix,
      diagnosticsStatus: entry.diagnosticsStatus,
      catalogSource: entry.catalogSource,
    })),
    dispatchPolicy: {
      kind: dispatchKind,
      laneOrder: [...args.runtimeLaneOrder],
      defaultLane: registeredLanes[0],
      requiresCredentialStateMap: dispatchKind === "credential-aware-auto-lane",
      autoDispatches: dispatchKind === "credential-aware-auto-lane",
    },
    doctorEntryPoints: {
      serviceRoute: buildServiceProviderRouteRefs(
        args.providerId as ProviderStatusView["provider"],
        args.baseUrl,
      ).doctor,
      cliCommand: `pnpm run webai-bridge:cli -- provider-doctor --provider ${args.providerId} --json`,
      mcpTool: "webai-bridge.provider.doctor",
      providerCatalogTarget,
    },
  };
}

export function buildServiceProviderDoctorAlignment(args: {
  dispatchPlan: ServiceRuntimeDispatchPlanView;
  probe?: ServiceProviderProbeView;
  remediation?: ServiceProviderRemediationView;
  diagnose?: ServiceProviderDebugSupportView;
}): ServiceProviderDoctorAlignmentView {
  const runtimeCanInvoke =
    args.dispatchPlan.runtimeCanInvoke ??
    args.probe?.runtime.canInvoke ??
    args.remediation?.runtime.canInvoke ??
    false;

  return {
    story: args.dispatchPlan.dispatchable ? "dispatchable" : "blocked",
    runtimeCanInvoke,
    remediationState:
      args.dispatchPlan.remediationState ??
      args.remediation?.runtime.credentialState,
    blockerClassification: args.dispatchPlan.blockerClassification,
    blockerSummary: args.dispatchPlan.blockerSummary,
    liveReadiness: args.diagnose?.liveReadiness.status,
  };
}

export function buildServiceProviderDoctorReceipt(args: {
  providerId: string;
  alignment: ServiceProviderDoctorAlignmentView;
  policy: ServiceProviderPolicyView;
  routes: ServiceProviderRouteRefs;
  hasDiagnose: boolean;
}): ServiceProviderDoctorReceiptView {
  const recommendedCliCommands = [
    `pnpm run webai-bridge:cli -- provider-doctor --provider ${args.providerId} --json`,
    `pnpm run webai-bridge:cli -- provider-entry --target ${args.policy.doctorEntryPoints.providerCatalogTarget}`,
  ];

  if (args.hasDiagnose) {
    recommendedCliCommands.push(
      `pnpm run webai-bridge:cli -- provider-diagnose --provider ${args.providerId} --json`,
    );
  }

  const recommendedMcpTools = [
    "webai-bridge.provider.doctor",
    "webai-bridge.catalog.provider_entry",
  ];

  if (args.hasDiagnose) {
    recommendedMcpTools.push("webai-bridge.provider.diagnose");
  }

  const remediationWorkflow = buildServiceRemediationWorkflow({
    providerId: args.providerId,
    story: args.alignment.story,
    summary:
      args.alignment.story === "dispatchable"
        ? `${args.providerId} can dispatch under the current runtime ledger.`
        : args.alignment.blockerSummary ??
          `${args.providerId} is currently blocked under the current runtime ledger.`,
    doctorRoute: args.policy.doctorEntryPoints.serviceRoute,
    remediationRoute: args.routes.remediation,
    runtimePlanRoute: buildServiceRouteCatalog().runtimePlan,
    invokeRoute: buildServiceRouteCatalog().invoke,
    hasDiagnose: args.hasDiagnose,
  });

  return {
    summary:
      args.alignment.story === "dispatchable"
        ? `${args.providerId} is dispatchable under the current runtime truth.`
        : args.alignment.blockerSummary ??
          `${args.providerId} is currently blocked under the current runtime truth.`,
    recommendedCliCommands,
    recommendedMcpTools,
    remediationWorkflow,
  };
}

export function buildServiceRemediationWorkflow(args: {
  providerId: string;
  story: "dispatchable" | "blocked";
  summary: string;
  doctorRoute: string;
  remediationRoute: string;
  runtimePlanRoute: string;
  invokeRoute: string;
  hasDiagnose: boolean;
}): ServiceRemediationWorkflowView {
  const steps: ServiceRemediationWorkflowStepView[] = [
    {
      id: "inspect-provider-doctor",
      label: "Inspect the provider doctor first.",
      cliCommand: `pnpm run webai-bridge:cli -- provider-doctor --provider ${args.providerId} --json`,
      mcpTool: "webai-bridge.provider.doctor",
      route: args.doctorRoute,
    },
    {
      id: "review-runtime-plan",
      label: "Review the runtime planner before changing route or lane assumptions.",
      cliCommand: "pnpm run webai-bridge:cli -- runtime-plan --json",
      mcpTool: "webai-bridge.runtime.plan",
      route: args.runtimePlanRoute,
    },
  ];

  if (args.story === "blocked") {
    steps.push({
      id: args.hasDiagnose ? "inspect-provider-diagnose" : "inspect-provider-remediation",
      label: args.hasDiagnose
        ? "Inspect diagnose evidence before retrying the provider."
        : "Inspect the provider remediation surface before retrying the provider.",
      cliCommand: args.hasDiagnose
        ? `pnpm run webai-bridge:cli -- provider-diagnose --provider ${args.providerId} --json`
        : `pnpm run webai-bridge:cli -- provider-remediation --provider ${args.providerId} --json`,
      mcpTool: args.hasDiagnose
        ? "webai-bridge.provider.diagnose"
        : "webai-bridge.provider.remediation",
      route: args.remediationRoute,
    });
  } else {
    steps.push({
      id: "invoke-when-ready",
      label: "Invoke through the runtime once the current policy profile still agrees.",
      cliCommand: "pnpm run example:runtime-bridge",
      route: args.invokeRoute,
    });
  }

  return {
    providerId: args.providerId,
    story: args.story,
    summary: args.summary,
    steps,
  };
}

export function buildServiceRuntimeControlLedgerView(args: {
  providers: ServiceProviderDoctorView[];
}): ServiceRuntimeDoctorView["controlLedger"] {
  const routes = buildServiceRouteCatalog();
  const mapProvider = (
    provider: ServiceProviderDoctorView,
  ): ServiceRuntimeControlLedgerProviderView => ({
    providerId: provider.providerId,
    displayName: provider.displayName,
    selectedLane: provider.dispatchPlan.selectedLane,
    doctorRoute: provider.routes.doctor,
    blockerClassification: provider.dispatchPlan.blockerClassification,
    summary: provider.receipt.summary,
  });

  return {
    routes: {
      runtimeDoctor: routes.runtimeDoctor,
      runtimePlan: routes.runtimePlan,
      invoke: routes.invoke,
      authPortal: routes.authPortal,
    },
    dispatchableProviders: args.providers
      .filter((provider) => provider.alignment.story === "dispatchable")
      .map(mapProvider),
    blockedProviders: args.providers
      .filter((provider) => provider.alignment.story === "blocked")
      .map(mapProvider),
    remediationWorkflows: args.providers.map(
      (provider) => provider.receipt.remediationWorkflow,
    ),
  };
}

export function applyServicePolicyProfileToDispatchPlan(args: {
  policyProfile: RuntimePolicyProfileId;
  dispatchPlan: ServiceRuntimeDispatchPlanView;
}): ServiceRuntimeDispatchPlanView {
  if (args.policyProfile !== "strict-fail-closed") {
    return {
      ...args.dispatchPlan,
      policyProfile: args.policyProfile,
    };
  }

  const remediationState = args.dispatchPlan.remediationState;
  const shouldBlock =
    remediationState === "refreshable-degraded" ||
    remediationState === "expiring";

  if (!shouldBlock) {
    return {
      ...args.dispatchPlan,
      policyProfile: args.policyProfile,
    };
  }

  return {
    ...args.dispatchPlan,
    policyProfile: args.policyProfile,
    dispatchable: false,
    blocked: true,
    runtimeCanInvoke: false,
    blockerClassification:
      args.dispatchPlan.blockerClassification ?? "refreshable-degraded",
    blockerSummary:
      args.dispatchPlan.blockerSummary ??
      "The strict-fail-closed profile refuses degraded or expiring runtime materials.",
  };
}

export function buildServiceRuntimeDoctorView(args: {
  activePolicyProfile: RuntimePolicyProfileId;
  availablePolicyProfiles: RuntimePolicyProfileId[];
  providers: ServiceProviderDoctorView[];
}): ServiceRuntimeDoctorView {
  const blockingProviders = args.providers
    .filter((provider) => provider.alignment.story === "blocked")
    .map((provider) => provider.providerId);
  const readyProviders = args.providers
    .filter((provider) => provider.alignment.story === "dispatchable")
    .map((provider) => provider.providerId);
  const strongestNextSteps = args.providers
    .filter((provider) => provider.alignment.story === "blocked")
    .flatMap((provider) =>
      provider.receipt.remediationWorkflow.steps
        .map((step) => step.cliCommand)
        .filter((command): command is string => Boolean(command))
        .slice(0, 1),
    )
    .slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    activePolicyProfile: args.activePolicyProfile,
    availablePolicyProfiles: [...args.availablePolicyProfiles],
    activePolicyPack: buildServiceRuntimePolicyPackView(args.activePolicyProfile),
    availablePolicyPacks: buildServiceRuntimePolicyPackCatalog(
      args.availablePolicyProfiles,
    ),
    summary: {
      totalProviders: args.providers.length,
      dispatchableCount: readyProviders.length,
      blockingCount: blockingProviders.length,
      blockingProviders,
      readyProviders,
    },
    strongestNextSteps,
    controlLedger: buildServiceRuntimeControlLedgerView({
      providers: args.providers,
    }),
    providers: args.providers,
  };
}

export function buildServiceInvokeReceiptView(args: {
  policyProfile: RuntimePolicyProfileId;
  dispatchPlan: ServiceRuntimeDispatchPlanView;
  doctorRoute: string;
  suggestedNextStep?: string;
}): ServiceInvokeReceiptView {
  const routes = buildServiceRouteCatalog();
  return {
    policyProfile: args.policyProfile,
    activePolicyPack:
      args.dispatchPlan.activePolicyPack ??
      buildServiceRuntimePolicyPackView(args.policyProfile),
    providerId: args.dispatchPlan.providerId,
    laneId: args.dispatchPlan.selectedLane ?? "web-login",
    modelId: args.dispatchPlan.requestedModel.split("/").slice(1).join("/") || args.dispatchPlan.requestedModel,
    requestedModel: args.dispatchPlan.requestedModel,
    dispatchReason: args.dispatchPlan.dispatchReason,
    doctorRoute: args.doctorRoute,
    readinessSnapshot: {
      dispatchable: args.dispatchPlan.dispatchable,
      remediationState: args.dispatchPlan.remediationState,
      blockerClassification: args.dispatchPlan.blockerClassification,
    },
    lineage: {
      runtimeDoctorRoute: routes.runtimeDoctor,
      runtimePlanRoute: routes.runtimePlan,
      dispatchPlanRoute: routes.dispatchPlan,
      providerDoctorRoute: args.doctorRoute,
    },
    remediationWorkflow: buildServiceRemediationWorkflow({
      providerId: args.dispatchPlan.providerId,
      story: args.dispatchPlan.dispatchable ? "dispatchable" : "blocked",
      summary:
        args.dispatchPlan.dispatchable
          ? `${args.dispatchPlan.providerId} can dispatch under the current runtime ledger.`
          : args.dispatchPlan.blockerSummary ??
            `${args.dispatchPlan.providerId} is currently blocked under the current runtime ledger.`,
      doctorRoute: args.doctorRoute,
      remediationRoute: buildServiceProviderRouteRefs(
        args.dispatchPlan.providerId as ProviderStatusView["provider"],
      ).remediation,
      runtimePlanRoute: routes.runtimePlan,
      invokeRoute: routes.invoke,
      hasDiagnose: true,
    }),
    suggestedNextStep: args.suggestedNextStep,
  };
}

export function buildServiceProviderProbeView(
  provider: ProviderStatusView,
  ownerUserId = 'local-user',
  liveProof?: WebLiveProofResult
): ServiceProviderProbeView {
  return {
    providerId: provider.provider,
    providerDisplayName: provider.displayName,
    lane: provider.lane,
    authMode: provider.authMode,
    stabilityTarget: provider.stabilityTarget,
    models: provider.models,
    session: provider.session,
    runtime: buildServiceProviderRuntimeView(provider),
    diagnostics: provider.diagnostics,
    transportHint: provider.recommendedAction,
    liveProof,
    auth: buildServiceProviderAuthView(provider, ownerUserId),
    routes: buildServiceProviderRouteRefs(provider.provider)
  };
}

export function buildServiceProviderDebugSupportView(
  provider: ProviderStatusView,
  ownerUserId = 'local-user',
): ServiceProviderDebugSupportView {
  const auth = buildServiceProviderAuthView(provider, ownerUserId);

  return {
    providerId: provider.provider,
    providerDisplayName: provider.displayName,
    auth,
    runtime: buildServiceProviderRuntimeView(provider),
    storeReadiness: {
      credentialState: provider.credentialState,
      runtimeReadiness: provider.runtimeReadiness,
      validationState: provider.session.validationState,
      note:
        'Stored session materials describe what WebaiBridge has in the local store. They do not guarantee that the currently attached browser page is live-ready.',
    },
    captureProvenance: provider.session.captureProvenance,
    persistenceAudit: provider.session.persistenceAudit,
    liveReadiness: {
      status: 'unknown',
      diagnostic:
        'No live page inspection runner is registered for this provider, so WebaiBridge will not pretend to know the current browser page state.',
    },
    attachTarget: {
      label: 'No attach target',
      source: 'missing',
      available: false,
      note:
        'No debug attach target was resolved for this provider. Capture or attach a browser session before asking for current-page evidence.',
    },
    currentPage: {
      status: 'unavailable',
      diagnostic:
        'WebaiBridge does not have a live page snapshot for this provider yet.',
    },
    currentConsole: {
      status: 'unavailable',
      entries: [],
      diagnostic:
        'WebaiBridge does not buffer detached-browser console history yet, so current-console remains fail-closed.',
    },
    currentNetwork: {
      status: 'unavailable',
      entries: [],
      diagnostic:
        'WebaiBridge does not have a current network snapshot for this provider yet.',
    },
    diagnoseLadder: [
      {
        id: 'check-store',
        status: 'completed',
        summary: `Stored state = ${provider.session.state}; runtime readiness = ${provider.runtimeReadiness}.`,
      },
      {
        id: 'check-attach-target',
        status: 'blocked',
        summary:
          'Resolve or reattach the canonical browser target first; without it, WebaiBridge cannot compare store-ready against live-ready.',
      },
      {
        id: 'inspect-current-page',
        status: 'blocked',
        summary:
          'No current page snapshot is available yet.',
      },
      {
        id: 'inspect-console-network',
        status: 'completed',
        summary:
          'Current console remains fail-closed and current network remains unavailable until a live inspection runner exists.',
      },
      {
        id: 'rerun-provider-live-proof',
        status: 'recommended',
        summary:
          `Run the provider-scoped live gate after the browser session is attached for ${provider.displayName}.`,
        command: `pnpm exec node scripts/verify-web-login-live.mjs --provider ${provider.provider}`,
      },
      {
        id: 'repair-session',
        status: 'recommended',
        summary:
          `Repair ${provider.displayName} in the managed browser when store-ready and live-ready disagree.`,
        command: `pnpm run bootstrap:web-login-browser -- --provider ${provider.provider}`,
      },
    ],
    routes: buildServiceProviderRouteRefs(provider.provider),
  };
}

export function buildServiceProviderRemediationView(
  provider: ProviderStatusView,
  ownerUserId = 'local-user'
): ServiceProviderRemediationView {
  const auth = buildServiceProviderAuthView(provider, ownerUserId);

  return {
    ...auth,
    runtime: buildServiceProviderRuntimeView(provider),
    diagnostics: provider.diagnostics
  };
}

export function buildServiceRemediationSummary(
  providers: readonly ProviderStatusView[],
  ownerUserId = 'local-user'
): ServiceRemediationSummaryView {
  const remediationViews = providers.map((provider) =>
    buildServiceProviderRemediationView(provider, ownerUserId)
  );
  const blockingProviders = remediationViews.filter((provider) => !provider.runtime.canInvoke);
  const degradedProviders = remediationViews.filter(
    (provider) => provider.runtime.runtimeReadiness === 'degraded'
  );

  return {
    counts: {
      blocking: blockingProviders.length,
      degraded: degradedProviders.length,
      ready: remediationViews.length - blockingProviders.length - degradedProviders.length
    },
    blockingProviders,
    degradedProviders
  };
}

export function buildRuntimeBootstrapView(
  providers: readonly ProviderStatusView[],
  health: WebLaneSnapshot,
  serviceName: string,
  ownerUserId = 'local-user'
): RuntimeBootstrapView {
  return {
    surface: SERVICE_SURFACE_METADATA,
    authPortal: SERVICE_AUTH_PORTAL_METADATA,
    bootstrap: {
      serviceName,
      lane: 'web',
      consumption: 'service-first',
      routeCatalog: buildServiceRouteCatalog()
    },
    discovery: {
      lane: 'web',
      providers: buildServiceDiscoveryViews(providers)
    },
    auth: buildServiceAuthStatusView(providers, ownerUserId),
    health: {
      lane: health.lane,
      generatedAt: health.generatedAt,
      totals: health.totals
    },
    remediation: buildServiceRemediationSummary(providers, ownerUserId)
  };
}
