import { describe, expect, test } from 'vitest';
import { createDefaultByokRegistry } from '../../../packages/lanes/byok/src/index.js';
import { createWebaiBridgeSdkClient } from '../../../packages/sdk/src/index.js';

describe('BYOK capability alignment', () => {
  test('keeps provider registrations inside official API semantics', () => {
    const registry = createDefaultByokRegistry();

    for (const provider of registry.list()) {
      expect(provider.capabilities.textGeneration).toBe(true);
      expect(provider.capabilities.officialApi).toBe(true);
      expect(provider.capabilities.webLogin).toBe(false);
    }
  });

  test('pins auth mode expectations for the notable baseline providers', () => {
    const registry = createDefaultByokRegistry();

    expect(registry.get('gemini')?.credential.mode).toBe('api-key');
    expect(registry.get('vertex')?.credential.mode).toBe('google-vertex');
    expect(registry.get('bedrock')?.credential.mode).toBe('aws-sigv4');
    expect(registry.get('openrouter')?.credential.envNames).toContain(
      'OPENROUTER_API_KEY',
    );
  });

  test('keeps transport families aligned with provider integration baselines', () => {
    const registry = createDefaultByokRegistry();

    expect(registry.get('openai')?.transport.family).toBe('openai-responses');
    expect(registry.get('anthropic')?.transport.requestShape).toBe('messages');
    expect(registry.get('openrouter')?.transport.family).toBe(
      'openai-compatible',
    );
    expect(registry.get('vertex')?.transport.family).toBe('google-vertex');
    expect(registry.get('bedrock')?.transport.family).toBe('aws-bedrock');
  });

  test('descriptor providers fail fast on missing credentials instead of pretending they are ready', () => {
    const client = createWebaiBridgeSdkClient({
      env: {},
    });

    const prepared = client.prepareText({
      model: 'openai/gpt-5-mini',
      prompt: 'hello',
    });

    expect(prepared.ok).toBe(false);

    if (prepared.ok) {
      return;
    }

    expect(prepared.diagnostics[0]?.code).toBe('missing-credential');
  });
});
