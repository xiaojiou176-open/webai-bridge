import {
  buildServiceRouteCatalog,
  buildServiceProviderRouteRefs,
  type ServiceProviderAttachTargetView,
  type ServiceProviderCurrentConsoleView,
  type ServiceProviderCurrentNetworkView,
  type ServiceProviderCurrentPageView,
  type ServiceProviderDoctorView,
  type ServiceProviderDiagnoseStepView,
  type ServiceProviderDebugSupportView,
  type ServiceRuntimeDoctorView,
  type ServiceRuntimePlanView,
  type RuntimeBootstrapView,
  type ServiceAuthStatusView,
  type ServiceDiscoveryView,
  type ServiceRuntimeDispatchPlanView,
  type ServiceProviderProbeView,
  type ServiceProviderRemediationView,
  type ServiceRuntimeRouteCatalog,
} from "../../http/src/service-language.js";

type FetchLike = typeof fetch;
export type ServiceProviderStoreReadinessView =
  ServiceProviderDebugSupportView["storeReadiness"];
export type ServiceProviderLiveReadinessView =
  ServiceProviderDebugSupportView["liveReadiness"];

export interface WebaiBridgeServiceClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
}

export interface RuntimeHealthResponse {
  lane: "web";
  generatedAt: string;
  totals: {
    total: number;
    ready: number;
    degraded: number;
    userActionRequired: number;
    unavailable: number;
  };
}

export interface RuntimeInvokeRequest {
  provider: string;
  model: string;
  input: string;
  lane?: "web" | "byok";
}

export interface RuntimeDispatchPlanRequest extends RuntimeInvokeRequest {}

export interface RuntimePlanRequest {
  requiredCapabilities?: string[];
  policyProfile?: string;
  allowWebLogin?: boolean;
  requireOfficialApi?: boolean;
  requireToolCalling?: boolean;
}

export interface RuntimeInvokeResponse {
  ok: boolean;
  provider?: string;
  model?: string;
  lane?: string;
  outputText?: string;
  providerMessageId?: string;
  error?: {
    type?: string;
    category?: string;
    suggestedAction?: string;
  };
  auth?: {
    providerId?: string;
    transportHint?: string;
  };
}

type ServiceProviderId = ServiceDiscoveryView["providerId"];

export class WebaiBridgeServiceClient {
  readonly routes: ServiceRuntimeRouteCatalog;
  readonly #fetch: FetchLike;
  readonly #headers: Record<string, string>;

  constructor(options: WebaiBridgeServiceClientOptions) {
    this.routes = buildServiceRouteCatalog(options.baseUrl);
    this.#fetch = options.fetch ?? fetch;
    this.#headers = options.headers ?? {};
  }

  async #request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(this.#headers);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (init.headers) {
      const extra = new Headers(init.headers);
      extra.forEach((value, key) => headers.set(key, value));
    }

    const response = await this.#fetch(url, {
      ...init,
      headers,
    });
    const payload = (await response.json()) as T;

    if (!response.ok) {
      const error = new Error(`WebaiBridge service request failed with HTTP ${response.status} at ${url}.`);
      Object.assign(error, {
        status: response.status,
        payload,
      });
      throw error;
    }

    return payload;
  }

  bootstrap() {
    return this.#request<RuntimeBootstrapView>(this.routes.bootstrap);
  }

  entrypoint() {
    return this.#request<RuntimeBootstrapView>(this.routes.entrypoint);
  }

  async listProviders(): Promise<ServiceDiscoveryView[]> {
    const payload = await this.#request<{
      discovery: { providers: ServiceDiscoveryView[] };
    }>(this.routes.providers);

    return payload.discovery.providers;
  }

  authStatus() {
    return this.#request<ServiceAuthStatusView>(this.routes.authStatus);
  }

  health() {
    return this.#request<RuntimeHealthResponse>(this.routes.health);
  }

  runtimeDoctor() {
    return this.#request<{ doctor: ServiceRuntimeDoctorView }>(
      this.routes.runtimeDoctor,
    );
  }

  runtimePlan(request: RuntimePlanRequest = {}) {
    return this.#request<{ plan: ServiceRuntimePlanView }>(this.routes.runtimePlan, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  providerStatus(providerId: ServiceProviderId) {
    return this.#request<ServiceProviderProbeView>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).status,
    );
  }

  providerProbe(providerId: ServiceProviderId) {
    return this.#request<ServiceProviderProbeView>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).probe,
    );
  }

  providerDoctor(providerId: ServiceProviderId) {
    return this.#request<{ doctor: ServiceProviderDoctorView }>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).doctor,
    );
  }

  providerRemediation(providerId: ServiceProviderId) {
    return this.#request<ServiceProviderRemediationView>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).remediation,
    );
  }

  providerCurrentPage(providerId: ServiceProviderId) {
    return this.#request<{ debug: ServiceProviderCurrentPageView }>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).debugCurrentPage,
    ).then((payload) => payload.debug);
  }

  providerCurrentConsole(providerId: ServiceProviderId) {
    return this.#request<{ debug: ServiceProviderCurrentConsoleView }>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).debugCurrentConsole,
    ).then((payload) => payload.debug);
  }

  providerCurrentNetwork(providerId: ServiceProviderId) {
    return this.#request<{ debug: ServiceProviderCurrentNetworkView }>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).debugCurrentNetwork,
    ).then((payload) => payload.debug);
  }

  providerSupportBundle(providerId: ServiceProviderId) {
    return this.#request<{ debug: ServiceProviderDebugSupportView }>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).debugSupportBundle,
    ).then((payload) => payload.debug);
  }

  providerStoreReadiness(providerId: ServiceProviderId) {
    return this.providerSupportBundle(providerId).then(
      (bundle) => bundle.storeReadiness,
    );
  }

  providerLiveReadiness(providerId: ServiceProviderId) {
    return this.providerSupportBundle(providerId).then(
      (bundle) => bundle.liveReadiness,
    );
  }

  providerAttachTarget(providerId: ServiceProviderId) {
    return this.providerSupportBundle(providerId).then(
      (bundle) => bundle.attachTarget,
    );
  }

  providerDiagnoseLadder(providerId: ServiceProviderId) {
    return this.providerSupportBundle(providerId).then(
      (bundle) => bundle.diagnoseLadder,
    );
  }

  providerDiagnose(providerId: ServiceProviderId) {
    return this.providerSupportBundle(providerId);
  }

  startProviderAcquisition(providerId: ServiceProviderId, requestBody: unknown = {}) {
    return this.#request<unknown>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).acquisitionStart,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );
  }

  captureProviderAcquisition(providerId: ServiceProviderId, requestBody: unknown = {}) {
    return this.#request<unknown>(
      buildServiceProviderRouteRefs(providerId, this.#baseUrl()).acquisitionCapture,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );
  }

  invoke(request: RuntimeInvokeRequest) {
    const payload: RuntimeInvokeRequest = {
      provider: request.provider,
      model: request.model,
      input: request.input,
      ...(request.lane ? { lane: request.lane } : {}),
    };

    return this.#request<RuntimeInvokeResponse>(this.routes.invoke, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  dispatchPlan(request: RuntimeDispatchPlanRequest) {
    const payload: RuntimeDispatchPlanRequest = {
      provider: request.provider,
      model: request.model,
      input: request.input,
      ...(request.lane ? { lane: request.lane } : {}),
    };

    return this.#request<{ dispatchPlan: ServiceRuntimeDispatchPlanView }>(
      this.routes.dispatchPlan,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  #baseUrl() {
    return this.routes.bootstrap.replace(/\/v1\/runtime\/bootstrap$/, "");
  }
}

export function createWebaiBridgeServiceClient(
  options: WebaiBridgeServiceClientOptions,
) {
  return new WebaiBridgeServiceClient(options);
}

export type {
  ServiceProviderAttachTargetView,
  ServiceProviderCurrentConsoleView,
  ServiceProviderCurrentNetworkView,
  ServiceProviderCurrentPageView,
  ServiceProviderDoctorView,
  ServiceProviderDiagnoseStepView,
  ServiceProviderDebugSupportView,
  ServiceRuntimeDoctorView,
  ServiceRuntimePlanView,
};
