import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  advanceCredentialLifecycle,
  buildStoredWebCredentialRecords,
  buildStoredWebProviderSessions,
  buildStoredWebRuntimeEnv,
  buildCredentialSessionHandoff,
  canTransitionCredentialLifecycle,
  createEmptyLocalWebAuthStore,
  createCredentialRecord,
  getCredentialWorkflowId,
  getCredentialWorkflowDescriptor,
  getCredentialUserActions,
  listStoredWebProviderSessions,
  readLocalWebAuthStore,
  removeStoredWebProviderSession,
  resolveLocalWebAuthStorePath,
  upsertStoredWebProviderSession
} from '../../../packages/credentials/src/index.js';

describe('credentials baseline', () => {
  it('models end-user-owned single-provider single-account slots by default', () => {
    const record = createCredentialRecord({
      userId: 'terry-local',
      providerId: 'chatgpt',
      authModeId: 'web-login'
    });

    expect(record.owner.ownershipModel).toBe('end-user-owned');
    expect(record.account.strategy).toBe('single-provider-single-account');
    expect(record.provider.authModeId).toBe('web-login');
    expect(record.state).toBe('missing');
  });

  it('derives runtime states from credential health facts', () => {
    const readyRecord = createCredentialRecord({
      userId: 'terry-local',
      providerId: 'gemini',
      authModeId: 'byok',
      accountId: 'gemini-key',
      lifecycleStage: 'check',
      status: {
        hasMaterial: true,
        providerAvailable: true
      }
    });

    const expiringRecord = createCredentialRecord({
      userId: 'terry-local',
      providerId: 'claude',
      authModeId: 'web-login',
      accountId: 'claude-browser',
      lifecycleStage: 'check',
      status: {
        hasMaterial: true,
        providerAvailable: true,
        expiringSoon: true
      }
    });

    const degradedRecord = createCredentialRecord({
      userId: 'terry-local',
      providerId: 'chatgpt',
      authModeId: 'web-login',
      accountId: 'chatgpt-browser',
      lifecycleStage: 'refresh-renew',
      status: {
        hasMaterial: true,
        providerAvailable: true,
        refreshEligible: true,
        degraded: true
      }
    });

    expect(readyRecord.state).toBe('ready');
    expect(expiringRecord.state).toBe('expiring');
    expect(degradedRecord.state).toBe('refreshable-but-degraded');
  });

  it('allows only documented lifecycle transitions', () => {
    const record = createCredentialRecord({
      userId: 'terry-local',
      providerId: 'qwen',
      authModeId: 'web-login'
    });

    expect(canTransitionCredentialLifecycle('acquire', 'bind')).toBe(true);
    expect(canTransitionCredentialLifecycle('acquire', 're-auth')).toBe(false);

    const bound = advanceCredentialLifecycle(record, 'bind');

    expect(bound.lifecycleStage).toBe('bind');

    expect(() => advanceCredentialLifecycle(record, 're-auth')).toThrow(
      'Invalid credential lifecycle transition'
    );
  });

  it('maps states into explicit user actions instead of implicit failover', () => {
    const missingWebLoginActions = getCredentialUserActions('missing', 'web-login');
    const missingByokActions = getCredentialUserActions('missing', 'byok');
    const expiredByokActions = getCredentialUserActions('expired', 'byok');

    expect(missingWebLoginActions[0]?.label).toBe('Start Login');
    expect(missingByokActions[0]).toMatchObject({
      label: 'Review key setup',
      emphasis: 'secondary'
    });
    expect(missingByokActions[0]?.description).toContain(
      'BYOK binding stays local today'
    );
    expect(expiredByokActions[0]?.label).toBe('Review key replacement');
  });

  it('maps credential states into login, status, and re-auth workflows', () => {
    expect(getCredentialWorkflowId('missing')).toBe('login');
    expect(getCredentialWorkflowId('ready')).toBe('status');
    expect(getCredentialWorkflowId('refreshable-but-degraded')).toBe('status');
    expect(getCredentialWorkflowId('expired')).toBe('re-auth');
    expect(getCredentialWorkflowId('user-action-required')).toBe('re-auth');
  });

  it('fails closed for unsupported credential workflow states', () => {
    expect(() => getCredentialWorkflowDescriptor('mystery-state' as never)).toThrow(
      'Unsupported credential workflow'
    );
  });

  it('builds explicit local session handoff tickets for acquisition and refresh recovery', () => {
    const missingByok = buildCredentialSessionHandoff(
      createCredentialRecord({
        userId: 'terry-local',
        providerId: 'openai',
        authModeId: 'byok'
      })
    );
    const missingWebLogin = buildCredentialSessionHandoff(
      createCredentialRecord({
        userId: 'terry-local',
        providerId: 'claude',
        authModeId: 'web-login'
      })
    );
    const degradedSession = buildCredentialSessionHandoff(
      createCredentialRecord({
        userId: 'terry-local',
        providerId: 'chatgpt',
        authModeId: 'web-login',
        accountId: 'chatgpt-browser',
        lifecycleStage: 'refresh-renew',
        status: {
          hasMaterial: true,
          degraded: true,
          refreshEligible: true
        }
      })
    );

    expect(missingByok.kind).toBe('acquisition');
    expect(missingByok.captureRequest?.artifacts[0]?.kind).toBe('api-key');
    expect(missingByok.captureRequest?.artifacts[0]?.handoffChannel).toBe('local-auth-portal');
    expect(missingByok.captureRequest?.artifacts[0]?.description).toContain(
      'outside the browser acquisition flow'
    );

    expect(missingWebLogin.kind).toBe('acquisition');
    expect(missingWebLogin.captureRequest?.artifacts[0]?.kind).toBe('browser-session');
    expect(missingWebLogin.captureRequest?.artifacts[0]?.collectedBy).toBe('local-runtime');
    expect(missingWebLogin.nextStep.actor).toBe('end-user');

    expect(degradedSession.kind).toBe('refresh-recovery');
    expect(degradedSession.captureRequest).toBeNull();
    expect(degradedSession.nextStep.actionId).toBe('retry-refresh');
    expect(degradedSession.nextStep.actor).toBe('local-runtime');
    expect(degradedSession.fallbackStep?.actionId).toBe('reauthenticate');
  });

  it('persists high-stability web acquisition outputs into a local-first store', () => {
    const storeEnv = {
      WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: join(
        process.cwd(),
        '.runtime-cache',
        'temp',
        'credentials-store.test.json'
      )
    };
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    upsertStoredWebProviderSession(
      {
        providerId: 'chatgpt',
        state: 'ready',
        accountLabel: 'chatgpt:local-browser',
        sessionSource: 'chatgpt-browser-profile',
        lastValidatedAt: '2026-03-29T20:00:00.000Z',
        artifactStates: {
          'next-auth-session-token': 'present',
          'openai-access-token': 'present'
        },
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: 'chatgpt_session=stored',
          WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT: 'WebaiBridgeStored/1.0'
        },
        updatedAt: '2026-03-29T20:00:00.000Z',
        source: 'local-auth-portal'
      },
      storeEnv
    );

    const runtimeEnv = buildStoredWebRuntimeEnv(storeEnv);
    const sessions = buildStoredWebProviderSessions(storeEnv);
    const records = buildStoredWebCredentialRecords('terry-local', storeEnv);

    expect(resolveLocalWebAuthStorePath(storeEnv)).toContain('credentials-store.test.json');
    expect(runtimeEnv.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE).toBe('chatgpt_session=stored');
    expect(sessions.chatgpt).toEqual(
      expect.objectContaining({
        state: 'ready',
        sessionSource: 'chatgpt-browser-profile'
      })
    );
    expect(records[0]).toEqual(
      expect.objectContaining({
        state: 'ready',
        account: expect.objectContaining({
          accountLabel: 'chatgpt:local-browser'
        })
      })
    );

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });

  it('returns an empty store for missing files and can remove stored provider sessions', () => {
    const storeEnv = {
      WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: join(
        process.cwd(),
        '.runtime-cache',
        'temp',
        'credentials-blank-store.test.json'
      )
    };
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    expect(createEmptyLocalWebAuthStore()).toEqual({
      version: 1,
      providers: {}
    });
    expect(readLocalWebAuthStore(storeEnv)).toEqual({
      version: 1,
      providers: {}
    });

    upsertStoredWebProviderSession(
      {
        providerId: 'chatgpt',
        state: 'ready',
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: 'chatgpt_session=stored'
        },
        updatedAt: '2026-03-29T20:00:00.000Z',
        source: 'local-auth-portal'
      },
      storeEnv
    );
    upsertStoredWebProviderSession(
      {
        providerId: 'gemini',
        state: 'user-action-required',
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT: 'WebaiBridgeStored/1.0'
        },
        updatedAt: '2026-03-29T20:00:00.000Z',
        source: 'local-auth-portal'
      },
      storeEnv
    );

    expect(listStoredWebProviderSessions(storeEnv).map((record) => record.providerId)).toEqual([
      'chatgpt',
      'gemini'
    ]);

    const nextStore = removeStoredWebProviderSession('chatgpt', storeEnv);

    expect(nextStore.providers.chatgpt).toBeUndefined();
    expect(listStoredWebProviderSessions(storeEnv).map((record) => record.providerId)).toEqual([
      'gemini'
    ]);

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });
});
