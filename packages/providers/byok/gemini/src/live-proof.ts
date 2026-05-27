import { fileURLToPath } from 'node:url';
import type {
  HttpTransportDescriptor,
  ProviderTextRequest,
  RuntimeDiagnostic,
} from '../../../../lanes/byok/src/contracts.js';
import geminiByokProvider from './index.js';

const liveProofRerunCommand = 'pnpm exec node scripts/verify-gemini-live.mjs';
const liveProofModel =
  geminiByokProvider.modelCatalog.recommendedModel ??
  geminiByokProvider.modelCatalog.defaultModel ??
  'gemini-2.5-flash';

interface EnvPresenceEntry {
  name: string;
  present: boolean;
}

interface GeminiLiveProofSuccess {
  status: 'success';
  model: string;
  envStatus: EnvPresenceEntry[];
  envNameUsed: string;
  baseUrl: string;
  baseUrlSource: 'default' | 'env';
  baseUrlEnvName?: string;
  requestUrl: string;
  responseText: string;
  diagnostics: RuntimeDiagnostic[];
}

interface GeminiLiveProofExternalBlocker {
  status: 'external-blocker';
  blocker: 'missing-gemini-api-key';
  model: string;
  envStatus: EnvPresenceEntry[];
  missingEnvNames: string[];
  rerunCommand: string;
  diagnostics: RuntimeDiagnostic[];
}

interface GeminiLiveProofFailure {
  status: 'failure';
  reason: 'prepare-failed' | 'invoke-not-implemented' | 'invoke-failed';
  model: string;
  envStatus: EnvPresenceEntry[];
  envNameUsed?: string;
  requestUrl?: string;
  diagnostics: RuntimeDiagnostic[];
  rawSummary?: string;
}

export type GeminiLiveProofResult =
  | GeminiLiveProofSuccess
  | GeminiLiveProofExternalBlocker
  | GeminiLiveProofFailure;

function collectEnvStatus(
  env: Record<string, string | undefined>,
): EnvPresenceEntry[] {
  return geminiByokProvider.credential.envNames.map(name => ({
    name,
    present: Boolean(env[name]?.trim()),
  }));
}

function redactGeminiUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.searchParams.has('key')) {
      parsed.searchParams.set('key', '<redacted>');
    }

    return parsed.toString();
  } catch {
    return url.replace(/key=[^&]+/u, 'key=<redacted>');
  }
}

function summarizeRaw(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(raw);

    if (serialized.length <= 1_200) {
      return serialized;
    }

    return `${serialized.slice(0, 1_197)}...`;
  } catch {
    return String(raw);
  }
}

function createLiveProofRequest(): ProviderTextRequest {
  return {
    model: geminiByokProvider.createModel(liveProofModel),
    input: {
      prompt: 'Reply with exactly: WEBAI_BRIDGE_GEMINI_LIVE_OK',
      system:
        'You are verifying the WebaiBridge Gemini BYOK live path. Reply with exactly WEBAI_BRIDGE_GEMINI_LIVE_OK.',
      maxOutputTokens: 32,
      temperature: 0,
    },
  };
}

export async function runGeminiLiveProof(
  env: Record<string, string | undefined> = process.env,
): Promise<GeminiLiveProofResult> {
  const request = createLiveProofRequest();
  const envStatus = collectEnvStatus(env);
  const preparation = geminiByokProvider.prepareText(request, {
    env,
    fetch,
  });

  if (!preparation.ok) {
    const missingEnvNames = envStatus
      .filter(entry => !entry.present)
      .map(entry => entry.name);

    if (preparation.diagnostics.some(diagnostic => diagnostic.code === 'missing-credential')) {
      return {
        status: 'external-blocker',
        blocker: 'missing-gemini-api-key',
        model: request.model.id,
        envStatus,
        missingEnvNames,
        rerunCommand: liveProofRerunCommand,
        diagnostics: preparation.diagnostics,
      };
    }

    return {
      status: 'failure',
      reason: 'prepare-failed',
      model: request.model.id,
      envStatus,
      diagnostics: preparation.diagnostics,
    };
  }

  if (typeof geminiByokProvider.invokeText !== 'function') {
    return {
      status: 'failure',
      reason: 'invoke-not-implemented',
      model: request.model.id,
      envStatus,
      diagnostics: preparation.diagnostics,
    };
  }

  const preparedTransport = preparation.prepared
    .transport as HttpTransportDescriptor;
  const envNameUsed =
    geminiByokProvider.credential.envNames.find(name => Boolean(env[name]?.trim())) ??
    'unknown';
  let result;

  try {
    result = await geminiByokProvider.invokeText(request, {
      env,
      fetch,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return {
      status: 'failure',
      reason: 'invoke-failed',
      model: request.model.id,
      envStatus,
      envNameUsed,
      requestUrl: redactGeminiUrl(preparedTransport.url),
      diagnostics: [],
      rawSummary:
        error instanceof Error ? error.message : String(error),
    };
  }

  if (!result.ok) {
    return {
      status: 'failure',
      reason: 'invoke-failed',
      model: request.model.id,
      envStatus,
      envNameUsed,
      requestUrl: redactGeminiUrl(preparedTransport.url),
      diagnostics: result.diagnostics,
      rawSummary: summarizeRaw(result.raw),
    };
  }

  return {
    status: 'success',
    model: request.model.id,
    envStatus,
    envNameUsed,
    baseUrl: preparedTransport.resolvedBaseUrl.value,
    baseUrlSource: preparedTransport.resolvedBaseUrl.source,
    baseUrlEnvName: preparedTransport.resolvedBaseUrl.envName,
    requestUrl: redactGeminiUrl(preparedTransport.url),
    responseText: result.text,
    diagnostics: result.diagnostics,
  };
}

async function main() {
  const result = await runGeminiLiveProof();
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'success') {
    return;
  }

  process.exitCode = result.status === 'external-blocker' ? 2 : 1;
}

const invokedPath = process.argv[1];

if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
