import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  GEMINI_WEB_LIVE_PROOF_ENV_NAMES,
  isGeminiHumanVerificationSnapshot,
  validateGeminiBrowserWorkspaceSnapshot,
  type GeminiBrowserWorkspaceSnapshot,
} from "./live-proof.js";
import { resolveRequiredEnvValues } from "../../shared/http-transport.js";
import {
  urlHasPathPrefix,
  urlHostnameHasRootDomain,
  urlHostnameMatches,
  urlPathStartsWithSegments,
} from "../../shared/url-hosts.js";

export const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
export const GEMINI_WEB_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL";
export const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
export const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
export const GEMINI_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
export const GEMINI_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
export const GEMINI_WEB_APP_URL = "https://gemini.google.com/app";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const GEMINI_RATE_LIMIT_TEXT_PATTERNS = [
  "rate limit",
  "too many requests",
  "please try again later",
  "try again later",
  "usage limit",
  "reached your limit",
  "请求过多",
  "请稍后再试",
  "达到限制",
  "使用上限",
];

type ConnectOverCDP = (
  endpointURL: string,
) => ReturnType<typeof chromium.connectOverCDP>;

function resolveGeminiBrowserCdpUrl(env: Record<string, string | undefined>) {
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

function isGeminiChallengeUrl(url: string): boolean {
  return (
    urlHasPathPrefix(url, "accounts.google.com", "/CookieMismatch") ||
    (urlHostnameHasRootDomain(url, "google.com") &&
      urlPathStartsWithSegments(url, ["sorry"]))
  );
}

function isExecutionContextDestroyed(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("execution context was destroyed") ||
    message.includes("cannot find context with specified id")
  );
}

function shouldRetryGeminiPrompt(error: Error): boolean {
  const message = error.message.toLowerCase();

  return (
    message.includes("execution context was destroyed") ||
    message.includes("cannot find context with specified id") ||
    message.includes("net::err_aborted") ||
    message.includes("frame was detached") ||
    message.includes("did not observe a completed model response")
  );
}

function isGeminiAppUrl(value: string): boolean {
  return (
    urlHostnameMatches(value, "gemini.google.com") &&
    urlPathStartsWithSegments(value, ["app"])
  );
}

async function navigateToGeminiApp(page: Page) {
  try {
    await page.goto(GEMINI_WEB_APP_URL, {
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (!error.message.toLowerCase().includes("net::err_aborted") &&
        !error.message.toLowerCase().includes("frame was detached")) ||
      !isGeminiAppUrl(page.url())
    ) {
      throw error;
    }
  }
}

async function evaluateWithNavigationRetry<T>(
  page: Page,
  evaluator: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await evaluator();
    } catch (error) {
      lastError = error;

      if (!isExecutionContextDestroyed(error) || attempt === 2) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini DOM evaluation failed without a captured error.");
}

function normalizeGeminiAssistantCandidate(candidate: string): string {
  return candidate
    .replace(/^显示思路\s*/i, "")
    .replace(/^gemini\s*(说|says)\s*/i, "")
    .trim();
}

export function selectGeminiAssistantReply(args: {
  requestedToken: string;
  assistantCandidates: string[];
  structuredReply: string;
  fallbackCandidates: string[];
}): string {
  const normalizedAssistantCandidates = args.assistantCandidates
    .map(normalizeGeminiAssistantCandidate)
    .filter((candidate) => candidate.length > 0);
  const normalizedStructuredReply = normalizeGeminiAssistantCandidate(
    args.structuredReply,
  );

  if (args.requestedToken) {
    const upperToken = args.requestedToken.toUpperCase();
    const tokenMatch =
      normalizedAssistantCandidates.find((candidate) =>
        candidate.toUpperCase().includes(upperToken),
      ) ??
      (normalizedStructuredReply.toUpperCase().includes(upperToken)
        ? normalizedStructuredReply
        : undefined) ??
      args.fallbackCandidates.find((candidate) =>
        candidate.toUpperCase().includes(upperToken),
      );

    if (tokenMatch) {
      return tokenMatch;
    }
  }

  return (
    normalizedAssistantCandidates.at(-1) ??
    normalizedStructuredReply ??
    args.fallbackCandidates.at(-1) ??
    ""
  );
}

async function ensureGeminiPage(context: BrowserContext): Promise<{
  page: Page;
  ownedPage: boolean;
}> {
  const existingPage = [...context.pages()].reverse().find((page) =>
    urlHostnameMatches(page.url(), "gemini.google.com"),
  );
  const page = existingPage ?? await context.newPage();
  if (typeof page.bringToFront === "function") {
    await page.bringToFront().catch(() => {});
  }

  if (!existingPage) {
    await navigateToGeminiApp(page);
  }

  await page.waitForTimeout(1_500);
  return {
    page,
    ownedPage: !existingPage,
  };
}

async function startFreshGeminiConversation(page: Page) {
  const selectors = [
    'button[aria-label*="发起新对话"]',
    'button[aria-label*="New"]',
    'a[aria-label*="发起新对话"]',
    'a[aria-label*="New"]',
    'a[href="/app"]',
  ];

  for (const selector of selectors) {
    try {
      await page.locator(selector).first().click({
        force: true,
        timeout: 1_500,
      });
      await page.waitForURL(/^https:\/\/gemini\.google\.com\/app(?:[/?#].*)?$/, {
        timeout: 4_000,
      }).catch(() => {});
      await page.waitForLoadState("domcontentloaded", { timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      return;
    } catch {
      // Gemini hides the new-chat affordance in some layouts; the current thread remains a usable fallback.
    }
  }
}

async function captureGeminiWorkspaceSnapshot(
  page: Page,
): Promise<GeminiBrowserWorkspaceSnapshot> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 2_000 });
  } catch {
    // SPA transitions do not always settle cleanly.
  }

  return evaluateWithNavigationRetry(page, () => page.evaluate(() => {
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
      finalUrl: browserGlobal.location?.href ?? GEMINI_WEB_APP_URL,
      text: `${title}\n${bodyText}`,
      hasComposerSurface,
    };
  }));
}

async function assertGeminiWorkspaceReady(page: Page) {
  const snapshot = await captureGeminiWorkspaceSnapshot(page);

  if (isGeminiHumanVerificationSnapshot(snapshot)) {
    throw new Error(
      "Gemini attached browser is on Google's abnormal-traffic verification page, so human verification must be completed before WebaiBridge can invoke Gemini.",
    );
  }

  const verdict = validateGeminiBrowserWorkspaceSnapshot(snapshot);

  if (!verdict.ok) {
    throw new Error(verdict.diagnostic);
  }
}

async function sendPrompt(page: Page, message: string) {
  const result = await evaluateWithNavigationRetry(page, () => page.evaluate((rateLimitPatterns: string[]) => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => any;
        body: any;
      };
      location: {
        href: string;
      };
    };
    const urlHasPathPrefixInPage = (url: string, allowedHost: string, pathPrefix: string) => {
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        const normalizedAllowedHost = allowedHost.toLowerCase();

        return (
          (hostname === normalizedAllowedHost || hostname.endsWith(`.${normalizedAllowedHost}`)) &&
          parsed.pathname.startsWith(pathPrefix)
        );
      } catch {
        return false;
      }
    };
    const pageText = dom.document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const lowerPageText = `${pageText ?? ""}`.toLowerCase();

    if (rateLimitPatterns.some((pattern) => lowerPageText.includes(pattern))) {
      return {
        ok: false,
        error:
          "Gemini attached browser is showing a visible rate-limit gate, so WebaiBridge must stop before sending another prompt.",
      };
    }

    if (
      urlHasPathPrefixInPage(dom.location.href, "google.com", "/sorry") ||
      pageText.includes("异常流量") ||
      pageText.includes("自动程序") ||
      lowerPageText.includes("unusual traffic")
    ) {
      return {
        ok: false,
        error:
          "Gemini attached browser is on Google's abnormal-traffic verification page, so human verification must be completed before WebaiBridge can invoke Gemini.",
      };
    }

    if (
      urlHasPathPrefixInPage(
        dom.location.href,
        "accounts.google.com",
        "/CookieMismatch",
      ) ||
      pageText.includes("CookieMismatch") ||
      pageText.includes("Cookie 设置存在问题") ||
      pageText.includes("启用 Cookie")
    ) {
      return {
        ok: false,
        error:
          "Gemini attached browser is on Google's CookieMismatch page, so the browser session must be repaired before WebaiBridge can invoke Gemini.",
      };
    }

    if (
      pageText.includes("Choose an account") ||
      pageText.includes("选择账号") ||
      pageText.includes("Sign in") ||
      pageText.includes("登录")
    ) {
      return {
        ok: false,
        error:
          "Gemini attached browser is still on a Google sign-in screen, so the browser session must be completed before WebaiBridge can invoke Gemini.",
      };
    }

    const inputSelectors = [
      '[placeholder*="Gemini"]',
      '[placeholder*="问问"]',
      '[data-placeholder*="Gemini"]',
      '[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea",
      '[aria-label*="message"]',
      '[aria-label*="prompt"]',
    ];
    let inputEl: any = null;

    for (const selector of inputSelectors) {
      const el = dom.document.querySelector(selector);

      if (el && el.offsetParent !== null) {
        inputEl = el;
        break;
      }
    }

    if (!inputEl) {
      return { ok: false, error: "Gemini input box not found." };
    }

    return {
      ok: true,
      selector:
        inputEl.getAttribute?.("aria-label") ??
        inputEl.getAttribute?.("data-placeholder") ??
        inputEl.tagName,
    };
  }, GEMINI_RATE_LIMIT_TEXT_PATTERNS));

  if (!result.ok) {
    throw new Error(result.error);
  }

  const input = page.locator('div[role="textbox"][contenteditable="true"], .ql-editor[contenteditable="true"], textarea').first();
  await input.click();
  await page.keyboard.press("Meta+A").catch(async () => {
    await page.keyboard.press("Control+A").catch(() => {});
  });
  await page.keyboard.press("Backspace").catch(async () => {
    await page.keyboard.press("Delete").catch(() => {});
  });
  await page.waitForTimeout(150);
  await page.keyboard.type(message, { delay: 20 });
  await page.waitForTimeout(250);

  const submittedViaDomButton = await evaluateWithNavigationRetry(page, () => page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => unknown;
      };
    };
    const selectors = [
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[type="submit"]',
      ".send-button",
    ];

    for (const selector of selectors) {
      const button = dom.document.querySelector(selector) as
        | {
            offsetParent: unknown;
            disabled?: boolean;
            getAttribute(name: string): string | null;
            click(): void;
          }
        | null;

      if (
        button &&
        button.offsetParent !== null &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
      ) {
        button.click();
        return true;
      }
    }

    return false;
  }));

  if (submittedViaDomButton) {
    return;
  }

  const sendSelectors = [
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[type="submit"]',
    ".send-button",
  ];

  for (const selector of sendSelectors) {
    try {
      await page.locator(selector).first().click({ force: true });
      return;
    } catch {
      // Fall through to the next selector, then to Enter if no visible send button exists.
    }
  }

  await page.keyboard.press("Enter");
}

async function waitForGeminiText(
  page: Page,
  submittedPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const maxWaitMs = 60_000;
  const pollIntervalMs = 250;
  const normalizedPrompt = submittedPrompt.trim();
  let lastText = "";
  let stableCount = 0;
  const baselineTexts = await evaluateWithNavigationRetry(page, () => page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => any;
        body: any;
      };
    };
    const clean = (text: string) => text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const skipTexts = [
      "Ask Gemini",
      "问问 Gemini",
      "Enter a prompt",
      "输入提示",
      "需要我为你做些什么",
      "制作图片",
      "创作音乐",
      "创作视频",
      "帮我学习",
      "随便写点什么",
      "给我的一天注入活力",
      "升级到 Google AI Plus",
      "正在加载",
    ];
    const isGreeting = (text: string) =>
      /gemini[,，]?\s*你好/i.test(text) ||
      (text.includes("你好") && (text.includes("需要") || text.includes("做些什么"))) ||
      text.startsWith("需要我为你做些什么");
    const isSkippableCandidate = (text: string) =>
      text.length < 40 ||
      skipTexts.some((entry) => text.includes(entry)) ||
      isGreeting(text);
    const sidebarRoot = dom.document.querySelector('[aria-label*="对话"], [class*="sidebar"], nav');
    const inputEl = dom.document.querySelector(
      '[contenteditable="true"], textarea, [placeholder*="Gemini"], [placeholder*="问问"]',
    );
    const inputRoot =
      inputEl?.closest("form") ??
      inputEl?.closest("[class*='input']") ??
      inputEl?.parentElement?.parentElement;
    const main =
      dom.document.querySelector("main") ??
      dom.document.querySelector('[role="main"]') ??
      dom.document.body;
    const scoped = main === dom.document.body ? dom.document : main;
    const candidates: string[] = [];

    scoped.querySelectorAll("*").forEach((el: any) => {
      if (sidebarRoot?.contains(el) || inputRoot?.contains(el)) {
        return;
      }

      const text = clean(el.textContent ?? "");

      if (!isSkippableCandidate(text) && !candidates.includes(text)) {
        candidates.push(text);
      }
    });

    return candidates;
  }));

  for (let elapsed = 0; elapsed < maxWaitMs; elapsed += pollIntervalMs) {
    if (signal?.aborted) {
      throw new Error("Gemini browser DOM transport aborted.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const result = await evaluateWithNavigationRetry(page, () => page.evaluate(({ prompt, baselineTexts }: { prompt: string; baselineTexts: string[] }) => {
      const dom = globalThis as unknown as {
        document: {
          querySelector: (selector: string) => any;
          querySelectorAll: (selector: string) => Iterable<any>;
          body: any;
        };
      };
      const clean = (text: string) => text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
      const normalizedPrompt = clean(prompt);
      const baselineSet = new Set(baselineTexts.map((entry) => clean(entry)));
      const skipTexts = [
        "Ask Gemini",
        "问问 Gemini",
        "Enter a prompt",
        "输入提示",
        "需要我为你做些什么",
        "制作图片",
        "创作音乐",
        "创作视频",
        "帮我学习",
        "随便写点什么",
        "给我的一天注入活力",
        "升级到 Google AI Plus",
        "正在加载",
      ];
      const isGreeting = (text: string) =>
        /gemini[,，]?\s*你好/i.test(text) ||
        (text.includes("你好") && (text.includes("需要") || text.includes("做些什么"))) ||
        text.startsWith("需要我为你做些什么");
      const isSkippableCandidate = (text: string) =>
        text.length < 40 ||
        skipTexts.some((entry) => text.includes(entry)) ||
        isGreeting(text);
      const sidebarRoot = dom.document.querySelector('[aria-label*="对话"], [class*="sidebar"], nav');
      const inputEl = dom.document.querySelector(
        '[contenteditable="true"], textarea, [placeholder*="Gemini"], [placeholder*="问问"]',
      );
      const inputRoot =
        inputEl?.closest("form") ??
        inputEl?.closest("[class*='input']") ??
        inputEl?.parentElement?.parentElement;
      const main =
        dom.document.querySelector("main") ??
        dom.document.querySelector('[role="main"]') ??
        dom.document.body;
      const scoped = main === dom.document.body ? dom.document : main;
      const responseSelectors = [
        "message-content",
        "structured-content-container.model-response-text",
        "structured-content-container",
        ".response-content",
        '[class*="response-content"]',
        '[class*="model-response-text"]',
      ];
      const assistantCandidates: string[] = [];
      const fallbackCandidates: string[] = [];

      for (const selector of responseSelectors) {
        for (const el of scoped.querySelectorAll(selector) as Iterable<any>) {
          if (sidebarRoot?.contains(el) || inputRoot?.contains(el)) {
            continue;
          }

          const text = clean(el.textContent ?? "");
          const looksLikePromptEcho =
            text === normalizedPrompt ||
            (normalizedPrompt.length > 0 &&
              text.includes(normalizedPrompt) &&
              text.length <= normalizedPrompt.length + 24);
          const existedBeforeSend = baselineSet.has(text);

          if (
            !looksLikePromptEcho &&
            !existedBeforeSend &&
            !assistantCandidates.includes(text)
          ) {
            assistantCandidates.push(text);
          }
        }
      }

      scoped.querySelectorAll("*").forEach((el: any) => {
        if (sidebarRoot?.contains(el) || inputRoot?.contains(el)) {
          return;
        }

        const text = clean(el.textContent ?? "");

        const looksLikePromptEcho =
          normalizedPrompt.length > 0 && text.includes(normalizedPrompt);

        const existedBeforeSend = baselineSet.has(text);

        if (
          !looksLikePromptEcho &&
          !existedBeforeSend &&
          !isSkippableCandidate(text) &&
          !fallbackCandidates.includes(text)
        ) {
          fallbackCandidates.push(text);
        }
      });

      const stopButton = dom.document.querySelector('[aria-label*="Stop"], [aria-label*="stop"]');
      const bodyText = clean(dom.document.body?.innerText ?? "");
      const structuredReplyPatterns = [
        /gemini 说\s*([\s\S]*?)\s*思考/i,
        /gemini says\s*([\s\S]*?)\s*(show thinking|gemini can make mistakes|$)/i,
      ];
      let structuredReply = "";

      for (const pattern of structuredReplyPatterns) {
        const match = bodyText.match(pattern);

        if (match?.[1]) {
          structuredReply = clean(match[1]);
          break;
        }
      }

      return {
        assistantCandidates,
        fallbackCandidates,
        structuredReply,
        isStreaming: Boolean(stopButton),
      };
    }, {
      prompt: normalizedPrompt,
      baselineTexts,
    }));

    const sentinelToken =
      normalizedPrompt.match(/\b([A-Z][A-Z0-9_]{2,})\b/) ??
      normalizedPrompt.match(/\b([A-Z0-9_]{3,})\b/);
    const requestedToken = sentinelToken?.[1] ?? "";
    const nextText = selectGeminiAssistantReply({
      requestedToken,
      assistantCandidates: result.assistantCandidates,
      structuredReply: result.structuredReply,
      fallbackCandidates: result.fallbackCandidates,
    });

    if (nextText) {
      const tokenMatched =
        requestedToken.length > 0 && nextText.toUpperCase().includes(requestedToken);

      if (nextText !== lastText) {
        lastText = nextText;
        stableCount = 0;
        continue;
      }

      stableCount += 1;

      if (requestedToken.length > 0) {
        if (tokenMatched && (!result.isStreaming || stableCount >= 2)) {
          return nextText;
        }

        continue;
      }

      if (!result.isStreaming && stableCount >= 2) {
        return nextText;
      }
    }
  }

  throw new Error(
    "Gemini DOM transport did not observe a completed model response on gemini.google.com/app.",
  );
}

export async function invokeGeminiBrowserDomTransport(
  args: {
    message: string;
    signal?: AbortSignal;
  },
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: ConnectOverCDP = chromium.connectOverCDP.bind(chromium) as ConnectOverCDP,
): Promise<string> {
  const resolvedEnv = resolveRequiredEnvValues(GEMINI_WEB_LIVE_PROOF_ENV_NAMES, env);

  if (!resolvedEnv) {
    throw new Error("Missing Gemini browser session material for DOM transport.");
  }

  const cdpUrl = resolveGeminiBrowserCdpUrl(env);
  const browser = await connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`Gemini browser DOM transport could not resolve a Chrome context from ${cdpUrl}.`);
    }

    // The attached Chrome profile is the primary Gemini auth source. Re-injecting
    // the serialized cookie bundle here can overwrite host-scoped Google cookies
    // and downgrade a valid session into Google's cookie-error page.
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { page, ownedPage } = await ensureGeminiPage(context);

      try {
        await assertGeminiWorkspaceReady(page);
        await startFreshGeminiConversation(page);
        await sendPrompt(page, args.message);
        return await waitForGeminiText(page, args.message, args.signal);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === 0 && shouldRetryGeminiPrompt(lastError)) {
          await navigateToGeminiApp(page).catch(() => {});
          await page.waitForTimeout(1_500);
          continue;
        }

        throw lastError;
      } finally {
        if (ownedPage && typeof page.close === "function") {
          await page.close().catch(() => {});
        }
      }
    }

    throw lastError ?? new Error("Gemini browser DOM transport failed without a captured error.");
  } finally {
    await browser.close().catch(() => {});
  }
}
