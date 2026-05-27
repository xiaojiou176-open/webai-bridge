import {
  type AuthMode,
  type CapabilityMatrix,
  type CapabilityMatrixInput,
  type DiagnosticStatus,
  type LaneId,
  type ModelReference,
  type ModelReferenceInput,
  type ProviderId,
  WebaiBridgeContractError,
  createCapabilityMatrix,
  normalizeLaneId,
  normalizeProviderId,
  parseModelReference,
  providerSupportsLane
} from '../../contracts/src/index.js';

export type ProviderCatalogSource = 'static' | 'provider-api' | 'upstream-sync';

export interface ProviderRegistration {
  readonly providerId: string;
  readonly laneId: string;
  readonly displayName?: string;
  readonly authModes: readonly AuthMode[];
  readonly defaultModel?: ModelReferenceInput;
  readonly recommendedModel?: ModelReferenceInput;
  readonly capabilities?: CapabilityMatrixInput;
  readonly diagnosticsStatus?: DiagnosticStatus;
  readonly catalogSource?: ProviderCatalogSource;
}

export interface RegisteredProvider {
  readonly providerId: ProviderId;
  readonly laneId: LaneId;
  readonly displayName: string;
  readonly authModes: readonly AuthMode[];
  readonly defaultModel?: ModelReference;
  readonly recommendedModel?: ModelReference;
  readonly capabilities: CapabilityMatrix;
  readonly diagnosticsStatus: DiagnosticStatus;
  readonly catalogSource: ProviderCatalogSource;
}

function normalizeRegistryModel(
  providerId: ProviderId,
  modelReference: ModelReferenceInput | undefined,
  label: string
): ModelReference | undefined {
  if (!modelReference) {
    return undefined;
  }

  const parsed = parseModelReference(modelReference);
  const normalizedProvider = normalizeProviderId(parsed.providerKey) ?? parsed.providerKey;

  if (normalizedProvider !== providerId) {
    throw new WebaiBridgeContractError(
      'registry-invalid',
      `${label} must point back to provider "${providerId}", received "${parsed.canonical}".`
    );
  }

  return parsed;
}

function normalizeRegistration(input: ProviderRegistration): RegisteredProvider {
  const providerId = normalizeProviderId(input.providerId);
  const laneId = normalizeLaneId(input.laneId);

  if (!providerId) {
    throw new WebaiBridgeContractError(
      'provider-unsupported',
      `Provider "${input.providerId}" is outside the current V1 provider universe.`
    );
  }

  if (!laneId) {
    throw new WebaiBridgeContractError(
      'configuration-invalid',
      `Lane "${input.laneId}" is invalid. V1 only allows BYOK and Web/Login.`
    );
  }

  if (!providerSupportsLane(providerId, laneId)) {
    throw new WebaiBridgeContractError(
      'provider-lane-incompatible',
      `Provider "${providerId}" cannot be registered on lane "${laneId}".`
    );
  }

  const authModes = [...new Set(input.authModes)];

  if (authModes.length === 0) {
    throw new WebaiBridgeContractError(
      'registry-invalid',
      `Provider "${providerId}" on lane "${laneId}" must declare at least one auth mode.`
    );
  }

  return Object.freeze({
    providerId,
    laneId,
    displayName: input.displayName ?? providerId,
    authModes: Object.freeze(authModes),
    defaultModel: normalizeRegistryModel(providerId, input.defaultModel, 'defaultModel'),
    recommendedModel: normalizeRegistryModel(
      providerId,
      input.recommendedModel,
      'recommendedModel'
    ),
    capabilities: createCapabilityMatrix(input.capabilities),
    diagnosticsStatus: input.diagnosticsStatus ?? 'healthy',
    catalogSource: input.catalogSource ?? 'static'
  });
}

function registryKey(providerId: ProviderId, laneId: LaneId): string {
  return `${providerId}:${laneId}`;
}

export class ProviderRegistry {
  readonly entries: readonly RegisteredProvider[];

  private readonly byKey = new Map<string, RegisteredProvider>();
  private readonly byProvider = new Map<ProviderId, readonly RegisteredProvider[]>();

  constructor(registrations: readonly ProviderRegistration[]) {
    const normalizedEntries = registrations.map(normalizeRegistration);

    for (const entry of normalizedEntries) {
      const key = registryKey(entry.providerId, entry.laneId);

      if (this.byKey.has(key)) {
        throw new WebaiBridgeContractError(
          'registry-invalid',
          `Duplicate provider registration detected for "${entry.providerId}" on "${entry.laneId}".`
        );
      }

      this.byKey.set(key, entry);
    }

    for (const entry of normalizedEntries) {
      const existingEntries = this.byProvider.get(entry.providerId) ?? [];
      this.byProvider.set(entry.providerId, Object.freeze([...existingEntries, entry]));
    }

    this.entries = Object.freeze(normalizedEntries);
  }

  list(filters: { readonly laneId?: LaneId; readonly providerId?: ProviderId } = {}): readonly RegisteredProvider[] {
    return this.entries.filter((entry) => {
      if (filters.laneId && entry.laneId !== filters.laneId) {
        return false;
      }

      if (filters.providerId && entry.providerId !== filters.providerId) {
        return false;
      }

      return true;
    });
  }

  get(providerId: ProviderId, laneId: LaneId): RegisteredProvider | undefined {
    return this.byKey.get(registryKey(providerId, laneId));
  }

  require(providerId: ProviderId, laneId: LaneId): RegisteredProvider {
    const entry = this.get(providerId, laneId);

    if (!entry) {
      throw new WebaiBridgeContractError(
        'provider-lane-incompatible',
        `Provider "${providerId}" is not registered on lane "${laneId}".`
      );
    }

    return entry;
  }

  entriesForProvider(providerId: ProviderId): readonly RegisteredProvider[] {
    return this.byProvider.get(providerId) ?? [];
  }

  availableLanes(providerId: ProviderId): readonly LaneId[] {
    return this.entriesForProvider(providerId).map((entry) => entry.laneId);
  }
}

export function createProviderRegistry(
  registrations: readonly ProviderRegistration[]
): ProviderRegistry {
  return new ProviderRegistry(registrations);
}
