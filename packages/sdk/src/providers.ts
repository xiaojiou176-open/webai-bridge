import type {
  ByokImplementation,
  ByokProviderId,
  ByokProviderRegistration,
  ByokProviderRegistry,
  CapabilityMatrix,
  CredentialRequirement,
  ModelReference,
  ProviderTransportContract,
} from '../../lanes/byok/src/index.js';
import { createProviderModelFactory } from '../../providers/byok/shared/provider-factory.js';

export type ProviderModelFactory<TProvider extends string> = ((
  modelId: string,
) => ModelReference) & {
  readonly provider: TProvider;
};

export const openai = createProviderModelFactory('openai');
export const anthropic = createProviderModelFactory('anthropic');
export const gemini = createProviderModelFactory('gemini');
export const xai = createProviderModelFactory('xai');
export const openrouter = createProviderModelFactory('openrouter');
export const groq = createProviderModelFactory('groq');
export const qwen = createProviderModelFactory('qwen');
export const vertex = createProviderModelFactory('vertex');
export const bedrock = createProviderModelFactory('bedrock');

export const providers = {
  openai,
  anthropic,
  gemini,
  xai,
  openrouter,
  groq,
  qwen,
  vertex,
  bedrock,
} as const;

export interface WebaiBridgeProviderProfile {
  provider: ByokProviderId;
  displayName: string;
  implementation: ByokImplementation;
  credential: CredentialRequirement;
  capabilities: CapabilityMatrix;
  transport: ProviderTransportContract;
  defaultModel?: ModelReference;
  recommendedModel?: ModelReference;
}

export function createProviderProfile(
  registration: ByokProviderRegistration,
): WebaiBridgeProviderProfile {
  return {
    provider: registration.provider,
    displayName: registration.displayName,
    implementation: registration.implementation,
    credential: registration.credential,
    capabilities: registration.capabilities,
    transport: registration.transport,
    defaultModel: registration.modelCatalog.defaultModel
      ? registration.createModel(registration.modelCatalog.defaultModel)
      : undefined,
    recommendedModel: registration.modelCatalog.recommendedModel
      ? registration.createModel(registration.modelCatalog.recommendedModel)
      : undefined,
  };
}

export function listProviderProfiles(
  registry: ByokProviderRegistry,
): readonly WebaiBridgeProviderProfile[] {
  return registry.list().map(createProviderProfile);
}

export function getProviderProfile(
  registry: ByokProviderRegistry,
  provider: ByokProviderId,
): WebaiBridgeProviderProfile | undefined {
  const registration = registry.get(provider);

  return registration ? createProviderProfile(registration) : undefined;
}
