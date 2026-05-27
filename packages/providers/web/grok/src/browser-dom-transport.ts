import { chromium, type BrowserContext, type Page } from "playwright-core";

import { GROK_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import { resolveRequiredEnvValues } from "../../shared/http-transport.js";

export const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
export const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
export const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
export const GROK_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
export const GROK_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
export const GROK_WEB_APP_URL = "https://grok.com/";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const GROK_CDP_RETRY_DELAY_MS = 500;

type ConnectOverCDP = (
  endpointURL: string,
) => ReturnType<typeof chromium.connectOverCDP>;

function resolveGrokCdpUrl(env: Record<string, string | undefined>) {
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

function isClosedTargetError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("target page, context or browser has been closed") ||
    message.includes("page has been closed") ||
    message.includes("browser has been closed") ||
    message.includes("context has been closed")
  );
}

function isRecoverableGrokBrowserError(error: unknown): boolean {
  return isExecutionContextDestroyed(error) || isClosedTargetError(error);
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
    message.includes("eaddrnotavail") ||
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
  connectOverCDP: ConnectOverCDP,
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
    : new Error("Grok DOM evaluation failed without a captured error.");
}

function parseGrokCookies(cookieBundle: string) {
  return cookieBundle
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes("="))
    .map((entry) => {
      const [name, ...valueParts] = entry.split("=");

      return {
        name: name?.trim() ?? "",
        value: valueParts.join("=").trim(),
        domain: ".grok.com",
        path: "/",
      };
    })
    .filter((cookie) => cookie.name.length > 0);
}

function extractRequestedToken(prompt: string): string | undefined {
  const match = prompt.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i);
  return match?.[1];
}

function isGrokPageUrl(urlString: string): boolean {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();
    return hostname === "grok.com" || hostname.endsWith(".grok.com");
  } catch {
    return false;
  }
}

async function ensureGrokPage(context: BrowserContext): Promise<Page> {
  const existingPage = context.pages().find((page) => isGrokPageUrl(page.url()));

  if (existingPage) {
    await existingPage.bringToFront().catch(() => {});
    await existingPage.goto(GROK_WEB_APP_URL, {
      waitUntil: "domcontentloaded",
    }).catch(() => {});
    await existingPage.waitForTimeout(1_500);
    return existingPage;
  }

  const page = await context.newPage();
  await page.goto(GROK_WEB_APP_URL, {
    waitUntil: "domcontentloaded",
  }).catch(() => {});
  await page.waitForTimeout(1_500);
  return page;
}

async function sendPrompt(page: Page, message: string) {
  const sendSelectors = [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[type="submit"]',
    'button[data-testid*="send"]',
    "form button[type=submit]",
    ".send-button",
    "[class*='send']",
  ];
  const result = await evaluateWithNavigationRetry(page, () => page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => any;
      };
    };
    const selectors = [
      '[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea[placeholder]",
      "textarea",
    ];

    for (const selector of selectors) {
      const element = dom.document.querySelector(selector);

      if (element && element.offsetParent !== null) {
        return { ok: true };
      }
    }

    return { ok: false, error: "Grok input box not found in the attached browser." };
  }));

  if (result && !result.ok) {
    throw new Error(result.error);
  }

  if (typeof (page as Page & { locator?: unknown }).locator === "function") {
    const selectorCandidates = [
      '[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea[placeholder]",
      "textarea",
    ];
    let clicked = false;

    for (const selector of selectorCandidates) {
      const input = (page as Page & {
        locator: (value: string) => { first(): { click(args?: unknown): Promise<void> } };
      })
        .locator(selector)
        .first();

      try {
        await input.click({ force: true });
        clicked = true;
        break;
      } catch {
        // Grok keeps hidden draft editors in the DOM, so try selectors in priority order.
      }
    }

    if (!clicked) {
      throw new Error("Grok input box could not be focused in the attached browser.");
    }

    await page.keyboard.type(message, { delay: 20 });

    let clickedSendButton = false;

    for (const selector of sendSelectors) {
      const button = (page as Page & {
        locator: (value: string) => { first(): { click(args?: unknown): Promise<void> } };
      })
        .locator(selector)
        .first();

      try {
        await button.click({ force: true });
        clickedSendButton = true;
        break;
      } catch {
        // Grok keeps multiple hidden button affordances in the DOM, so keep trying.
      }
    }

    if (!clickedSendButton) {
      await page.keyboard.press("Enter");
    }
    return;
  }

  await evaluateWithNavigationRetry(page, () => page.evaluate((prompt: string) => {
    const dom = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => any;
      };
      Event: new (type: string, init?: Record<string, unknown>) => Event;
      KeyboardEvent: new (
        type: string,
        init?: Record<string, unknown>,
      ) => Event;
    };
    const inputSelectors = [
      '[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea[placeholder]",
      "textarea",
    ];
    let inputEl: any = null;

    for (const selector of inputSelectors) {
      const element = dom.document.querySelector(selector);

      if (element && element.offsetParent !== null) {
        inputEl = element;
        break;
      }
    }

    if (!inputEl) {
      return;
    }

    inputEl.focus();

    if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
      inputEl.value = prompt;
      inputEl.dispatchEvent(new dom.Event("input", { bubbles: true }));
    } else {
      inputEl.textContent = prompt;
      inputEl.dispatchEvent(new dom.Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new dom.Event("change", { bubbles: true }));
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
  }, message));
}

interface GrokTextSnapshot {
  text: string;
  isStreaming: boolean;
  bodyText: string;
}

async function captureGrokTextSnapshot(
  page: Page,
  prompt: string,
  baselineTexts: string[],
): Promise<GrokTextSnapshot> {
  return evaluateWithNavigationRetry(
    page,
    () =>
      page.evaluate(
        ({
          prompt: inputPrompt,
          baselineTexts: inputBaselineTexts,
        }: {
          prompt: string;
          baselineTexts: string[];
        }) => {
          const browserGlobal = globalThis as typeof globalThis & {
            document: {
              querySelector: (selector: string) => any;
              querySelectorAll: (selector: string) => Iterable<any>;
              body: { innerText?: string } | null;
            };
          };
          const clean = (value: string) => value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
          const baselineSet = new Set(inputBaselineTexts.map((entry) => clean(entry)));
          const selectors = [
            '[data-role="assistant"]',
            '[class*="assistant"]',
            '[class*="response"]',
            '[class*="message"]',
            "article",
            "[class*='markdown']",
            ".prose",
          ];
          let text = "";

          for (const selector of selectors) {
            const elements = Array.from(browserGlobal.document.querySelectorAll(selector));

            for (let index = elements.length - 1; index >= 0; index -= 1) {
              const candidate = clean((elements[index] as { textContent?: string }).textContent ?? "");
              const looksLikePromptEcho =
                candidate === inputPrompt ||
                (inputPrompt.length > 0 &&
                  candidate.includes(inputPrompt) &&
                  candidate.length <= inputPrompt.length + 24) ||
                candidate === "" ||
                candidate.includes("Ask Grok") ||
                baselineSet.has(candidate);

              if (
                candidate.length > 20 &&
                !looksLikePromptEcho
              ) {
                text = candidate;
                break;
              }
            }

            if (text) {
              break;
            }
          }

          if (!text) {
            const all = Array.from(browserGlobal.document.querySelectorAll("p, div[class]"));

            for (let index = all.length - 1; index >= 0; index -= 1) {
              const candidate = clean((all[index] as { textContent?: string }).textContent ?? "");
              const looksLikePromptEcho =
                candidate === inputPrompt ||
                (inputPrompt.length > 0 &&
                  candidate.includes(inputPrompt) &&
                  candidate.length <= inputPrompt.length + 24) ||
                candidate === "" ||
                candidate.includes("Ask Grok") ||
                baselineSet.has(candidate);

              if (
                candidate.length > 20 &&
                !looksLikePromptEcho
              ) {
                text = candidate;
                break;
              }
            }
          }

          const stopButton = browserGlobal.document.querySelector(
            '[aria-label*="Stop"], [aria-label*="stop"]',
          );

          return {
            text,
            isStreaming: Boolean(stopButton),
            bodyText: clean(browserGlobal.document.body?.innerText ?? ""),
          };
        },
        {
          prompt,
          baselineTexts,
        },
      ),
  );
}

function resolveRequestedGrokToken(
  snapshot: GrokTextSnapshot,
  requestedToken: string | undefined,
): string | undefined {
  if (!requestedToken) {
    return undefined;
  }

  if (snapshot.bodyText.includes(requestedToken)) {
    return requestedToken;
  }

  if (snapshot.text.includes(requestedToken)) {
    return requestedToken;
  }

  return undefined;
}

async function waitForGrokText(
  page: Page,
  submittedPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const maxWaitMs = 180_000;
  const pollIntervalMs = 2_000;
  const normalizedPrompt = submittedPrompt.trim();
  const requestedToken = extractRequestedToken(submittedPrompt);
  let lastText = "";
  let stableCount = 0;
  const baselineTexts = await evaluateWithNavigationRetry(page, () => page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      document: {
        querySelectorAll: (selector: string) => Iterable<any>;
      };
    };
    const clean = (value: string) => value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const selectors = [
      '[data-role="assistant"]',
      '[class*="assistant"]',
      '[class*="response"]',
      '[class*="message"]',
      "article",
      ".prose",
    ];
    const values: string[] = [];

    for (const selector of selectors) {
      const elements = Array.from(browserGlobal.document.querySelectorAll(selector));

      for (const element of elements) {
        const text = clean((element as { textContent?: string }).textContent ?? "");

        if (text.length > 20 && !values.includes(text)) {
          values.push(text);
        }
      }
    }

    return values;
  }));

  for (let elapsed = 0; elapsed < maxWaitMs; elapsed += pollIntervalMs) {
    if (signal?.aborted) {
      const lateSnapshot = await captureGrokTextSnapshot(page, normalizedPrompt, baselineTexts);
      const lateToken = resolveRequestedGrokToken(lateSnapshot, requestedToken);

      if (lateToken) {
        return lateToken;
      }

      throw new Error("Grok browser DOM transport aborted.");
    }

    await page.waitForTimeout(pollIntervalMs);

    const result = await captureGrokTextSnapshot(page, normalizedPrompt, baselineTexts);

    const resolvedToken = resolveRequestedGrokToken(result, requestedToken);

    if (resolvedToken) {
      return resolvedToken;
    }

    if (result?.text) {
      if (requestedToken) {
        continue;
      }

      if (result.text !== lastText) {
        lastText = result.text;
        stableCount = 0;
        continue;
      }

      stableCount += 1;

      if (!result.isStreaming && stableCount >= 2) {
        return result.text;
      }
    }
  }

  const finalSnapshot = await captureGrokTextSnapshot(
    page,
    normalizedPrompt,
    baselineTexts,
  ).catch(() => undefined);
  const finalToken = finalSnapshot ? resolveRequestedGrokToken(finalSnapshot, requestedToken) : undefined;

  if (finalToken) {
    return finalToken;
  }

  throw new Error(
    "Grok DOM transport did not observe a completed assistant response in the attached browser.",
  );
}

export async function invokeGrokBrowserDomTransport(
  args: {
    message: string;
    signal?: AbortSignal;
  },
  env: Record<string, string | undefined> = process.env,
  connectOverCDP: ConnectOverCDP = chromium.connectOverCDP.bind(chromium) as ConnectOverCDP,
): Promise<string> {
  const envValues = resolveRequiredEnvValues(
    GROK_WEB_LIVE_PROOF_ENV_NAMES,
    env,
  );

  if (!envValues) {
    throw new Error("Missing Grok browser session material for browser DOM fallback.");
  }

  const cdpUrl = resolveGrokCdpUrl(env);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const browser = await connectGrokBrowserWithRetry(cdpUrl, connectOverCDP);

    try {
      const context = browser.contexts()[0];

      if (!context) {
        throw new Error(`Grok browser DOM transport could not resolve a Chrome context from ${cdpUrl}.`);
      }

      if (typeof context.addCookies === "function") {
        await context.addCookies(
          parseGrokCookies(envValues.WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE),
        ).catch(() => {});
      }

      const page = await ensureGrokPage(context);
      await sendPrompt(page, args.message);
      return await waitForGrokText(page, args.message, args.signal);
    } catch (error) {
      lastError = error;

      if (!isRecoverableGrokBrowserError(error) || attempt === 1) {
        throw error;
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Grok browser DOM transport failed without a captured error.");
}
