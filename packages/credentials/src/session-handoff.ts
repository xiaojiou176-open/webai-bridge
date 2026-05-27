import type { AuthModeId, ProviderId } from './catalog.js';
import type { CredentialMaterialKind, CredentialRecord } from './model.js';
import {
  getCredentialUserActions,
  getCredentialWorkflowDescriptor,
  type CredentialUserAction,
  type CredentialUserActionId,
  type CredentialWorkflowId
} from './state.js';

export const CREDENTIAL_ACTION_ACTORS = ['end-user', 'local-runtime'] as const;
export type CredentialActionActor = (typeof CREDENTIAL_ACTION_ACTORS)[number];

export const CREDENTIAL_ARTIFACT_SOURCES = [
  'end-user-input',
  'local-browser-session',
  'provider-oauth',
  'current-bound-credential'
] as const;
export type CredentialArtifactSource = (typeof CREDENTIAL_ARTIFACT_SOURCES)[number];

export const CREDENTIAL_HANDOFF_CHANNELS = [
  'local-auth-portal',
  'local-browser',
  'local-runtime'
] as const;
export type CredentialHandoffChannel = (typeof CREDENTIAL_HANDOFF_CHANNELS)[number];

export const CREDENTIAL_HANDOFF_KINDS = [
  'acquisition',
  'status-review',
  'refresh-recovery',
  're-authentication'
] as const;
export type CredentialHandoffKind = (typeof CREDENTIAL_HANDOFF_KINDS)[number];

export const CREDENTIAL_HANDOFF_STATUSES = [
  'pending-user-action',
  'ready-for-local-runtime',
  'status-only',
  'waiting-on-provider'
] as const;
export type CredentialHandoffStatus = (typeof CREDENTIAL_HANDOFF_STATUSES)[number];

const ACTION_ACTOR_BY_ID: Record<CredentialUserActionId, CredentialActionActor> = {
  'provide-api-key': 'end-user',
  'start-web-login': 'end-user',
  'replace-api-key': 'end-user',
  reauthenticate: 'end-user',
  'retry-refresh': 'local-runtime',
  'wait-for-provider': 'end-user',
  'view-status': 'end-user'
};

const ACTION_ACTOR_LABELS: Record<CredentialActionActor, string> = {
  'end-user': 'End user',
  'local-runtime': 'Local runtime'
};

const ARTIFACT_SOURCE_LABELS: Record<CredentialArtifactSource, string> = {
  'end-user-input': 'End-user input',
  'local-browser-session': 'Local browser session',
  'provider-oauth': 'Provider OAuth flow',
  'current-bound-credential': 'Current bound credential'
};

const HANDOFF_CHANNEL_LABELS: Record<CredentialHandoffChannel, string> = {
  'local-auth-portal': 'Local auth portal',
  'local-browser': 'Local browser',
  'local-runtime': 'Local runtime'
};

const HANDOFF_KIND_LABELS: Record<CredentialHandoffKind, string> = {
  acquisition: 'Acquisition Ticket',
  'status-review': 'Status Review',
  'refresh-recovery': 'Refresh Recovery',
  're-authentication': 'Re-auth Ticket'
};

const HANDOFF_STATUS_LABELS: Record<CredentialHandoffStatus, string> = {
  'pending-user-action': 'Pending user action',
  'ready-for-local-runtime': 'Ready for local runtime',
  'status-only': 'Status only',
  'waiting-on-provider': 'Waiting on provider'
};

export interface CredentialArtifactEnvelope {
  artifactId: string;
  kind: CredentialMaterialKind;
  label: string;
  description: string;
  source: CredentialArtifactSource;
  sourceLabel: string;
  collectedBy: CredentialActionActor;
  collectedByLabel: string;
  handoffChannel: CredentialHandoffChannel;
  handoffChannelLabel: string;
  required: boolean;
}

export interface CredentialCaptureRequest {
  requestId: string;
  summary: string;
  description: string;
  artifacts: CredentialArtifactEnvelope[];
}

export interface CredentialHandoffStep {
  actionId: CredentialUserActionId;
  actor: CredentialActionActor;
  actorLabel: string;
  label: string;
  description: string;
  blocking: boolean;
}

export interface CredentialSessionHandoff {
  ticketId: string;
  workflowId: CredentialWorkflowId;
  workflowLabel: string;
  kind: CredentialHandoffKind;
  kindLabel: string;
  status: CredentialHandoffStatus;
  statusLabel: string;
  localOnly: true;
  ownerUserId: string;
  providerId: ProviderId;
  providerDisplayName: CredentialRecord['provider']['displayName'];
  authModeId: AuthModeId;
  summary: string;
  captureRequest: CredentialCaptureRequest | null;
  nextStep: CredentialHandoffStep;
  fallbackStep: CredentialHandoffStep | null;
  recommendedActions: CredentialUserAction[];
}

function getMaterialSource(materialKind: CredentialMaterialKind): CredentialArtifactSource {
  switch (materialKind) {
    case 'api-key':
      return 'end-user-input';
    case 'oauth-session':
      return 'provider-oauth';
    case 'browser-session':
    case 'subscription-session':
      return 'local-browser-session';
  }
}

function getArtifactCollector(authModeId: AuthModeId): CredentialActionActor {
  return authModeId === 'byok' ? 'end-user' : 'local-runtime';
}

function getArtifactChannel(authModeId: AuthModeId, materialKind: CredentialMaterialKind): CredentialHandoffChannel {
  if (authModeId === 'byok') {
    return 'local-auth-portal';
  }

  return materialKind === 'oauth-session' ? 'local-runtime' : 'local-browser';
}

function getHandoffKind(record: CredentialRecord): CredentialHandoffKind {
  switch (record.state) {
    case 'missing':
      return 'acquisition';
    case 'refreshable-but-degraded':
      return 'refresh-recovery';
    case 'expired':
    case 'user-action-required':
      return 're-authentication';
    case 'ready':
    case 'expiring':
    case 'provider-unavailable':
      return 'status-review';
  }
}

function getHandoffStatus(
  record: CredentialRecord,
  kind: CredentialHandoffKind
): CredentialHandoffStatus {
  switch (kind) {
    case 'acquisition':
    case 're-authentication':
      return 'pending-user-action';
    case 'refresh-recovery':
      return 'ready-for-local-runtime';
    case 'status-review':
      return record.state === 'provider-unavailable' ? 'waiting-on-provider' : 'status-only';
  }
}

function getArtifactLabel(
  kind: CredentialHandoffKind,
  authModeId: AuthModeId,
  materialKind: CredentialMaterialKind
): string {
  if (authModeId === 'byok') {
    return kind === 're-authentication' ? 'Replacement API key' : 'API key';
  }

  switch (materialKind) {
    case 'oauth-session':
      return kind === 're-authentication' ? 'Renewed OAuth session' : 'OAuth session';
    case 'subscription-session':
      return kind === 're-authentication'
        ? 'Renewed subscription session'
        : 'Subscription-backed session';
    case 'browser-session':
      return kind === 're-authentication' ? 'Renewed browser session' : 'Browser session';
    case 'api-key':
      return kind === 're-authentication' ? 'Replacement API key' : 'API key';
  }
}

function getArtifactDescription(
  record: CredentialRecord,
  kind: CredentialHandoffKind
): string {
  if (record.provider.authModeId === 'byok') {
    return kind === 're-authentication'
      ? 'Collect a fresh end-user-owned API key and rebind it to the same local provider slot outside the browser acquisition flow.'
      : 'Review the local provider slot requirements, then collect and bind the end-user API key outside the browser acquisition flow.';
  }

  return kind === 're-authentication'
    ? 'Capture a renewed local web session for the same end-user-owned provider slot after the user signs in again.'
    : 'Capture a local web session after the end user finishes browser sign-in or OAuth for this provider slot.';
}

function buildArtifactEnvelope(
  record: CredentialRecord,
  kind: CredentialHandoffKind
): CredentialArtifactEnvelope {
  const source = getMaterialSource(record.materialKind);
  const collectedBy = getArtifactCollector(record.provider.authModeId);
  const handoffChannel = getArtifactChannel(record.provider.authModeId, record.materialKind);

  return {
    artifactId: `${record.credentialId}:${kind}:artifact`,
    kind: record.materialKind,
    label: getArtifactLabel(kind, record.provider.authModeId, record.materialKind),
    description: getArtifactDescription(record, kind),
    source,
    sourceLabel: ARTIFACT_SOURCE_LABELS[source],
    collectedBy,
    collectedByLabel: ACTION_ACTOR_LABELS[collectedBy],
    handoffChannel,
    handoffChannelLabel: HANDOFF_CHANNEL_LABELS[handoffChannel],
    required: true
  };
}

function buildCaptureRequest(
  record: CredentialRecord,
  kind: CredentialHandoffKind
): CredentialCaptureRequest | null {
  if (kind !== 'acquisition' && kind !== 're-authentication') {
    return null;
  }

  const artifact = buildArtifactEnvelope(record, kind);

  return {
    requestId: `${record.credentialId}:${kind}:capture`,
    summary:
      kind === 'acquisition'
        ? `Collect ${artifact.label.toLowerCase()} for ${record.provider.displayName}.`
        : `Collect renewed material for ${record.provider.displayName} re-authentication.`,
    description:
      kind === 'acquisition'
        ? 'This capture request is local-first and tied to the end-user-owned provider slot.'
        : 'This capture request renews the same end-user-owned credential path without switching accounts.',
    artifacts: [artifact]
  };
}

function buildHandoffStep(action: CredentialUserAction): CredentialHandoffStep {
  const actor = ACTION_ACTOR_BY_ID[action.id];

  return {
    actionId: action.id,
    actor,
    actorLabel: ACTION_ACTOR_LABELS[actor],
    label: action.label,
    description: action.description,
    blocking: action.blocking
  };
}

function getHandoffSummary(record: CredentialRecord, kind: CredentialHandoffKind): string {
  switch (kind) {
    case 'acquisition':
      return record.provider.authModeId === 'byok'
        ? 'Acquire the end-user-owned API key and bind it locally before runtime use starts.'
        : 'Run a local browser login so WebaiBridge can capture the user-owned session for this provider slot.';
    case 're-authentication':
      return record.provider.authModeId === 'byok'
        ? 'Replace the expired or revoked API key with fresh end-user-owned material.'
        : 'Ask the end user to sign in again so WebaiBridge can capture a renewed local session for the same provider slot.';
    case 'refresh-recovery':
      return 'Retry local refresh against the current credential before escalating to a new user-authenticated session.';
    case 'status-review':
      return record.state === 'provider-unavailable'
        ? 'Keep the current user-owned credential in place and wait for provider availability to recover.'
        : 'Review the current local credential health without turning the auth portal into a control-plane.';
  }
}

export function buildCredentialSessionHandoff(record: CredentialRecord): CredentialSessionHandoff {
  const workflow = getCredentialWorkflowDescriptor(record.state);
  const kind = getHandoffKind(record);
  const status = getHandoffStatus(record, kind);
  const recommendedActions = getCredentialUserActions(record.state, record.provider.authModeId);
  const [nextAction, fallbackAction] = recommendedActions;

  if (!nextAction) {
    throw new Error(`Credential handoff requires at least one action for state: ${record.state}`);
  }

  return {
    ticketId: `${kind}:${record.credentialId}`,
    workflowId: workflow.id,
    workflowLabel: workflow.label,
    kind,
    kindLabel: HANDOFF_KIND_LABELS[kind],
    status,
    statusLabel: HANDOFF_STATUS_LABELS[status],
    localOnly: true,
    ownerUserId: record.owner.userId,
    providerId: record.provider.providerId,
    providerDisplayName: record.provider.displayName,
    authModeId: record.provider.authModeId,
    summary: getHandoffSummary(record, kind),
    captureRequest: buildCaptureRequest(record, kind),
    nextStep: buildHandoffStep(nextAction),
    fallbackStep: fallbackAction ? buildHandoffStep(fallbackAction) : null,
    recommendedActions
  };
}
