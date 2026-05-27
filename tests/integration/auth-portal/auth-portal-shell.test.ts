import { describe, expect, it } from 'vitest';

import {
  type AuthPortalCard,
  buildAuthPortalShellModel,
  renderAuthPortalShell
} from '../../../apps/auth-portal/src/index.js';
import {
  createCredentialOwner,
  createCredentialRecord
} from '../../../packages/credentials/src/index.js';
import { buildAuthRuntimeView } from '../../../packages/diagnostics/src/index.js';

describe('auth portal shell', () => {
  function buildRouteRefs(providerId: string) {
    return {
      status: `/v1/runtime/providers/${providerId}/status`,
      probe: `/v1/runtime/providers/${providerId}/probe`,
      remediation: `/v1/runtime/providers/${providerId}/remediation`,
      acquisitionStart: `/v1/runtime/providers/${providerId}/acquisition/start`,
      acquisitionCapture: `/v1/runtime/providers/${providerId}/acquisition/capture`,
      debugCurrentPage: `/v1/runtime/providers/${providerId}/debug/current-page`,
      debugCurrentConsole: `/v1/runtime/providers/${providerId}/debug/current-console`,
      debugCurrentNetwork: `/v1/runtime/providers/${providerId}/debug/current-network`,
      debugSupportBundle: `/v1/runtime/providers/${providerId}/debug/support-bundle`,
      debugWorkbench: `/v1/runtime/providers/${providerId}/debug/workbench`
    };
  }

  it('surfaces login, status, and re-authentication entry points in a local-first shell', () => {
    const owner = createCredentialOwner('terry-local');

    const model = buildAuthPortalShellModel({
      owner,
      routeCatalog: {
        authPortal: '/v1/runtime/auth-portal',
        providerStatusTemplate: '/v1/runtime/providers/{providerId}/status',
        providerAcquisitionStartTemplate: '/v1/runtime/providers/{providerId}/acquisition/start',
        providerAcquisitionCaptureTemplate: '/v1/runtime/providers/{providerId}/acquisition/capture',
        providerDebugWorkbenchTemplate: '/v1/runtime/providers/{providerId}/debug/workbench',
      },
      records: [
        createCredentialRecord({
          userId: owner.userId,
          providerId: 'gemini',
          authModeId: 'byok',
          accountId: 'gemini-key',
          accountLabel: 'Gemini key',
          lifecycleStage: 'check',
          status: {
            hasMaterial: true
          }
        }),
        createCredentialRecord({
          userId: owner.userId,
          providerId: 'chatgpt',
          authModeId: 'web-login',
          accountId: 'chatgpt-browser',
          accountLabel: 'ChatGPT browser session',
          lifecycleStage: 'expire-degrade',
          status: {
            hasMaterial: true,
            expired: true
          }
        })
      ]
    });

    const byokGeminiCard = model.sections[0]?.cards.find((card) => card.providerId === 'gemini');
    const missingClaudeCard = model.sections[1]?.cards.find((card) => card.providerId === 'claude');
    const expiredChatGptCard = model.sections[1]?.cards.find((card) => card.providerId === 'chatgpt');
    const workflowIds = model.workflows.map((workflow) => workflow.id);

    expect(byokGeminiCard?.actions.map((action) => action.label)).toContain('View Status');
    expect(missingClaudeCard?.actions.map((action) => action.label)).toContain('Start Login');
    expect(expiredChatGptCard?.actions.map((action) => action.label)).toContain('Re-authenticate');
    expect(missingClaudeCard?.handoff.kind).toBe('acquisition');
    expect(missingClaudeCard?.handoff.captureRequest?.artifacts[0]?.collectedBy).toBe('local-runtime');
    expect(expiredChatGptCard?.workflowId).toBe('re-auth');
    expect(expiredChatGptCard?.diagnostic?.contractCategoryLabel).toBe('expired session');
    expect(expiredChatGptCard?.handoff.kind).toBe('re-authentication');
    expect(workflowIds).toEqual(['login', 'status', 're-auth']);

    const html = renderAuthPortalShell(model);

    expect(html).toContain('WebaiBridge Web/Login Access');
    expect(html).toContain('Local-first Web/Login access');
    expect(html).toContain('No shared credential pool');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('Inspect current browser');
    expect(html).toContain('Web/Login live readiness');
    expect(html).toContain('The five provider verdicts that matter first');
    expect(html).toContain('Start here first');
    expect(html).toContain('Start with one call');
    expect(html).toContain('Review live readiness first');
    expect(html).toContain('Open provider details');
    expect(html).toContain('Web/Login details, evidence, and actions');
    expect(html).toContain('The arrivals board above already makes the first call.');
    expect(html).toContain('Portal rules, workflows, and browser handoff model');
    expect(html).toContain('BYOK inventory and local key slots');
    expect(html).toContain('Portal rules, workflows, and browser handoff model');
    expect(html).toContain('BYOK inventory and local key slots');
    expect(html).toContain('Login');
    expect(html).toContain('Status');
    expect(html).toContain('Re-auth');
    expect(html).toContain('Acquisition Ticket');
    expect(html).toContain('Re-auth Ticket');
    expect(html).toContain('Capture Request');
    expect(html).toContain('Collected by: Local runtime');
    expect(html).toContain('Next step');
    expect(html).toContain('Start Login');
    expect(html).toContain('Managed Browser');
    expect(html).toContain('Attach Browser Session');
    expect(html).toContain('View Status');
    expect(html).toContain('Re-authenticate');
    expect(html).toContain('Technical category');
    expect(html).toContain('auth-portal-route-catalog');
    expect(html).toContain('/v1/runtime/providers/{providerId}/acquisition/start');
    expect(html).toContain('/v1/runtime/providers/{providerId}/debug/workbench');
    expect(html).toContain('data-provider-id="claude"');
    expect(html).toContain('data-action-id="start-web-login"');
    expect(html).toContain('data-acquisition-mode="isolated-chrome-root"');
    expect(html).toContain('data-acquisition-mode="managed-browser"');
    expect(html).toContain('data-acquisition-mode="existing-browser-session"');
    expect(html).toContain('auth-portal-feedback');
    expect(html).toContain('Reload current summary');
    expect(html).toContain('data-portal-reload="true"');
    expect(html).not.toContain('window.setTimeout(() => window.location.reload(), 500)');
    expect(html).not.toContain('&quot;authPortal&quot;');
    expect(html).toContain('payload.acquisition ?? {}');
    expect(html).toContain('syncProviderDrawerFromHash');
    expect(html).toContain('providerDrawer instanceof HTMLDetailsElement');
    expect(html).toContain('!browser?.loginOpened');
    expect(html).toContain('data-capture-body');
    expect(html).toContain('aria-live="polite"');

    const routeCatalogMatch = html.match(
      /<script type="application\/json" id="auth-portal-route-catalog">([\s\S]*?)<\/script>/
    );

    expect(routeCatalogMatch?.[1]).toBeTruthy();
    expect(JSON.parse(routeCatalogMatch?.[1] ?? '')).toEqual(model.routeCatalog);
  });

  it('promotes known blocker subtypes ahead of generic re-auth wording on web-login cards', () => {
    const owner = createCredentialOwner('terry-local');
    const defaultModel = buildAuthPortalShellModel({
      owner,
      routeCatalog: {
        authPortal: '/v1/runtime/auth-portal',
        providerStatusTemplate: '/v1/runtime/providers/{providerId}/status',
        providerAcquisitionStartTemplate: '/v1/runtime/providers/{providerId}/acquisition/start',
        providerAcquisitionCaptureTemplate: '/v1/runtime/providers/{providerId}/acquisition/capture',
        providerDebugWorkbenchTemplate: '/v1/runtime/providers/{providerId}/debug/workbench'
      }
    });
    const byokSection = defaultModel.sections[0];
    const webSection = defaultModel.sections[1];
    const claudeBase = buildAuthRuntimeView(
      createCredentialRecord({
        userId: owner.userId,
        providerId: 'claude',
        authModeId: 'web-login',
        accountId: 'claude-browser',
        accountLabel: 'Claude browser session',
        lifecycleStage: 're-auth',
        status: {
          hasMaterial: true,
          userActionRequired: true
        }
      })
    );
    const grokBase = buildAuthRuntimeView(
      createCredentialRecord({
        userId: owner.userId,
        providerId: 'grok',
        authModeId: 'web-login',
        accountId: 'grok-browser',
        accountLabel: 'Grok browser session',
        lifecycleStage: 're-auth',
        status: {
          hasMaterial: true,
          userActionRequired: true
        }
      })
    );
    const claudeCard: AuthPortalCard = {
      ...claudeBase,
      mode: 'isolated-chrome-root',
      modeLabel: 'Use Isolated Chrome Root',
      routes: buildRouteRefs('claude'),
      transportHint: 'Restore Claude subscription access before rerunning the live gate.',
      session: {
        state: 'user-action-required',
        accountLabel: 'Claude browser session',
        requiredUserAction: 'Restore Claude subscription access before rerunning the live gate.',
        persistenceAudit: {
          workspaceClassification: 'account-action-required',
          summary: 'Claude account access is blocked until the subscription is restored.',
          pageUrl: 'https://claude.ai/new',
          pageTitle: 'Claude'
        }
      } as AuthPortalCard['session']
    };
    const grokCard: AuthPortalCard = {
      ...grokBase,
      mode: 'isolated-chrome-root',
      modeLabel: 'Use Isolated Chrome Root',
      routes: buildRouteRefs('grok'),
      transportHint: 'Complete the Grok browser session until it reaches a reusable workspace.',
      session: {
        state: 'user-action-required',
        accountLabel: 'Grok browser session',
        requiredUserAction: 'Complete the Grok browser session until it reaches a reusable workspace.',
        persistenceAudit: {
          workspaceClassification: 'session-incomplete',
          summary: 'The current Grok browser seat has not reached a reusable workspace yet.',
          pageUrl: 'https://grok.com/',
          pageTitle: 'Grok'
        }
      } as AuthPortalCard['session']
    };

    const html = renderAuthPortalShell({
      ...defaultModel,
      sections: [
        ...(byokSection ? [byokSection] : []),
        webSection
          ? {
              ...webSection,
              cards: [claudeCard, grokCard]
            }
          : {
              id: 'web-login',
              title: 'Web/Login',
              description: 'User signs in with a browser, OAuth flow, or subscription-backed web session.',
              cards: [claudeCard, grokCard]
            }
      ]
    });

    expect(html).toContain('Account action required');
    expect(html).toContain('Inspect Claude blocker');
    expect(html).toContain('Session incomplete');
    expect(html).toContain('Inspect current browser first');
    expect(html).toContain('Start here first');
    expect(html).toContain('Claude · Account action required');
    expect(html).toContain('Inspect Claude blocker');
    expect(html).toContain('Re-authenticate');
    expect(html).toContain('Primary verdict');
    expect(html).toContain('Evidence and handoff details');
    expect(html).toContain('The arrivals board above already makes the first call.');
    expect(html).not.toContain('This section now behaves like a triage wall');
    expect(html).toContain('Account action required');
    expect(html).toContain('Session incomplete');
    expect(html.indexOf('The five provider verdicts that matter first')).toBeLessThan(
      html.indexOf('Portal rules, workflows, and browser handoff model')
    );
  });

  it('prefers live current-browser truth over stale stored browser audits on web-login cards', () => {
    const owner = createCredentialOwner('terry-local');
    const defaultModel = buildAuthPortalShellModel({
      owner,
      routeCatalog: {
        authPortal: '/v1/runtime/auth-portal',
        providerStatusTemplate: '/v1/runtime/providers/{providerId}/status',
        providerAcquisitionStartTemplate: '/v1/runtime/providers/{providerId}/acquisition/start',
        providerAcquisitionCaptureTemplate: '/v1/runtime/providers/{providerId}/acquisition/capture',
        providerDebugWorkbenchTemplate: '/v1/runtime/providers/{providerId}/debug/workbench'
      }
    });
    const byokSection = defaultModel.sections[0];
    const webSection = defaultModel.sections[1];
    const claudeBase = buildAuthRuntimeView(
      createCredentialRecord({
        userId: owner.userId,
        providerId: 'claude',
        authModeId: 'web-login',
        accountId: 'claude-browser',
        accountLabel: 'Claude browser session',
        lifecycleStage: 're-auth',
        status: {
          hasMaterial: true,
          userActionRequired: true
        }
      })
    );
    const claudeCard: AuthPortalCard = {
      ...claudeBase,
      mode: 'isolated-chrome-root',
      modeLabel: 'Use Isolated Chrome Root',
      routes: buildRouteRefs('claude'),
      transportHint: 'Restore Claude subscription access before rerunning the live gate.',
      session: {
        state: 'user-action-required',
        accountLabel: 'Claude browser session',
        requiredUserAction: 'Restore Claude subscription access before rerunning the live gate.',
        persistenceAudit: {
          workspaceClassification: 'provider-adjacent',
          summary: 'Stored audit is stale and still points at another browser seat.',
          pageUrl: 'https://chatgpt.com/c/stale-seat',
          pageTitle: 'ChatGPT'
        }
      } as AuthPortalCard['session'],
      currentBrowser: {
        source: 'live-browser-inspection',
        status: 'captured',
        liveStatus: 'live-ready',
        classification: 'workspace-ready',
        summary: 'Claude browser tab looks reusable, but account access is blocked upstream.',
        title: 'Claude',
        url: 'https://claude.ai/new',
        attachTargetLabel: 'Isolated Chrome root'
      }
    };

    const html = renderAuthPortalShell({
      ...defaultModel,
      sections: [
        ...(byokSection ? [byokSection] : []),
        webSection
          ? {
              ...webSection,
              cards: [claudeCard]
            }
          : {
              id: 'web-login',
              title: 'Web/Login',
              description: 'User signs in with a browser, OAuth flow, or subscription-backed web session.',
              cards: [claudeCard]
            }
      ]
    });

    expect(html).toContain('Current browser truth');
    expect(html).toContain('Account action required');
    expect(html).toContain('Inspect Claude blocker');
    expect(html).toContain('Title</strong> Claude');
    expect(html).toContain('https://claude.ai/new');
    expect(html).not.toContain('https://chatgpt.com/c/stale-seat');
    expect(html).not.toContain('Title</strong> ChatGPT');
  });

  it('keeps attach-failed web-login cards out of the ready bucket', () => {
    const owner = createCredentialOwner('terry-local');
    const defaultModel = buildAuthPortalShellModel({
      owner,
      routeCatalog: {
        authPortal: '/v1/runtime/auth-portal',
        providerStatusTemplate: '/v1/runtime/providers/{providerId}/status',
        providerAcquisitionStartTemplate: '/v1/runtime/providers/{providerId}/acquisition/start',
        providerAcquisitionCaptureTemplate: '/v1/runtime/providers/{providerId}/acquisition/capture',
        providerDebugWorkbenchTemplate: '/v1/runtime/providers/{providerId}/debug/workbench'
      }
    });
    const byokSection = defaultModel.sections[0];
    const chatgptBase = buildAuthRuntimeView(
      createCredentialRecord({
        userId: owner.userId,
        providerId: 'chatgpt',
        authModeId: 'web-login',
        accountId: 'chatgpt-browser',
        accountLabel: 'ChatGPT browser session',
        lifecycleStage: 're-auth',
        status: {
          hasMaterial: true,
          userActionRequired: true
        }
      })
    );
    const chatgptCard: AuthPortalCard = {
      ...chatgptBase,
      mode: 'isolated-chrome-root',
      modeLabel: 'Use Isolated Chrome Root',
      routes: buildRouteRefs('chatgpt'),
      transportHint: 'Restore the ChatGPT attach target before rerunning the live gate.',
      session: {
        state: 'user-action-required',
        accountLabel: 'ChatGPT browser session',
        requiredUserAction: 'Restore the ChatGPT attach target before rerunning the live gate.',
        persistenceAudit: {
          workspaceClassification: 'attach-failed',
          summary: 'WebaiBridge could not attach to the current ChatGPT browser seat.',
          pageUrl: 'https://chatgpt.com/',
          pageTitle: 'ChatGPT'
        }
      } as AuthPortalCard['session']
    };

    const html = renderAuthPortalShell({
      ...defaultModel,
      sections: [
        ...(byokSection ? [byokSection] : []),
        {
          id: 'web-login',
          title: 'Web/Login',
          description: 'User signs in with a browser, OAuth flow, or subscription-backed web session.',
          cards: [chatgptCard]
        }
      ]
    });

    expect(html).toContain('Session incomplete');
    expect(html).toContain('User action required');
    expect(html).not.toContain('Ready providers (1)');
    expect(html).toContain('BYOK key entry stays outside the browser acquisition flow.');
  });
});
