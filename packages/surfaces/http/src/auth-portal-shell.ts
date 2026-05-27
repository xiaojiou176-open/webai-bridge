import {
  AUTH_MODE_CATALOG,
  BYOK_PROVIDER_CATALOG,
  WEB_LOGIN_PROVIDER_CATALOG,
  createCredentialOwner,
  createCredentialRecord,
  type AuthModeId,
  type CredentialOwner,
  type CredentialRecord,
  type ProviderSupportDescriptor
} from '../../../credentials/src/index.js';
import {
  buildAuthRuntimeView,
  summarizeAuthRuntimeViews,
  type AuthRuntimeView,
  type AuthWorkflowSummary
} from '../../../diagnostics/src/index.js';
import type {
  ServiceProviderAuthView,
  ServiceRuntimeRouteCatalog,
} from "./service-language.js";

export interface AuthPortalShellOptions {
  owner?: CredentialOwner;
  userId?: string;
  records?: readonly CredentialRecord[];
  generatedAt?: string;
  title?: string;
  sections?: AuthPortalSection[];
  routeCatalog?: AuthPortalRouteCatalog;
}

export interface AuthPortalAcquisitionModeView {
  id:
    | "managed-browser"
    | "isolated-chrome-root"
    | "existing-chrome-profile"
    | "existing-browser-session";
  label: string;
  description: string;
  advanced: boolean;
  default: boolean;
}

export type AuthPortalCard = AuthRuntimeView &
  Partial<
    Pick<
      ServiceProviderAuthView,
      | "availableModes"
      | "browserTarget"
      | "mode"
      | "modeLabel"
      | "routes"
      | "session"
      | "transportHint"
    >
  > & {
    currentBrowser?: AuthPortalCurrentBrowserView;
  };
export type AuthPortalActionView = AuthPortalCard['actions'][number];

export interface AuthPortalCurrentBrowserView {
  source: 'live-browser-inspection' | 'stored-browser-audit';
  status?: 'captured' | 'unavailable';
  liveStatus?: 'live-ready' | 'live-blocked' | 'unknown';
  classification?:
    | 'workspace-ready'
    | 'session-incomplete'
    | 'login-required'
    | 'provider-adjacent'
    | 'provider-unavailable'
    | 'missing-page'
    | 'attach-failed'
    | 'human-verification-required'
    | 'account-action-required'
    | 'permission-gated'
    | 'unknown';
  summary: string;
  title?: string;
  url?: string;
  attachTargetLabel?: string;
}

export interface AuthPortalSection {
  id: AuthModeId;
  title: string;
  description: string;
  cards: AuthPortalCard[];
}

export interface AuthPortalShellModel {
  title: string;
  mode: 'local-first';
  generatedAt: string;
  trustBoundary: string;
  supportedPolicies: string[];
  workflows: AuthWorkflowSummary[];
  sections: AuthPortalSection[];
  routeCatalog?: AuthPortalRouteCatalog;
}

export type AuthPortalRouteCatalog = Pick<
  ServiceRuntimeRouteCatalog,
  | "authPortal"
  | "providerStatusTemplate"
  | "providerAcquisitionStartTemplate"
  | "providerAcquisitionCaptureTemplate"
  | "providerDebugWorkbenchTemplate"
>;

const DEFAULT_WEB_ACQUISITION_MODES: readonly AuthPortalAcquisitionModeView[] = [
  {
    id: "isolated-chrome-root",
    label: "Use Isolated Chrome Root",
    description:
      "Reuse WebaiBridge's dedicated Chrome root and single repo-owned profile for login and capture.",
    advanced: true,
    default: true,
  },
  {
    id: "managed-browser",
    label: "Managed Browser",
    description:
      "Let WebaiBridge launch or reattach its dedicated fallback onboarding browser for login and capture.",
    advanced: false,
    default: false,
  },
  {
    id: "existing-browser-session",
    label: "Attach Existing Browser Session",
    description:
      "Attach to a browser session that is already exposing a reusable browser-session URL.",
    advanced: true,
    default: false,
  },
] as const;

function getOwner(options: AuthPortalShellOptions): CredentialOwner {
  if (options.owner) {
    return options.owner;
  }

  return createCredentialOwner(options.userId ?? 'local-user');
}

function getRecordKey(record: Pick<CredentialRecord, 'provider'>): string {
  return `${record.provider.authModeId}:${record.provider.providerId}`;
}

function getDescriptorKey(descriptor: ProviderSupportDescriptor): string {
  return `${descriptor.authModeId}:${descriptor.providerId}`;
}

function buildFallbackRecord(
  descriptor: ProviderSupportDescriptor,
  owner: CredentialOwner
): CredentialRecord {
  return createCredentialRecord({
    userId: owner.userId,
    providerId: descriptor.providerId,
    authModeId: descriptor.authModeId,
    origin: owner.origin
  });
}

function buildCard(
  descriptor: ProviderSupportDescriptor,
  owner: CredentialOwner,
  recordsByKey: ReadonlyMap<string, CredentialRecord>
): AuthPortalCard {
  const record = recordsByKey.get(getDescriptorKey(descriptor)) ?? buildFallbackRecord(descriptor, owner);
  return buildAuthRuntimeView(record);
}

function buildSection(
  id: AuthModeId,
  owner: CredentialOwner,
  recordsByKey: ReadonlyMap<string, CredentialRecord>
): AuthPortalSection {
  const descriptors = id === 'byok' ? BYOK_PROVIDER_CATALOG : WEB_LOGIN_PROVIDER_CATALOG;

  return {
    id,
    title: AUTH_MODE_CATALOG[id].label,
    description: AUTH_MODE_CATALOG[id].description,
    cards: descriptors.map((descriptor) => buildCard(descriptor, owner, recordsByKey))
  };
}

function buildSections(options: AuthPortalShellOptions, owner: CredentialOwner) {
  if (options.sections) {
    return options.sections;
  }

  const recordsByKey = new Map(
    (options.records ?? []).map((record) => [getRecordKey(record), record] as const)
  );

  return [
    buildSection('byok', owner, recordsByKey),
    buildSection('web-login', owner, recordsByKey)
  ];
}

export function buildAuthPortalShellModel(
  options: AuthPortalShellOptions = {}
): AuthPortalShellModel {
  const owner = getOwner(options);
  const sections = buildSections(options, owner);
  const workflows = summarizeAuthRuntimeViews(sections.flatMap((section) => section.cards)).workflowSummary;

  return {
    title: options.title ?? 'WebaiBridge Web/Login Access',
    mode: 'local-first',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    trustBoundary:
      'Local-first shell. Credentials remain end-user owned. No shared credential pool, no automatic account rotation, no implicit failover.',
    supportedPolicies: ['BYOK', 'Web/Login', 'single-provider-single-account', 'user-owned credentials'],
    workflows,
    sections,
    routeCatalog: options.routeCatalog
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface AuthPortalVisibleTruthFocus {
  title: string;
  detail: string;
  nextStepLabel: string;
  nextStepDescription: string;
  primaryLinkLabel: string;
}

function getVisibleTruthDetail(
  card: AuthPortalCard,
  fallback: string,
  source: 'required-user-action-first' | 'browser-checkpoint-first' = 'required-user-action-first'
): string {
  const requiredUserAction = card.session?.requiredUserAction?.trim();
  const browserSummary = getBrowserCheckpoint(card)?.summary?.trim();
  const transportHint = card.transportHint?.trim();

  if (source === 'browser-checkpoint-first') {
    return browserSummary || requiredUserAction || transportHint || fallback;
  }

  return requiredUserAction || browserSummary || transportHint || fallback;
}

function getBrowserCheckpoint(card: AuthPortalCard): AuthPortalCurrentBrowserView | null {
  if (card.currentBrowser) {
    return card.currentBrowser;
  }

  const audit = card.session?.persistenceAudit;

  if (!audit) {
    return null;
  }

  return {
    source: 'stored-browser-audit',
    classification: audit.workspaceClassification,
    summary:
      audit.summary ??
      card.transportHint ??
      'Open the debug workbench to compare stored material truth against the current browser.',
    title: audit.pageTitle,
    url: audit.pageUrl
  };
}

function inferRequiredActionClassification(
  card: AuthPortalCard,
): AuthPortalCurrentBrowserView["classification"] | undefined {
  if (card.state !== "user-action-required") {
    return undefined;
  }

  const text = `${card.session?.requiredUserAction ?? ""}\n${card.transportHint ?? ""}`.toLowerCase();

  if (
    text.includes("subscription") ||
    text.includes("payment") ||
    text.includes("invoice") ||
    text.includes("billing") ||
    text.includes("account step")
  ) {
    return "account-action-required";
  }

  if (
    text.includes("verification") ||
    text.includes("verify") ||
    text.includes("captcha")
  ) {
    return "human-verification-required";
  }

  return undefined;
}

function getEffectiveWorkspaceClassification(
  card: AuthPortalCard,
): AuthPortalCurrentBrowserView["classification"] | undefined {
  const browserClassification = getBrowserCheckpoint(card)?.classification;
  const requiredActionClassification = inferRequiredActionClassification(card);

  if (
    requiredActionClassification &&
    (!browserClassification ||
      browserClassification === "workspace-ready" ||
      browserClassification === "provider-adjacent")
  ) {
    return requiredActionClassification;
  }

  if (browserClassification) {
    return browserClassification;
  }

  return requiredActionClassification;
}

function getVisibleTruthFocus(card: AuthPortalCard): AuthPortalVisibleTruthFocus | null {
  if (card.authModeId !== 'web-login') {
    return null;
  }

  const classification = getEffectiveWorkspaceClassification(card);

  switch (classification) {
    case 'account-action-required':
      return {
        title: 'Account action required',
        detail: getVisibleTruthDetail(
          card,
          'The current browser is blocked on an owner/manual account step. Resolve that first before treating re-authentication as the main path.'
        ),
        nextStepLabel: 'Resolve account access',
        nextStepDescription:
          'Stay in the current browser and finish the owner/manual account step first. Use a fresh login flow only after access is restored.',
        primaryLinkLabel: 'Review current blocker'
      };
    case 'human-verification-required':
      return {
        title: 'Human verification required',
        detail: getVisibleTruthDetail(
          card,
          'The current browser hit a verification wall that still needs an end-user step before WebaiBridge can trust the session again.'
        ),
        nextStepLabel: 'Complete verification',
        nextStepDescription:
          'Finish the human verification step in the current browser first. Start a new login flow only if that browser seat cannot recover.',
        primaryLinkLabel: 'Inspect current browser first'
      };
    case 'session-incomplete':
      return {
        title: 'Session incomplete',
        detail: getVisibleTruthDetail(
          card,
          'The current browser is not on a reusable workspace yet, so WebaiBridge cannot treat this slot as live-ready.',
          'browser-checkpoint-first'
        ),
        nextStepLabel: 'Finish browser session',
        nextStepDescription:
          'Use the current browser path until this provider reaches a real workspace. Start a fresh login only if the current seat cannot recover.',
        primaryLinkLabel: 'Inspect current browser first'
      };
    case 'login-required':
      return {
        title: 'Login still required',
        detail: getVisibleTruthDetail(
          card,
          'The current browser is still on a login or verification page, so the session is not reusable yet.',
          'browser-checkpoint-first'
        ),
        nextStepLabel: 'Continue browser login',
        nextStepDescription:
          'Finish the login flow in the current browser first. Treat re-authentication as the fallback, not the default explanation.',
        primaryLinkLabel: 'Inspect current browser first'
      };
    case 'permission-gated':
      return {
        title: 'Permission gate still blocking',
        detail: getVisibleTruthDetail(
          card,
          'The browser reached a permission gate that still needs an end-user choice before the workspace becomes reusable.',
          'browser-checkpoint-first'
        ),
        nextStepLabel: 'Clear permission gate',
        nextStepDescription:
          'Resolve the permission gate in the current browser first, then rerun the live check after the workspace is actually reusable.',
        primaryLinkLabel: 'Inspect current browser first'
      };
    case 'provider-adjacent':
      return {
        title: 'Workspace handoff incomplete',
        detail: getVisibleTruthDetail(
          card,
          'The browser is nearby, but WebaiBridge still does not see a reusable workspace in the current seat.',
          'browser-checkpoint-first'
        ),
        nextStepLabel: 'Finish browser session',
        nextStepDescription:
          'Use the current browser seat until it reaches the real provider workspace. Only then should WebaiBridge rerun the live proof.',
        primaryLinkLabel: 'Inspect current browser first'
      };
    default:
      if (card.state === 'user-action-required' && card.session?.requiredUserAction) {
        return {
          title: 'User action required',
          detail: getVisibleTruthDetail(
            card,
            'The runtime still needs an explicit end-user action before this slot can be treated as healthy.'
          ),
          nextStepLabel: 'Continue required action',
          nextStepDescription:
            'Finish the currently required end-user step first, then rerun the live check only after the blocker is cleared.',
          primaryLinkLabel: 'Review current blocker'
        };
      }

      return null;
  }
}

function getActionLabel(_card: AuthPortalCard, action: AuthPortalCard['actions'][number]): string {
  return action.label;
}

function renderAction(card: AuthPortalCard, action: AuthPortalCard['actions'][number]): string {
  const actionLabel = getActionLabel(card, action);
  const baseButton = `<button class="action action-${action.emphasis}" data-action-key="${escapeHtml(
    action.actionKey
  )}" data-action-id="${escapeHtml(action.id)}" data-provider-id="${escapeHtml(
    card.providerId
  )}" data-auth-mode-id="${escapeHtml(card.authModeId)}" data-workflow-id="${escapeHtml(
    card.workflowId
  )}" data-acquisition-mode="${escapeHtml(
    card.authModeId === "web-login" &&
      (action.id === "start-web-login" || action.id === "reauthenticate")
      ? "isolated-chrome-root"
      : ""
  )}" type="button">${escapeHtml(actionLabel)}</button>`;

  if (
    card.authModeId !== "web-login" ||
    (action.id !== "start-web-login" && action.id !== "reauthenticate")
  ) {
    return baseButton;
  }

  const advancedButtons = [
    {
      label: "Managed Browser",
      mode: "managed-browser",
    },
    {
      label: "Attach Browser Session",
      mode: "existing-browser-session",
    },
  ]
    .map(
      (advancedAction) =>
        `<button class="action action-secondary" data-action-key="${escapeHtml(
          `${action.actionKey}:${advancedAction.mode}`
        )}" data-action-id="${escapeHtml(action.id)}" data-provider-id="${escapeHtml(
          card.providerId
        )}" data-auth-mode-id="${escapeHtml(card.authModeId)}" data-workflow-id="${escapeHtml(
          card.workflowId
        )}" data-acquisition-mode="${escapeHtml(advancedAction.mode)}" type="button">${escapeHtml(
          advancedAction.label
        )}</button>`,
    )
    .join("");

  return `${baseButton}${advancedButtons}`;
}

function renderAcquisitionModes(card: AuthPortalCard): string {
  if (card.authModeId !== "web-login") {
    return "";
  }

  const modes = card.availableModes ?? DEFAULT_WEB_ACQUISITION_MODES;
  const recommendedMode = modes.find((mode) => mode.default) ?? modes[0];
  const secondaryModes = modes.filter((mode) => mode !== recommendedMode);
  const renderModeList = (modeList: readonly AuthPortalAcquisitionModeView[]) =>
    modeList
      .map(
        (mode) =>
          `<li>
            <strong>${escapeHtml(mode.label)}</strong>
            <span>${escapeHtml(mode.description)}</span>
            <span>${mode.default ? "Recommended first path" : "Use only when you already know why"}</span>
          </li>`,
      )
      .join("");

  return `<div class="acquisition-modes">
    <p class="handoff-caption"><strong>Login paths</strong></p>
    ${
      recommendedMode
        ? `<div class="acquisition-modes-primary">
            <strong>${escapeHtml(recommendedMode.label)}</strong>
            <span>${escapeHtml(recommendedMode.description)}</span>
            <span>Recommended first path</span>
          </div>`
        : ""
    }
    ${
      secondaryModes.length > 0
        ? `<details class="acquisition-modes-details">
            <summary>Review alternate login paths</summary>
            <ul class="handoff-artifact-list">
              ${renderModeList(secondaryModes)}
            </ul>
          </details>`
        : `<ul class="handoff-artifact-list">
            ${renderModeList(modes)}
          </ul>`
    }
  </div>`;
}

function mapWorkspaceClassificationLabel(classification: string | undefined): string {
  switch (classification) {
    case "workspace-ready":
      return "Browser checkpoint looks reusable";
    case "session-incomplete":
      return "Browser still needs a real workspace";
    case "permission-gated":
      return "Browser reached a permission gate";
    case "human-verification-required":
      return "Browser hit a human verification gate";
    case "account-action-required":
      return "Browser needs an account action";
    case "provider-unavailable":
      return "Provider-side blocker is showing in the browser";
    case "login-required":
      return "Browser is still on a login or verification page";
    case "provider-adjacent":
      return "Browser is nearby, but not on a usable workspace yet";
    default:
      return "No fresh browser checkpoint yet";
  }
}

function mapWorkspaceTone(classification: string | undefined): "ok" | "warning" | "danger" {
  switch (classification) {
    case "workspace-ready":
      return "ok";
    case "provider-adjacent":
    case "session-incomplete":
    case "login-required":
      return "warning";
    case "permission-gated":
    case "human-verification-required":
    case "account-action-required":
    case "provider-unavailable":
      return "danger";
    default:
      return "warning";
  }
}

function renderMaterialSnapshot(card: AuthPortalCard): string {
  if (!card.session) {
    return "";
  }

  const lastValidatedAt = card.session.lastValidatedAt
    ? `<span><strong>Last checked</strong> <code>${escapeHtml(card.session.lastValidatedAt)}</code></span>`
    : "";
  const validationState = card.session.validationState
    ? `<span><strong>Validation</strong> <code>${escapeHtml(card.session.validationState)}</code></span>`
    : "";
  const sessionSource = card.session.sessionSource
    ? `<span><strong>Source</strong> <code>${escapeHtml(card.session.sessionSource)}</code></span>`
    : "";

  return `<section class="snapshot">
    <p class="snapshot-label">Local materials</p>
    <div class="snapshot-row">
      <strong>${escapeHtml(card.stateLabel)}</strong>
      <span>${escapeHtml(card.statusSummary)}</span>
    </div>
    <div class="snapshot-meta">
      ${validationState}
      ${sessionSource}
      ${lastValidatedAt}
    </div>
  </section>`;
}

function renderBrowserCheckpoint(card: AuthPortalCard): string {
  if (card.authModeId !== "web-login") {
    return "";
  }

  const browserCheckpoint = getBrowserCheckpoint(card);
  const classification = getEffectiveWorkspaceClassification(card);
  const tone = mapWorkspaceTone(classification);
  const sourceLabel =
    browserCheckpoint?.source === "live-browser-inspection"
      ? "Current browser truth"
      : "Last stored browser checkpoint";
  const url = browserCheckpoint?.url
    ? `<span><strong>${escapeHtml(
        browserCheckpoint.source === "live-browser-inspection"
          ? "Current page"
          : "Last stored page"
      )}</strong> <code>${escapeHtml(browserCheckpoint.url)}</code></span>`
    : "";
  const title = browserCheckpoint?.title
    ? `<span><strong>Title</strong> ${escapeHtml(browserCheckpoint.title)}</span>`
    : "";
  const source = browserCheckpoint
    ? `<span><strong>Source</strong> ${escapeHtml(
        browserCheckpoint.source === "live-browser-inspection"
          ? "Live browser inspection"
          : "Stored browser audit",
      )}</span>`
    : "";
  const liveStatus = browserCheckpoint?.liveStatus
    ? `<span><strong>Live state</strong> <code>${escapeHtml(browserCheckpoint.liveStatus)}</code></span>`
    : "";
  const attachTarget = browserCheckpoint?.attachTargetLabel
    ? `<span><strong>Attach target</strong> ${escapeHtml(browserCheckpoint.attachTargetLabel)}</span>`
    : "";
  const summary =
    browserCheckpoint?.summary ??
    card.transportHint ??
    "Open the debug workbench to compare stored material truth against the currently attached browser.";

  return `<section class="snapshot snapshot-${tone}">
    <p class="snapshot-label">${escapeHtml(sourceLabel)}</p>
    <div class="snapshot-row">
      <strong>${escapeHtml(mapWorkspaceClassificationLabel(classification))}</strong>
      <span>${escapeHtml(summary)}</span>
    </div>
    <div class="snapshot-meta">
      ${source}
      ${liveStatus}
      ${attachTarget}
      ${title}
      ${url}
    </div>
  </section>`;
}

function renderRouteLinks(card: AuthPortalCard): string {
  if (!card.routes) {
    return "";
  }

  const links = [
    ["Status JSON", card.routes.status],
    ["Probe JSON", card.routes.probe],
    ["Remediation JSON", card.routes.remediation],
    ["Current page", card.routes.debugCurrentPage],
    ["Current console", card.routes.debugCurrentConsole],
    ["Current network", card.routes.debugCurrentNetwork],
    ["Support bundle", card.routes.debugSupportBundle],
  ].filter(([, href]) => Boolean(href));

  if (links.length === 0) {
    return "";
  }

  return `<details class="technical-panel">
    <summary>Technical links</summary>
    <div class="technical-link-grid">
      ${links
        .map(
          ([label, href]) =>
            `<a href="${escapeHtml(href ?? "")}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`,
        )
        .join("")}
    </div>
    ${
      card.diagnostic
        ? `<p class="technical-note"><strong>Technical category</strong> <code>${escapeHtml(
            card.diagnostic.contractCategoryLabel,
          )}</code></p>`
        : ""
    }
  </details>`;
}

function renderWorkflowSummary(workflow: AuthWorkflowSummary): string {
  return `<article class="workflow-card">
    <header class="workflow-header">
      <div>
        <h2>${escapeHtml(workflow.label)}</h2>
        <p>${escapeHtml(workflow.description)}</p>
      </div>
      <span class="workflow-count">${workflow.count}</span>
    </header>
    <ul class="workflow-provider-list">
      ${workflow.providers
        .map(
          (provider) =>
            `<li><strong>${escapeHtml(provider.providerDisplayName)}</strong><span>${escapeHtml(
              provider.stateLabel
            )}</span></li>`
        )
        .join('')}
    </ul>
  </article>`;
}

function renderCaptureRequest(card: AuthPortalCard): string {
  if (!card.handoff.captureRequest) {
    return '';
  }

  return `<div class="handoff-capture">
    <p class="handoff-caption"><strong>Capture Request</strong>: ${escapeHtml(
      card.handoff.captureRequest.summary
    )}</p>
    <p class="handoff-copy">${escapeHtml(card.handoff.captureRequest.description)}</p>
    <ul class="handoff-artifact-list">
      ${card.handoff.captureRequest.artifacts
        .map(
          (artifact) =>
            `<li>
              <strong>${escapeHtml(artifact.label)}</strong>
              <span>${escapeHtml(artifact.description)}</span>
              <span>Source: ${escapeHtml(artifact.sourceLabel)}</span>
              <span>Collected by: ${escapeHtml(artifact.collectedByLabel)}</span>
              <span>Handoff: ${escapeHtml(artifact.handoffChannelLabel)}</span>
            </li>`
        )
        .join('')}
    </ul>
  </div>`;
}

function renderHandoff(card: AuthPortalCard): string {
  const truthFocus = getVisibleTruthFocus(card);
  const nextStepLabel = truthFocus?.nextStepLabel ?? card.handoff.nextStep.label;
  const nextStepDescription = truthFocus?.nextStepDescription ?? card.handoff.nextStep.description;

  return `<section class="handoff">
    <header class="handoff-header">
      <div>
        <h4>${escapeHtml(card.handoff.kindLabel)}</h4>
        <p>${escapeHtml(card.handoff.summary)}</p>
      </div>
      <span class="handoff-status">${escapeHtml(card.handoff.statusLabel)}</span>
    </header>
    ${renderCaptureRequest(card)}
    <p class="handoff-step">
      <strong>Next step</strong>: ${escapeHtml(nextStepLabel)} by ${escapeHtml(
        card.handoff.nextStep.actorLabel
      )}.
    </p>
    <p class="handoff-copy">${escapeHtml(nextStepDescription)}</p>
    ${
      card.handoff.fallbackStep
        ? `<p class="handoff-fallback"><strong>Fallback</strong>: ${escapeHtml(
            card.handoff.fallbackStep.label
          )} by ${escapeHtml(card.handoff.fallbackStep.actorLabel)}.</p>`
        : ''
    }
  </section>`;
}

function getCardVerdictTitle(card: AuthPortalCard): string {
  const truthFocus = getVisibleTruthFocus(card);
  return truthFocus?.title ?? card.stateLabel;
}

function getCardVerdictTone(card: AuthPortalCard): "ok" | "warning" | "danger" {
  if (card.authModeId === "web-login") {
    const bucket = getWebLoginPriorityBucket(card);
    if (bucket === "account-action") {
      return "danger";
    }
    if (bucket === "session-work") {
      return "warning";
    }
    return "ok";
  }

  if (card.state === "ready") {
    return "ok";
  }
  if (card.state === "user-action-required" || card.state === "expired" || card.state === "missing") {
    return "danger";
  }

  return "warning";
}

function getCardVerdictSummary(card: AuthPortalCard): string {
  const truthFocus = getVisibleTruthFocus(card);

  if (truthFocus) {
    return truthFocus.nextStepLabel;
  }

  if (card.state === "ready") {
    return "Ready to use";
  }

  return card.statusSummary;
}

function getCardVerdictNextStep(card: AuthPortalCard): string {
  const truthFocus = getVisibleTruthFocus(card);
  if (truthFocus) {
    return truthFocus.nextStepLabel;
  }

  if (card.state === "ready") {
    return "Ready to use";
  }

  return "Review current status";
}

function renderCardVerdict(card: AuthPortalCard): string {
  const tone = getCardVerdictTone(card);

  return `<section class="card-verdict card-verdict-${tone}">
    <p class="eyebrow eyebrow-compact">Primary verdict</p>
    <h4>${escapeHtml(getCardVerdictTitle(card))}</h4>
    <p>${escapeHtml(getCardVerdictSummary(card))}</p>
    <p class="card-verdict-next">${escapeHtml(getCardVerdictNextStep(card))}</p>
  </section>`;
}

function renderCardDetails(card: AuthPortalCard): string {
  const detailsLabel =
    card.authModeId === "web-login" ? "Evidence and handoff details" : "More local details";
  const truthFocus = getVisibleTruthFocus(card);
  const diagnosticHtml = card.diagnostic
    ? `<div class="diagnostic diagnostic-${card.diagnostic.severity}">
        <strong>${escapeHtml(truthFocus?.title ?? card.diagnostic.summary)}</strong>
        <p>${escapeHtml(truthFocus?.detail ?? card.diagnostic.detail)}</p>
        <p class="diagnostic-contract">Technical category: <code>${escapeHtml(
          card.diagnostic.contractCategoryLabel
        )}</code></p>
      </div>`
    : '<div class="diagnostic diagnostic-ok"><strong>No active blocker</strong><p>WebaiBridge does not currently see a local credential blocker for this provider slot.</p></div>';

  return `<details class="card-details">
    <summary>${escapeHtml(detailsLabel)}</summary>
    <div class="card-details-body">
      ${diagnosticHtml}
      <p class="workflow"><strong>Current lane step</strong>: ${escapeHtml(card.workflowLabel)}.</p>
      <p class="status">${escapeHtml(card.workflowDescription)}</p>
      ${
        card.modeLabel
          ? `<p class="ownership"><strong>Current browser handoff</strong>: ${escapeHtml(card.modeLabel)}</p>`
          : ""
      }
      ${renderMaterialSnapshot(card)}
      ${renderBrowserCheckpoint(card)}
      <p class="ownership">${escapeHtml(card.ownership.summary)}</p>
      ${renderHandoff(card)}
      ${renderAcquisitionModes(card)}
      ${renderRouteLinks(card)}
    </div>
  </details>`;
}

function renderCard(card: AuthPortalCard): string {
  const truthFocus = getVisibleTruthFocus(card);
  const debugLink =
    card.authModeId === "web-login" && card.routes?.debugWorkbench
      ? `<a class="action action-${truthFocus ? "primary" : "secondary"} action-link" href="${escapeHtml(
          card.routes.debugWorkbench,
        )}">${escapeHtml(truthFocus?.primaryLinkLabel ?? "Inspect current browser")}</a>`
      : "";

  return `<article class="card" id="provider-${escapeHtml(card.providerId)}">
    <header class="card-header">
      <div>
        <h3>${escapeHtml(card.providerDisplayName)}</h3>
        <p class="card-kicker">${escapeHtml(card.authModeLabel)}</p>
      </div>
      <span class="state state-${escapeHtml(card.state)}">${escapeHtml(getCardVerdictTitle(card))}</span>
    </header>
    ${renderCardVerdict(card)}
    ${renderCardDetails(card)}
    <div class="actions">${debugLink}${card.actions.map((action) => renderAction(card, action)).join('')}</div>
  </article>`;
}

function renderSection(section: AuthPortalSection): string {
  return `<section class="section" id="section-${escapeHtml(section.id)}">
    <header class="section-header">
      <h2>${escapeHtml(section.title)}</h2>
      <p>${escapeHtml(section.description)}</p>
    </header>
    <div class="card-grid">${section.cards.map((card) => renderCard(card)).join('')}</div>
  </section>`;
}

function renderCardGroup(
  title: string,
  description: string,
  cards: readonly AuthPortalCard[],
  collapsed = false,
): string {
  if (cards.length === 0) {
    return "";
  }

  if (!collapsed) {
    return `<section class="card-group">
      <header class="section-header">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </header>
      <div class="card-grid">${cards.map((card) => renderCard(card)).join('')}</div>
    </section>`;
  }

  return `<details class="card-group card-group-collapsed">
    <summary>${escapeHtml(title)}</summary>
    <div class="card-group-body">
      <p>${escapeHtml(description)}</p>
      <div class="card-grid">${cards.map((card) => renderCard(card)).join('')}</div>
    </div>
  </details>`;
}

function renderWebLoginSection(section: AuthPortalSection): string {
  const accountActionCards = section.cards.filter(
    (card) => getWebLoginPriorityBucket(card) === "account-action",
  );
  const sessionWorkCards = section.cards.filter(
    (card) => getWebLoginPriorityBucket(card) === "session-work",
  );
  const readyCards = section.cards.filter((card) => getWebLoginPriorityBucket(card) === "ready");

  return `<details class="section web-login-detail-shelf provider-drawer" id="auth-portal-provider-drawers">
    <summary>
      <span class="eyebrow eyebrow-compact">Deeper layer</span>
      <span class="detail-shelf-title">${escapeHtml(section.title)} details, evidence, and actions</span>
      <span class="detail-shelf-copy">The arrivals board above already makes the first call. Open this only when you need raw evidence, capture steps, or the full handoff record.</span>
    </summary>
    <div class="detail-shelf-body provider-drawer-body">
        ${renderCardGroup(
          "Account action required",
          "These providers are blocked on owner/manual account work before runtime use can continue.",
          accountActionCards,
        )}
        ${renderCardGroup(
          "Session incomplete",
          "These providers still need the current browser session to reach a reusable workspace.",
          sessionWorkCards,
        )}
        ${renderCardGroup(
          `Ready providers (${readyCards.length})`,
          "These providers are currently usable. Expand only when you need their evidence or actions.",
          readyCards,
          true,
        )}
      </div>
  </details>`;
}

function renderCollapsedSection(
  section: AuthPortalSection,
  title: string,
  description: string,
): string {
  return `<details class="secondary-context-stack">
    <summary>${escapeHtml(title)}</summary>
    <div class="secondary-context-body">
      <p>${escapeHtml(description)}</p>
      ${renderSection(section)}
    </div>
  </details>`;
}

function orderSectionsForDisplay(sections: readonly AuthPortalSection[]): AuthPortalSection[] {
  return [...sections].sort((left, right) => {
    if (left.id === right.id) {
      return 0;
    }

    if (left.id === "web-login") {
      return -1;
    }

    if (right.id === "web-login") {
      return 1;
    }

    return 0;
  });
}

function getWebLoginPriorityBucket(card: AuthPortalCard): "ready" | "account-action" | "session-work" {
  const classification = getEffectiveWorkspaceClassification(card);

  if (classification === "account-action-required") {
    return "account-action";
  }

  if (classification === "workspace-ready") {
    return "ready";
  }

  if (classification) {
    return "session-work";
  }

  if (card.session?.state === "user-action-required" || card.state === "user-action-required") {
    return "session-work";
  }

  if (card.state === "ready") {
    return "ready";
  }

  return "session-work";
}

function renderPriorityMetric(
  label: string,
  value: number,
  tone: "ok" | "warning" | "danger",
): string {
  return `<article class="priority-metric priority-metric-${tone}">
    <p class="eyebrow eyebrow-compact">${escapeHtml(label)}</p>
    <strong>${escapeHtml(`${value}`)}</strong>
  </article>`;
}

function getPrimaryHeroBlockerCard(section: AuthPortalSection): AuthPortalCard | undefined {
  const orderedCards = [...section.cards].sort((left, right) => {
    const rank = {
      "account-action": 0,
      "session-work": 1,
      ready: 2,
    } as const;

    return rank[getWebLoginPriorityBucket(left)] - rank[getWebLoginPriorityBucket(right)];
  });

  return orderedCards.find((card) => getWebLoginPriorityBucket(card) !== "ready");
}

function getHeroBlockerLabel(
  card: AuthPortalCard,
  truthFocus: AuthPortalVisibleTruthFocus | null,
): string {
  const candidate =
    truthFocus?.primaryLinkLabel ??
    truthFocus?.nextStepLabel ??
    card.handoff?.nextStep?.label ??
    card.actions?.[0]?.label;

  if (!candidate) {
    return `Inspect ${card.providerDisplayName} truth`;
  }

  if (candidate === "Review current blocker") {
    return `Inspect ${card.providerDisplayName} blocker`;
  }

  if (candidate === "Inspect current browser first") {
    return `Inspect ${card.providerDisplayName} browser`;
  }

  return candidate;
}

function renderHeroFirstCallStrip(model: AuthPortalShellModel): string {
  const webLoginSection = model.sections.find((section) => section.id === "web-login");
  if (!webLoginSection) {
    return "";
  }

  const readyCount = webLoginSection.cards.filter(
    (card) => getWebLoginPriorityBucket(card) === "ready",
  ).length;
  const accountActionCount = webLoginSection.cards.filter(
    (card) => getWebLoginPriorityBucket(card) === "account-action",
  ).length;
  const sessionWorkCount = webLoginSection.cards.filter(
    (card) => getWebLoginPriorityBucket(card) === "session-work",
  ).length;
  const firstBlocker = getPrimaryHeroBlockerCard(webLoginSection);
  const blockerTruthFocus = firstBlocker ? getVisibleTruthFocus(firstBlocker) : null;
  const blockerHref =
    firstBlocker?.routes?.debugWorkbench ?? (firstBlocker ? `#provider-${firstBlocker.providerId}` : "");
  const blockerLabel = firstBlocker
    ? getHeroBlockerLabel(firstBlocker, blockerTruthFocus)
    : "Inspect current truth";

  return `<div class="hero-call-strip-shell">
    <p class="eyebrow eyebrow-compact">First call summary</p>
    <div class="hero-call-strip" aria-label="First call summary">
      <article class="hero-call-card hero-call-card-danger">
      <p class="eyebrow eyebrow-compact">Owner action</p>
      <strong>${escapeHtml(`${accountActionCount}`)}</strong>
      <span>Accounts blocked on payment, subscription, or other owner steps.</span>
      </article>
      <article class="hero-call-card hero-call-card-warning">
      <p class="eyebrow eyebrow-compact">Browser work</p>
      <strong>${escapeHtml(`${sessionWorkCount}`)}</strong>
      <span>Providers that still need you to finish the browser login before runtime can reuse them.</span>
      </article>
      <article class="hero-call-card hero-call-card-ok">
      <p class="eyebrow eyebrow-compact">Ready now</p>
      <strong>${escapeHtml(`${readyCount}`)}</strong>
      <span>Providers already reusable without opening the deeper shelf first.</span>
      </article>
    </div>
    ${
      firstBlocker
        ? `<aside class="hero-top-blocker" aria-label="Current first blocker">
      <div class="hero-top-blocker-copy">
        <p class="eyebrow eyebrow-compact">Start here first</p>
        <strong>${escapeHtml(firstBlocker.providerDisplayName)} · ${escapeHtml(
          blockerTruthFocus?.title ?? firstBlocker.stateLabel,
        )}</strong>
        <p>${escapeHtml(
          blockerTruthFocus?.detail ??
            firstBlocker.statusSummary ??
            "Open the current provider shelf before touching the rest of the list.",
        )}</p>
      </div>
      <a class="hero-top-blocker-link" href="${escapeHtml(blockerHref)}">${escapeHtml(blockerLabel)}</a>
    </aside>`
        : ""
    }
  </div>`;
}

function renderWebLoginPriorityRail(model: AuthPortalShellModel): string {
  const webLoginSection = model.sections.find((section) => section.id === "web-login");
  if (!webLoginSection) {
    return "";
  }

  const orderedCards = [...webLoginSection.cards].sort((left, right) => {
    const rank = {
      "account-action": 0,
      "session-work": 1,
      ready: 2,
    } as const;

    return rank[getWebLoginPriorityBucket(left)] - rank[getWebLoginPriorityBucket(right)];
  });

  const readyCount = orderedCards.filter((card) => getWebLoginPriorityBucket(card) === "ready").length;
  const accountActionCount = orderedCards.filter(
    (card) => getWebLoginPriorityBucket(card) === "account-action",
  ).length;
  const sessionWorkCount = orderedCards.filter(
    (card) => getWebLoginPriorityBucket(card) === "session-work",
  ).length;

  return `<section id="auth-portal-web-login-priority-rail" class="priority-rail" aria-label="Web/Login live readiness">
    <header class="section-header">
      <p class="eyebrow">Web/Login live readiness</p>
      <h2>The five provider verdicts that matter first</h2>
      <p>Think of this like the front desk arrivals board. Make the first call here, then open the deeper provider shelf only when you need evidence, capture steps, or the full action trail.</p>
    </header>
    <div class="priority-metrics-grid">
      ${renderPriorityMetric("Ready", readyCount, "ok")}
      ${renderPriorityMetric("Account action required", accountActionCount, "danger")}
      ${renderPriorityMetric("Session incomplete", sessionWorkCount, "warning")}
    </div>
    <div class="priority-card-grid">
      ${orderedCards
        .map((card) => {
          const truthFocus = getVisibleTruthFocus(card);
          const bucket = getWebLoginPriorityBucket(card);
          const detail =
            truthFocus?.nextStepLabel ??
            card.handoff?.nextStep?.label ??
            card.actions?.[0]?.label ??
            (bucket === "ready" ? "Ready to use" : "Inspect current truth");
          const summary =
            truthFocus?.detail ??
            card.statusSummary ??
            (bucket === "ready"
              ? "This provider is currently reusable."
              : "Open the current provider shelf only after the arrivals board tells you this is the next blocker to resolve.");
          const linkTarget = card.routes?.debugWorkbench ?? `#provider-${card.providerId}`;
          return `<article class="priority-provider-card priority-provider-card-${bucket}">
            <p class="eyebrow eyebrow-compact">${escapeHtml(card.providerDisplayName)}</p>
            <h3>${escapeHtml(truthFocus?.title ?? card.stateLabel)}</h3>
            <p class="priority-provider-step">${escapeHtml(detail)}</p>
            <p class="priority-provider-summary">${escapeHtml(summary)}</p>
            <a class="priority-provider-link" href="${escapeHtml(linkTarget)}">${escapeHtml(
              truthFocus ? "Open current truth" : "Jump to provider card",
            )}</a>
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

function renderBoundaryRail(model: AuthPortalShellModel): string {
  return `<section class="boundary-grid" aria-label="Portal boundary">
    <article class="boundary-card">
      <p class="eyebrow eyebrow-compact">What this page does</p>
      <h2>Track your local provider access</h2>
      <p>Use this portal to compare <strong>what WebaiBridge already holds locally</strong> against <strong>what the currently attached browser can actually reuse right now</strong>.</p>
    </article>
    <article class="boundary-card">
      <p class="eyebrow eyebrow-compact">What this page does not do</p>
      <h2>Not a control plane</h2>
      <p>${escapeHtml(model.trustBoundary)}</p>
    </article>
  </section>`;
}

function renderSecondaryPortalContext(model: AuthPortalShellModel): string {
  return `<details class="secondary-context-stack">
    <summary>Portal rules, workflows, and browser handoff model</summary>
    <div class="secondary-context-body">
      ${renderBoundaryRail(model)}
      <section class="policy-list" aria-label="Supported policies">
        ${model.supportedPolicies
          .map((policy) => `<span class="policy-pill">${escapeHtml(policy)}</span>`)
          .join('')}
      </section>
      <section class="workflow-grid" aria-label="Auth workflows">
        ${model.workflows.map((workflow) => renderWorkflowSummary(workflow)).join('')}
      </section>
      ${renderModeGuide()}
    </div>
  </details>`;
}

function renderModeGuide(): string {
  return `<section class="mode-guide">
    <header class="section-header">
      <h2>Choose the right browser handoff</h2>
      <p>Think of these like three ways to hand the same keyring to the same local runtime. The difference is where WebaiBridge picks it up, not who owns the account.</p>
    </header>
    <div class="mode-guide-grid">
      <article class="mode-guide-card">
        <h3>Repo browser workspace</h3>
        <p>Reuse WebaiBridge&apos;s dedicated Chrome workspace for this repo. This is the steady-state path when you already live inside the repo-owned browser seat.</p>
      </article>
      <article class="mode-guide-card">
        <h3>Managed fallback browser</h3>
        <p>Let WebaiBridge open or reattach its simpler fallback browser for onboarding. Use this when the main workspace is not ready yet.</p>
      </article>
      <article class="mode-guide-card">
        <h3>Attach an existing session</h3>
        <p>Use this only when you already have a reusable browser session URL and you know it belongs to this repo-owned runtime path.</p>
      </article>
    </div>
  </section>`;
}

function renderRouteCatalog(routeCatalog?: AuthPortalRouteCatalog): string {
  if (!routeCatalog) {
    return "";
  }

  const serialized = JSON.stringify(routeCatalog)
    .replaceAll("<", "\\u003c")
    .replaceAll("</script", "<\\/script");

  return `<script type="application/json" id="auth-portal-route-catalog">${serialized}</script>`;
}

function renderPortalScript(routeCatalog?: AuthPortalRouteCatalog): string {
  if (!routeCatalog) {
    return "";
  }

  return `<script type="module">
const routeCatalogEl = document.getElementById('auth-portal-route-catalog');
const routeCatalog = routeCatalogEl ? JSON.parse(routeCatalogEl.textContent ?? '{}') : {};
const feedback = document.getElementById('auth-portal-feedback');
const providerDrawer = document.getElementById('auth-portal-provider-drawers');

function syncProviderDrawerFromHash() {
  if (!(providerDrawer instanceof HTMLDetailsElement)) {
    return;
  }

  const hash = window.location.hash;
  if (!hash) {
    return;
  }

  if (hash === '#auth-portal-provider-drawers' || hash.startsWith('#provider-')) {
    providerDrawer.open = true;
  }
}

syncProviderDrawerFromHash();
window.addEventListener('hashchange', syncProviderDrawerFromHash);

function replaceProvider(template, providerId) {
  return template.replace('{providerId}', providerId);
}

function setActionBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function setFeedback(title, summary, raw, actionHtml = '', state = 'working') {
  if (!feedback) return;
  feedback.hidden = false;
  feedback.dataset.state = state;
  feedback.innerHTML = \`
    <h2>\${title}</h2>
    <p>\${summary}</p>
    \${raw ? \`<pre>\${raw}</pre>\` : ''}
    \${actionHtml}\`;
  feedback.focus();
}

async function callJson(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-portal-reload]');

  if (!button) {
    return;
  }

  window.location.reload();
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action-id]');

  if (!button) {
    return;
  }

  const providerId = button.dataset.providerId;
  const authModeId = button.dataset.authModeId;
  const actionId = button.dataset.actionId;

  if (!providerId || !actionId) {
    return;
  }

  if (actionId === 'view-status') {
    window.open(replaceProvider(routeCatalog.providerStatusTemplate, providerId), '_blank', 'noopener');
    return;
  }

  if (authModeId !== 'web-login') {
    setFeedback(
      'Review BYOK key setup',
      'BYOK key entry stays outside the browser acquisition flow. Use this provider slot to review the local key requirements, then bind the end-user key through the local setup path.'
    );
    return;
  }

  try {
    if (actionId === 'start-web-login' || actionId === 'reauthenticate') {
      setActionBusy(button, true);
      setFeedback('Preparing browser handoff', 'WebaiBridge is lining up the local browser workspace and checking whether a capture path is available.', '', '', 'working');
      const acquisitionMode = button.dataset.acquisitionMode ?? 'isolated-chrome-root';
      const { payload } = await callJson(
        replaceProvider(routeCatalog.providerAcquisitionStartTemplate, providerId),
        {
          mode: acquisitionMode,
        }
      );
      const acquisition = payload.acquisition ?? {};
      const browser = acquisition.browser;
      const captureRequest = acquisition.captureRequest ?? { mode: acquisitionMode };
      const captureUrl =
        acquisition.status === 'ready-for-user-login' ? acquisition.captureUrl : undefined;
      const captureBody = encodeURIComponent(JSON.stringify(captureRequest));
      const captureButton = captureUrl
        ? \`<button class="action action-primary" data-capture-url="\${captureUrl}" data-capture-body="\${captureBody}" type="button">Capture Session</button>\`
        : '';
      const inspectButton =
        routeCatalog.providerDebugWorkbenchTemplate
          ? \`<a class="action action-secondary action-link" href="\${replaceProvider(routeCatalog.providerDebugWorkbenchTemplate, providerId)}">Inspect current browser</a>\`
          : '';
      if (acquisition.loginUrl && !browser?.loginOpened) {
        window.open(acquisition.loginUrl, '_blank', 'noopener');
      }
      const details = [
        acquisition.modeLabel ? \`Mode: \${acquisition.modeLabel}\` : '',
        acquisition.browserTarget?.summary,
        browser?.summary,
        acquisition.instructions,
      ].filter(Boolean).join('\\n\\n');
      setFeedback(
        acquisition.status === 'ready-for-user-login'
          ? 'Browser handoff ready'
          : 'Browser handoff needs attention',
        acquisition.summary ??
          'Finish the provider login in the selected browser seat, then capture the session back into WebaiBridge.',
        details,
        \`\${captureButton}\${inspectButton}\`,
        acquisition.status === 'ready-for-user-login' ? 'success' : 'warning'
      );
      setActionBusy(button, false);
      return;
    }

    if (actionId === 'retry-refresh') {
      setActionBusy(button, true);
      setFeedback('Capturing current session', 'WebaiBridge is reading the current browser state and writing the local handoff record.', '', '', 'working');
      const { payload } = await callJson(
        replaceProvider(routeCatalog.providerAcquisitionCaptureTemplate, providerId)
      );
      const acquisitionStatus = payload.acquisition?.status;
      const reloadButton =
        acquisitionStatus === 'success' || acquisitionStatus === 'refreshable-but-degraded'
          ? '<button class="action action-secondary" data-portal-reload="true" type="button">Reload current summary</button>'
          : '';
      setFeedback(
        acquisitionStatus === 'refreshable-but-degraded'
          ? 'Browser capture stored with follow-up'
          : 'Current browser captured',
        payload.acquisition?.summary ?? 'WebaiBridge stored the current browser handoff record.',
        payload.acquisition?.storePath ?? '',
        reloadButton,
        acquisitionStatus === 'refreshable-but-degraded' ? 'warning' : 'success'
      );
      setActionBusy(button, false);
      return;
    }
  } catch (error) {
    setFeedback('Action could not finish', error instanceof Error ? error.message : 'Unknown auth portal failure.', '', '', 'danger');
  } finally {
    setActionBusy(button, false);
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-capture-url]');

  if (!button) {
    return;
  }

  try {
    setActionBusy(button, true);
    setFeedback('Capturing current session', 'WebaiBridge is writing the current browser state into the local store and then refreshing the portal.', '', '', 'working');
    const captureBody = button.dataset.captureBody
      ? JSON.parse(decodeURIComponent(button.dataset.captureBody))
      : {};
    const { payload } = await callJson(button.dataset.captureUrl, captureBody);
    const acquisitionStatus = payload.acquisition?.status;
    const reloadButton =
      acquisitionStatus === 'success' || acquisitionStatus === 'refreshable-but-degraded'
        ? '<button class="action action-secondary" data-portal-reload="true" type="button">Reload current summary</button>'
        : '';
    setFeedback(
      acquisitionStatus === 'refreshable-but-degraded'
        ? 'Browser capture stored with follow-up'
        : 'Current browser captured',
      payload.acquisition?.summary ?? 'WebaiBridge stored the current browser handoff record.',
      payload.acquisition?.storePath ?? '',
      reloadButton,
      acquisitionStatus === 'refreshable-but-degraded' ? 'warning' : 'success'
    );
  } catch (error) {
    setFeedback('Browser capture could not finish', error instanceof Error ? error.message : 'Unknown capture failure.', '', '', 'danger');
  } finally {
    setActionBusy(button, false);
  }
});
</script>`;
}

export function renderAuthPortalShell(model: AuthPortalShellModel): string {
  const orderedSections = orderSectionsForDisplay(model.sections);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(model.title)}</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='28' fill='%23111816'/%3E%3Cpath d='M30 34h60v12H30zm0 20h60v12H30zm0 20h32v12H30z' fill='%233fa56b'/%3E%3C/svg%3E" />
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f1412;
        --panel: #151c19;
        --panel-raised: #1b2420;
        --ink: #e8f1ec;
        --muted: #a9b7b0;
        --line: #2a3631;
        --accent: #3fa56b;
        --warning: #c78b2c;
        --danger: #c95a5a;
        --ok: #4cbc76;
        --shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(63, 165, 107, 0.08), transparent 24rem),
          radial-gradient(circle at bottom right, rgba(199, 139, 44, 0.06), transparent 18rem),
          var(--bg);
        color: var(--ink);
        font-family: "IBM Plex Sans", "Fira Sans", "Segoe UI", sans-serif;
      }

      main {
        width: min(1200px, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 2rem 0 3rem;
      }

      .skip-link {
        position: absolute;
        left: 1rem;
        top: 1rem;
        transform: translateY(-240%);
        padding: 0.75rem 1rem;
        border-radius: 999px;
        background: var(--accent);
        color: #08100b;
        font-weight: 700;
        text-decoration: none;
        transition: transform 140ms ease;
        z-index: 20;
      }

      .skip-link:focus-visible {
        transform: translateY(0);
      }

      .hero,
      .section,
      .policy-list,
      .workflow-grid,
      .priority-rail,
      .boundary-card,
      .mode-guide,
      .feedback {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
        gap: 1rem;
        padding: 1.75rem;
        margin-bottom: 1rem;
      }

      .eyebrow {
        margin: 0 0 0.5rem;
        color: var(--accent);
        font-size: 0.9rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-family: "JetBrains Mono", "Fira Code", monospace;
      }

      .eyebrow-compact {
        font-size: 0.78rem;
      }

      h1,
      h2,
      h3,
      p {
        margin-top: 0;
      }

      h1,
      h2,
      h3,
      h4,
      summary,
      button,
      a {
        letter-spacing: -0.02em;
      }

      code,
      pre,
      .mono,
      .workflow-count,
      .state,
      .snapshot-meta span,
      .policy-pill {
        font-family: "JetBrains Mono", "Fira Code", monospace;
      }

      .hero p:last-child,
      .section-header p:last-child,
      .diagnostic p:last-child,
      .card p:last-child,
      .boundary-card p:last-child {
        margin-bottom: 0;
      }

      .hero-copy h1 {
        max-width: 14ch;
        font-size: clamp(1.85rem, 3.1vw, 2.8rem);
        line-height: 1.02;
        margin-bottom: 0.78rem;
      }

      .hero-copy p {
        max-width: 58ch;
        color: var(--muted);
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 1rem;
        align-items: center;
      }

      .hero-primary-action {
        display: inline-flex;
        flex-direction: column;
        gap: 0.32rem;
      }

      .hero-primary-action-note {
        color: rgba(229, 232, 233, 0.64);
        font-size: 0.78rem;
        line-height: 1.4;
      }

      .hero-secondary-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
      }

      .hero-call-strip-shell {
        display: grid;
        gap: 0.55rem;
        margin-top: 1.08rem;
      }

      .hero-call-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.8rem;
      }

      .hero-call-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 0.95rem 1rem 0.9rem;
        background: var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .hero-call-card strong {
        display: block;
        margin-bottom: 0.28rem;
        font-size: 1.7rem;
        line-height: 1;
      }

      .hero-call-card span {
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.4;
      }

      .hero-call-card-ok {
        border-color: rgba(76, 188, 118, 0.32);
        background:
          linear-gradient(180deg, rgba(76, 188, 118, 0.14), rgba(76, 188, 118, 0.04)),
          var(--panel-raised);
      }

      .hero-call-card-warning {
        border-color: rgba(199, 139, 44, 0.34);
        background:
          linear-gradient(180deg, rgba(199, 139, 44, 0.16), rgba(199, 139, 44, 0.045)),
          var(--panel-raised);
      }

      .hero-call-card-danger {
        border-color: rgba(201, 90, 90, 0.38);
        background:
          linear-gradient(180deg, rgba(201, 90, 90, 0.18), rgba(201, 90, 90, 0.05)),
          var(--panel-raised);
      }

      .hero-meta {
        display: grid;
        gap: 0.68rem;
        align-content: start;
      }

      .hero-meta-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 1rem;
        background: var(--panel-raised);
      }

      .hero-meta-card-quiet {
        padding: 0.72rem 0.8rem;
        background: rgba(255, 255, 255, 0.012);
        border-color: rgba(255, 255, 255, 0.04);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.025),
          0 10px 24px rgba(0, 0, 0, 0.08);
      }

      .hero-meta-card-quiet p {
        color: rgba(240, 244, 242, 0.86);
        font-size: 0.86rem;
        line-height: 1.4;
      }

      .hero-meta-card-quiet .eyebrow {
        color: #7cd6a1;
      }

      .hero-meta-card-priority {
        border-color: rgba(63, 165, 107, 0.18);
        background:
          linear-gradient(180deg, rgba(63, 165, 107, 0.085), rgba(63, 165, 107, 0.022)),
          var(--panel-raised);
        box-shadow:
          0 12px 24px rgba(63, 165, 107, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .hero-step-list {
        list-style: none;
        display: grid;
        gap: 0.6rem;
        margin: 0;
        padding: 0;
      }

      .hero-step-list li {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.7rem;
        align-items: start;
      }

      .hero-step-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.55rem;
        min-height: 1.55rem;
        border-radius: 999px;
        background: rgba(63, 165, 107, 0.18);
        color: #dff5e8;
        font-family: "JetBrains Mono", "Fira Code", monospace;
        font-size: 0.76rem;
        font-weight: 700;
      }

      .hero-step-copy strong {
        display: block;
        margin-bottom: 0.18rem;
      }

      .hero-step-copy span {
        color: var(--muted);
        font-size: 0.88rem;
        line-height: 1.4;
      }

      .hero-meta-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.2rem;
        color: rgba(244, 247, 246, 0.9);
        font-size: 0.8rem;
      }

      .hero-meta-footer .mono {
        color: #ffffff;
      }

      .priority-rail {
        padding: 1.2rem;
        margin-bottom: 1rem;
      }

      .priority-rail .section-header {
        max-width: 68ch;
      }

      .priority-metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.85rem;
        margin: 1rem 0;
      }

      .priority-metric {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 0.9rem 1rem;
        background: var(--panel-raised);
      }

      .priority-metric strong {
        font-size: 2rem;
        line-height: 1;
      }

      .priority-metric-ok {
        border-color: rgba(76, 188, 118, 0.28);
        background: rgba(255, 255, 255, 0.015);
      }

      .priority-metric-warning {
        border-color: rgba(199, 139, 44, 0.3);
        background:
          linear-gradient(180deg, rgba(199, 139, 44, 0.18), rgba(199, 139, 44, 0.06)),
          var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(199, 139, 44, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .priority-metric-danger {
        border-color: rgba(201, 90, 90, 0.34);
        background:
          linear-gradient(180deg, rgba(201, 90, 90, 0.22), rgba(201, 90, 90, 0.07)),
          var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(201, 90, 90, 0.16),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .priority-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.85rem;
      }

      .hero-top-blocker {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.9rem;
        margin-top: 0.85rem;
        padding: 0.95rem 1rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
          var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.03),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .hero-top-blocker-copy {
        display: grid;
        gap: 0.22rem;
      }

      .hero-top-blocker-copy strong {
        font-size: 1rem;
        color: var(--ink);
      }

      .hero-top-blocker-copy p:last-child {
        margin: 0;
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .hero-top-blocker-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.62rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--ink);
        font-size: 0.85rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .hero-top-blocker-link:hover {
        border-color: rgba(63, 165, 107, 0.44);
        background: rgba(63, 165, 107, 0.16);
      }

      .priority-provider-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 0.95rem;
        background: var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .priority-provider-card h3 {
        margin: 0 0 0.45rem;
      }

      .priority-provider-card p:last-of-type {
        color: var(--muted);
      }

      .priority-provider-step {
        display: inline-flex;
        align-items: center;
        margin: 0 0 0.35rem;
        padding: 0.26rem 0.58rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(232, 241, 236, 0.92);
        font-size: 0.8rem;
        font-weight: 600;
      }

      .priority-provider-card p.priority-provider-summary {
        margin: 0;
        min-height: 2.8rem;
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .priority-provider-card-ready {
        border-color: rgba(76, 188, 118, 0.28);
        background: rgba(255, 255, 255, 0.016);
      }

      .priority-metric-ok .eyebrow,
      .priority-provider-card-ready .eyebrow {
        color: #79d19d;
      }

      .priority-provider-card-ready .priority-provider-step {
        color: #dff5e8;
        background: rgba(76, 188, 118, 0.15);
      }

      .priority-provider-card-account-action {
        border-color: rgba(201, 90, 90, 0.34);
        background:
          linear-gradient(180deg, rgba(201, 90, 90, 0.2), rgba(201, 90, 90, 0.06)),
          var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(201, 90, 90, 0.14),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .priority-provider-card-account-action .priority-provider-step {
        color: #ffe8e8;
        background: rgba(201, 90, 90, 0.17);
      }

      .priority-provider-card-session-work {
        border-color: rgba(199, 139, 44, 0.3);
        background:
          linear-gradient(180deg, rgba(199, 139, 44, 0.18), rgba(199, 139, 44, 0.06)),
          var(--panel-raised);
        box-shadow:
          0 0 0 1px rgba(199, 139, 44, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .priority-provider-card-session-work .priority-provider-step {
        color: #ffedbf;
        background: rgba(199, 139, 44, 0.17);
      }

      .priority-provider-link {
        display: inline-flex;
        margin-top: 0.4rem;
        color: var(--ink);
        text-decoration: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.28);
      }

      .provider-drawer {
        padding: 0;
        overflow: hidden;
      }

      .provider-drawer summary {
        list-style: none;
        cursor: pointer;
        display: grid;
        gap: 0.3rem;
        padding: 1.2rem 1.35rem;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.015)),
          var(--panel);
      }

      .provider-drawer summary::-webkit-details-marker {
        display: none;
      }

      .detail-shelf-title {
        font-size: 1.2rem;
        font-weight: 600;
      }

      .detail-shelf-copy {
        max-width: 72ch;
        color: var(--muted);
      }

      .provider-drawer-body {
        padding: 0 1.35rem 1.35rem;
        border-top: 1px solid var(--line);
      }

      .secondary-context-stack {
        margin-bottom: 1rem;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: var(--shadow);
      }

      .secondary-context-stack summary {
        cursor: pointer;
        padding: 1rem 1.15rem;
        color: var(--muted);
      }

      .secondary-context-body {
        padding: 0 1rem 1rem;
      }

      .policy-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        padding: 1rem;
        margin-bottom: 1rem;
      }

      .boundary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .boundary-card {
        padding: 1.1rem 1.15rem;
      }

      .workflow-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        padding: 1rem;
        margin-bottom: 1rem;
      }

      .workflow-card {
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 1rem;
        background: var(--panel-raised);
      }

      .workflow-header {
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
        align-items: start;
        margin-bottom: 0.75rem;
      }

      .workflow-count {
        display: inline-flex;
        min-width: 2rem;
        min-height: 2rem;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(19, 111, 99, 0.12);
        color: var(--accent);
        font-weight: 600;
      }

      .workflow-provider-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.6rem;
      }

      .workflow-provider-list li {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        color: var(--muted);
      }

      .policy-pill {
        padding: 0.5rem 0.85rem;
        border-radius: 999px;
        background: rgba(63, 165, 107, 0.12);
        color: var(--accent);
        font-size: 0.92rem;
      }

      .section {
        padding: 1.5rem;
        margin-bottom: 1.25rem;
      }

      .card-group {
        margin-top: 1rem;
      }

      .card-group-collapsed {
        border-top: 1px solid var(--line);
        padding-top: 0.85rem;
      }

      .card-group-collapsed summary {
        cursor: pointer;
        color: var(--muted);
        margin-bottom: 0.8rem;
      }

      .card-group-body p {
        color: var(--muted);
      }

      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 1rem;
        background: var(--panel-raised);
      }

      .card-verdict {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 0.95rem 1rem;
        background: rgba(255, 255, 255, 0.03);
        margin-bottom: 0.85rem;
      }

      .card-verdict h4 {
        margin: 0 0 0.4rem;
        font-size: 1.45rem;
      }

      .card-verdict-next {
        color: var(--ink);
        font-weight: 600;
        font-size: 0.95rem;
      }

      .card-verdict p:first-of-type {
        color: var(--muted);
      }

      .card-verdict-ok {
        border-color: rgba(76, 188, 118, 0.3);
      }

      .card-verdict-warning {
        border-color: rgba(199, 139, 44, 0.32);
      }

      .card-verdict-danger {
        border-color: rgba(201, 90, 90, 0.34);
      }

      .card-header {
        display: flex;
        gap: 1rem;
        align-items: start;
        justify-content: space-between;
        margin-bottom: 0.85rem;
      }

      .card-kicker {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .state {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.35rem 0.7rem;
        font-size: 0.84rem;
        background: #25302b;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #dbe8e1;
      }

      .state-ready {
        background: #17452d;
        color: #e6fff0;
      }

      .state-expiring,
      .state-refreshable-but-degraded,
      .state-provider-unavailable {
        background: #4a3310;
        color: #ffe6ad;
      }

      .state-expired,
      .state-missing,
      .state-user-action-required {
        background: #4a1c1c;
        color: #ffe3e3;
      }

      .status,
      .ownership,
      .workflow,
      .diagnostic-contract,
      .handoff-copy,
      .handoff-step,
      .handoff-fallback,
      .handoff-artifact-list,
      .handoff-header p,
      .boundary-card p,
      .snapshot-row span,
      .technical-note {
        color: var(--muted);
        font-size: 0.95rem;
      }

      .snapshot {
        margin: 0.8rem 0;
        padding: 0.85rem 0.9rem;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.02);
      }

      .snapshot-warning {
        border-color: rgba(199, 139, 44, 0.35);
      }

      .snapshot-danger {
        border-color: rgba(201, 90, 90, 0.35);
      }

      .snapshot-ok {
        border-color: rgba(76, 188, 118, 0.32);
      }

      .snapshot-label {
        margin-bottom: 0.45rem;
        color: var(--muted);
        font-size: 0.84rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .snapshot-row {
        display: grid;
        gap: 0.35rem;
      }

      .snapshot-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 0.75rem;
      }

      .diagnostic {
        border-radius: 16px;
        padding: 0.75rem;
        margin: 0.85rem 0;
      }

      .handoff {
        border-radius: 16px;
        padding: 0.85rem;
        margin: 0.85rem 0;
        background: rgba(63, 165, 107, 0.08);
        border: 1px solid rgba(63, 165, 107, 0.18);
      }

      .handoff-header {
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
        align-items: start;
        margin-bottom: 0.7rem;
      }

      .handoff-header h4,
      .handoff-caption {
        margin-bottom: 0.25rem;
      }

      .handoff-status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.3rem 0.65rem;
        background: #1f5138;
        color: #ebfff3;
        font-size: 0.82rem;
        white-space: nowrap;
      }

      .handoff-artifact-list {
        list-style: none;
        padding: 0;
        margin: 0.75rem 0;
        display: grid;
        gap: 0.55rem;
      }

      .handoff-artifact-list li {
        display: grid;
        gap: 0.15rem;
        padding: 0.65rem 0.75rem;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
      }

      .acquisition-modes {
        display: grid;
        gap: 0.7rem;
      }

      .acquisition-modes-primary {
        display: grid;
        gap: 0.2rem;
        padding: 0.7rem 0.8rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.03);
      }

      .acquisition-modes-primary span {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .acquisition-modes-details {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 0.7rem;
      }

      .acquisition-modes-details summary {
        cursor: pointer;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .diagnostic-warning {
        background: rgba(180, 83, 9, 0.1);
      }

      .diagnostic-error {
        background: rgba(180, 35, 24, 0.1);
      }

      .diagnostic-ok {
        background: rgba(29, 111, 66, 0.08);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }

      .card-details {
        margin: 0.85rem 0 0.95rem;
        border-top: 1px solid var(--line);
        padding-top: 0.8rem;
      }

      .card-details summary {
        cursor: pointer;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .card-details-body {
        margin-top: 0.9rem;
      }

      .action {
        border: none;
        border-radius: 999px;
        padding: 0.65rem 1rem;
        font: inherit;
        cursor: pointer;
        text-decoration: none;
        transition:
          transform 140ms ease,
          border-color 140ms ease,
          background-color 140ms ease,
          opacity 140ms ease;
      }

      .action:hover {
        transform: translateY(-1px);
      }

      .action[disabled],
      .action[aria-busy="true"] {
        cursor: progress;
        opacity: 0.72;
      }

      .action-primary {
        background: var(--accent);
        color: #08100b;
        font-weight: 600;
      }

      .action-secondary {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--line);
        color: var(--ink);
      }

      .action-ghost {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--muted);
      }

      .action-warning {
        background: rgba(199, 139, 44, 0.16);
        color: #f0c46d;
      }

      .feedback {
        padding: 1rem;
        margin-bottom: 1rem;
      }

      .feedback[data-state="working"] {
        border-color: rgba(199, 139, 44, 0.38);
      }

      .feedback[data-state="success"] {
        border-color: rgba(76, 188, 118, 0.38);
      }

      .feedback[data-state="warning"] {
        border-color: rgba(199, 139, 44, 0.38);
      }

      .feedback[data-state="danger"] {
        border-color: rgba(201, 90, 90, 0.4);
      }

      .feedback pre {
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 0.8rem;
      }

      .technical-panel {
        margin: 0.85rem 0;
        border-top: 1px solid var(--line);
        padding-top: 0.8rem;
      }

      .technical-panel summary {
        cursor: pointer;
        color: var(--muted);
      }

      .technical-link-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.8rem;
      }

      .technical-link-grid a {
        color: var(--ink);
        text-decoration: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0.45rem 0.75rem;
      }

      .mode-guide {
        padding: 1.2rem;
        margin-bottom: 1rem;
      }

      .mode-guide-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }

      .mode-guide-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 1rem;
        background: var(--panel-raised);
      }

      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        html {
          scroll-behavior: auto;
        }

        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }

      @media (max-width: 720px) {
        main {
          width: min(100vw - 1rem, 1120px);
          padding: 1rem 0 2rem;
        }

        .hero,
        .section,
        .workflow-grid,
        .priority-rail,
        .mode-guide {
          padding: 1.1rem;
          border-radius: 18px;
        }

        .priority-metrics-grid {
          grid-template-columns: 1fr;
        }

        .hero-call-strip {
          grid-template-columns: 1fr;
        }

        .hero {
          grid-template-columns: 1fr;
        }

        .hero-actions {
          flex-direction: column;
        }

        .card-header {
          flex-direction: column;
        }

        .workflow-header,
        .workflow-provider-list li,
        .handoff-header {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#auth-portal-main">Skip to main content</a>
    <main id="auth-portal-main">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Local-first Web/Login access</p>
          <h1>${escapeHtml(model.title)}</h1>
          <p>Start with one question: <strong>who is ready now</strong>, <strong>who needs owner action</strong>, and <strong>who still needs you to finish the browser login before this page can be trusted</strong>.</p>
          ${renderHeroFirstCallStrip(model)}
          <div class="hero-actions">
            <div class="hero-primary-action">
              <a class="action action-primary action-link" href="#auth-portal-web-login-priority-rail">Review live readiness first</a>
              <span class="hero-primary-action-note">Make the first call here, then open deeper evidence only for the provider that still needs help.</span>
            </div>
            <div class="hero-secondary-actions">
              <a class="action action-ghost action-link" href="#auth-portal-provider-drawers">Open provider details</a>
              <a class="action action-ghost action-link" href="#section-byok">Review BYOK later</a>
            </div>
          </div>
        </div>
        <div class="hero-meta">
          <article class="hero-meta-card hero-meta-card-priority">
            <p class="eyebrow eyebrow-compact">Start with one call</p>
            <ol class="hero-step-list">
              <li>
                <span class="hero-step-index">01</span>
                <span class="hero-step-copy">
                  <strong>Read the arrivals board.</strong>
                  <span>Decide who is ready now, who needs owner action, and who still needs browser work.</span>
                </span>
              </li>
              <li>
                <span class="hero-step-index">02</span>
                <span class="hero-step-copy">
                  <strong>Open one provider only when blocked.</strong>
                  <span>Use the deeper drawer when you need browser evidence, capture steps, or the full action trail.</span>
                </span>
              </li>
              <li>
                <span class="hero-step-index">03</span>
                <span class="hero-step-copy">
                  <strong>Check BYOK after the live call is clear.</strong>
                  <span>Keep API-key inventory as the secondary shelf, not the first-screen decision source.</span>
                </span>
              </li>
            </ol>
          </article>
          <article class="hero-meta-card hero-meta-card-quiet">
            <p class="eyebrow eyebrow-compact">Current stance</p>
            <p>${escapeHtml(model.trustBoundary)}</p>
          </article>
        </div>
      </section>
      <section id="auth-portal-feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true" tabindex="-1" hidden></section>
      ${renderWebLoginPriorityRail(model)}
      ${orderedSections
        .map((section) =>
          section.id === "byok"
            ? renderCollapsedSection(
                section,
                "BYOK inventory and local key slots",
                "Open this only when you need the local API-key inventory. Keep the Web/Login live wall above as the primary front-door truth.",
              )
            : renderWebLoginSection(section),
        )
        .join('')}
      ${renderSecondaryPortalContext(model)}
    </main>
    ${renderRouteCatalog(model.routeCatalog)}
    ${renderPortalScript(model.routeCatalog)}
  </body>
</html>`;
}

export function renderDefaultAuthPortalShell(userId = 'local-user'): string {
  return renderAuthPortalShell(
    buildAuthPortalShellModel({
      owner: createCredentialOwner(userId)
    })
  );
}
