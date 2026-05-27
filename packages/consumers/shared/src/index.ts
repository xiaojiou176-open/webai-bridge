import {
  normalizeProviderId,
  providerSupportedLanes,
  WebaiBridgeContractError,
} from "../../../contracts/src/index.js";
import { parseModelReference } from "../../../contracts/src/model-reference.js";
import {
  createWebaiBridgeServiceClient,
  type RuntimeInvokeRequest,
  type RuntimeInvokeResponse,
  type WebaiBridgeServiceClientOptions,
} from "../../../surfaces/sdk-client/src/index.js";

export const THIN_COMPAT_TARGETS = ["codex", "claude-code", "openclaw"] as const;
export type ThinCompatTarget = (typeof THIN_COMPAT_TARGETS)[number];

export const THIN_COMPAT_MODES = ["chat", "plan", "copilot-brain"] as const;
export type ThinCompatMode = (typeof THIN_COMPAT_MODES)[number];

export const THIN_COMPAT_UNSUPPORTED_FEATURES = [
  "tool-execution",
  "mcp-execution",
  "execution-brain",
  "terminal-shell",
  "approval-ui",
  "browser-automation",
] as const;
export type ThinCompatUnsupportedFeature =
  (typeof THIN_COMPAT_UNSUPPORTED_FEATURES)[number];

export const THIN_COMPAT_TRANSPORTS = [
  "responses",
  "anthropic-compatible",
  "delegated-runtime",
] as const;
export type ThinCompatTransport = (typeof THIN_COMPAT_TRANSPORTS)[number];

export interface ThinCompatManifest<TTarget extends ThinCompatTarget = ThinCompatTarget> {
  readonly target: TTarget;
  readonly status: "partial";
  readonly builderFacing: true;
  readonly failClosed: true;
  readonly supportedModes: readonly ThinCompatMode[];
  readonly unsupportedFeatures: readonly ThinCompatUnsupportedFeature[];
  readonly transport: ThinCompatTransport;
  readonly route: "/v1/runtime/invoke";
  readonly notes: readonly string[];
}

export interface ThinCompatRequest {
  readonly model: string;
  readonly input: string;
  readonly mode?: ThinCompatMode;
  readonly provider?: string;
  readonly lane?: "web" | "byok";
}

export interface ThinCompatResponse<TTarget extends ThinCompatTarget = ThinCompatTarget> {
  readonly target: TTarget;
  readonly mode: ThinCompatMode;
  readonly ok: boolean;
  readonly provider?: string;
  readonly model: string;
  readonly lane?: string;
  readonly outputText?: string;
  readonly providerMessageId?: string;
  readonly error?: RuntimeInvokeResponse["error"];
  readonly auth?: RuntimeInvokeResponse["auth"];
  readonly route: "/v1/runtime/invoke";
}

export interface ThinCompatAdapter<TTarget extends ThinCompatTarget = ThinCompatTarget> {
  readonly manifest: ThinCompatManifest<TTarget>;
  invokeText(request: ThinCompatRequest): Promise<ThinCompatResponse<TTarget>>;
  failClosed(feature: ThinCompatUnsupportedFeature): never;
}

export type ThinCompatAdapterOptions = WebaiBridgeServiceClientOptions;

export interface ThinCompatManifestOptions<TTarget extends ThinCompatTarget> {
  readonly target: TTarget;
  readonly transport: ThinCompatTransport;
  readonly notes: readonly string[];
}

export class ThinCompatUnsupportedFeatureError extends Error {
  readonly feature: ThinCompatUnsupportedFeature;
  readonly target: ThinCompatTarget;

  constructor(feature: ThinCompatUnsupportedFeature, target: ThinCompatTarget) {
    super(
      `WebaiBridge thin compat target "${target}" intentionally does not expose "${feature}".`,
    );
    this.name = "ThinCompatUnsupportedFeatureError";
    this.feature = feature;
    this.target = target;
  }
}

export function createThinCompatManifest<TTarget extends ThinCompatTarget>(
  options: ThinCompatManifestOptions<TTarget>,
): ThinCompatManifest<TTarget> {
  return Object.freeze({
    target: options.target,
    status: "partial",
    builderFacing: true,
    failClosed: true,
    supportedModes: THIN_COMPAT_MODES,
    unsupportedFeatures: THIN_COMPAT_UNSUPPORTED_FEATURES,
    transport: options.transport,
    route: "/v1/runtime/invoke",
    notes: Object.freeze([...options.notes]),
  });
}

function resolveProviderId(request: ThinCompatRequest) {
  const requestedProvider = request.provider?.trim();

  if (requestedProvider) {
    const normalized = normalizeProviderId(requestedProvider);
    if (!normalized) {
      throw new WebaiBridgeContractError(
        "configuration-invalid",
        `Unknown provider "${request.provider}" for thin compat request.`,
        {
          hints: [
            'Use a canonical provider id like "chatgpt" or "anthropic".',
            'Or omit "provider" and use a "provider/model" reference.',
          ],
        },
      );
    }

    return normalized;
  }

  const modelReference = parseModelReference(request.model);
  const normalized = normalizeProviderId(modelReference.providerKey);

  if (!normalized) {
    throw new WebaiBridgeContractError(
      "invalid-model-reference",
      `Model reference "${request.model}" does not point at a known WebaiBridge provider.`,
      {
        hints: ['Use the canonical "provider/model" form.'],
      },
    );
  }

  return normalized;
}

function toServiceLane(lane: "byok" | "web-login") {
  return lane === "web-login" ? "web" : "byok";
}

function resolveLane(request: ThinCompatRequest, providerId: string): "web" | "byok" {
  if (request.lane) {
    return request.lane;
  }

  const lanes = providerSupportedLanes(providerId as Parameters<typeof providerSupportedLanes>[0]);

  if (lanes.length === 1) {
    return toServiceLane(lanes[0]);
  }

  throw new WebaiBridgeContractError(
    "configuration-invalid",
    `Provider "${providerId}" supports multiple lanes; thin compat requests must set "lane" explicitly.`,
    {
      hints: [
        'Use `lane: "byok"` when delegating through API-key providers.',
        'Use `lane: "web"` when delegating through managed browser sessions.',
      ],
    },
  );
}

export function buildThinCompatInvokeRequest(
  request: ThinCompatRequest,
): RuntimeInvokeRequest {
  const providerId = resolveProviderId(request);
  const lane = resolveLane(request, providerId);

  return {
    provider: providerId,
    model: request.model,
    input: request.input,
    lane,
  };
}

export function createThinCompatAdapter<TTarget extends ThinCompatTarget>(
  manifest: ThinCompatManifest<TTarget>,
  options: WebaiBridgeServiceClientOptions,
): ThinCompatAdapter<TTarget> {
  const client = createWebaiBridgeServiceClient(options);

  return {
    manifest,
    async invokeText(request) {
      const invokeRequest = buildThinCompatInvokeRequest(request);
      const response = await client.invoke(invokeRequest);
      const outputText =
        response.outputText ??
        (response as RuntimeInvokeResponse & { text?: string }).text;
      const ok = response.ok ?? (response.error ? false : outputText !== undefined);

      return {
        target: manifest.target,
        mode: request.mode ?? "chat",
        ok,
        provider: response.provider ?? invokeRequest.provider,
        model: response.model ?? request.model,
        lane: response.lane ?? invokeRequest.lane,
        outputText,
        providerMessageId: response.providerMessageId,
        error: response.error,
        auth: response.auth,
        route: manifest.route,
      };
    },
    failClosed(feature) {
      throw new ThinCompatUnsupportedFeatureError(feature, manifest.target);
    },
  };
}
