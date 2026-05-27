import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  collectLiveProofEnvStatus,
  runHtmlWebProbe,
  type WebLiveProofClassification,
  type WebLiveProofResult,
} from "../../../../lanes/web/src/live-proof.js";
import { urlHostnameMatches } from "../../shared/url-hosts.js";

export const GROK_WEB_LIVE_PROOF_ENV_NAMES = [
  "WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE",
  "WEBAI_BRIDGE_WEB_GROK_USER_AGENT",
] as const;

export const GROK_WEB_LIVE_PROOF_URL = "https://grok.com";
const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
const GROK_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const GROK_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
const LIVE_PROOF_RERUN_COMMAND = "pnpm exec node scripts/verify-web-login-live.mjs --provider grok";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const GROK_HUMAN_VERIFICATION_MARKERS = [
  "verify you are human",
  "human verification",
  "captcha",
  "are you human",
  "机器人验证",
] as const;
const GROK_ACCOUNT_ACTION_MARKERS = [
  "connect your x account",
  "关联你的",
  "unlock early features",
  "unlock extended capabilities",
  "upgrade to supergrok",
  "解锁早期功能",
  "解锁扩展能力",
  "升级到 supergrok",
  "free trial",
  "免费试用",
] as const;
const GROK_READY_HINT_MARKERS = [
  "ask grok",
  "how can i help",
  "需要我如何帮助你",
  "我能帮你做什么",
  "new chat",
  "history",
  "projects",
  "新建聊天",
  "历史记录",
  "项目",
] as const;
const GROK_LOGGED_OUT_MARKERS = [
  "sign in",
  "log in",
  "create account",
  "登录",
  "注册",
  "条款",
  "隐私政策",
  "privacy policy",
  "terms",
] as const;

function resolveGrokLiveProofCdpUrl(env: Record<string, string | undefined>) {
  const browserMode = env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]?.trim();

  return (
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    ((browserMode === ISOLATED_CHROME_ROOT_MODE ||
      browserMode === LEGACY_EXISTING_PROFILE_MODE)
      ? env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        GROK_WEB_DEFAULT_ISOLATED_CDP_URL
      : GROK_WEB_DEFAULT_CDP_URL)
  );
}
const GROK_CDP_RETRY_DELAY_MS = 500;

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isRecoverableGrokCdpConnectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("connectovercdp") ||
    message.includes("timeout 30000ms exceeded") ||
    message.includes("econnrefused") ||
    message.includes("browser has been closed")
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectGrokBrowserWithRetry(
  cdpUrl: string,
  connectOverCDP: typeof chromium.connectOverCDP,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await connectOverCDP(cdpUrl);
    } catch (error) {
      lastError = error;

      if (!isRecoverableGrokCdpConnectError(error) || attempt === 2) {
        throw error;
      }

      await wait(GROK_CDP_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Grok CDP connection failed for ${cdpUrl}.`);
}

function isExecutionContextDestroyed(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("execution context was destroyed") ||
    message.includes("cannot find context with specified id") ||
    message.includes("frame was detached") ||
    message.includes("net::err_aborted")
  );
}

function detectGrokWorkspaceBlocker(
  lowerText: string,
  hasComposerSurface: boolean,
): GrokBrowserWorkspaceFailureVerdict | undefined {
  if (includesAny(lowerText, GROK_HUMAN_VERIFICATION_MARKERS)) {
    return {
      ok: false,
      classification: "human-verification-required",
      diagnostic:
        "Grok browser workspace proof reached grok.com, but the attached browser is blocked on a human-verification or anti-bot gate.",
      summary:
        "Grok browser workspace still requires human verification before the live composer can run.",
    };
  }

  if (
    includesAny(lowerText, GROK_ACCOUNT_ACTION_MARKERS) &&
    (!hasComposerSurface || !includesAny(lowerText, GROK_READY_HINT_MARKERS))
  ) {
    return {
      ok: false,
      classification: "user-action-required",
      diagnostic:
        "Grok browser workspace proof reached grok.com, but the attached browser still requires an end-user account action such as linking an X account or unlocking the required plan before the live composer is usable.",
      summary:
        "Grok browser workspace still requires an account action such as linking X or unlocking the required plan.",
    };
  }

  return undefined;
}

interface GrokBrowserWorkspaceSuccessVerdict {
  ok: true;
  signal: string;
  summary: string;
}

interface GrokBrowserWorkspaceFailureVerdict {
  ok: false;
  classification: WebLiveProofClassification;
  diagnostic: string;
  summary: string;
}

async function ensureGrokBrowserPage(
  context: BrowserContext,
) {
  const existingPage = context
    .pages()
    .find((page: Page) => urlHostnameMatches(page.url(), "grok.com"));

  if (existingPage) {
    if (typeof existingPage.bringToFront === "function") {
      await existingPage.bringToFront().catch(() => {});
    }
    await existingPage.waitForTimeout(1_500);
    return existingPage;
  }

  const page = await context.newPage();
  await page.goto(GROK_WEB_LIVE_PROOF_URL, {
    waitUntil: "domcontentloaded",
  }).catch(() => {});
  await page.waitForTimeout(1_500);
  return page;
}

export async function captureGrokBrowserWorkspaceSnapshot(page: Page) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => {});

      const snapshot = await page.evaluate(() => {
        const dom = globalThis as unknown as {
          document: {
            querySelector: (selector: string) => any;
            body: { innerText?: string } | null;
          };
          location: { href: string };
        };
        const bodyText = `${dom.document.body?.innerText ?? ""}`.replace(/\s+/g, " ").trim();
        const composerSelectors = [
          '[contenteditable="true"]',
          'div[role="textbox"]',
          "textarea[placeholder]",
          "textarea",
        ];
        const hasComposerSurface = composerSelectors.some((selector) => {
          const element = dom.document.querySelector(selector);
          return Boolean(element && element.offsetParent !== null);
        });

        return {
          finalUrl: dom.location.href,
          bodyText,
          hasComposerSurface,
        };
      });

      if (snapshot.bodyText || snapshot.hasComposerSurface || attempt === 4) {
        return snapshot;
      }

      await page.waitForTimeout(500);
      continue;
    } catch (error) {
      lastError = error;

      if (!isExecutionContextDestroyed(error) || attempt === 4) {
        throw error;
      }

      await page.waitForTimeout(300);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Grok browser workspace snapshot failed without a captured error.");
}

export function validateGrokBrowserWorkspaceSnapshot(snapshot: {
  finalUrl: string;
  bodyText: string;
  hasComposerSurface: boolean;
}): GrokBrowserWorkspaceSuccessVerdict | GrokBrowserWorkspaceFailureVerdict {
  const lowerText = snapshot.bodyText.toLowerCase();

  if (!urlHostnameMatches(snapshot.finalUrl, "grok.com")) {
    return {
      ok: false,
      classification: "session-incomplete",
      diagnostic:
        "Grok browser workspace proof redirected away from grok.com, so the attached browser session is not proven yet.",
      summary: snapshot.finalUrl,
    };
  }

  const blocker = detectGrokWorkspaceBlocker(lowerText, snapshot.hasComposerSurface);

  if (blocker) {
    return blocker;
  }

  if (includesAny(lowerText, GROK_LOGGED_OUT_MARKERS)) {
    return {
      ok: false,
      classification: "session-incomplete",
      diagnostic:
        "Grok browser workspace proof reached grok.com, but the page still shows login/signup or public-landing markers instead of an authenticated workspace.",
      summary: snapshot.finalUrl,
    };
  }

  if (
    includesAny(lowerText, [
      "sign in",
      "log in",
      "create account",
    ]) ||
    !snapshot.hasComposerSurface
  ) {
    return {
      ok: false,
      classification: "session-incomplete",
      diagnostic:
        "Grok browser workspace proof reached grok.com, but the attached browser still looks unauthenticated or is missing the live composer surface.",
      summary: snapshot.finalUrl,
    };
  }

  return {
    ok: true,
    signal: "grok-home-composer",
    summary:
      "Grok workspace/composer page looked authenticated in the attached local browser session.",
  };
}

export async function runGrokBrowserWorkspaceProof(
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: typeof chromium.connectOverCDP = chromium.connectOverCDP.bind(chromium),
): Promise<WebLiveProofResult> {
  const envStatus = collectLiveProofEnvStatus(GROK_WEB_LIVE_PROOF_ENV_NAMES, env);

  if (
    !env.WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE?.trim() ||
    !env.WEBAI_BRIDGE_WEB_GROK_USER_AGENT?.trim()
  ) {
    return {
      status: "external-blocker",
      provider: "grok",
      blocker: "missing-web-session-material",
      probeUrl: GROK_WEB_LIVE_PROOF_URL,
      envStatus,
      missingEnvNames: envStatus.filter((entry) => !entry.present).map((entry) => entry.name),
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
    };
  }

  const cdpUrl = resolveGrokLiveProofCdpUrl(env);
  let browser: Awaited<ReturnType<typeof connectOverCDP>> | undefined;

  try {
    browser = await connectGrokBrowserWithRetry(cdpUrl, connectOverCDP);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    const page = await ensureGrokBrowserPage(context);
    const snapshot = await captureGrokBrowserWorkspaceSnapshot(page);
    const verdict = validateGrokBrowserWorkspaceSnapshot(snapshot);

    if (!verdict.ok) {
      return {
        status: "failure",
        provider: "grok",
        classification: verdict.classification,
        probeUrl: GROK_WEB_LIVE_PROOF_URL,
        finalUrl: snapshot.finalUrl,
        reason: "probe-unexpected-body",
        diagnostic:
          verdict.diagnostic ??
          "Unknown Grok browser workspace proof failure.",
        summary: verdict.summary ?? snapshot.finalUrl,
        envStatus,
      };
    }

    return {
      status: "success",
      provider: "grok",
      probeUrl: GROK_WEB_LIVE_PROOF_URL,
      finalUrl: snapshot.finalUrl,
      responseStatus: 200,
      responseKind: "html",
      signal: `${verdict.signal ?? "grok-home-composer"}-browser-dom`,
      summary:
        verdict.summary ??
        "Grok workspace/composer page looked authenticated in the attached local browser session.",
      envStatus,
    };
  } catch (error) {
    return {
      status: "failure",
      provider: "grok",
      classification: "provider-unavailable",
      probeUrl: GROK_WEB_LIVE_PROOF_URL,
      reason: "probe-request-failed",
      diagnostic:
        error instanceof Error ? error.message : "Unknown Grok browser workspace proof failure.",
      envStatus,
    };
  } finally {
    await browser?.close();
  }
}

export async function runGrokWebLiveProof(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<WebLiveProofResult> {
  if (env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()) {
    return runGrokBrowserWorkspaceProof(env);
  }

  return runHtmlWebProbe(
    {
      provider: "grok",
      probeUrl: GROK_WEB_LIVE_PROOF_URL,
      requiredEnvNames: GROK_WEB_LIVE_PROOF_ENV_NAMES,
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
      buildHeaders(resolvedEnv) {
        return {
          accept: "text/html,application/xhtml+xml",
          cookie: resolvedEnv.WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE,
          "user-agent": resolvedEnv.WEBAI_BRIDGE_WEB_GROK_USER_AGENT,
        };
      },
      validate({ html, response }) {
        const lowerHtml = html.toLowerCase();
        const finalUrl = response.url || GROK_WEB_LIVE_PROOF_URL;

        if (!urlHostnameMatches(finalUrl, "grok.com")) {
          return {
            ok: false,
            classification: "session-incomplete",
            diagnostic:
              "Grok live probe redirected away from grok.com, so the browser session is not proven yet.",
            summary: finalUrl,
          };
        }

        const blocker = detectGrokWorkspaceBlocker(lowerHtml, lowerHtml.includes("composer"));

        if (blocker) {
          return blocker;
        }

        if (
          !includesAny(lowerHtml, ["grok", "composer"]) ||
          includesAny(lowerHtml, ["sign in", "log in", "create account"])
        ) {
          return {
            ok: false,
            classification: "session-incomplete",
            diagnostic:
              "Grok live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
            summary: finalUrl,
          };
        }

        return {
          ok: true,
          signal: "grok-home-composer",
          summary:
            "Grok home/composer page responded with authenticated-looking HTML markers for the browser session.",
        };
      },
    },
    env,
    fetchFn,
  );
}
