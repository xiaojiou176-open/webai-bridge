import { randomUUID } from "node:crypto";

import {
  createWebProviderRuntime,
  type SessionArtifactRecord,
  type SessionLifecyclePlan,
  type SessionProbeRecord,
  type WebProviderRuntime,
  type WebSessionContractEvaluation,
} from "../../../../lanes/web/src/index.js";
import { CHATGPT_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractTextFromEventStream,
  hasRequiredEnvValues,
  readTextResponse,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";

const CHATGPT_CAPABILITIES = {
  textGeneration: true,
  streaming: true,
  toolCalling: true,
  imageInput: true,
  webLogin: true,
  officialApi: false,
} as const;

const CHATGPT_CAPTURE_HANDOFF =
  "Open https://chatgpt.com in the user-owned Chrome profile, confirm the browser session is live, then capture the cookie jar, `__Secure-next-auth.session-token`, `/api/auth/session` access token, and the active user agent.";
const CHATGPT_REFRESH_HANDOFF =
  "Reuse the attached ChatGPT browser session to refresh `/api/auth/session` and rerun the sentinel prepare/finalize handshake before the degraded window closes.";
const CHATGPT_REAUTH_HANDOFF =
  "Re-open https://chatgpt.com in the attached browser profile, sign in again, and recapture `__Secure-next-auth.session-token` plus the `/api/auth/session` access token.";
const CHATGPT_INVOKE_HANDOFF =
  "Reuse the captured ChatGPT cookie jar, refresh `/api/auth/session`, warm `backend-api/conversation/init` plus the sentinel chat-requirements handshake, then POST `https://chatgpt.com/backend-api/conversation` with the captured browser user agent.";
const CHATGPT_INVOKE_MODE = "chatgpt-backend-api-conversation";
const CHATGPT_TRANSPORT_FALLBACK_TIMEOUT_MS = 20_000;

function extractRequestedToken(prompt: string): string | undefined {
  const match = prompt.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i);
  return match?.[1];
}

function normalizeTokenText(value: string): string {
  return value.replace(/[\s\u200B-\u200D\uFEFF]+/g, "").toLowerCase();
}

function buildChatgptBrowserLikeHeaders(args: {
  accessToken: string;
  cookieBundle: string;
  deviceId: string;
  userAgent: string;
  accept: string;
}): Record<string, string> {
  return {
    accept: args.accept,
    "accept-language": "en-US,en;q=0.9",
    authorization: `Bearer ${args.accessToken}`,
    "content-type": "application/json",
    cookie: args.cookieBundle,
    "oai-device-id": args.deviceId,
    "oai-language": "en-US",
    origin: "https://chatgpt.com",
    referer: "https://chatgpt.com/",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": args.userAgent,
  };
}

async function warmChatgptConversation(args: {
  accessToken: string;
  cookieBundle: string;
  deviceId: string;
  userAgent: string;
}) {
  const warmHeaders = buildChatgptBrowserLikeHeaders({
    ...args,
    accept: "application/json, text/plain, */*",
  });

  for (const endpoint of [
    "https://chatgpt.com/backend-api/conversation/init",
    "https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare",
    "https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize",
  ]) {
    await fetch(endpoint, {
      method: "POST",
      headers: warmHeaders,
      body: "{}",
    }).catch(() => undefined);
  }
}

async function invokeChatgptTransportWithTimeout<T>(run: () => Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `ChatGPT transport timed out after ${CHATGPT_TRANSPORT_FALLBACK_TIMEOUT_MS}ms before the browser DOM fallback could take over.`,
            ),
          );
        }, CHATGPT_TRANSPORT_FALLBACK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sanitizeSegment(value?: string): string {
  const sanitized = (value ?? "default")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return sanitized.length > 0 ? sanitized : "default";
}

function buildChatgptProviderMessageId(model: string, accountLabel?: string): string {
  return `chatgpt-web-${sanitizeSegment(model)}-${sanitizeSegment(accountLabel)}`;
}

function artifactState(
  artifactDetails: SessionArtifactRecord[],
  id: string,
): SessionArtifactRecord["state"] {
  return artifactDetails.find((artifact) => artifact.id === id)?.state ?? "missing";
}

function buildProbe(
  status: SessionProbeRecord["status"],
  summary: string,
  checkedAt?: string,
): SessionProbeRecord {
  return {
    status,
    source: "chatgpt-auth-session-probe",
    checkedAt,
    summary,
  };
}

function buildRefreshPlan(
  status: SessionLifecyclePlan["status"],
  reason?: string,
): SessionLifecyclePlan {
  return {
    supported: true,
    status,
    mode: "chatgpt-auth-session-refresh",
    handoff: CHATGPT_REFRESH_HANDOFF,
    reason,
  };
}

function buildReAuthPlan(
  status: SessionLifecyclePlan["status"],
  reason?: string,
): SessionLifecyclePlan {
  return {
    supported: true,
    status,
    mode: "chatgpt-browser-session-reauth",
    handoff: CHATGPT_REAUTH_HANDOFF,
    reason,
  };
}

function evaluateChatgptSession(args: {
  session: { state: string };
  observedAt: string;
  artifactDetails: SessionArtifactRecord[];
}): WebSessionContractEvaluation {
  const nextAuthTokenState = artifactState(
    args.artifactDetails,
    "next-auth-session-token",
  );
  const accessTokenState = artifactState(args.artifactDetails, "openai-access-token");
  const sentinelState = artifactState(args.artifactDetails, "sentinel-chat-requirements");

  if (
    nextAuthTokenState === "missing" &&
    args.session.state !== "missing" &&
    args.session.state !== "provider-unavailable"
  ) {
    const reason =
      "ChatGPT can no longer prove the browser login because the `__Secure-next-auth.session-token` cookie is missing.";

    return {
      state: "user-action-required",
      validationState: "stale",
      requiredUserAction: CHATGPT_REAUTH_HANDOFF,
      probe: buildProbe("re-auth-required", reason, args.observedAt),
      refreshEligible: false,
      refresh: buildRefreshPlan("blocked", reason),
      reAuth: buildReAuthPlan("required-now", reason),
    };
  }

  if (
    accessTokenState === "missing" &&
    args.session.state !== "missing" &&
    args.session.state !== "provider-unavailable"
  ) {
    const reason =
      "ChatGPT browser cookies are still present, but the `/api/auth/session` access token is missing and must be re-captured.";

    return {
      state:
        args.session.state === "expired"
          ? "expired"
          : "refreshable-but-degraded",
      validationState: "recovering",
      refreshEligible: true,
      degradedReason: reason,
      probe: buildProbe("refresh-recommended", reason, args.observedAt),
      refresh: buildRefreshPlan("available", reason),
      reAuth: buildReAuthPlan("not-needed"),
    };
  }

  const sentinelSummary =
    sentinelState === "missing"
      ? "ChatGPT session token and access token are present; the sentinel/chat-requirements warmup will be refreshed lazily at invoke time."
      : "ChatGPT session token, access token, and sentinel handshake artifacts are all present.";

  const probeStatus =
    args.session.state === "expiring"
      ? "refresh-recommended"
      : args.session.state === "refreshable-but-degraded"
        ? "refresh-recommended"
        : args.session.state === "ready"
          ? "session-valid"
          : undefined;

  if (!probeStatus) {
    return {};
  }

  return {
    probe: buildProbe(probeStatus, sentinelSummary, args.observedAt),
    refresh:
      args.session.state === "expiring"
        ? buildRefreshPlan("available", "ChatGPT session is approaching expiry while the browser login is still usable.")
        : undefined,
  };
}

export function createChatgptWebRuntime(): WebProviderRuntime {
  return createWebProviderRuntime({
    descriptor: {
      provider: "chatgpt",
      displayName: "ChatGPT Web",
      stabilityTarget: "high",
      degradedInvocationPolicy: "allow-with-warning",
      authProfile: {
        mode: "browser-session",
        loginUrl: "https://chatgpt.com",
        accountLabel: "chatgpt:default",
        sessionSource: "chatgpt-browser-profile",
      },
      capabilities: CHATGPT_CAPABILITIES,
      models: [
        {
          id: "gpt-4o",
          displayName: "GPT-4o",
          contextWindow: 128000,
          maxOutputTokens: 8192,
          capabilities: CHATGPT_CAPABILITIES,
          alias: "default",
        },
        {
          id: "gpt-4.1",
          displayName: "GPT-4.1",
          contextWindow: 128000,
          maxOutputTokens: 8192,
          capabilities: CHATGPT_CAPABILITIES,
        },
      ],
      notes: [
        "Web/Login runtime landing zone for ChatGPT browser session transport.",
        "Single-provider, single-account baseline. No pooling or implicit failover.",
        "High-stability target: degraded but refreshable sessions can continue with warnings.",
      ],
    },
    defaults: {
      state: "missing",
      note: "Local browser session must be captured before invocation.",
    },
    invokeContract: {
      kind: "synthetic-demo",
      mode: CHATGPT_INVOKE_MODE,
      handoff: CHATGPT_INVOKE_HANDOFF,
      reason:
        "ChatGPT Web currently returns a descriptive alpha stub, not a real browser-backed conversation response.",
    },
    hasInvokeTransport: (context) =>
      hasRequiredEnvValues(CHATGPT_WEB_LIVE_PROOF_ENV_NAMES, context.env ?? process.env),
    invokeTransport: async ({ request, status, context }) => {
      const accountLabel = status.session.accountLabel ?? "chatgpt:default";

      try {
        return await invokeChatgptTransportWithTimeout(async () => {
          const envValues = resolveRequiredEnvValues(
            CHATGPT_WEB_LIVE_PROOF_ENV_NAMES,
            context.env ?? process.env,
          );

          if (!envValues) {
            throw new Error("Missing ChatGPT browser session material for real transport.");
          }

          const sessionResponse = await fetch("https://chatgpt.com/api/auth/session", {
            method: "GET",
            headers: {
              accept: "application/json, text/plain, */*",
              cookie: envValues.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE,
              referer: "https://chatgpt.com/",
              "user-agent": envValues.WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT,
            },
          });

          if (!sessionResponse.ok) {
            throw new Error(`ChatGPT auth session probe failed with HTTP ${sessionResponse.status}.`);
          }

          const session = (await sessionResponse.json()) as {
            accessToken?: string;
            oaiDeviceId?: string;
          };
          const accessToken = session.accessToken;
          const deviceId = session.oaiDeviceId ?? randomUUID();

          if (!accessToken) {
            throw new Error("ChatGPT auth session did not return an access token.");
          }

          await warmChatgptConversation({
            accessToken,
            cookieBundle: envValues.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE,
            deviceId,
            userAgent: envValues.WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT,
          });

          const body = {
            action: "next",
            messages: [
              {
                id: randomUUID(),
                author: { role: "user" },
                content: {
                  content_type: "text",
                  parts: [request.input],
                },
              },
            ],
            parent_message_id: randomUUID(),
            model: request.model,
            timezone_offset_min: new Date().getTimezoneOffset(),
            history_and_training_disabled: false,
            conversation_mode: { kind: "primary_assistant", plugin_ids: null },
            force_paragen: false,
            force_paragen_model_slug: "",
            force_rate_limit: false,
            reset_rate_limits: false,
            force_use_sse: true,
          };

          const response = await fetch("https://chatgpt.com/backend-api/conversation", {
            method: "POST",
            headers: buildChatgptBrowserLikeHeaders({
              accessToken,
              cookieBundle: envValues.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE,
              deviceId,
              userAgent: envValues.WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT,
              accept: "text/event-stream",
            }),
            body: JSON.stringify(body),
          });

          const raw = await readTextResponse(response);

          if (!response.ok) {
            const canRetryInBrowser =
              response.status === 403 ||
              (response.status === 401 &&
                /token_revoked|token_invalidated|invalidated oauth token|authentication token has been invalidated|try signing in again/i.test(
                  raw,
                ));

            if (canRetryInBrowser) {
              const { invokeChatgptBrowserDomTransport } = await import("./browser-dom-transport.js");
              const outputText = await invokeChatgptBrowserDomTransport(
                {
                  message: request.input,
                },
                context.env ?? process.env,
              );

              return {
                outputText,
                providerMessageId: buildChatgptProviderMessageId(request.model, accountLabel),
              };
            }

            throw new Error(
              `ChatGPT conversation request failed with HTTP ${response.status}: ${summarizeRawTransportOutput("ChatGPT", raw)}`,
            );
          }

          const requestedToken = extractRequestedToken(request.input);
          const extractedText =
            extractTextFromEventStream(raw) ??
            summarizeRawTransportOutput("ChatGPT", raw);
          const normalizedRequestedToken = requestedToken
            ? normalizeTokenText(requestedToken)
            : undefined;
          const normalizedExtractedText = normalizeTokenText(extractedText);

          return {
            outputText:
              normalizedRequestedToken &&
              normalizedExtractedText.includes(normalizedRequestedToken)
                ? requestedToken!
                : extractedText,
            providerMessageId: buildChatgptProviderMessageId(request.model, accountLabel),
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";

        if (message.includes("timed out")) {
          const { invokeChatgptBrowserDomTransport } = await import("./browser-dom-transport.js");
          const outputText = await invokeChatgptBrowserDomTransport(
            {
              message: request.input,
            },
            context.env ?? process.env,
          );

          return {
            outputText,
            providerMessageId: buildChatgptProviderMessageId(request.model, accountLabel),
          };
        }

        throw error;
      }
    },
    sessionContract: {
      probeSource: "chatgpt-auth-session-probe",
      artifacts: [
        {
          id: "browser-profile",
          label: "Attached browser profile",
          kind: "browser-profile",
          required: true,
          source: "browser-profile",
          description: "The local Chrome profile attached to chatgpt.com over CDP.",
        },
        {
          id: "cookie-bundle",
          label: "Captured cookie bundle",
          kind: "cookie-bundle",
          required: true,
          source: "cookie-store",
          description: "The full chatgpt.com/openai.com cookie jar captured from the user-owned browser profile.",
        },
        {
          id: "next-auth-session-token",
          label: "NextAuth session token",
          kind: "session-token",
          required: true,
          source: "cookie-store",
          description:
            "The `__Secure-next-auth.session-token` cookie (or split `.0`/`.1` pair) that proves the ChatGPT web login.",
        },
        {
          id: "openai-access-token",
          label: "OpenAI access token",
          kind: "access-token",
          required: true,
          source: "request-capture",
          description:
            "The access token recovered from `/api/auth/session`, reused for ChatGPT web API calls.",
        },
        {
          id: "user-agent",
          label: "Browser user agent",
          kind: "user-agent",
          required: true,
          source: "runtime-derivation",
          description: "The browser user agent captured alongside the local ChatGPT session.",
        },
        {
          id: "sentinel-chat-requirements",
          label: "Sentinel chat requirements",
          kind: "sentinel",
          required: false,
          source: "runtime-derivation",
          description:
            "The warmup/sentinel handshake used before `backend-api/conversation` on ChatGPT web.",
        },
      ],
      capture: {
        mode: "chatgpt-browser-cdp-capture",
        referenceUrl: "https://chatgpt.com",
        handoff: CHATGPT_CAPTURE_HANDOFF,
        artifactIds: [
          "browser-profile",
          "cookie-bundle",
          "next-auth-session-token",
          "openai-access-token",
          "user-agent",
        ],
      },
      refresh: {
        supported: true,
        mode: "chatgpt-auth-session-refresh",
        handoff: CHATGPT_REFRESH_HANDOFF,
      },
      reAuth: {
        mode: "chatgpt-browser-session-reauth",
        handoff: CHATGPT_REAUTH_HANDOFF,
      },
      evaluate: evaluateChatgptSession,
    },
  });
}
