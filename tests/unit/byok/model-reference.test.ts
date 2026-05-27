import { describe, expect, test } from 'vitest';
import {
  formatModelReference,
  parseModelReference,
} from '../../../packages/lanes/byok/src/index.js';
import {
  createWebaiBridgeSdk,
  gemini,
  openrouter,
  providers,
} from '../../../packages/sdk/src/index.js';

describe('BYOK model references', () => {
  test('builds provider/model references through SDK-facing factories', () => {
    expect(gemini('gemini-2.5-flash')).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      id: 'gemini/gemini-2.5-flash',
    });

    expect(providers.openai('gpt-5-mini').id).toBe('openai/gpt-5-mini');
  });

  test('parses provider/model while preserving nested model ids', () => {
    const parsed = parseModelReference(
      openrouter('google/gemini-2.0-flash-exp').id,
    );

    expect(parsed.provider).toBe('openrouter');
    expect(parsed.model).toBe('google/gemini-2.0-flash-exp');
    expect(formatModelReference(parsed)).toBe(
      'openrouter/google/gemini-2.0-flash-exp',
    );
  });

  test('rejects malformed references', () => {
    expect(() => parseModelReference('bad-reference')).toThrow(
      /provider\/model/,
    );
    expect(() => parseModelReference('unknown/model')).toThrow(
      /Unsupported BYOK provider/,
    );
  });

  test('surfaces default and recommended model references through the SDK', () => {
    const sdk = createWebaiBridgeSdk();

    expect(sdk.getDefaultModel('gemini')?.id).toBe('gemini/gemini-2.5-flash');
    expect(sdk.getRecommendedModel('openai')?.id).toBe('openai/gpt-5-mini');
    expect(sdk.createModel('vertex', 'gemini-2.5-flash').id).toBe(
      'vertex/gemini-2.5-flash',
    );
  });
});
