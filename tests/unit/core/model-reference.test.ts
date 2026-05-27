import { describe, expect, it } from 'vitest';

import {
  WebaiBridgeContractError,
  normalizeModelReference,
  parseModelReference,
  sameModelReference
} from '../../../packages/contracts/src/index';

describe('model reference normalization', () => {
  it('normalizes provider/model input into a canonical pointer', () => {
    const parsed = parseModelReference(' Gemini / gemini-2.5-pro ');

    expect(parsed.providerKey).toBe('gemini');
    expect(parsed.modelId).toBe('gemini-2.5-pro');
    expect(parsed.canonical).toBe('gemini/gemini-2.5-pro');
  });

  it('treats structured and string references as the same model', () => {
    expect(
      sameModelReference('gemini/gemini-2.5-pro', {
        provider: 'gemini',
        model: 'gemini-2.5-pro'
      })
    ).toBe(true);

    expect(
      normalizeModelReference({
        provider: 'chatgpt',
        model: 'gpt-4.1'
      })
    ).toBe('chatgpt/gpt-4.1');
  });

  it('rejects invalid model references that omit the provider/model separator', () => {
    expect(() => parseModelReference('gemini-2.5-pro')).toThrowError(WebaiBridgeContractError);

    try {
      parseModelReference('gemini-2.5-pro');
    } catch (error) {
      expect((error as WebaiBridgeContractError).diagnostic.code).toBe('invalid-model-reference');
    }
  });
});
