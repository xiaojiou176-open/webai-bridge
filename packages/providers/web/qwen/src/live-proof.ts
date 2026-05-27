import {
  collectLiveProofEnvStatus,
  runJsonWebProbe,
  type WebLiveProofResult,
} from "../../../../lanes/web/src/live-proof.js";
import { chromium, type BrowserContext, type Page } from "playwright-core";

export const QWEN_WEB_LIVE_PROOF_ENV_NAMES = [
  "WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE",
  "WEBAI_BRIDGE_WEB_QWEN_USER_AGENT",
] as const;

export const QWEN_WEB_LIVE_PROOF_URL = "https://chat.qwen.ai";
export const QWEN_WEB_SESSION_PROBE_URL = "https://chat.qwen.ai/api/v2/chats/new";
const LIVE_PROOF_RERUN_COMMAND = "pnpm exec node scripts/verify-web-login-live.mjs --provider qwen";
const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
const QWEN_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const QWEN_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function resolveQwenCdpUrl(env: Record<string, string | undefined>) {
  const browserMode = env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]?.trim();

  return (
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    ((browserMode === ISOLATED_CHROME_ROOT_MODE ||
      browserMode === LEGACY_EXISTING_PROFILE_MODE)
      ? env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        QWEN_WEB_DEFAULT_ISOLATED_CDP_URL
      : QWEN_WEB_DEFAULT_CDP_URL)
  );
}

async function ensureQwenBrowserPage(context: BrowserContext): Promise<Page> {
  const existingPage = context.pages().find((page) => page.url().includes("qwen.ai"));

  if (existingPage) {
    await existingPage.goto(QWEN_WEB_LIVE_PROOF_URL, {
      waitUntil: "domcontentloaded",
    });

    return existingPage;
  }

  const page = await context.newPage();
  await page.goto(QWEN_WEB_LIVE_PROOF_URL, {
    waitUntil: "domcontentloaded",
  });

  return page;
}

async function captureQwenBrowserWorkspaceSnapshot(
  page: Page,
): Promise<QwenBrowserWorkspaceSnapshot> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 2_000 });
  } catch {
    // Best effort only. SPA transitions do not always settle.
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
      finalUrl: browserGlobal.location?.href ?? QWEN_WEB_LIVE_PROOF_URL,
      text: `${title}\n${bodyText}`,
      hasComposerSurface,
    };
  });
}

export interface QwenBrowserWorkspaceSnapshot {
  finalUrl: string;
  text: string;
  hasComposerSurface: boolean;
}

export function validateQwenBrowserWorkspaceSnapshot(
  snapshot: QwenBrowserWorkspaceSnapshot,
): { ok: true; signal: string; summary: string } | { ok: false; diagnostic: string; summary?: string } {
  const finalUrl = snapshot.finalUrl || QWEN_WEB_LIVE_PROOF_URL;
  const lowerText = snapshot.text.toLowerCase();
  const hasWorkspaceMarker =
    snapshot.hasComposerSurface ||
    includesAny(lowerText, [
      "qwen",
      "workspace",
      "composer",
      "qwen3",
      "新建对话",
      "搜索对话",
      "社区",
      "coder",
      "有什么我能帮您的吗",
      "有什么我能帮您的",
    ]);
  const hasLoginMarker = includesAny(lowerText, ["sign in", "log in", "登录", "注册"]);

  if (!finalUrl.includes("chat.qwen.ai")) {
    return {
      ok: false,
      diagnostic:
        "Qwen live probe redirected away from chat.qwen.ai, so the browser session is not proven yet.",
      summary: finalUrl,
    };
  }

  if (!hasWorkspaceMarker || hasLoginMarker) {
    return {
      ok: false,
      diagnostic:
        "Qwen live probe reached the page, but the HTML markers still look like an unauthenticated or incomplete session.",
      summary: finalUrl,
    };
  }

  return {
    ok: true,
    signal: "qwen-workspace-composer",
    summary:
      "Qwen workspace/composer page responded with authenticated-looking HTML markers for the browser session.",
  };
}

export function reconcileQwenLiveProofResults(args: {
  apiProofResult: WebLiveProofResult;
  browserProofResult?: WebLiveProofResult;
}): WebLiveProofResult {
  if (!args.browserProofResult) {
    return args.apiProofResult;
  }

  if (
    args.apiProofResult.status === "success" &&
    args.browserProofResult.status !== "success"
  ) {
    return args.browserProofResult;
  }

  return args.apiProofResult;
}

export async function runQwenWebLiveProof(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<WebLiveProofResult> {
  const apiProofResult = await runJsonWebProbe(
    {
      provider: "qwen",
      probeUrl: QWEN_WEB_SESSION_PROBE_URL,
      requiredEnvNames: QWEN_WEB_LIVE_PROOF_ENV_NAMES,
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
      requestInit: {
        method: "POST",
        body: JSON.stringify({}),
      },
      buildHeaders(resolvedEnv) {
        return {
          accept: "application/json, text/event-stream, */*",
          cookie: resolvedEnv.WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE,
          "content-type": "application/json",
          "user-agent": resolvedEnv.WEBAI_BRIDGE_WEB_QWEN_USER_AGENT,
        };
      },
      validate(body, response) {
        if (typeof body !== "object" || body == null) {
          return {
            ok: false,
            diagnostic: "Qwen session probe did not return a JSON object.",
          };
        }

        const record = body as {
          success?: boolean;
          data?: { id?: string; code?: string; details?: string; message?: string };
        };
        const lowerCode = `${record.data?.code ?? ""}`.toLowerCase();
        const lowerDetails = `${record.data?.details ?? record.data?.message ?? ""}`.toLowerCase();

        if (
          record.success === false &&
          (lowerCode === "unauthorized" ||
            lowerDetails.includes("do not have permission") ||
            lowerDetails.includes("contact your administrator"))
        ) {
          return {
            ok: false,
            classification: "user-action-required",
            diagnostic:
              "Qwen authenticated workspace is visible, but the browser-side chat bootstrap endpoint is currently returning Unauthorized. The end user must restore the session or permission scope before live invocation can continue.",
            summary: response.url || QWEN_WEB_SESSION_PROBE_URL,
          };
        }

        if (!record.success || typeof record.data?.id !== "string") {
          return {
            ok: false,
            diagnostic:
              "Qwen session probe did not return a fresh authenticated chat bootstrap id.",
            summary: response.url || QWEN_WEB_SESSION_PROBE_URL,
          };
        }

        return {
          ok: true,
          signal: "qwen-chat-bootstrap",
          summary:
            "Qwen authenticated chat bootstrap endpoint returned a fresh chat id for the browser session.",
        };
      },
    },
    env,
    fetchFn,
  );

  if (apiProofResult.status === "external-blocker") {
    return apiProofResult;
  }

  if (!env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()) {
    return apiProofResult;
  }

  const browserProofResult = await runQwenBrowserWorkspaceProof(env);
  return reconcileQwenLiveProofResults({
    apiProofResult,
    browserProofResult,
  });
}

export async function runQwenBrowserWorkspaceProof(
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: (endpointURL: string) => ReturnType<typeof chromium.connectOverCDP> = (
    endpointURL,
  ) => chromium.connectOverCDP(endpointURL),
): Promise<WebLiveProofResult> {
  const envStatus = collectLiveProofEnvStatus(QWEN_WEB_LIVE_PROOF_ENV_NAMES, env);
  const cookieBundle = env.WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE?.trim();

  if (!cookieBundle || !env.WEBAI_BRIDGE_WEB_QWEN_USER_AGENT?.trim()) {
    return {
      status: "external-blocker",
      provider: "qwen",
      blocker: "missing-web-session-material",
      probeUrl: QWEN_WEB_LIVE_PROOF_URL,
      envStatus,
      missingEnvNames: envStatus.filter((entry) => !entry.present).map((entry) => entry.name),
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
    };
  }

  const cdpUrl = resolveQwenCdpUrl(env);
  let browser: Awaited<ReturnType<typeof connectOverCDP>> | undefined;

  try {
    browser = await connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    const page = await ensureQwenBrowserPage(context);
    const snapshot = await captureQwenBrowserWorkspaceSnapshot(page);
    const verdict = validateQwenBrowserWorkspaceSnapshot(snapshot);

    if (!verdict.ok) {
      return {
        status: "failure",
        provider: "qwen",
        probeUrl: QWEN_WEB_LIVE_PROOF_URL,
        finalUrl: snapshot.finalUrl,
        reason: "probe-unexpected-body",
        diagnostic: verdict.diagnostic,
        summary: verdict.summary,
        envStatus,
      };
    }

    return {
      status: "success",
      provider: "qwen",
      probeUrl: QWEN_WEB_LIVE_PROOF_URL,
      finalUrl: snapshot.finalUrl,
      responseStatus: 200,
      responseKind: "html",
      signal: `${verdict.signal}-browser-dom`,
      summary:
        "Qwen workspace/composer page looked authenticated in the attached local browser session.",
      envStatus,
    };
  } catch (error) {
    return {
      status: "failure",
      provider: "qwen",
      probeUrl: QWEN_WEB_LIVE_PROOF_URL,
      reason: "probe-request-failed",
      diagnostic:
        error instanceof Error ? error.message : "Unknown Qwen browser workspace proof failure.",
      envStatus,
    };
  } finally {
    await browser?.close();
  }
}
