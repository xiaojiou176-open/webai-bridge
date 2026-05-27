import {
  type CapabilityId,
  type CredentialState,
  type LaneId,
  type ModelReferenceInput,
  type ProviderId,
  WebaiBridgeContractError,
  isCredentialUsable,
  missingCapabilities,
  normalizeProviderId,
  parseModelReference
} from '../../contracts/src/index.js';
import type { ProviderRegistry } from './provider-registry.js';

export interface LaneDispatchRequest {
  readonly providerId?: ProviderId;
  readonly modelReference?: ModelReferenceInput;
  readonly preferredLane?: LaneId;
  readonly credentialStates?: Partial<Record<LaneId, CredentialState>>;
  readonly requiredCapabilities?: readonly CapabilityId[];
}

export interface LaneDispatchDecision {
  readonly providerId: ProviderId;
  readonly laneId: LaneId;
  readonly candidateLanes: readonly LaneId[];
  readonly reason: 'single-compatible-lane' | 'preferred-lane' | 'lane-order';
}

export interface LaneDispatchOptions {
  readonly laneOrder?: readonly LaneId[];
}

function resolveProviderId(request: LaneDispatchRequest): ProviderId {
  if (request.providerId) {
    return request.providerId;
  }

  if (!request.modelReference) {
    throw new WebaiBridgeContractError(
      'routing-failed',
      'Lane dispatch requires either providerId or modelReference.'
    );
  }

  const parsed = parseModelReference(request.modelReference);
  const providerId = normalizeProviderId(parsed.providerKey);

  if (!providerId) {
    throw new WebaiBridgeContractError(
      'provider-unsupported',
      `Model reference "${parsed.canonical}" points to a provider outside the current V1 scope.`
    );
  }

  return providerId;
}

function sortLanes(candidateLanes: readonly LaneId[], laneOrder: readonly LaneId[]): readonly LaneId[] {
  const orderIndex = new Map(laneOrder.map((laneId, index) => [laneId, index]));

  return [...candidateLanes].sort(
    (left, right) => (orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}

function mapCredentialStateToErrorCode(state: CredentialState | undefined) {
  switch (state) {
    case 'expired':
      return 'session-expired' as const;
    case 'invalid':
      return 'credential-invalid' as const;
    case 'user-action-required':
      return 'user-action-required' as const;
    default:
      return 'missing-credential' as const;
  }
}

export function dispatchLane(
  registry: ProviderRegistry,
  request: LaneDispatchRequest,
  options: LaneDispatchOptions = {}
): LaneDispatchDecision {
  const providerId = resolveProviderId(request);
  const laneOrder = options.laneOrder ?? ['byok', 'web-login'];
  const registrations = registry.entriesForProvider(providerId);

  if (registrations.length === 0) {
    throw new WebaiBridgeContractError(
      'provider-unsupported',
      `Provider "${providerId}" has no registered V1 lanes.`
    );
  }

  const capabilityCompatibleLanes = registrations
    .filter((entry) => {
      if (!request.requiredCapabilities || request.requiredCapabilities.length === 0) {
        return true;
      }

      return missingCapabilities(entry.capabilities, request.requiredCapabilities).length === 0;
    })
    .map((entry) => entry.laneId);

  if (capabilityCompatibleLanes.length === 0) {
    throw new WebaiBridgeContractError(
      'provider-capability-mismatch',
      `Provider "${providerId}" does not satisfy the requested capability set.`
    );
  }

  const candidateLanes = sortLanes(capabilityCompatibleLanes, laneOrder);

  if (request.preferredLane) {
    if (!candidateLanes.includes(request.preferredLane)) {
      throw new WebaiBridgeContractError(
        'provider-lane-incompatible',
        `Provider "${providerId}" cannot use preferred lane "${request.preferredLane}".`
      );
    }

    const preferredState = request.credentialStates?.[request.preferredLane];

    if (request.credentialStates && !isCredentialUsable(preferredState)) {
      throw new WebaiBridgeContractError(
        mapCredentialStateToErrorCode(preferredState),
        `Preferred lane "${request.preferredLane}" is not currently usable for provider "${providerId}".`
      );
    }

    return Object.freeze({
      providerId,
      laneId: request.preferredLane,
      candidateLanes,
      reason: 'preferred-lane'
    });
  }

  const usableLanes = candidateLanes.filter((laneId) =>
    request.credentialStates ? isCredentialUsable(request.credentialStates[laneId]) : true
  );

  if (request.credentialStates && usableLanes.length === 0) {
    const firstState = candidateLanes
      .map((laneId) => request.credentialStates?.[laneId])
      .find((state) => state !== undefined);

    throw new WebaiBridgeContractError(
      mapCredentialStateToErrorCode(firstState),
      `Provider "${providerId}" has no currently usable lane under the supplied credential state map.`
    );
  }

  const selectedLane = (usableLanes[0] ?? candidateLanes[0]) as LaneId;

  return Object.freeze({
    providerId,
    laneId: selectedLane,
    candidateLanes,
    reason: candidateLanes.length === 1 ? 'single-compatible-lane' : 'lane-order'
  });
}
