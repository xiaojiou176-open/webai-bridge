import {
  createDefaultByokRegistry,
  invokeByokText,
  prepareByokTextInvocation,
  type ByokProviderId,
  type ByokProviderRegistry,
  type ModelReference,
  type ProviderTextResult,
  type TextGenerationInput,
} from '../../../lanes/byok/src/index.js';
import {
  getProviderProfile,
  listProviderProfiles,
  type WebaiBridgeProviderProfile,
} from '../../../sdk/src/providers.js';

export interface WebaiBridgeSdkClientOptions {
  registry?: ByokProviderRegistry;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export interface GenerateTextRequest extends TextGenerationInput {
  model: string | ModelReference;
}

export class WebaiBridgeSdkClient {
  readonly registry: ByokProviderRegistry;
  readonly #env: Record<string, string | undefined>;
  readonly #fetch: typeof fetch;

  constructor(options: WebaiBridgeSdkClientOptions = {}) {
    this.registry = options.registry ?? createDefaultByokRegistry();
    this.#env = options.env ?? process.env;
    this.#fetch = options.fetch ?? fetch;
  }

  listProviders() {
    return this.registry.list();
  }

  getProvider(provider: ByokProviderId) {
    return this.registry.get(provider);
  }

  listProviderProfiles(): readonly WebaiBridgeProviderProfile[] {
    return listProviderProfiles(this.registry);
  }

  getProviderProfile(
    provider: ByokProviderId,
  ): WebaiBridgeProviderProfile | undefined {
    return getProviderProfile(this.registry, provider);
  }

  createModel(provider: ByokProviderId, modelId: string) {
    const registration = this.registry.get(provider);

    if (!registration) {
      throw new Error(`Provider "${provider}" is not registered.`);
    }

    return registration.createModel(modelId);
  }

  getDefaultModel(provider: ByokProviderId) {
    return this.getProviderProfile(provider)?.defaultModel;
  }

  getRecommendedModel(provider: ByokProviderId) {
    return this.getProviderProfile(provider)?.recommendedModel;
  }

  resolveModel(reference: string | ModelReference) {
    return this.registry.resolveModel(reference);
  }

  prepareText(request: GenerateTextRequest) {
    return prepareByokTextInvocation(
      this.registry,
      {
        model: request.model,
        input: {
          prompt: request.prompt,
          system: request.system,
          stream: request.stream,
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature,
        },
      },
      {
        env: this.#env,
        fetch: this.#fetch,
      },
    );
  }

  async generateText(request: GenerateTextRequest): Promise<ProviderTextResult> {
    return invokeByokText(
      this.registry,
      {
        model: request.model,
        input: {
          prompt: request.prompt,
          system: request.system,
          stream: request.stream,
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature,
        },
      },
      {
        env: this.#env,
        fetch: this.#fetch,
      },
    );
  }
}

export function createWebaiBridgeSdkClient(
  options: WebaiBridgeSdkClientOptions = {},
) {
  return new WebaiBridgeSdkClient(options);
}
