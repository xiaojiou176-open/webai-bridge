import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createWebaiBridgeSdk,
  createWebaiBridgeSdkClient,
} from '../../../packages/sdk/src/index.js';
import { runGeminiLiveProof } from '../../../packages/providers/byok/gemini/src/live-proof.js';
import geminiByokProvider from '../../../packages/providers/byok/gemini/src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Gemini BYOK baseline', () => {
  test('prepares the real Gemini API key request path', () => {
    const client = createWebaiBridgeSdkClient({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
      },
    });

    const prepared = client.prepareText({
      model: 'gemini/gemini-2.5-flash',
      prompt: 'Hello from WebaiBridge',
      system: 'You are a concise test model.',
      maxOutputTokens: 128,
      temperature: 0.3,
    });

    expect(prepared.ok).toBe(true);

    if (!prepared.ok) {
      return;
    }

    expect(prepared.prepared.transport.kind).toBe('http');

    if (prepared.prepared.transport.kind !== 'http') {
      return;
    }

    expect(prepared.prepared.transport.contract.family).toBe(
      'gemini-generative-language',
    );
    expect(prepared.prepared.transport.contract.requestShape).toBe(
      'generate-content',
    );
    expect(prepared.prepared.transport.resolvedBaseUrl).toEqual({
      value: 'https://generativelanguage.googleapis.com/v1beta',
      source: 'default',
    });
    expect(prepared.prepared.transport.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini-key',
    );
    expect(prepared.prepared.transport.headers).toEqual({
      'content-type': 'application/json',
    });
    expect(prepared.prepared.transport.body).toEqual({
      systemInstruction: {
        parts: [{ text: 'You are a concise test model.' }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello from WebaiBridge' }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0.3,
      },
    });
  });

  test('fails clearly when the Gemini API key is missing', async () => {
    const client = createWebaiBridgeSdkClient({
      env: {},
    });

    const result = await client.generateText({
      model: 'gemini/gemini-2.5-flash',
      prompt: 'This should not run.',
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.diagnostics[0]?.code).toBe('missing-credential');
  });

  test('executes the Gemini baseline through injected fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Gemini baseline ok.' }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    });

    const client = createWebaiBridgeSdkClient({
      env: {
        GEMINI_API_KEY: 'test-gemini-key',
      },
      fetch: fetchMock,
    });

    const result = await client.generateText({
      model: 'gemini/gemini-2.5-flash',
      prompt: 'Say baseline ok.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.text).toBe('Gemini baseline ok.');
  });

  test('exposes provider profiles through the SDK-facing entry point', () => {
    const sdk = createWebaiBridgeSdk();
    const geminiProfile = sdk.getProviderProfile('gemini');
    const openaiProfile = sdk.getProviderProfile('openai');

    expect(geminiProfile?.implementation).toBe('executable-baseline');
    expect(geminiProfile?.transport.sdkBinding?.packageName).toBe(
      '@ai-sdk/google',
    );
    expect(openaiProfile?.implementation).toBe('descriptor-baseline');
    expect(openaiProfile?.transport.sdkBinding?.packageName).toBe(
      '@ai-sdk/openai',
    );
  });

  test('returns a structured failure when the live Gemini invoke throws before diagnostics exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    );

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: 'test-gemini-key',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failure',
        reason: 'invoke-failed',
        envNameUsed: 'WEBAI_BRIDGE_GEMINI_API_KEY',
        rawSummary: 'fetch failed',
      }),
    );
  });

  test('returns prepare-failed when Gemini preparation fails for a non-credential reason', async () => {
    vi.spyOn(geminiByokProvider, 'prepareText').mockReturnValue({
      ok: false,
      diagnostics: [
        {
          code: 'provider-unavailable',
          message: 'proxy offline',
        },
      ],
    } as never);

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: 'test-gemini-key',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failure',
        reason: 'prepare-failed',
      }),
    );
  });

  test('returns an external blocker with missing env names when the Gemini live proof has no key', async () => {
    const result = await runGeminiLiveProof({});

    expect(result).toEqual(
      expect.objectContaining({
        status: 'external-blocker',
        blocker: 'missing-gemini-api-key',
        rerunCommand: 'pnpm exec node scripts/verify-gemini-live.mjs'
      })
    );

    if (result.status !== 'external-blocker') {
      throw new Error('Expected external-blocker result.');
    }

    expect(result.missingEnvNames.length).toBeGreaterThan(0);
  });

  test('reports env-based baseUrl overrides and redacts the request url in success results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'WEBAI_BRIDGE_GEMINI_LIVE_OK' }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      ) as typeof fetch,
    );

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: 'env-key',
      WEBAI_BRIDGE_GEMINI_BASE_URL: 'https://proxy.internal/v1beta',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        envNameUsed: 'WEBAI_BRIDGE_GEMINI_API_KEY',
        baseUrl: 'https://proxy.internal/v1beta',
        baseUrlSource: 'env',
        baseUrlEnvName: 'WEBAI_BRIDGE_GEMINI_BASE_URL',
        responseText: 'WEBAI_BRIDGE_GEMINI_LIVE_OK',
      }),
    );

    if (result.status !== 'success') {
      throw new Error('Expected success result.');
    }

    expect(result.requestUrl).toContain('key=%3Credacted%3E');
  });

  test('surfaces thrown invoke errors and alternative env names without leaking the raw key', async () => {
    vi.spyOn(geminiByokProvider, 'invokeText').mockRejectedValue(
      new Error('socket hang up'),
    );

    const result = await runGeminiLiveProof({
      GOOGLE_API_KEY: 'test-gemini-key',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failure',
        reason: 'invoke-failed',
        envNameUsed: 'GOOGLE_API_KEY',
        requestUrl: expect.stringContaining('key=%3Credacted%3E'),
        rawSummary: 'socket hang up',
      }),
    );
  });

  test('truncates oversized raw payloads when Gemini returns a structured failure body', async () => {
    vi.spyOn(geminiByokProvider, 'invokeText').mockResolvedValue({
      ok: false,
      diagnostics: [],
      raw: {
        payload: 'x'.repeat(1300),
      },
    } as never);

    const result = await runGeminiLiveProof({
      GEMINI_API_KEY: 'test-gemini-key',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failure',
        reason: 'invoke-failed',
        envNameUsed: 'GEMINI_API_KEY',
        rawSummary: expect.stringMatching(/\.\.\.$/),
      }),
    );
  });
});
