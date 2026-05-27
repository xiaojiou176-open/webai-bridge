import { randomUUID } from "node:crypto";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { GROK_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractGrokTransportText,
  GROK_TRANSPORT_ENTRYPOINT,
} from "./transport.js";
import {
  extractTextFromEventStream,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";
import { urlHostnameMatches } from "../../shared/url-hosts.js";

const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
const GROK_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const GROK_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";
const GROK_CDP_RETRY_DELAY_MS = 500;
const GROK_BROWSER_SESSION_TIMEOUT_MS = 45_000;

type ConnectOverCDP = (
  endpointURL: string,
) => ReturnType<typeof chromium.connectOverCDP>;

type GrokBrowserSessionFailure = {
  ok: false;
  stage: "list" | "create" | "respond";
  status: number;
  detail?: string;
  raw?: string;
};

type GrokBrowserSessionSuccess = {
  ok: true;
  raw: string;
};

type GrokBrowserSessionResult =
  | GrokBrowserSessionFailure
  | GrokBrowserSessionSuccess;

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

function isRecoverableGrokCdpConnectError(error: unknown) {
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

async function ensureGrokPage(context: BrowserContext): Promise<Page> {
  const existingPage = context
    .pages()
    .find((page) => urlHostnameMatches(page.url(), "grok.com"));

  if (existingPage) {
    await existingPage.bringToFront?.().catch(() => {});
    await existingPage.waitForLoadState("domcontentloaded", {
      timeout: 5_000,
    }).catch(() => undefined);
    return existingPage;
  }

  const page = await context.newPage();
  await page.goto(GROK_TRANSPORT_ENTRYPOINT, {
    waitUntil: "domcontentloaded",
  }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  return page;
}

export async function invokeGrokBrowserSessionTransport(args: {
  message: string;
  model: string;
  env: Record<string, string | undefined>;
  connectOverCDP?: ConnectOverCDP;
}) {
  const envValues = resolveRequiredEnvValues(
    GROK_WEB_LIVE_PROOF_ENV_NAMES,
    args.env,
  );

  if (!envValues) {
    throw new Error("Missing Grok browser session material for browser-session fallback.");
  }

  const cdpUrl = resolveGrokCdpUrl(args.env);
  const connectOverCDP =
    args.connectOverCDP ?? (chromium.connectOverCDP.bind(chromium) as ConnectOverCDP);
  let browser: Awaited<ReturnType<typeof connectOverCDP>> | undefined;

  try {
    browser = await connectGrokBrowserWithRetry(cdpUrl, connectOverCDP);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    if (typeof context.addCookies === "function") {
      await context.addCookies(
        parseGrokCookies(envValues.WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE),
      ).catch(() => undefined);
    }

    const page = await ensureGrokPage(context);
    const result = (await Promise.race([
      page.evaluate(
        async ({ message, model }) => {
          function summarize(value: string) {
            return `${value ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 500);
          }

          const browserGlobal = globalThis as typeof globalThis & {
            location?: { pathname?: string };
          };
          const currentMatch = browserGlobal.location?.pathname?.match(/\/c\/([^/?#]+)/);
          let conversationId = currentMatch?.[1];

          if (!conversationId) {
            const listResponse = await fetch(
              "https://grok.com/rest/app-chat/conversations?limit=1",
              {
                method: "GET",
                credentials: "include",
              },
            );
            const listRaw = await listResponse.text();

            if (listResponse.ok) {
              try {
                const listPayload = JSON.parse(listRaw) as {
                  conversations?: Array<{ conversationId?: string; id?: string }>;
                };
                conversationId =
                  listPayload.conversations?.[0]?.conversationId ??
                  listPayload.conversations?.[0]?.id;
              } catch {
                // fall through to create path
              }
            } else {
              return {
                ok: false,
                stage: "list",
                status: listResponse.status,
                detail: summarize(listRaw),
                raw: listRaw,
              };
            }
          }

          if (!conversationId) {
            const createResponse = await fetch(
              "https://grok.com/rest/app-chat/conversations",
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({}),
              },
            );
            const createRaw = await createResponse.text();

            if (!createResponse.ok) {
              return {
                ok: false,
                stage: "create",
                status: createResponse.status,
                detail: summarize(createRaw),
                raw: createRaw,
              };
            }

            try {
              const createPayload = JSON.parse(createRaw) as {
                conversationId?: string;
                id?: string;
              };
              conversationId = createPayload.conversationId ?? createPayload.id;
            } catch {
              return {
                ok: false,
                stage: "create",
                status: createResponse.status,
                detail: summarize(createRaw),
                raw: createRaw,
              };
            }
          }

          if (!conversationId) {
            return {
              ok: false,
              stage: "create",
              status: 200,
              detail: "Grok browser-session transport could not resolve a conversation id.",
            };
          }

          const response = await fetch(
            `https://grok.com/rest/app-chat/conversations/${conversationId}/responses`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                accept: "application/json, text/event-stream, */*",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                message,
                parentResponseId: crypto.randomUUID(),
                disableSearch: false,
                enableImageGeneration: true,
                imageAttachments: [],
                returnImageBytes: false,
                returnRawGrokInXaiRequest: false,
                fileAttachments: [],
                enableImageStreaming: true,
                imageGenerationCount: 2,
                forceConcise: false,
                toolOverrides: {},
                enableSideBySide: true,
                sendFinalMetadata: true,
                isReasoning: false,
                metadata: { request_metadata: { mode: "auto" } },
                disableTextFollowUps: false,
                disableArtifact: false,
                isFromGrokFiles: false,
                disableMemory: false,
                forceSideBySide: false,
                modelMode: "MODEL_MODE_AUTO",
                isAsyncChat: false,
                skipCancelCurrentInflightRequests: false,
                isRegenRequest: false,
                disableSelfHarmShortCircuit: false,
                deviceEnvInfo: {
                  darkModeEnabled: false,
                  devicePixelRatio: 1,
                  screenWidth: 1440,
                  screenHeight: 900,
                  viewportWidth: 1440,
                  viewportHeight: 900,
                },
                model,
              }),
            },
          );
          const raw = await response.text();

          if (!response.ok) {
            return {
              ok: false,
              stage: "respond",
              status: response.status,
              detail: summarize(raw),
              raw,
            };
          }

          return {
            ok: true,
            raw,
          };
        },
        {
          message: args.message,
          model: args.model,
        },
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Grok browser-session transport timed out after ${GROK_BROWSER_SESSION_TIMEOUT_MS}ms.`,
            ),
          );
        }, GROK_BROWSER_SESSION_TIMEOUT_MS);
      }),
    ])) as GrokBrowserSessionResult;

    if (result.ok !== true) {
      const detail = result.detail ?? result.raw ?? "Unknown Grok browser-session failure.";
      throw new Error(
        `Grok browser-session transport ${result.stage} failed with HTTP ${result.status}: ${summarizeRawTransportOutput("Grok", detail)}`,
      );
    }

    return {
      outputText:
        extractGrokTransportText(result.raw) ??
        extractTextFromEventStream(result.raw) ??
        summarizeRawTransportOutput("Grok", result.raw),
      providerMessageId: `grok-msg-${randomUUID()}`,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
