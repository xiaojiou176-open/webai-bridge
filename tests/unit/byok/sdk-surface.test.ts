import { describe, expect, test } from 'vitest';
import { createWebaiBridgeSdk } from '../../../packages/sdk/src/index.js';

describe('WebaiBridge SDK surface', () => {
  test('acts as a unified BYOK entry point for provider discovery and preparation', () => {
    const sdk = createWebaiBridgeSdk({
      env: {
        GEMINI_API_KEY: 'sdk-test-key',
      },
    });

    const profiles = sdk.listProviderProfiles();
    const gemini = sdk.getProviderProfile('gemini');
    const prepared = sdk.prepareText({
      model: sdk.getRecommendedModel('gemini') ?? 'gemini/gemini-2.5-flash',
      prompt: 'hello sdk',
    });

    expect(profiles).toHaveLength(9);
    expect(gemini?.transport.sdkBinding?.packageName).toBe('@ai-sdk/google');
    expect(gemini?.defaultModel?.id).toBe('gemini/gemini-2.5-flash');
    expect(prepared.ok).toBe(true);
  });

  test('exposes the Web/Login runtime registry and auth-status semantics through the SDK', async () => {
    const sdk = createWebaiBridgeSdk({
      web: {
        useLocalWebAuthStore: false,
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: 'chatgpt=abc',
          WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: 'WebaiBridgeTest/1.0',
        },
        providerSessions: {
          chatgpt: {
            state: 'ready',
            accountLabel: 'chatgpt:default',
            sessionSource: 'chatgpt-browser-profile',
          },
          grok: {
            state: 'user-action-required',
            accountLabel: 'grok:default',
            sessionSource: 'grok-browser-profile',
            requiredUserAction: 'Link the X account in the attached browser.',
          },
        },
      },
    });

    const webProviders = sdk.web.listProviders();
    const chatgpt = sdk.web.getProvider('chatgpt');
    const authStatus = await sdk.web.authStatus();
    const health = await sdk.web.health();

    expect(webProviders).toHaveLength(5);
    expect(chatgpt?.descriptor.provider).toBe('chatgpt');
    expect(chatgpt?.descriptor.authProfile.mode).toBe('browser-session');
    expect(authStatus.find((entry) => entry.provider === 'chatgpt')?.credentialState).toBe('ready');
    expect(authStatus.find((entry) => entry.provider === 'grok')?.credentialState).toBe('user-action-required');
    expect(health.lane).toBe('web');
    expect(health.totals.total).toBe(5);
    expect(health.totals.userActionRequired).toBeGreaterThanOrEqual(1);
  });
});
