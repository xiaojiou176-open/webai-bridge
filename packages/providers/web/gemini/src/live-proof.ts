import {
  collectLiveProofEnvStatus,
  runHtmlWebProbe,
  type WebLiveProofClassification,
  type WebLiveProofResult,
} from "../../../../lanes/web/src/live-proof.js";
import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  urlHostnameHasRootDomain,
  urlHostnameMatches,
  urlPathStartsWithSegments,
} from "../../shared/url-hosts.js";

export const GEMINI_WEB_LIVE_PROOF_ENV_NAMES = [
  "WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE",
  "WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT",
] as const;

export const GEMINI_WEB_LIVE_PROOF_URL = "https://gemini.google.com/app";
const LIVE_PROOF_RERUN_COMMAND = "pnpm exec node scripts/verify-web-login-live.mjs --provider gemini";
const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const GEMINI_WEB_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
const GEMINI_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const GEMINI_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const GEMINI_HUMAN_VERIFICATION_MARKERS = [
  "unusual traffic",
  "abnormal traffic",
  "not a robot",
  "自动程序",
  "异常流量",
  "确认这些请求是由您",
] as const;
const GEMINI_RATE_LIMIT_MARKERS = [
  "rate limit",
  "usage limit",
  "usage cap",
  "too many requests",
  "reached your limit",
  "reached the limit",
  "已达到使用上限",
  "达到限制",
  "请求过多",
] as const;

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function resolveGeminiLiveProofCdpUrl(env: Record<string, string | undefined>) {
  const browserMode = env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]?.trim();
  const shouldUseIsolatedRoot =
    !browserMode ||
    browserMode === ISOLATED_CHROME_ROOT_MODE ||
    browserMode === LEGACY_EXISTING_PROFILE_MODE;

  return (
    env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim() ||
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    (shouldUseIsolatedRoot
      ? env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        GEMINI_WEB_DEFAULT_ISOLATED_CDP_URL
      : GEMINI_WEB_DEFAULT_CDP_URL)
  );
}

async function navigateToGeminiWorkspace(page: Page) {
  try {
    await page.goto(GEMINI_WEB_LIVE_PROOF_URL, {
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (!error.message.toLowerCase().includes("net::err_aborted") &&
        !error.message.toLowerCase().includes("frame was detached")) ||
      !isGeminiWorkspaceUrl(page.url())
    ) {
      throw error;
    }
  }
}

function isGeminiWorkspaceUrl(value: string): boolean {
  return (
    urlHostnameMatches(value, "gemini.google.com") &&
    urlPathStartsWithSegments(value, ["app"])
  );
}

function isGeminiSorryUrl(value: string): boolean {
  return (
    urlHostnameHasRootDomain(value, "google.com") &&
    urlPathStartsWithSegments(value, ["sorry", "index"])
  );
}

function isGeminiSorryContinuationUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return [...parsed.searchParams.values()].some((candidate) => {
      try {
        return urlHostnameMatches(decodeURIComponent(candidate), "gemini.google.com");
      } catch {
        return urlHostnameMatches(candidate, "gemini.google.com");
      }
    });
  } catch {
    return false;
  }
}

export interface GeminiBrowserWorkspaceSnapshot {
  finalUrl: string;
  text: string;
  hasComposerSurface: boolean;
}

export function isGeminiHumanVerificationSnapshot(
  snapshot: GeminiBrowserWorkspaceSnapshot,
): boolean {
  const finalUrl = snapshot.finalUrl || GEMINI_WEB_LIVE_PROOF_URL;
  const lowerText = `${snapshot.text ?? ""}`.toLowerCase();

  return (
    isGeminiSorryUrl(finalUrl) ||
    includesAny(lowerText, GEMINI_HUMAN_VERIFICATION_MARKERS)
  );
}

export function isGeminiRateLimitedSnapshot(
  snapshot: GeminiBrowserWorkspaceSnapshot,
): boolean {
  const lowerText = `${snapshot.text ?? ""}`.toLowerCase();

  return includesAny(lowerText, GEMINI_RATE_LIMIT_MARKERS);
}

async function ensureGeminiBrowserPage(context: BrowserContext): Promise<Page> {
  const candidatePages = [...context.pages()].reverse().filter((page) => {
    const url = page.url();

    return (
      urlHostnameMatches(url, "gemini.google.com") ||
      (isGeminiSorryUrl(url) && isGeminiSorryContinuationUrl(url))
    );
  });
  let verificationPage: Page | undefined;

  for (const page of candidatePages) {
    const snapshot = await captureGeminiBrowserWorkspaceSnapshot(page).catch(() => undefined);

    if (!snapshot) {
      continue;
    }

    if (validateGeminiBrowserWorkspaceSnapshot(snapshot).ok) {
      await page.bringToFront().catch(() => {});
      await page.waitForLoadState("domcontentloaded", { timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      return page;
    }

    if (!verificationPage && isGeminiHumanVerificationSnapshot(snapshot)) {
      verificationPage = page;
    }
  }

  if (verificationPage) {
    return verificationPage;
  }

  const page = await context.newPage();
  await navigateToGeminiWorkspace(page);
  await page.waitForTimeout(1_500);

  return page;
}

async function captureGeminiBrowserWorkspaceSnapshot(
  page: Page,
): Promise<GeminiBrowserWorkspaceSnapshot> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 2_000 });
  } catch {
    // SPA transitions do not always settle cleanly.
  }

  return page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      document: {
        body: { innerText?: string } | null;
        title?: string;
        querySelector(selector: string): unknown;
      };
      location?: { href?: string };
    };
    const bodyText = browserGlobal.document.body?.innerText ?? "";
    const title = browserGlobal.document.title ?? "";
    const hasComposerSurface = Boolean(
      browserGlobal.document.querySelector("textarea, [contenteditable='true'], [role='textbox']"),
    );

    return {
      finalUrl: browserGlobal.location?.href ?? GEMINI_WEB_LIVE_PROOF_URL,
      text: `${title}\n${bodyText}`,
      hasComposerSurface,
    };
  });
}

export function validateGeminiBrowserWorkspaceSnapshot(
  snapshot: GeminiBrowserWorkspaceSnapshot,
): { ok: true; signal: string; summary: string } | {
  ok: false;
  classification?: WebLiveProofClassification;
  diagnostic: string;
  summary?: string;
} {
  const finalUrl = snapshot.finalUrl || GEMINI_WEB_LIVE_PROOF_URL;
  const lowerText = `${snapshot.text ?? ""}`.toLowerCase();
  const hasWorkspaceMarker =
    snapshot.hasComposerSurface ||
    includesAny(lowerText, [
      "gemini",
      "composer",
      "google ai",
      "deep research",
      "canvas",
      "新对话",
      "发送消息",
    ]);
  const hasLoginMarker = includesAny(lowerText, [
    "sign in",
    "log in",
    "choose an account",
    "to continue to gemini",
  ]);

  if (isGeminiHumanVerificationSnapshot(snapshot)) {
    return {
      ok: false,
      diagnostic:
        "Gemini browser workspace is currently on Google's abnormal-traffic verification page, so a human must clear that check before live invocation can continue.",
      summary: finalUrl,
    };
  }

  if (isGeminiRateLimitedSnapshot(snapshot)) {
    return {
      ok: false,
      classification: "provider-unavailable",
      diagnostic:
        "Gemini browser workspace is currently showing a visible rate-limit or usage-cap gate, so live invocation must wait for provider capacity or a plan upgrade before continuing.",
      summary: finalUrl,
    };
  }

  if (!isGeminiWorkspaceUrl(finalUrl)) {
    return {
      ok: false,
      diagnostic:
        "Gemini browser workspace proof redirected away from gemini.google.com, so the attached browser session is not proven yet.",
      summary: finalUrl,
    };
  }

  if (!hasWorkspaceMarker || hasLoginMarker) {
    return {
      ok: false,
      diagnostic:
        "Gemini browser workspace proof reached the page, but the DOM markers still look like an unauthenticated or incomplete session.",
      summary: finalUrl,
    };
  }

  return {
    ok: true,
    signal: "gemini-app-page",
    summary:
      "Gemini browser workspace looked authenticated in the attached local browser session.",
  };
}

export async function runGeminiBrowserWorkspaceProof(
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: typeof chromium.connectOverCDP = chromium.connectOverCDP.bind(chromium),
): Promise<WebLiveProofResult> {
  const envStatus = collectLiveProofEnvStatus(GEMINI_WEB_LIVE_PROOF_ENV_NAMES, env);
  const cookieBundle = env.WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE?.trim();

  if (!cookieBundle || !env.WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT?.trim()) {
    return {
      status: "external-blocker",
      provider: "gemini",
      blocker: "missing-web-session-material",
      probeUrl: GEMINI_WEB_LIVE_PROOF_URL,
      envStatus,
      missingEnvNames: envStatus.filter((entry) => !entry.present).map((entry) => entry.name),
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
    };
  }

  const cdpUrl = resolveGeminiLiveProofCdpUrl(env);
  let browser: Awaited<ReturnType<typeof connectOverCDP>> | undefined;

  try {
    browser = await connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    const page = await ensureGeminiBrowserPage(context);
    const snapshot = await captureGeminiBrowserWorkspaceSnapshot(page);
    const verdict = validateGeminiBrowserWorkspaceSnapshot(snapshot);

    if (!verdict.ok) {
      return {
        status: "failure",
        provider: "gemini",
        classification: verdict.classification,
        probeUrl: GEMINI_WEB_LIVE_PROOF_URL,
        finalUrl: snapshot.finalUrl,
        reason: "probe-unexpected-body",
        diagnostic: verdict.diagnostic,
        summary: verdict.summary,
        envStatus,
      };
    }

    return {
      status: "success",
      provider: "gemini",
      probeUrl: GEMINI_WEB_LIVE_PROOF_URL,
      finalUrl: snapshot.finalUrl,
      responseStatus: 200,
      responseKind: "html",
      signal: `${verdict.signal}-browser-dom`,
      summary: verdict.summary,
      envStatus,
    };
  } catch (error) {
    return {
      status: "failure",
      provider: "gemini",
      probeUrl: GEMINI_WEB_LIVE_PROOF_URL,
      reason: "probe-request-failed",
      diagnostic:
        error instanceof Error
          ? error.message
          : "Unknown Gemini browser workspace proof failure.",
      envStatus,
    };
  } finally {
    await browser?.close();
  }
}

export async function runGeminiWebLiveProof(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<WebLiveProofResult> {
  if (
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()
  ) {
    const browserProofResult = await runGeminiBrowserWorkspaceProof(env);

    if (
      browserProofResult.status === "success" ||
      browserProofResult.status === "external-blocker"
    ) {
      return browserProofResult;
    }
  }

  return runHtmlWebProbe(
    {
      provider: "gemini",
      probeUrl: GEMINI_WEB_LIVE_PROOF_URL,
      requiredEnvNames: GEMINI_WEB_LIVE_PROOF_ENV_NAMES,
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
      buildHeaders(resolvedEnv) {
        return {
          accept: "text/html,application/xhtml+xml",
          cookie: resolvedEnv.WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE,
          "user-agent": resolvedEnv.WEBAI_BRIDGE_WEB_GEMINI_USER_AGENT,
        };
      },
      validate({ html, response }) {
        const lowerHtml = html.toLowerCase();
        const finalUrl = response.url || GEMINI_WEB_LIVE_PROOF_URL;

        if (!urlHostnameMatches(finalUrl, "gemini.google.com")) {
          return {
            ok: false,
            diagnostic:
              "Gemini live probe redirected away from gemini.google.com, so the OAuth/browser session is not proven yet.",
            summary: finalUrl,
          };
        }

        if (
          !includesAny(lowerHtml, ["gemini", "composer"]) ||
          includesAny(lowerHtml, ["sign in", "log in", "choose an account"])
        ) {
          return {
            ok: false,
            diagnostic:
              "Gemini live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
            summary: finalUrl,
          };
        }

        return {
          ok: true,
          signal: "gemini-app-page",
          summary:
            "Gemini app page responded with authenticated-looking HTML markers for the browser session.",
        };
      },
    },
    env,
    fetchFn,
  );
}
