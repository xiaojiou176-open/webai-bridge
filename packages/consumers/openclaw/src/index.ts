import {
  buildServiceRouteCatalog,
  type ServiceProviderDoctorView,
  type RuntimeBootstrapView,
  type ServiceRuntimeRouteCatalog,
} from "../../../surfaces/http/src/service-language.js";
import type {
  RuntimeHealthResponse,
  RuntimeInvokeRequest,
  WebaiBridgeServiceClientOptions,
} from "../../../surfaces/sdk-client/src/index.js";
import {
  buildThinCompatInvokeRequest,
  createThinCompatAdapter,
  createThinCompatManifest,
  type ThinCompatAdapterOptions,
  type ThinCompatMode,
  type ThinCompatRequest,
  type ThinCompatResponse,
  type ThinCompatUnsupportedFeature,
} from "../../shared/src/index.js";

export const OPENCLAW_THIN_COMPAT_MANIFEST = createThinCompatManifest({
  target: "openclaw",
  transport: "delegated-runtime",
  notes: [
    "future consumer-side adapter only",
    "provider/runtime delegation without product-shell inheritance",
    "no operator control plane or channel shell parity",
  ],
});

export const OPENCLAW_THIN_COMPAT_METADATA = OPENCLAW_THIN_COMPAT_MANIFEST;
export const OPENCLAW_UNSUPPORTED_FEATURES =
  OPENCLAW_THIN_COMPAT_MANIFEST.unsupportedFeatures;

export type OpenclawThinCompatRequest = ThinCompatRequest & {
  readonly mode?: "chat" | "plan" | "copilot-brain";
};

export type OpenclawThinCompatResponse = ThinCompatResponse<"openclaw">;
export type OpenclawBuilderRoutes = Pick<
  ServiceRuntimeRouteCatalog,
  "authStatus" | "bootstrap" | "dispatchPlan" | "health" | "invoke" | "providers"
>;

export interface OpenclawRuntimeDispatchPlan {
  readonly providerId: string;
  readonly requestedModel: string;
  readonly selectedLane: string;
  readonly candidateLanes: readonly string[];
  readonly preferredLane?: string;
  readonly dispatchReason: string;
  readonly credentialStates: Readonly<Record<string, string>>;
}

export interface OpenclawRuntimeDispatchPlanResponse {
  readonly dispatchPlan: OpenclawRuntimeDispatchPlan;
}

export interface OpenclawProviderDoctorResponse {
  readonly doctor: ServiceProviderDoctorView;
}

export interface OpenclawDelegationPreview {
  readonly target: "openclaw";
  readonly compat: "partial";
  readonly delegatedTo: "service-runtime";
  readonly mode: ThinCompatMode;
  readonly route: "/v1/runtime/invoke";
  readonly requestBody: RuntimeInvokeRequest;
  readonly requestPreview: {
    readonly inputLength: number;
    readonly inputPreview: string;
  };
  readonly runtimeRoutes: OpenclawBuilderRoutes;
  readonly unsupportedFeatures: typeof OPENCLAW_UNSUPPORTED_FEATURES;
}

export interface OpenclawDelegationPreflight {
  readonly target: "openclaw";
  readonly compat: "partial";
  readonly delegatedTo: "service-runtime";
  readonly failClosed: true;
  readonly preview: OpenclawDelegationPreview;
  readonly dispatchPlan: OpenclawRuntimeDispatchPlan;
  readonly doctor: ServiceProviderDoctorView;
  readonly runtime: {
    readonly surface: RuntimeBootstrapView["surface"] | undefined;
    readonly bootstrap: RuntimeBootstrapView["bootstrap"];
    readonly health: RuntimeHealthResponse;
    readonly routes: OpenclawBuilderRoutes;
  };
  readonly advisories: readonly string[];
}

export interface OpenclawThinCompatAdapter {
  readonly manifest: typeof OPENCLAW_THIN_COMPAT_MANIFEST;
  delegateTurn(
    request: OpenclawThinCompatRequest,
  ): Promise<OpenclawThinCompatResponse>;
  invokeText(
    request: OpenclawThinCompatRequest,
  ): Promise<{
    compat: "partial";
    delegatedTo: "service-runtime";
    unsupportedFeatures: typeof OPENCLAW_UNSUPPORTED_FEATURES;
    ok: boolean;
    provider?: string;
    model: string;
    lane?: string;
    outputText?: string;
    providerMessageId?: string;
    error?: OpenclawThinCompatResponse["error"];
    auth?: OpenclawThinCompatResponse["auth"];
  }>;
  describeDelegation(): {
    target: "openclaw";
    compat: "partial";
    delegatedTo: "service-runtime";
    unsupportedFeatures: typeof OPENCLAW_UNSUPPORTED_FEATURES;
  };
  bootstrapDelegation(): Promise<RuntimeBootstrapView>;
  healthDelegation(): Promise<RuntimeHealthResponse>;
  previewDelegation(
    request: OpenclawThinCompatRequest,
  ): OpenclawDelegationPreview;
  readDispatchPlan(
    request: OpenclawThinCompatRequest,
  ): Promise<OpenclawRuntimeDispatchPlanResponse>;
  readProviderDoctor(
    request: OpenclawThinCompatRequest,
  ): Promise<OpenclawProviderDoctorResponse>;
  preflightDelegation(
    request: OpenclawThinCompatRequest,
  ): Promise<OpenclawDelegationPreflight>;
  failClosed(feature: ThinCompatUnsupportedFeature): never;
}

function pickOpenclawBuilderRoutes(
  routes: ServiceRuntimeRouteCatalog,
): OpenclawBuilderRoutes {
  return {
    authStatus: routes.authStatus,
    bootstrap: routes.bootstrap,
    dispatchPlan: routes.dispatchPlan,
    health: routes.health,
    invoke: routes.invoke,
    providers: routes.providers,
  };
}

function buildInputPreview(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function buildOpenclawDelegationPreview(
  request: OpenclawThinCompatRequest,
  routes: ServiceRuntimeRouteCatalog,
): OpenclawDelegationPreview {
  const requestBody = buildThinCompatInvokeRequest(request);

  return {
    target: "openclaw",
    compat: "partial",
    delegatedTo: "service-runtime",
    mode: request.mode ?? "chat",
    route: "/v1/runtime/invoke",
    requestBody,
    requestPreview: {
      inputLength: request.input.length,
      inputPreview: buildInputPreview(request.input),
    },
    runtimeRoutes: pickOpenclawBuilderRoutes(routes),
    unsupportedFeatures: OPENCLAW_UNSUPPORTED_FEATURES,
  };
}

function buildOpenclawPreflightAdvisories(
  preview: OpenclawDelegationPreview,
  health: RuntimeHealthResponse,
  dispatchPlan: OpenclawRuntimeDispatchPlan,
) {
  const advisories = [
    "Builder wedge stays fail-closed and does not inherit the OpenClaw product shell.",
  ];

  if (preview.requestBody.lane === "web") {
    advisories.push(
      "Web lane delegation still depends on the end user's current browser session materials.",
    );
  }

  if (
    health.totals.degraded > 0 ||
    health.totals.userActionRequired > 0 ||
    health.totals.unavailable > 0
  ) {
    advisories.push(
      "Runtime health is mixed; inspect remediation before treating this bridge as ready.",
    );
  }

  if (dispatchPlan.selectedLane !== preview.requestBody.lane) {
    advisories.push(
      `Runtime dispatch selected "${dispatchPlan.selectedLane}" instead of requested lane "${preview.requestBody.lane}".`,
    );
  }

  return advisories;
}

class OpenClawBuilderWedgeClient {
  readonly #fetch: typeof fetch;
  readonly #headers: Record<string, string>;
  readonly #routes: ServiceRuntimeRouteCatalog;

  constructor(options: WebaiBridgeServiceClientOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#headers = options.headers ?? {};
    this.#routes = buildServiceRouteCatalog(options.baseUrl);
  }

  get routes(): OpenclawBuilderRoutes {
    return pickOpenclawBuilderRoutes(this.#routes);
  }

  async #request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(this.#headers);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (init.headers) {
      const extraHeaders = new Headers(init.headers);
      extraHeaders.forEach((value, key) => headers.set(key, value));
    }

    const response = await this.#fetch(url, {
      ...init,
      headers,
    });
    const payload = (await response.json()) as T;

    if (!response.ok) {
      const error = new Error(
        `OpenClaw builder wedge request failed with HTTP ${response.status} at ${url}.`,
      );
      Object.assign(error, {
        status: response.status,
        payload,
      });
      throw error;
    }

    return payload;
  }

  bootstrap(): Promise<RuntimeBootstrapView> {
    return this.#request<RuntimeBootstrapView>(this.#routes.bootstrap);
  }

  health(): Promise<RuntimeHealthResponse> {
    return this.#request<RuntimeHealthResponse>(this.#routes.health);
  }

  dispatchPlan(
    requestBody: RuntimeInvokeRequest,
  ): Promise<OpenclawRuntimeDispatchPlanResponse> {
    return this.#request<OpenclawRuntimeDispatchPlanResponse>(
      this.#routes.dispatchPlan,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );
  }

  providerDoctor(providerId: string): Promise<OpenclawProviderDoctorResponse> {
    return this.#request<OpenclawProviderDoctorResponse>(
      `${this.#routes.bootstrap.replace(/\/bootstrap$/, "")}/providers/${providerId}/doctor`,
    );
  }
}

export function createOpenclawThinCompatAdapter(
  options: ThinCompatAdapterOptions,
): OpenclawThinCompatAdapter {
  const adapter = createThinCompatAdapter(OPENCLAW_THIN_COMPAT_MANIFEST, options);
  const builderWedgeClient = new OpenClawBuilderWedgeClient(options);

  return {
    manifest: adapter.manifest,
    describeDelegation() {
      return {
        target: "openclaw",
        compat: "partial" as const,
        delegatedTo: "service-runtime" as const,
        unsupportedFeatures: OPENCLAW_UNSUPPORTED_FEATURES,
      };
    },
    bootstrapDelegation() {
      return builderWedgeClient.bootstrap();
    },
    healthDelegation() {
      return builderWedgeClient.health();
    },
    previewDelegation(request) {
      return buildOpenclawDelegationPreview(request, buildServiceRouteCatalog(options.baseUrl));
    },
    readDispatchPlan(request) {
      return builderWedgeClient.dispatchPlan(
        buildOpenclawDelegationPreview(
          request,
          buildServiceRouteCatalog(options.baseUrl),
        ).requestBody,
      );
    },
    readProviderDoctor(request) {
      return builderWedgeClient.providerDoctor(
        buildOpenclawDelegationPreview(
          request,
          buildServiceRouteCatalog(options.baseUrl),
        ).requestBody.provider,
      );
    },
    async preflightDelegation(request) {
      const preview = buildOpenclawDelegationPreview(
        request,
        buildServiceRouteCatalog(options.baseUrl),
      );
      const [bootstrap, health, dispatchPlan, doctor] = await Promise.all([
        builderWedgeClient.bootstrap(),
        builderWedgeClient.health(),
        builderWedgeClient.dispatchPlan(preview.requestBody),
        builderWedgeClient.providerDoctor(preview.requestBody.provider),
      ]);

      return {
        target: "openclaw",
        compat: "partial",
        delegatedTo: "service-runtime",
        failClosed: true,
        preview,
        dispatchPlan: dispatchPlan.dispatchPlan,
        doctor: doctor.doctor,
        runtime: {
          surface: bootstrap.surface,
          bootstrap: bootstrap.bootstrap,
          health,
          routes: builderWedgeClient.routes,
        },
        advisories: buildOpenclawPreflightAdvisories(
          preview,
          health,
          dispatchPlan.dispatchPlan,
        ),
      };
    },
    delegateTurn(request) {
      return adapter.invokeText(request);
    },
    failClosed(feature) {
      return adapter.failClosed(feature);
    },
    async invokeText(request) {
      const response = await adapter.invokeText(request);
      return {
        compat: "partial" as const,
        delegatedTo: "service-runtime" as const,
        unsupportedFeatures: OPENCLAW_UNSUPPORTED_FEATURES,
        ok: response.ok,
        provider: response.provider,
        model: response.model,
        lane: response.lane,
        outputText: response.outputText,
        providerMessageId: response.providerMessageId,
        error: response.error,
        auth: response.auth,
      };
    },
  };
}

export const createOpenClawCompatAdapter = createOpenclawThinCompatAdapter;
