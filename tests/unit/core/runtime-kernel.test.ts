import { describe, expect, it } from 'vitest';

import { WebaiBridgeContractError } from '../../../packages/contracts/src/index';
import {
  createProviderRegistry,
  createWebaiBridgeRuntime
} from '../../../packages/kernel/src/index';

function createTestRegistry() {
  return createProviderRegistry([
    {
      providerId: 'gemini',
      laneId: 'byok',
      authModes: ['api-key'],
      defaultModel: 'gemini/gemini-2.5-pro',
      capabilities: {
        'text-generation': true,
        streaming: true,
        'official-api': true
      }
    },
    {
      providerId: 'gemini',
      laneId: 'web-login',
      authModes: ['session', 'web-login'],
      defaultModel: 'gemini/gemini-2.5-flash',
      capabilities: {
        'text-generation': true,
        streaming: true,
        'web-login': true
      }
    },
    {
      providerId: 'chatgpt',
      laneId: 'web-login',
      authModes: ['oauth', 'web-login'],
      defaultModel: 'chatgpt/gpt-4.1',
      capabilities: {
        'text-generation': true,
        streaming: true,
        'web-login': true,
        'tool-calling': true
      }
    }
  ]);
}

describe('kernel registry and runtime skeleton', () => {
  it('assembles a provider registry and prepares a runtime invocation plan', () => {
    const registry = createTestRegistry();
    const runtime = createWebaiBridgeRuntime({ registry });

    expect(registry.availableLanes('gemini')).toEqual(['byok', 'web-login']);

    const plan = runtime.prepareInvocation({
      surface: 'service',
      providerId: 'gemini',
      requiredCapabilities: ['text-generation'],
      credentialStates: {
        byok: 'configured',
        'web-login': 'missing'
      }
    });

    expect(plan.selection.providerId).toBe('gemini');
    expect(plan.selection.laneId).toBe('byok');
    expect(plan.selection.model.canonical).toBe('gemini/gemini-2.5-pro');
    expect(plan.capabilities['official-api'].supported).toBe(true);
  });

  it('refuses duplicate registrations on the same provider/lane pair', () => {
    expect(() =>
      createProviderRegistry([
        {
          providerId: 'chatgpt',
          laneId: 'web-login',
          authModes: ['web-login'],
          defaultModel: 'chatgpt/gpt-4.1'
        },
        {
          providerId: 'chatgpt',
          laneId: 'web-login',
          authModes: ['oauth'],
          defaultModel: 'chatgpt/gpt-4.1-mini'
        }
      ])
    ).toThrowError(WebaiBridgeContractError);
  });

  it('raises explicit credential errors instead of silently flipping lanes', () => {
    const runtime = createWebaiBridgeRuntime({ registry: createTestRegistry() });

    expect(() =>
      runtime.prepareInvocation({
        surface: 'sdk',
        providerId: 'gemini',
        preferredLane: 'web-login',
        credentialStates: {
          byok: 'configured',
          'web-login': 'missing'
        }
      })
    ).toThrowError(WebaiBridgeContractError);

    try {
      runtime.prepareInvocation({
        surface: 'sdk',
        providerId: 'gemini',
        preferredLane: 'web-login',
        credentialStates: {
          byok: 'configured',
          'web-login': 'missing'
        }
      });
    } catch (error) {
      expect((error as WebaiBridgeContractError).diagnostic.code).toBe('missing-credential');
    }
  });

  it('filters listed providers and emits a refreshable-degraded diagnostic when needed', () => {
    const registry = createTestRegistry();
    const runtime = createWebaiBridgeRuntime({ registry });

    expect(runtime.listProviders({ laneId: 'web-login' })).toHaveLength(2);

    const plan = runtime.prepareInvocation({
      surface: 'service',
      providerId: 'gemini',
      requiredCapabilities: ['text-generation'],
      credentialStates: {
        byok: 'refreshable-degraded',
        'web-login': 'missing'
      }
    });

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({
        code: 'session-refreshable-degraded',
      }),
    ]);
  });

  it('dispatches execution through the configured lane executor after planning', async () => {
    const registry = createTestRegistry();
    const runtime = createWebaiBridgeRuntime({ registry });
    const byokExecutor = {
      execute: ({ plan }: { plan: { selection: { laneId: string; providerId: string } } }) =>
        `${plan.selection.laneId}:${plan.selection.providerId}`,
    };

    const result = await runtime.invoke(
      {
        surface: 'service',
        providerId: 'gemini',
        modelReference: 'gemini/gemini-2.5-pro',
        credentialStates: {
          byok: 'configured',
          'web-login': 'missing',
        },
      },
      {
        byok: byokExecutor,
      },
      {
        byok: {
          prompt: 'hello',
        } as unknown,
      },
    );

    expect(result).toBe('byok:gemini');
  });
});
