import {
  type LaneId,
  type ModelReference,
  type ModelReferenceInput,
  type ProviderId,
  WebaiBridgeContractError,
  normalizeProviderId,
  parseModelReference
} from '../../contracts/src/index.js';
import type { ProviderRegistry, RegisteredProvider } from './provider-registry.js';

export interface ModelResolutionRequest {
  readonly providerId?: ProviderId;
  readonly laneId?: LaneId;
  readonly modelReference?: ModelReferenceInput;
}

export interface ResolvedModelReference {
  readonly providerId: ProviderId;
  readonly laneId: LaneId;
  readonly model: ModelReference;
  readonly source: 'requested' | 'default-model' | 'recommended-model';
}

export interface ModelResolutionOptions {
  readonly laneOrder?: readonly LaneId[];
}

function sortEntries(
  entries: readonly RegisteredProvider[],
  laneOrder: readonly LaneId[]
): readonly RegisteredProvider[] {
  const orderIndex = new Map(laneOrder.map((laneId, index) => [laneId, index]));

  return [...entries].sort(
    (left, right) =>
      (orderIndex.get(left.laneId) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(right.laneId) ?? Number.MAX_SAFE_INTEGER)
  );
}

function resolveProviderId(request: ModelResolutionRequest, parsedModel?: ModelReference): ProviderId {
  if (request.providerId && parsedModel) {
    const normalizedProvider = normalizeProviderId(parsedModel.providerKey);

    if (normalizedProvider && normalizedProvider !== request.providerId) {
      throw new WebaiBridgeContractError(
        'model-resolution-failed',
        `Requested provider "${request.providerId}" conflicts with model reference "${parsedModel.canonical}".`
      );
    }
  }

  if (request.providerId) {
    return request.providerId;
  }

  if (!parsedModel) {
    throw new WebaiBridgeContractError(
      'model-resolution-failed',
      'Model resolution requires providerId or modelReference.'
    );
  }

  const providerId = normalizeProviderId(parsedModel.providerKey);

  if (!providerId) {
    throw new WebaiBridgeContractError(
      'provider-unsupported',
      `Model reference "${parsedModel.canonical}" targets a provider outside the current V1 scope.`
    );
  }

  return providerId;
}

export function resolveModelReference(
  registry: ProviderRegistry,
  request: ModelResolutionRequest,
  options: ModelResolutionOptions = {}
): ResolvedModelReference {
  const parsedModel = request.modelReference ? parseModelReference(request.modelReference) : undefined;
  const providerId = resolveProviderId(request, parsedModel);
  const laneOrder = options.laneOrder ?? ['byok', 'web-login'];

  if (request.laneId) {
    const entry = registry.require(providerId, request.laneId);

    if (parsedModel) {
      return Object.freeze({
        providerId,
        laneId: entry.laneId,
        model: parsedModel,
        source: 'requested'
      });
    }

    const fallbackModel = entry.defaultModel ?? entry.recommendedModel;

    if (!fallbackModel) {
      throw new WebaiBridgeContractError(
        'model-resolution-failed',
        `Provider "${providerId}" on lane "${request.laneId}" has no default or recommended model.`
      );
    }

    return Object.freeze({
      providerId,
      laneId: entry.laneId,
      model: fallbackModel,
      source: entry.defaultModel ? 'default-model' : 'recommended-model'
    });
  }

  const entries = sortEntries(registry.entriesForProvider(providerId), laneOrder);

  if (entries.length === 0) {
    throw new WebaiBridgeContractError(
      'provider-unsupported',
      `Provider "${providerId}" has no registered V1 entries for model resolution.`
    );
  }

  const selectedEntry = entries[0];

  if (parsedModel) {
    return Object.freeze({
      providerId,
      laneId: selectedEntry.laneId,
      model: parsedModel,
      source: 'requested'
    });
  }

  const fallbackModel = selectedEntry.defaultModel ?? selectedEntry.recommendedModel;

  if (!fallbackModel) {
    throw new WebaiBridgeContractError(
      'model-resolution-failed',
      `Provider "${providerId}" has no default or recommended model in the registry.`
    );
  }

  return Object.freeze({
    providerId,
    laneId: selectedEntry.laneId,
    model: fallbackModel,
    source: selectedEntry.defaultModel ? 'default-model' : 'recommended-model'
  });
}
