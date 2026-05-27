import { chromium, type BrowserContext, type Page } from "playwright-core";

import {
  urlHostnameHasRootDomain,
  urlHostnameMatches,
  urlPathHasExtension,
} from "../../shared/url-hosts.js";

export const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
export const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
export const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
export const CHATGPT_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
export const CHATGPT_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
export const CHATGPT_WEB_APP_URL = "https://chatgpt.com/";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const CHATGPT_RISK_TEXT_PATTERNS = [
  "unusual activity",
  "verify you are human",
  "complete the security check",
  "captcha",
];
const CHATGPT_RATE_LIMIT_TEXT_PATTERNS = [
  "you've reached our limit",
  "you have reached our limit",
  "you've reached the limit",
  "you have reached the limit",
  "try again later",
  "please wait before trying again",
  "our systems are a bit busy",
  "limit reached",
  "message cap",
  "rate limit",
  "usage limit",
  "usage cap",
  "too many requests",
  "too many messages",
  "已达到上限",
  "消息上限",
  "请求过多",
];
const CHATGPT_EMAIL_VERIFICATION_TEXT_PATTERNS = [
  "check your inbox",
  "verification code",
  "we just sent",
  "use password instead",
  "重新发送电子邮件",
  "验证码",
  "检查您的收件箱",
];
const CHATGPT_LOGGED_OUT_TEXT_PATTERNS = [
  "login to get personalized responses",
  "log in to get personalized responses",
  "登录以获取基于已保存聊天的回答",
  "log in",
  "sign up",
  "登录 chatgpt",
  "免费注册",
];

type ConnectOverCDP = (
  endpointURL: string,
) => ReturnType<typeof chromium.connectOverCDP>;

function resolveChatgptCdpUrl(env: Record<string, string | undefined>) {
  const browserMode = env[WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME]?.trim();

  return (
    env[SHARED_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
    ((browserMode === ISOLATED_CHROME_ROOT_MODE ||
      browserMode === LEGACY_EXISTING_PROFILE_MODE)
      ? env[EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
        CHATGPT_WEB_DEFAULT_ISOLATED_CDP_URL
      : CHATGPT_WEB_DEFAULT_CDP_URL)
  );
}

function parseChatgptCookies(cookieBundle: string) {
  return cookieBundle
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes("="))
    .map((entry) => {
      const [name, ...valueParts] = entry.split("=");

      return {
        name: name?.trim() ?? "",
        value: valueParts.join("=").trim(),
        path: "/",
        secure: true,
        sameSite: "Lax" as const,
        url: CHATGPT_WEB_APP_URL,
      };
    })
    .filter((cookie) => cookie.name.length > 0);
}

function detectChatgptRiskCheck(bodyText: string): string | undefined {
  const lowerBodyText = `${bodyText ?? ""}`.toLowerCase();
  const matchedPattern = CHATGPT_RISK_TEXT_PATTERNS.find((pattern) =>
    lowerBodyText.includes(pattern),
  );

  if (!matchedPattern) {
    return undefined;
  }

  return `ChatGPT browser DOM transport hit a visible risk-check gate in the attached browser (${matchedPattern}).`;
}

function detectChatgptRateLimit(bodyText: string): string | undefined {
  const lowerBodyText = `${bodyText ?? ""}`.toLowerCase();
  const matchedPattern = CHATGPT_RATE_LIMIT_TEXT_PATTERNS.find((pattern) =>
    lowerBodyText.includes(pattern),
  );

  if (!matchedPattern) {
    return undefined;
  }

  return `ChatGPT browser DOM transport hit a visible rate-limit gate in the attached browser (${matchedPattern}).`;
}

function detectChatgptVisibleBlocker(pageText: string): string | undefined {
  return detectChatgptRateLimit(pageText) ?? detectChatgptRiskCheck(pageText);
}

function detectChatgptEmailVerification(pageText: string): string | undefined {
  const lowerPageText = `${pageText ?? ""}`.toLowerCase();
  const matchedPattern = CHATGPT_EMAIL_VERIFICATION_TEXT_PATTERNS.find((pattern) =>
    lowerPageText.includes(pattern),
  );

  if (!matchedPattern) {
    return undefined;
  }

  return `ChatGPT attached browser is currently blocked on OpenAI email verification (${matchedPattern}), so the end user must finish that verification before WebaiBridge can invoke ChatGPT.`;
}

function detectChatgptLoggedOutWorkspace(pageText: string): string | undefined {
  const lowerPageText = `${pageText ?? ""}`.toLowerCase();
  const matchedPattern = CHATGPT_LOGGED_OUT_TEXT_PATTERNS.find((pattern) =>
    lowerPageText.includes(pattern),
  );

  if (!matchedPattern) {
    return undefined;
  }

  return "ChatGPT attached browser is still showing the logged-out landing page or login/signup controls, so the browser workspace is not ready for live invocation.";
}

export function detectChatgptWorkspaceGate(pageText: string): string | undefined {
  return detectChatgptEmailVerification(pageText) ?? detectChatgptLoggedOutWorkspace(pageText);
}

export function validateChatgptBrowserWorkspaceSnapshot(snapshot: {
  finalUrl: string;
  bodyText: string;
  hasComposerSurface: boolean;
}): { ok: true } | { ok: false; diagnostic: string } {
  const loggedOutWorkspace = detectChatgptLoggedOutWorkspace(
    `${snapshot.finalUrl}\n${snapshot.bodyText}`,
  );

  if (loggedOutWorkspace) {
    return {
      ok: false,
      diagnostic: loggedOutWorkspace,
    };
  }

  const verificationGate = detectChatgptEmailVerification(
    `${snapshot.finalUrl}\n${snapshot.bodyText}`,
  );

  if (verificationGate) {
    return {
      ok: false,
      diagnostic: verificationGate,
    };
  }

  if (!snapshot.hasComposerSurface) {
    return {
      ok: false,
      diagnostic:
        "ChatGPT attached browser is not yet showing a reliable composer surface, so the browser workspace is not ready for live invocation.",
    };
  }

  return { ok: true };
}

function extractRequestedToken(prompt: string): string | undefined {
  const match = prompt.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i);
  return match?.[1];
}

function normalizeTokenText(value: string): string {
  return value.replace(/[\s\u200B-\u200D\uFEFF]+/g, "").toLowerCase();
}

function normalizeChatgptReply(value: string): string {
  return `${value ?? ""}`.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function looksLikePromptEcho(candidate: string, prompt: string): boolean {
  return (
    candidate === prompt ||
    (prompt.length > 0 &&
      candidate.includes(prompt) &&
      candidate.length <= prompt.length + 24)
  );
}

export function selectChatgptAssistantReply(args: {
  assistantCandidates: string[];
  structuredReply: string;
  baselineTexts: string[];
  prompt: string;
  requestedToken?: string;
}): string {
  const baselineSet = new Set(
    args.baselineTexts.map(normalizeChatgptReply).filter(Boolean),
  );
  const normalizedPrompt = normalizeChatgptReply(args.prompt);
  const normalizedRequestedToken = args.requestedToken
    ? normalizeTokenText(args.requestedToken)
    : undefined;

  const assistantReply = args.assistantCandidates
    .map(normalizeChatgptReply)
    .findLast(
      (candidate) =>
        candidate.length > 0 &&
        !baselineSet.has(candidate) &&
        !looksLikePromptEcho(candidate, normalizedPrompt),
    );

  if (assistantReply) {
    return assistantReply;
  }

  const structuredReply = normalizeChatgptReply(args.structuredReply);

  if (
    structuredReply.length === 0 ||
    baselineSet.has(structuredReply) ||
    looksLikePromptEcho(structuredReply, normalizedPrompt)
  ) {
    return "";
  }

  if (
    normalizedRequestedToken &&
    !normalizeTokenText(structuredReply).includes(normalizedRequestedToken)
  ) {
    return "";
  }

  return structuredReply;
}

async function waitForChatgptPageReady(page: Page): Promise<Page> {
  await page.waitForTimeout(2_000);
  try {
    await page.waitForFunction(
      () => {
        const browserGlobal = globalThis as unknown as {
          document: {
            scripts: Iterable<{ src?: string }>;
          };
        };
        const scripts = Array.from(browserGlobal.document.scripts);
        return scripts.some(
          (script) => {
            if (typeof script.src !== "string") {
              return false;
            }

            try {
              const parsed = new URL(script.src);
              return (
                parsed.protocol === "https:" &&
                urlHostnameHasRootDomain(script.src, "oaistatic.com") &&
                urlPathHasExtension(script.src, ".js")
              );
            } catch {
              return false;
            }
          },
        );
      },
      { timeout: 15_000 },
    );
  } catch {
    // ChatGPT sometimes hydrates slowly; we keep going with the visible page even if the sentinel script is late.
  }
  return page;
}

async function ensureChatgptPage(context: BrowserContext): Promise<Page> {
  const existingPage = [...context.pages()].reverse().find((page) =>
    urlHostnameMatches(page.url(), "chatgpt.com"),
  );
  const page = existingPage ?? await context.newPage();
  if (typeof page.bringToFront === "function") {
    await page.bringToFront().catch(() => {});
  }

  await page.goto(CHATGPT_WEB_APP_URL, {
    waitUntil: "load",
  }).catch(async () => {
    await page.reload({ waitUntil: "load" }).catch(() => {});
  });

  return waitForChatgptPageReady(page);
}

async function startFreshChatgptConversation(page: Page) {
  if (typeof page.locator !== "function") {
    return;
  }

  const selectors = [
    'a[href="/"]',
    'button[aria-label*="New chat"]',
    'button[aria-label*="New Chat"]',
    'button[aria-label*="新聊天"]',
    'a[aria-label*="New chat"]',
    'a[aria-label*="新聊天"]',
  ];

  for (const selector of selectors) {
    try {
      await page.locator(selector).first().click({
        force: true,
        timeout: 1_500,
      });
      await page.waitForLoadState("domcontentloaded", { timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(800);
      return;
    } catch {
      // ChatGPT shifts its new-chat affordance frequently; keep the current page if none of the
      // visible selectors fire.
    }
  }
}

async function sendPrompt(page: Page, message: string) {
  const sendSelectors = [
    "#composer-submit-button",
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
    "form button[type=submit]",
  ];
  const preflight = await page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelectorAll: (selector: string) => Iterable<any>;
        body: { innerText?: string } | null;
      };
    };
    const dialogSelectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      "[data-radix-portal]",
      "[data-radix-popper-content-wrapper]",
      "[data-headlessui-portal]",
      ".modal",
    ];
    const dialogText = dialogSelectors
      .flatMap((selector) =>
        Array.from(dom.document.querySelectorAll(selector)).map((element) =>
          `${(element as { textContent?: string }).textContent ?? ""}`.trim(),
        ),
      )
      .filter(Boolean)
      .join("\n");

    return {
      pageText: `${dialogText}\n${dom.document.body?.innerText ?? ""}`.trim(),
    };
  });
  const visibleBlocker = detectChatgptVisibleBlocker(preflight.pageText);

  if (visibleBlocker) {
    throw new Error(visibleBlocker);
  }

  const workspaceGate = detectChatgptWorkspaceGate(preflight.pageText);

  if (workspaceGate) {
    throw new Error(workspaceGate);
  }

  await page.evaluate((prompt: string) => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => any;
        querySelectorAll: (selector: string) => Iterable<any>;
      };
      Event: new (type: string, init?: Record<string, unknown>) => Event;
      KeyboardEvent: new (
        type: string,
        init?: Record<string, unknown>,
      ) => Event;
    };
    const inputSelectors = [
      'div[role="textbox"][contenteditable="true"]',
      "#prompt-textarea",
      "textarea[placeholder]",
      "textarea",
      '[contenteditable="true"][data-placeholder]',
      '[contenteditable="true"]',
    ];
    let inputEl: any = null;

    for (const selector of inputSelectors) {
      const elements = Array.from(dom.document.querySelectorAll(selector));

      for (const element of elements) {
        if (element && element.offsetParent !== null) {
          inputEl = element;
          break;
        }
      }

      if (inputEl) {
        break;
      }
    }

    if (!inputEl) {
      throw new Error("ChatGPT input box could not be focused in the attached browser.");
    }

    inputEl.focus();

    if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
      inputEl.value = prompt;
      inputEl.dispatchEvent(new dom.Event("input", { bubbles: true }));
    } else {
      inputEl.textContent = prompt;
      inputEl.dispatchEvent(new dom.Event("input", { bubbles: true }));
    }

    inputEl.dispatchEvent(
      new dom.KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    );

    for (const selector of [
      "#composer-submit-button",
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      "form button[type=submit]",
    ]) {
      const button = dom.document.querySelector(selector);

      if (button && button.offsetParent !== null) {
        button.click();
        return;
      }
    }
  }, message);

  await page.keyboard.press("Enter").catch(() => {});
}

async function waitForChatgptText(
  page: Page,
  submittedPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const maxWaitMs = 60_000;
  const pollIntervalMs = 1_500;
  const normalizedPrompt = submittedPrompt.trim();
  const requestedToken = extractRequestedToken(submittedPrompt);
  const normalizedRequestedToken = requestedToken
    ? normalizeTokenText(requestedToken)
    : undefined;
  let lastText = "";
  let stableCount = 0;
  const baselineTexts = await page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelectorAll: (selector: string) => Iterable<any>;
        body: { innerText?: string } | null;
      };
    };
    const clean = (text: string) => text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const selectors = ['[data-message-author-role="assistant"]', "article", ".prose", '[class*="assistant"]'];
    const values: string[] = [];

    for (const selector of selectors) {
      const elements = Array.from(dom.document.querySelectorAll(selector));

      for (const element of elements) {
        const text = clean((element as { textContent?: string }).textContent ?? "");

        if (text.length > 0 && !values.includes(text)) {
          values.push(text);
        }
      }
    }

    return values;
  });

  for (let elapsed = 0; elapsed < maxWaitMs; elapsed += pollIntervalMs) {
    if (signal?.aborted) {
      throw new Error("ChatGPT browser DOM transport aborted.");
    }

    await page.waitForTimeout(pollIntervalMs);

    let result;

    try {
      result = await page.evaluate(
        ({ prompt }: { prompt: string }) => {
        const dom = globalThis as unknown as {
      document: {
        querySelectorAll: (selector: string) => Iterable<any>;
        querySelector: (selector: string) => any;
        body: { innerText?: string } | null;
      };
    };
        const clean = (text: string) => text.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
        const selectors = [
          '[data-message-author-role="assistant"]',
          "article",
          ".prose",
          '[class*="assistant"]',
        ];
        const assistantCandidates: string[] = [];

        for (const selector of selectors) {
          const elements = Array.from(dom.document.querySelectorAll(selector));

          for (let index = elements.length - 1; index >= 0; index -= 1) {
            const candidate = clean((elements[index] as { textContent?: string }).textContent ?? "");
            const looksLikePromptEcho =
              candidate === prompt ||
              (prompt.length > 0 &&
                candidate.includes(prompt) &&
                candidate.length <= prompt.length + 24);

            if (candidate.length > 0 && !looksLikePromptEcho) {
              assistantCandidates.push(candidate);
            }
          }
        }

        const stopButton = dom.document.querySelector('[aria-label*="Stop"]');
        const bodyText = clean(dom.document.body?.innerText ?? "");
        const structuredReplyPatterns = [
          /chatgpt 说[:：]?\s*([\s\S]*?)\s*(chatgpt 也可能会犯错|$)/i,
          /chatgpt says[:：]?\s*([\s\S]*?)\s*(chatgpt can make mistakes|$)/i,
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
          structuredReply,
          isStreaming: Boolean(stopButton),
          bodyText,
        };
      },
      {
        prompt: normalizedPrompt,
      },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.includes("Execution context was destroyed") ||
        message.includes("Cannot find context with specified id")
      ) {
        continue;
      }

      throw error;
    }

    if (result?.bodyText) {
      const observedBodyText = result.bodyText;
      const riskCheckError = detectChatgptVisibleBlocker(observedBodyText);

      if (riskCheckError) {
        throw new Error(riskCheckError);
      }

      const workspaceGate = detectChatgptWorkspaceGate(observedBodyText);

      if (workspaceGate) {
        throw new Error(workspaceGate);
      }

      if (
        normalizedRequestedToken &&
        normalizeTokenText(observedBodyText).includes(normalizedRequestedToken)
      ) {
        return requestedToken ?? observedBodyText;
      }
    }

    const candidateText = result
      ? selectChatgptAssistantReply({
          assistantCandidates: result.assistantCandidates ?? [],
          structuredReply: result.structuredReply ?? "",
          baselineTexts,
          prompt: normalizedPrompt,
          requestedToken,
        })
      : "";

    if (candidateText) {
      if (
        normalizedRequestedToken &&
        !normalizeTokenText(candidateText).includes(normalizedRequestedToken)
      ) {
        continue;
      }

      if (candidateText !== lastText) {
        lastText = candidateText;
        stableCount = 0;
        continue;
      }

      stableCount += 1;

      if (!result.isStreaming && stableCount >= 2) {
        return candidateText;
      }
    }
  }

  throw new Error(
    "ChatGPT DOM transport did not observe a completed assistant response in the attached browser.",
  );
}

export async function invokeChatgptBrowserDomTransport(
  args: {
    message: string;
    signal?: AbortSignal;
  },
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: ConnectOverCDP = chromium.connectOverCDP.bind(chromium) as ConnectOverCDP,
): Promise<string> {
  const cdpUrl = resolveChatgptCdpUrl(env);
  const cookieBundle = env.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE?.trim();
  const browser = await connectOverCDP(cdpUrl);

  try {
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`ChatGPT browser DOM transport could not resolve a Chrome context from ${cdpUrl}.`);
    }

    if (cookieBundle && typeof context.addCookies === "function") {
      await context.addCookies(parseChatgptCookies(cookieBundle)).catch(() => {});
    }

    const page = await ensureChatgptPage(context);
    await startFreshChatgptConversation(page);
    await sendPrompt(page, args.message);
    return await waitForChatgptText(page, args.message, args.signal);
  } finally {
    await browser.close().catch(() => {});
  }
}
