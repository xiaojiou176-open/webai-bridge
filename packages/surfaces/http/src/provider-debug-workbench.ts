import type {
  ServiceProviderCurrentConsoleView,
  ServiceProviderCurrentNetworkView,
  ServiceProviderDebugSupportView,
  ServiceProviderDiagnoseStepView,
} from "./service-language.js";

function escapeHtml(value: string): string {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderOptionalCode(label: string, value?: string): string {
  if (!value) {
    return "";
  }

  return `<span><strong>${escapeHtml(label)}</strong> <code>${escapeHtml(value)}</code></span>`;
}

function mapTone(status: string): "ok" | "warning" | "danger" {
  if (status === "live-ready" || status === "ready" || status === "captured") {
    return "ok";
  }

  if (
    status === "live-blocked" ||
    status === "limited" ||
    status === "blocked" ||
    status === "recommended" ||
    status === "refreshable-but-degraded"
  ) {
    return "warning";
  }

  return "danger";
}

interface DebugTruthFocus {
  eyebrow: string;
  summary: string;
  detail: string;
  runtimeSummary: string;
}

interface SharedDiagnosticState {
  repeatedRaw?: string;
  condensedSummary?: string;
}

function getEffectiveRuntimePathStatus(
  debug: ServiceProviderDebugSupportView,
  truthFocus: DebugTruthFocus | null,
): string {
  if (!truthFocus) {
    return debug.runtime.runtimeReadiness;
  }

  switch (debug.currentPage.classification) {
    case "account-action-required":
    case "human-verification-required":
    case "session-incomplete":
    case "login-required":
    case "provider-adjacent":
    case "permission-gated":
      return "blocked";
    default:
      if (debug.auth.session?.state === "user-action-required") {
        return "blocked";
      }
      return debug.runtime.runtimeReadiness;
  }
}

function getRuntimePathFactValue(
  debug: ServiceProviderDebugSupportView,
  truthFocus: DebugTruthFocus | null,
): string {
  if (!truthFocus) {
    return debug.runtime.runtimeReadiness;
  }

  switch (debug.currentPage.classification) {
    case "account-action-required":
      return "blocked by owner action";
    case "human-verification-required":
      return "blocked on verification";
    case "session-incomplete":
    case "login-required":
    case "provider-adjacent":
    case "permission-gated":
      return "blocked on current browser";
    default:
      if (debug.auth.session?.state === "user-action-required") {
        return "blocked by user action";
      }
      return debug.runtime.runtimeReadiness;
  }
}

function getDebugTruthFocus(debug: ServiceProviderDebugSupportView): DebugTruthFocus | null {
  const classification = debug.currentPage.classification;
  const requiredUserAction = debug.auth.session?.requiredUserAction?.trim();
  const pageDiagnostic = debug.currentPage.diagnostic;

  switch (classification) {
    case "account-action-required":
      return {
        eyebrow: "Owner action first",
        summary:
          requiredUserAction ||
          pageDiagnostic ||
          "The current browser is still blocked on an owner/manual account step.",
        detail:
          "Current browser evidence can still look reusable. That does not clear the blocker. Finish the owner/manual account step first, then rerun the provider live gate.",
        runtimeSummary:
          "Owner/manual account action is still blocking runtime use. A reusable-looking browser page does not clear this blocker by itself.",
      };
    case "human-verification-required":
      return {
        eyebrow: "Verification first",
        summary:
          requiredUserAction ||
          pageDiagnostic ||
          "The current browser still needs a human verification step before this provider can be treated as reusable.",
        detail:
          "Do the verification step in the current browser first. Only rerun the provider live gate after the blocker is visibly gone.",
        runtimeSummary:
          "Runtime use is still blocked on a human verification step. Current browser reachability is not the same as access being restored.",
      };
    case "session-incomplete":
    case "login-required":
    case "provider-adjacent":
    case "permission-gated":
      return {
        eyebrow: "Browser session first",
        summary:
          pageDiagnostic ||
          requiredUserAction ||
          "The current browser session has not reached a reusable workspace yet.",
        detail:
          "Finish the current browser session until this provider reaches a real workspace. Rerun the provider live gate only after the page is visibly ready.",
        runtimeSummary:
          "Runtime use is still blocked because the current browser session has not reached a reusable workspace yet.",
      };
    default:
      if (debug.auth.session?.state === "user-action-required" && requiredUserAction) {
        return {
          eyebrow: "Owner action first",
          summary: requiredUserAction,
          detail:
            "WebaiBridge already knows this is an end-user blocker. Finish that action first, then rerun the provider live gate for fresh proof.",
          runtimeSummary:
            "Runtime use is still blocked on an explicit end-user action. Do not treat reruns as the primary fix until that action is complete.",
        };
      }

      return null;
  }
}

function normalizeDiagnosticText(value: string | undefined): string {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function getSharedDiagnosticState(debug: ServiceProviderDebugSupportView): SharedDiagnosticState {
  const diagnostics = [
    debug.currentPage.diagnostic,
    debug.currentConsole.diagnostic,
    debug.currentNetwork.diagnostic,
  ]
    .map((value) => normalizeDiagnosticText(value))
    .filter(Boolean);

  const repeated = diagnostics.find(
    (candidate, index) => diagnostics.indexOf(candidate) !== index,
  );

  if (!repeated) {
    return {};
  }

  return {
    repeatedRaw: repeated,
    condensedSummary:
      "The same browser-inspection failure is feeding multiple sections. Keep the primary verdict above, then use the detailed diagnostics tray below for the raw technical message.",
  };
}

function getSectionDiagnosticText(
  diagnostic: string,
  sharedDiagnostic: SharedDiagnosticState,
): string {
  if (
    sharedDiagnostic.repeatedRaw &&
    normalizeDiagnosticText(diagnostic) === sharedDiagnostic.repeatedRaw
  ) {
    return "Same browser-inspection failure as above. Open detailed browser diagnostics below for the raw technical message.";
  }

  return diagnostic;
}

function renderDetailedBrowserDiagnostics(sharedDiagnostic: SharedDiagnosticState): string {
  if (!sharedDiagnostic.repeatedRaw) {
    return "";
  }

  return renderDiagnosticTray(
    "Detailed browser evidence",
    sharedDiagnostic.condensedSummary ??
      "Open the raw browser diagnostic only when the summary and next step still are not enough.",
    `<section class="section">
      <header class="section-header">
        <h2>Detailed browser evidence</h2>
        <p>${escapeHtml(sharedDiagnostic.condensedSummary ?? "")}</p>
      </header>
      <pre>${escapeHtml(sharedDiagnostic.repeatedRaw)}</pre>
    </section>`,
    { badge: "Raw log" },
  );
}

function renderDiagnosticTray(
  title: string,
  description: string,
  body: string,
  options?: {
    id?: string;
    open?: boolean;
    badge?: string;
  },
): string {
  return `<details class="diagnostic-tray"${options?.id ? ` id="${escapeHtml(options.id)}"` : ""}${options?.open ? " open" : ""}>
    <summary>
      <span class="diagnostic-tray-copy">
        ${options?.badge ? `<span class="diagnostic-tray-badge">${escapeHtml(options.badge)}</span>` : ""}
        <span class="diagnostic-tray-title">${escapeHtml(title)}</span>
        <span class="diagnostic-tray-description">${escapeHtml(description)}</span>
      </span>
      <span class="diagnostic-tray-toggle">Details</span>
    </summary>
    <div class="diagnostic-tray-body">
      ${body}
    </div>
  </details>`;
}

function renderEvidenceStack(
  debug: ServiceProviderDebugSupportView,
  currentPageDiagnostic: string,
  currentConsoleDiagnostic: string,
  currentNetworkDiagnostic: string,
  blockedFlow = false,
): string {
  const firstDiagnoseStep = debug.diagnoseLadder[0];
  const evidencePeek = [
    debug.currentPage.classification
      ? `Current page: ${debug.currentPage.classification}`
      : "Current page: live-read evidence in primary tray",
    firstDiagnoseStep?.summary
      ? `Next repair step: ${firstDiagnoseStep.summary}`
      : "Next repair step: open the diagnose ladder",
  ];

  return `<details id="evidence-stack" class="evidence-stack">
    <summary>
      <span class="evidence-stack-summary-copy">
        <span class="evidence-stack-summary-title">Evidence stack, repair ladder, and raw JSON surfaces</span>
        <span class="evidence-stack-summary-peek">${escapeHtml(evidencePeek.join(" • "))}</span>
      </span>
      <span class="evidence-stack-summary-toggle">Open trays</span>
    </summary>
    <div class="evidence-stack-body">
      <div class="evidence-stack-intro">
        <p class="eyebrow eyebrow-compact">Progressive disclosure</p>
        <p>Open the tray you need right now. The workbench keeps current browser proof, repair order, and raw routes separated so one click does not dump every diagnostic layer at once.</p>
      </div>
      <div class="diagnostic-tray-stack">
        ${renderDiagnosticTray(
          "Current browser evidence",
          "Start with what the current page and stored capture history say.",
          `<section class="section">
            <header class="section-header">
              <h2>Current browser evidence</h2>
              <p>The safest way to reason about a web-login provider is: first what WebaiBridge stored, then what the current browser page actually shows.</p>
            </header>
            <div class="section-grid">
              <article class="section-card">
                <h3>Current page</h3>
                <p>${escapeHtml(currentPageDiagnostic)}</p>
                <div class="meta-row">
                  ${renderOptionalCode("classification", debug.currentPage.classification)}
                  ${renderOptionalCode("url", debug.currentPage.url)}
                  ${renderOptionalCode("title", debug.currentPage.title)}
                </div>
              </article>
              <article class="section-card">
                <h3>Capture provenance</h3>
                <div class="meta-row">
                  ${renderOptionalCode("browser mode", debug.captureProvenance?.browserMode)}
                  ${renderOptionalCode("captured", debug.captureProvenance?.capturedAt)}
                  ${renderOptionalCode("profile", debug.captureProvenance?.profileName)}
                </div>
                <p>${escapeHtml(debug.persistenceAudit?.summary ?? "No persistence audit summary is currently available.")}</p>
              </article>
            </div>
          </section>`,
          {
            open: true,
            badge: "Primary tray",
          },
        )}
        ${renderDiagnosticTray(
          "Current console and network",
          "Open this only when you need the current console or network observation window.",
          `<section class="section">
            <header class="section-header">
              <h2>Current console and network</h2>
              <p>These are evidence surfaces, not vanity metrics. Empty entries mean WebaiBridge did not see fresh events during this inspection window, not that the provider is automatically healthy.</p>
            </header>
            <div class="section-grid">
              <article class="section-card">
                <h3>Current console</h3>
                <p>${escapeHtml(currentConsoleDiagnostic)}</p>
                ${renderConsoleEntries(debug.currentConsole)}
              </article>
              <article class="section-card">
                <h3>Current network</h3>
                <p>${escapeHtml(currentNetworkDiagnostic)}</p>
                ${renderNetworkEntries(debug.currentNetwork)}
              </article>
            </div>
          </section>`,
          {
            badge: "Supporting evidence",
          },
        )}
        ${renderDiagnosticTray(
          "Diagnose ladder",
          "Keep this tray for the ordered repair sequence on this machine.",
          `<section class="section">
            <header class="section-header">
              <h2>Diagnose ladder</h2>
              <p>Walk this in order. It is the repair ladder for this provider on this machine, not a product KPI wall.</p>
            </header>
            <ol class="ladder">
              ${debug.diagnoseLadder.map((step) => renderDiagnoseStep(step)).join("")}
            </ol>
          </section>`,
          {
            id: "diagnose-ladder-tray",
            open: blockedFlow,
            badge: "Repair order",
          },
        )}
        ${renderDiagnosticTray(
          "JSON truth surfaces",
          "Use this tray only when you want the raw routes that back the page.",
          `<section class="section">
            <header class="section-header">
              <h2>JSON truth surfaces</h2>
              <p>Use these routes when you want the raw evidence that backs this page. They stay read-only on purpose.</p>
            </header>
            <div class="json-link-grid">
              <a href="${escapeHtml(debug.routes.status)}" target="_blank" rel="noopener">Status JSON</a>
              <a href="${escapeHtml(debug.routes.probe)}" target="_blank" rel="noopener">Probe JSON</a>
              <a href="${escapeHtml(debug.routes.remediation)}" target="_blank" rel="noopener">Remediation JSON</a>
              <a href="${escapeHtml(debug.routes.debugCurrentPage)}" target="_blank" rel="noopener">Current page JSON</a>
              <a href="${escapeHtml(debug.routes.debugCurrentConsole)}" target="_blank" rel="noopener">Current console JSON</a>
              <a href="${escapeHtml(debug.routes.debugCurrentNetwork)}" target="_blank" rel="noopener">Current network JSON</a>
              <a href="${escapeHtml(debug.routes.debugSupportBundle)}" target="_blank" rel="noopener">Support bundle JSON</a>
            </div>
          </section>`,
          {
            badge: "Raw routes",
          },
        )}
      </div>
    </div>
  </details>`;
}

function renderSummaryCard(
  title: string,
  status: string,
  summary: string,
  meta: string,
  technicalStatus = status,
): string {
  const tone = mapTone(status);
  const cardMeta = [renderOptionalCode("technical status", technicalStatus), meta]
    .filter(Boolean)
    .join("");

  return `<article class="summary-card summary-card-${tone}">
    <p class="eyebrow eyebrow-compact">${escapeHtml(title)}</p>
    <h2>${escapeHtml(getHumanStatusLabel(status, title))}</h2>
    <p>${escapeHtml(summary)}</p>
    ${cardMeta ? `<div class="meta-row">${cardMeta}</div>` : ""}
  </article>`;
}

function renderHeroTruthStrip(
  debug: ServiceProviderDebugSupportView,
  runtimePathStatus: string,
): string {
  const items = [
    {
      title: "Stored material",
      status: debug.storeReadiness.credentialState,
      summary: debug.storeReadiness.note,
    },
    {
      title: "Current browser",
      status: debug.liveReadiness.status,
      summary: debug.liveReadiness.diagnostic,
    },
    {
      title: "Runtime path",
      status: runtimePathStatus,
      summary: debug.auth.statusSummary,
    },
  ];

  return `<section class="hero-truth-strip" aria-label="First read summary">
    ${items
      .map((item) => {
        const tone = mapTone(item.status);
        return `<article class="hero-truth-card hero-truth-card-${tone}">
          <p class="eyebrow eyebrow-compact">${escapeHtml(item.title)}</p>
          <strong>${escapeHtml(getHumanStatusLabel(item.status, item.title))}</strong>
          <span>${escapeHtml(item.summary)}</span>
        </article>`;
      })
      .join("")}
  </section>`;
}

function getHumanStatusLabel(status: string, title: string): string {
  if (title === "Current browser") {
    switch (status) {
      case "live-ready":
        return "Browser looks reusable";
      case "live-blocked":
        return "Browser still blocked";
      case "unknown":
        return "No fresh browser read";
      default:
        break;
    }
  }

  if (title === "Runtime path") {
    switch (status) {
      case "ready":
        return "Runtime can invoke";
      case "blocked":
        return "Runtime still blocked";
      case "refreshable-but-degraded":
        return "Runtime is degraded";
      default:
        break;
    }
  }

  switch (status) {
    case "ready":
    case "workspace-ready":
      return "Ready to use";
    case "captured":
      return "Captured";
    case "validated":
      return "Validated";
    case "missing":
      return "No stored material";
    case "expired":
      return "Stored but expired";
    case "user-action-required":
      return "User action required";
    case "session-incomplete":
      return "Session incomplete";
    case "account-action-required":
      return "Account action required";
    case "login-required":
      return "Login still required";
    default:
      return status
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function renderPrimaryVerdict(
  debug: ServiceProviderDebugSupportView,
  truthFocus: DebugTruthFocus,
): string {
  return `<section class="verdict-strip" aria-label="Primary verdict">
    <div class="verdict-copy">
      <p class="eyebrow">Primary verdict</p>
      <h2>${escapeHtml(truthFocus.eyebrow)}</h2>
      <p>${escapeHtml(truthFocus.summary)}</p>
      <p class="verdict-note">${escapeHtml(truthFocus.detail)}</p>
    </div>
    <div class="verdict-facts">
      <article class="verdict-fact">
        <p class="eyebrow eyebrow-compact">Stored material</p>
        <strong>${escapeHtml(debug.storeReadiness.credentialState)}</strong>
      </article>
      <article class="verdict-fact">
        <p class="eyebrow eyebrow-compact">Current browser</p>
        <strong>${escapeHtml(debug.liveReadiness.status)}</strong>
      </article>
      <article class="verdict-fact">
        <p class="eyebrow eyebrow-compact">Runtime path</p>
        <strong>${escapeHtml(getRuntimePathFactValue(debug, truthFocus))}</strong>
      </article>
    </div>
  </section>`;
}

function renderConsoleEntries(currentConsole: ServiceProviderCurrentConsoleView): string {
  if (currentConsole.entries.length === 0) {
    return `<p class="empty-copy">No fresh console entries were captured during this inspection window.</p>`;
  }

  return `<ul class="evidence-list">
    ${currentConsole.entries
      .map(
        (entry) =>
          `<li><code>${escapeHtml(entry.type)}</code><span>${escapeHtml(entry.text)}</span></li>`,
      )
      .join("")}
  </ul>`;
}

function renderNetworkEntries(currentNetwork: ServiceProviderCurrentNetworkView): string {
  if (currentNetwork.entries.length === 0) {
    return `<p class="empty-copy">No fresh network events were captured for this provider during the current observation window.</p>`;
  }

  return `<table class="evidence-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Method</th>
        <th>Status</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody>
      ${currentNetwork.entries
        .map(
          (entry) => `<tr>
            <td>${escapeHtml(entry.name)}</td>
            <td><code>${escapeHtml(entry.method ?? "n/a")}</code></td>
            <td><code>${escapeHtml(`${entry.status ?? entry.outcome ?? "n/a"}`)}</code></td>
            <td>${escapeHtml(entry.source ?? "runtime")}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderDiagnoseStep(step: ServiceProviderDiagnoseStepView): string {
  return `<li class="ladder-step ladder-step-${escapeHtml(step.status)}">
    <div>
      <strong>${escapeHtml(step.summary)}</strong>
      <p><code>${escapeHtml(step.id)}</code></p>
    </div>
    ${step.command ? `<pre>${escapeHtml(step.command)}</pre>` : ""}
  </li>`;
}

export function renderProviderDebugWorkbench(
  debug: ServiceProviderDebugSupportView,
  authPortalRoute = "/v1/runtime/auth-portal",
): string {
  const truthFocus = getDebugTruthFocus(debug);
  const runtimePathStatus = getEffectiveRuntimePathStatus(debug, truthFocus);
  const sharedDiagnostic = getSharedDiagnosticState(debug);
  const storeMeta = [
    renderOptionalCode("validation", debug.storeReadiness.validationState),
    renderOptionalCode("account", debug.auth?.ownership?.accountLabel),
  ]
    .filter(Boolean)
    .join("");
  const browserMeta = [
    renderOptionalCode("attach", debug.attachTarget.cdpUrl),
    renderOptionalCode("page", debug.currentPage.url),
  ]
    .filter(Boolean)
    .join("");
  const nextAction =
    debug.diagnoseLadder.find((step) => step.status === "recommended") ??
    debug.diagnoseLadder.find((step) => step.status === "blocked") ??
    debug.diagnoseLadder[0];
  const nextStepEyebrow = truthFocus?.eyebrow ?? "Current next step";
  const nextStepSummary = truthFocus?.summary ?? nextAction?.summary ?? "No next step recorded.";
  const nextStepDetail = truthFocus?.detail;
  const nextStepCommand = nextAction?.command;
  const nextStepCommandLabel = truthFocus ? "Rerun after the blocker clears" : "Next check";
  const primaryWorkbenchActionLabel = truthFocus ? "Open repair ladder" : "Open browser evidence";
  const primaryWorkbenchActionHref = truthFocus ? "#diagnose-ladder-tray" : "#evidence-stack";
  const runtimeSummary = truthFocus?.runtimeSummary ?? debug.auth.statusSummary;
  const currentBrowserSummary =
    sharedDiagnostic.repeatedRaw &&
    normalizeDiagnosticText(debug.liveReadiness.diagnostic) === sharedDiagnostic.repeatedRaw
      ? "Fresh browser inspection is currently unavailable. Use the detailed browser diagnostics tray below for the raw transport error."
      : debug.liveReadiness.diagnostic;
  const currentPageDiagnostic = getSectionDiagnosticText(debug.currentPage.diagnostic, sharedDiagnostic);
  const currentConsoleDiagnostic = getSectionDiagnosticText(
    debug.currentConsole.diagnostic,
    sharedDiagnostic,
  );
  const currentNetworkDiagnostic = getSectionDiagnosticText(
    debug.currentNetwork.diagnostic,
    sharedDiagnostic,
  );
  const nextStepTone =
    debug.liveReadiness.status === "live-ready" && runtimePathStatus === "ready"
      ? "ok"
      : "warning";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(debug.providerDisplayName)} browser readiness</title>
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
        --shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(63, 165, 107, 0.16), transparent 24rem),
          radial-gradient(circle at bottom right, rgba(199, 139, 44, 0.14), transparent 18rem),
          var(--bg);
        color: var(--ink);
        font-family: "IBM Plex Sans", "Fira Sans", "Segoe UI", sans-serif;
      }

      main {
        width: min(1220px, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 1.4rem 0 2.6rem;
      }

      a {
        color: inherit;
      }

      code,
      pre,
      th,
      td,
      .eyebrow,
      .meta-row span {
        font-family: "JetBrains Mono", "Fira Code", monospace;
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
      .summary-grid,
      .section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.03) inset,
          0 24px 54px rgba(0, 0, 0, 0.36);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.95fr);
        gap: 0.9rem;
        padding: 1.15rem;
        margin-bottom: 1rem;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.015)),
          var(--panel);
      }

      .hero-copy {
        display: grid;
        gap: 0.75rem;
        align-content: start;
      }

      .hero-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem;
      }

      .hero-copy h1 {
        margin: 0;
        max-width: 10.5ch;
        font-size: clamp(1.85rem, 3.4vw, 2.95rem);
        line-height: 0.98;
        letter-spacing: -0.045em;
      }

      .eyebrow {
        margin: 0 0 0.45rem;
        color: var(--accent);
        font-size: 0.84rem;
        letter-spacing: 0.11em;
        text-transform: uppercase;
      }

      .eyebrow-compact {
        font-size: 0.75rem;
      }

      .hero-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.32rem 0.65rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 0.74rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .hero-intro {
        margin: 0;
        max-width: 56ch;
        font-size: 1rem;
        line-height: 1.52;
      }

      .hero-copy p,
      .section p,
      .empty-copy {
        color: var(--muted);
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        align-items: center;
      }

      .pill-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.58rem 0.92rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.035);
        text-decoration: none;
        box-shadow:
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.9) 0 0 0 1px inset,
          rgba(255, 255, 255, 0.06) 0 1px 0 0 inset;
        transition:
          opacity 160ms ease,
          border-color 160ms ease,
          transform 160ms ease;
      }

      .pill-link:hover {
        opacity: 0.9;
        border-color: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
      }

      .pill-link-primary {
        background: var(--accent);
        color: #08100b;
        border-color: transparent;
        box-shadow:
          0 12px 24px rgba(63, 165, 107, 0.2),
          rgba(255, 255, 255, 0.18) 0 1px 0 0 inset;
      }

      .pill-link-warning {
        background: rgba(199, 139, 44, 0.18);
        color: #f4d18a;
        border-color: rgba(199, 139, 44, 0.3);
        box-shadow:
          0 12px 24px rgba(199, 139, 44, 0.12),
          rgba(255, 255, 255, 0.12) 0 1px 0 0 inset;
      }

      .pill-link-quiet {
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        color: rgba(232, 241, 236, 0.68);
        font-size: 0.88rem;
        line-height: 1.4;
      }

      .pill-link-quiet:hover {
        color: var(--ink);
        border-color: transparent;
        background: transparent;
        opacity: 1;
      }

      .hero-meta {
        display: grid;
        gap: 0.72rem;
        align-content: start;
      }

      .hero-meta-card,
      .verdict-strip,
      .summary-card,
      .section-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 0.95rem 1rem;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.022)),
          var(--panel-raised);
        box-shadow:
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.9) 0 0 0 1px inset,
          rgba(255, 255, 255, 0.04) 0 1px 0 0 inset;
      }

      .hero-meta-card {
        display: grid;
        gap: 0.6rem;
      }

      .hero-meta-card-quiet {
        padding: 0.72rem 0.82rem;
        background: rgba(255, 255, 255, 0.014);
        border-color: rgba(255, 255, 255, 0.05);
        box-shadow:
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.86) 0 0 0 1px inset;
      }

      .hero-meta-card-ok,
      .hero-meta-card-warning {
        border-color: rgba(63, 165, 107, 0.3);
        background:
          linear-gradient(180deg, rgba(63, 165, 107, 0.16), rgba(63, 165, 107, 0.045)),
          var(--panel-raised);
        box-shadow:
          0 18px 34px rgba(63, 165, 107, 0.1),
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.88) 0 0 0 1px inset,
          rgba(255, 255, 255, 0.05) 0 1px 0 0 inset;
      }

      .hero-meta-card-warning {
        border-color: rgba(199, 139, 44, 0.28);
        background:
          linear-gradient(180deg, rgba(199, 139, 44, 0.14), rgba(199, 139, 44, 0.04)),
          var(--panel-raised);
        box-shadow:
          0 18px 34px rgba(199, 139, 44, 0.08),
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.88) 0 0 0 1px inset,
          rgba(255, 255, 255, 0.05) 0 1px 0 0 inset;
      }

      .hero-meta-card-ok p:nth-of-type(2),
      .hero-meta-card-warning p:nth-of-type(2) {
        font-size: 1.05rem;
        line-height: 1.42;
        color: var(--ink);
      }

      .hero-next-step-summary strong {
        color: var(--ink);
      }

      .hero-meta-card p {
        margin: 0;
      }

      .hero-meta-card pre {
        margin-top: 0;
      }

      .hero-meta-card-ok pre,
      .hero-meta-card-warning pre {
        padding: 0.9rem;
        border-radius: 16px;
        background: rgba(10, 15, 12, 0.56);
        font-size: 0.98rem;
      }

      .hero-command-label {
        display: inline-flex;
        align-items: center;
        margin-bottom: 0.45rem;
        padding: 0.22rem 0.58rem;
        border-radius: 999px;
        background: rgba(63, 165, 107, 0.18);
        color: #dff5e8;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .hero-meta-card-quiet p:last-of-type {
        color: rgba(234, 238, 239, 0.74);
        font-size: 0.88rem;
        line-height: 1.38;
      }

      .verdict-strip {
        display: grid;
        grid-template-columns: minmax(0, 1.58fr) minmax(320px, 1fr);
        gap: 0.9rem;
        padding: 1rem;
        margin-bottom: 1rem;
        border-color: rgba(201, 90, 90, 0.34);
      }

      .verdict-copy h2 {
        margin: 0 0 0.35rem;
        font-size: clamp(1.72rem, 3.4vw, 2.6rem);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      .verdict-copy p {
        margin: 0;
      }

      .verdict-note {
        color: var(--muted);
        max-width: 60ch;
      }

      .verdict-facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.65rem;
        align-self: stretch;
      }

      .verdict-fact {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 0.82rem 0.9rem;
        background: rgba(255, 255, 255, 0.028);
        box-shadow:
          rgba(255, 255, 255, 0.035) 0 1px 0 0 inset,
          rgba(0, 0, 0, 0.16) 0 10px 18px -14px;
      }

      .verdict-fact strong {
        display: block;
        font-size: 1.03rem;
        line-height: 1.24;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.72rem;
        padding: 0.72rem;
        margin-bottom: 1rem;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
          var(--panel);
      }

      .summary-card h2 {
        margin: 0;
        font-size: 1.08rem;
        line-height: 1.18;
      }

      .summary-card p {
        margin: 0;
      }

      .summary-card {
        display: grid;
        gap: 0.52rem;
        min-height: 100%;
      }

      .summary-card-ok {
        border-color: rgba(76, 188, 118, 0.3);
      }

      .summary-card-warning {
        border-color: rgba(199, 139, 44, 0.3);
      }

      .summary-card-danger {
        border-color: rgba(201, 90, 90, 0.32);
      }

      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem 0.6rem;
      }

      .meta-row span {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .section {
        padding: 1rem;
        margin-bottom: 1rem;
      }

      .section-header {
        display: grid;
        gap: 0.35rem;
        margin-bottom: 0.85rem;
      }

      .section-header h2,
      .section-header p {
        margin: 0;
      }

      .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 0.82rem;
      }

      .section-card h3 {
        margin-top: 0;
        margin-bottom: 0.45rem;
      }

      .evidence-list,
      .ladder {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.8rem;
      }

      .evidence-list li,
      .ladder-step {
        display: grid;
        gap: 0.35rem;
        padding: 0.85rem;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.04);
      }

      .evidence-table {
        width: 100%;
        border-collapse: collapse;
      }

      .evidence-table th,
      .evidence-table td {
        text-align: left;
        padding: 0.65rem;
        border-top: 1px solid var(--line);
        vertical-align: top;
      }

      .evidence-table th {
        color: var(--muted);
      }

      pre {
        margin: 0;
        padding: 0.8rem;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .json-link-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
      }

      .json-link-grid a {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0.45rem 0.8rem;
        text-decoration: none;
        transition:
          opacity 160ms ease,
          border-color 160ms ease,
          transform 160ms ease;
      }

      .json-link-grid a:hover {
        opacity: 0.92;
        border-color: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
      }

      .section pre {
        margin-top: 0.85rem;
      }

      .evidence-stack {
        margin-bottom: 1rem;
        border: 1px solid var(--line);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.022), rgba(255, 255, 255, 0.01)),
          var(--panel);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.03) inset,
          0 18px 44px rgba(0, 0, 0, 0.3);
      }

      .evidence-stack summary {
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.9rem;
        padding: 0.9rem 1rem;
        color: var(--muted);
        transition:
          opacity 160ms ease,
          color 160ms ease;
      }

      .evidence-stack summary:hover {
        color: var(--ink);
        opacity: 0.96;
      }

      .evidence-stack-summary-copy {
        display: grid;
        gap: 0.24rem;
      }

      .evidence-stack-summary-title {
        color: var(--ink);
        font-weight: 700;
      }

      .evidence-stack-summary-peek {
        color: var(--muted);
        font-size: 0.9rem;
        line-height: 1.45;
      }

      .evidence-stack-summary-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem 0.56rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 0.74rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .evidence-stack-body {
        padding: 0 0.95rem 0.95rem;
      }

      .evidence-stack-intro {
        padding: 0.95rem 0.05rem 0.35rem;
      }

      .evidence-stack-intro p {
        margin: 0;
      }

      .diagnostic-tray-stack {
        display: grid;
        gap: 0.78rem;
      }

      .diagnostic-tray {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.015)),
          var(--panel-raised);
        box-shadow:
          rgba(27, 28, 30, 0.95) 0 0 0 1px,
          rgba(7, 8, 10, 0.88) 0 0 0 1px inset,
          rgba(255, 255, 255, 0.035) 0 1px 0 0 inset;
      }

      .diagnostic-tray summary {
        list-style: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.9rem;
        cursor: pointer;
        padding: 0.9rem 1rem;
      }

      .diagnostic-tray summary::-webkit-details-marker {
        display: none;
      }

      .diagnostic-tray-copy {
        display: grid;
        gap: 0.2rem;
      }

      .diagnostic-tray-badge,
      .diagnostic-tray-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem 0.56rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 0.74rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .diagnostic-tray-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--ink);
      }

      .diagnostic-tray-description {
        color: var(--muted);
        font-size: 0.93rem;
        line-height: 1.45;
      }

      .diagnostic-tray[open] .diagnostic-tray-toggle {
        color: var(--ink);
        border-color: rgba(255, 255, 255, 0.14);
      }

      .diagnostic-tray-body {
        padding: 0 0.9rem 0.9rem;
      }

      .diagnostic-tray-body .section {
        margin-bottom: 0;
      }

      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }

      @media (max-width: 760px) {
        .hero {
          grid-template-columns: 1fr;
        }

        .summary-grid,
        .verdict-strip,
        .verdict-facts,
        .hero-truth-strip {
          grid-template-columns: 1fr;
        }

        main {
          width: min(100vw - 1rem, 1220px);
          padding: 1rem 0 2rem;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#debug-workbench-main">Skip to main content</a>
    <main id="debug-workbench-main">
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-topline">
            <p class="eyebrow">Browser readiness check</p>
            <span class="hero-chip">Saved session and current browser</span>
          </div>
          <h1>${escapeHtml(debug.providerDisplayName)} browser readiness</h1>
          <p class="hero-intro">Start with one question: <strong>does this browser still look usable</strong>? This page compares saved session material with the current browser page, and it never invents green lights from missing evidence.</p>
      <div class="hero-actions">
            <a class="pill-link ${nextStepTone === "ok" ? "pill-link-primary" : "pill-link-warning"}" href="${escapeHtml(primaryWorkbenchActionHref)}">${escapeHtml(primaryWorkbenchActionLabel)}</a>
            <a class="pill-link pill-link-quiet" href="${escapeHtml(authPortalRoute)}">Back to auth portal</a>
            <a class="pill-link pill-link-quiet" href="${escapeHtml(debug.routes.debugSupportBundle)}" target="_blank" rel="noopener">Open support bundle</a>
          </div>
        </div>
        <div class="hero-meta">
          <article class="hero-meta-card hero-meta-card-${nextStepTone}">
            <p class="eyebrow eyebrow-compact">${escapeHtml(nextStepEyebrow)}</p>
            <p class="hero-next-step-summary"><strong>Next repair step:</strong> ${escapeHtml(nextStepSummary)}</p>
            ${nextStepDetail ? `<p>${escapeHtml(nextStepDetail)}</p>` : ""}
            ${nextStepCommand ? `<span class="hero-command-label">${escapeHtml(nextStepCommandLabel)}</span><pre>${escapeHtml(nextStepCommand)}</pre>` : ""}
          </article>
          <article class="hero-meta-card hero-meta-card-quiet">
            <p class="eyebrow eyebrow-compact">Browser connection</p>
            <p>${escapeHtml(debug.attachTarget.note)}</p>
            <div class="meta-row">
              ${renderOptionalCode("source", debug.attachTarget.source)}
              ${renderOptionalCode("cdp", debug.attachTarget.cdpUrl)}
            </div>
          </article>
        </div>
      </section>

      ${truthFocus ? renderPrimaryVerdict(debug, truthFocus) : ""}
      ${renderDetailedBrowserDiagnostics(sharedDiagnostic)}

      ${!truthFocus
        ? `<section class="summary-grid" aria-label="Provider readiness summary">
        ${renderSummaryCard(
          "Stored material",
          debug.storeReadiness.credentialState,
          debug.storeReadiness.note,
          storeMeta,
        )}
        ${renderSummaryCard(
          "Current browser",
          debug.liveReadiness.status,
          currentBrowserSummary,
          browserMeta,
        )}
        ${renderSummaryCard(
          "Runtime path",
          runtimePathStatus,
          runtimeSummary,
          [
            renderOptionalCode("policy", debug.runtime.degradedInvocationPolicy),
            renderOptionalCode("mode", debug.auth.modeLabel),
          ]
            .filter(Boolean)
            .join(""),
          debug.runtime.runtimeReadiness,
        )}
      </section>`
        : ""}
      ${renderEvidenceStack(
        debug,
        currentPageDiagnostic,
        currentConsoleDiagnostic,
        currentNetworkDiagnostic,
        Boolean(truthFocus),
      )}
    </main>
  </body>
</html>`;
}
