import { randomUUID } from "node:crypto";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { QWEN_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractTextFromEventStream,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";
import { urlHostnameHasRootDomain } from "../../shared/url-hosts.js";

const SHARED_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const WEBAI_BRIDGE_BROWSER_MODE_ENV_NAME = "WEBAI_BRIDGE_BROWSER_MODE";
const QWEN_WEB_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const QWEN_WEB_DEFAULT_ISOLATED_CDP_URL = "http://127.0.0.1:9338";
const QWEN_WEB_APP_URL = "https://chat.qwen.ai/";
const QWEN_BROWSER_SESSION_TIMEOUT_MS = 30_000;
const ISOLATED_CHROME_ROOT_MODE = "isolated-chrome-root";
const LEGACY_EXISTING_PROFILE_MODE = "existing-chrome-profile";

type QwenBrowserSessionFailure = {
  ok: false;
  stage: "create" | "completion";
  status: number;
  detail?: string;
  raw?: string;
};

type QwenBrowserSessionSuccess = {
  ok: true;
  raw: string;
};

type QwenBrowserSessionEvaluateResult =
  | QwenBrowserSessionFailure
  | QwenBrowserSessionSuccess;

function resolveQwenBrowserSessionCdpUrl(env: Record<string, string | undefined>) {
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

function extractRequestedToken(prompt: string): string | undefined {
  const match = prompt.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i);
  return match?.[1];
}

async function ensureQwenPage(context: BrowserContext): Promise<Page> {
  const existingPage = context.pages().find((page) =>
    urlHostnameHasRootDomain(page.url(), "qwen.ai"),
  );

  if (existingPage) {
    await existingPage.bringToFront?.().catch(() => {});
    await existingPage.goto(QWEN_WEB_APP_URL, {
      waitUntil: "domcontentloaded",
    }).catch(() => {});
    await existingPage.waitForTimeout(1_000);
    return existingPage;
  }

  const page = await context.newPage();
  await page.goto(QWEN_WEB_APP_URL, {
    waitUntil: "domcontentloaded",
  }).catch(() => {});
  await page.waitForTimeout(1_000);
  return page;
}

export async function invokeQwenBrowserSessionTransport(args: {
  message: string;
  model: string;
  env: Record<string, string | undefined>;
}) {
  const envValues = resolveRequiredEnvValues(QWEN_WEB_LIVE_PROOF_ENV_NAMES, args.env);

  if (!envValues) {
    throw new Error("Missing Qwen browser session material for browser-session fallback.");
  }

  const cdpUrl = resolveQwenBrowserSessionCdpUrl(args.env);
  const requestedToken = extractRequestedToken(args.message);
  const featureConfig = requestedToken
    ? { thinking_enabled: false }
    : { thinking_enabled: true, output_schema: "phase" };
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;

  try {
    browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${cdpUrl}.`);
    }

    const page = await ensureQwenPage(context);
    const result = (await Promise.race([
      page.evaluate(
        async ({ model, message, featureConfig: currentFeatureConfig }) => {
          function summarize(value: string) {
            return `${value ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 500);
          }

          const createResponse = await fetch("https://chat.qwen.ai/api/v2/chats/new", {
            method: "POST",
            credentials: "include",
            headers: {
              accept: "application/json, text/event-stream, */*",
              "content-type": "application/json",
            },
            body: JSON.stringify({}),
          });
          const createRaw = await createResponse.text();

          let createPayload: any;
          try {
            createPayload = JSON.parse(createRaw);
          } catch {
            createPayload = undefined;
          }

          const createDetail =
            createPayload?.data?.details ??
            createPayload?.data?.message ??
            createPayload?.message ??
            summarize(createRaw);
          const chatId =
            createPayload?.data?.id ??
            createPayload?.chat_id ??
            createPayload?.id ??
            createPayload?.chatId;

          if (!createResponse.ok || createPayload?.success === false || !chatId) {
            return {
              ok: false,
              stage: "create",
              status: createResponse.status,
              detail:
                !chatId && createResponse.ok && createPayload?.success !== false
                  ? `Qwen browser session transport did not return a chat id. ${createDetail}`
                  : createDetail,
            };
          }

          const completionResponse = await fetch(
            `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${chatId}`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                accept: "text/event-stream",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                stream: true,
                version: "2.1",
                incremental_output: true,
                chat_id: chatId,
                chat_mode: "normal",
                model,
                parent_id: null,
                messages: [
                  {
                    fid: crypto.randomUUID(),
                    parentId: null,
                    childrenIds: [],
                    role: "user",
                    content: message,
                    user_action: "chat",
                    files: [],
                    timestamp: Math.floor(Date.now() / 1000),
                    models: [model],
                    chat_type: "t2t",
                    feature_config: currentFeatureConfig,
                  },
                ],
              }),
            },
          );
          const completionRaw = await completionResponse.text();

          let completionPayload: any;
          try {
            completionPayload = JSON.parse(completionRaw);
          } catch {
            completionPayload = undefined;
          }

          const completionDetail =
            completionPayload?.data?.details ??
            completionPayload?.data?.message ??
            completionPayload?.message ??
            summarize(completionRaw);

          if (!completionResponse.ok || completionPayload?.success === false) {
            return {
              ok: false,
              stage: "completion",
              status: completionResponse.status,
              detail: completionDetail,
              raw: completionRaw,
            };
          }

          return {
            ok: true,
            raw: completionRaw,
          };
        },
        {
          model: args.model,
          message: args.message,
          featureConfig,
        },
      ),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Qwen browser session transport timed out after ${QWEN_BROWSER_SESSION_TIMEOUT_MS}ms.`,
            ),
          );
        }, QWEN_BROWSER_SESSION_TIMEOUT_MS);
      }),
    ])) as QwenBrowserSessionEvaluateResult;

    if (result.ok !== true) {
      const stage = result.stage;
      const status = result.status;
      const detail = result.detail ?? result.raw ?? "Unknown Qwen browser-session failure.";

      throw new Error(
        `Qwen browser session transport ${stage} failed with HTTP ${status}: ${summarizeRawTransportOutput("Qwen", detail)}`,
      );
    }

    return {
      outputText:
        extractTextFromEventStream(result.raw) ??
        summarizeRawTransportOutput("Qwen", result.raw),
      providerMessageId: `qwen-msg-${randomUUID()}`,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
