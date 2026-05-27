import { createCapabilities } from '../../../../lanes/byok/src/capabilities.js';
import type {
  ByokProviderRegistration,
  HttpTransportDescriptor,
  ProviderTextRequest,
  ProviderTransportContract,
  ResolvedTransportBaseUrl,
} from '../../../../lanes/byok/src/contracts.js';
import {
  missingCredentialDiagnostic,
  providerUnavailableDiagnostic,
} from '../../../../lanes/byok/src/diagnostics.js';
import { createModelReference } from '../../../../lanes/byok/src/model-reference.js';
import {
  resolveCredentialValue,
  resolveTransportBaseUrl,
} from '../../shared/provider-factory.js';

const geminiEnvNames = [
  'WEBAI_BRIDGE_GEMINI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
] as const;
const defaultGeminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
const geminiTransportContract: ProviderTransportContract = {
  family: 'gemini-generative-language',
  method: 'POST',
  requestShape: 'generate-content',
  baseUrl: defaultGeminiBaseUrl,
  baseUrlEnvNames: ['WEBAI_BRIDGE_GEMINI_BASE_URL'],
  path: '/models/{model}:generateContent',
  auth: {
    scheme: 'query-api-key',
    envNames: geminiEnvNames,
  },
  sdkBinding: {
    packageName: '@ai-sdk/google',
    exportName: 'google',
    setup: 'default-provider',
    modelInvocation: "google('gemini-2.5-flash')",
  },
};

function buildGeminiUrl(
  baseUrl: string,
  modelId: string,
  apiKey: string,
): string {
  const normalizedBaseUrl = baseUrl.endsWith('/')
    ? baseUrl.slice(0, -1)
    : baseUrl;

  return `${normalizedBaseUrl}/models/${modelId}:generateContent?key=${apiKey}`;
}

function buildGeminiBody(request: ProviderTextRequest) {
  const generationConfig: Record<string, number> = {};

  if (request.input.maxOutputTokens != null) {
    generationConfig.maxOutputTokens = request.input.maxOutputTokens;
  }

  if (request.input.temperature != null) {
    generationConfig.temperature = request.input.temperature;
  }

  return {
    ...(request.input.system
      ? {
          systemInstruction: {
            parts: [{ text: request.input.system }],
          },
        }
      : {}),
    contents: [
      {
        role: 'user',
        parts: [{ text: request.input.prompt }],
      },
    ],
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}

function extractGeminiText(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw == null) {
    return undefined;
  }

  const candidates = (raw as { candidates?: unknown }).candidates;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }

  const firstCandidate = candidates[0] as {
    content?: { parts?: Array<{ text?: string }> };
  };
  const parts = firstCandidate.content?.parts;

  if (!Array.isArray(parts)) {
    return undefined;
  }

  const text = parts
    .map(part => part.text)
    .filter((value): value is string => typeof value === 'string')
    .join('');

  return text.length > 0 ? text : undefined;
}

function createGeminiTransport(
  request: ProviderTextRequest,
  apiKey: string,
  resolvedBaseUrl: ResolvedTransportBaseUrl,
): HttpTransportDescriptor {
  return {
    kind: 'http',
    contract: geminiTransportContract,
    method: geminiTransportContract.method,
    resolvedBaseUrl,
    url: buildGeminiUrl(resolvedBaseUrl.value, request.model.model, apiKey),
    headers: {
      'content-type': 'application/json',
    },
    body: buildGeminiBody(request),
  };
}

const geminiByokProvider: ByokProviderRegistration = {
  provider: 'gemini',
  displayName: 'Google Gemini',
  lane: 'byok',
  implementation: 'executable-baseline',
  credential: {
    mode: 'api-key',
    envNames: geminiEnvNames,
    description: 'User supplied Gemini API key.',
    presence: {
      kind: 'any',
    },
  },
  capabilities: createCapabilities({
    toolCalling: true,
    imageInput: true,
    fileInput: true,
  }),
  modelCatalog: {
    mode: 'inline-default',
    defaultModel: 'gemini-2.5-flash',
    recommendedModel: 'gemini-2.5-flash',
  },
  transport: geminiTransportContract,
  createModel(modelId: string) {
    return createModelReference('gemini', modelId);
  },
  prepareText(request, context) {
    const apiKey = resolveCredentialValue(context.env, geminiEnvNames);

    if (!apiKey) {
      return {
        ok: false,
        diagnostics: [
          missingCredentialDiagnostic('gemini', request.model.id, this.credential),
        ],
      };
    }

    const resolvedBaseUrl =
      resolveTransportBaseUrl(
        context.env,
        geminiTransportContract.baseUrl,
        geminiTransportContract.baseUrlEnvNames,
      ) ?? {
        value: defaultGeminiBaseUrl,
        source: 'default',
      };

    return {
      ok: true,
      prepared: {
        provider: 'gemini',
        model: request.model,
        transport: createGeminiTransport(request, apiKey, resolvedBaseUrl),
        credential: this.credential,
        capabilities: this.capabilities,
      },
      diagnostics: [],
    };
  },
  async invokeText(request, context) {
    const preparation = this.prepareText(request, context);

    if (!preparation.ok) {
      return {
        ok: false,
        diagnostics: preparation.diagnostics,
      };
    }

    const preparedTransport = preparation.prepared
      .transport as HttpTransportDescriptor;
    const response = await context.fetch(preparedTransport.url, {
      method: preparedTransport.method,
      headers: preparedTransport.headers,
      body: JSON.stringify(preparedTransport.body),
      signal: context.signal,
    });

    const raw = await response.json().catch(() => undefined);

    if (!response.ok) {
      return {
        ok: false,
        prepared: preparation.prepared,
        raw,
        diagnostics: [
          providerUnavailableDiagnostic(
            'gemini',
            request.model.id,
            `Gemini request failed with status ${response.status}.`,
            response.status >= 500,
          ),
        ],
      };
    }

    const text = extractGeminiText(raw);

    if (!text) {
      return {
        ok: false,
        prepared: preparation.prepared,
        raw,
        diagnostics: [
          providerUnavailableDiagnostic(
            'gemini',
            request.model.id,
            'Gemini response did not contain a text candidate.',
            false,
          ),
        ],
      };
    }

    return {
      ok: true,
      text,
      prepared: preparation.prepared,
      raw,
      diagnostics: [],
    };
  },
};

export default geminiByokProvider;
