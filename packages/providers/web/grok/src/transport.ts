import { randomUUID } from "node:crypto";

import type {
  ProviderStatusView,
  RuntimeInvocationRequest,
  SessionArtifactRecord,
} from "../../../../lanes/web/src/index.js";
import { GROK_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractTextFromEventStream,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";

export const GROK_INVOKE_MODE = "grok-home-composer-dispatch";
export const GROK_TRANSPORT_ENTRYPOINT = "https://grok.com";
export const GROK_INVOKE_HANDOFF =
  "Dispatch Grok traffic through the authenticated Grok home/composer transport using the attached browser profile, grok.com session cookie, and OAuth/browser session artifacts.";
const GROK_TRANSPORT_TIMEOUT_MS = 20_000;

export function extractGrokTransportText(raw: string): string | undefined {
  const chunks: string[] = [];
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;

    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const data = JSON.parse(payload) as {
        contentDelta?: unknown;
        textDelta?: unknown;
        content?: unknown;
        text?: unknown;
        delta?: unknown;
      };
      const candidate =
        typeof data.contentDelta === "string"
          ? data.contentDelta
          : typeof data.textDelta === "string"
            ? data.textDelta
            : typeof data.content === "string"
              ? data.content
              : typeof data.text === "string"
                ? data.text
                : typeof data.delta === "string"
                  ? data.delta
                  : undefined;

      if (candidate) {
        chunks.push(candidate);
      }
    } catch {
      // Ignore non-NDJSON payloads and fall back to generic extraction below.
    }
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return chunks.join("");
}

function summarizeArtifacts(
  artifactDetails: SessionArtifactRecord[] | undefined,
): string {
  const requiredArtifacts = artifactDetails?.filter((artifact) => artifact.required) ?? [];

  if (requiredArtifacts.length === 0) {
    return "required artifacts are not yet reported";
  }

  return requiredArtifacts
    .map((artifact) => `${artifact.id}:${artifact.state}`)
    .join(", ");
}

function buildValidationClause(status: ProviderStatusView): string {
  return status.session.lastValidatedAt
    ? `last validated at ${status.session.lastValidatedAt}`
    : `validation ${status.session.validationState ?? "unknown"}`;
}

function buildProbeClause(status: ProviderStatusView): string {
  return status.session.probe
    ? `probe ${status.session.probe.status} via ${status.session.probe.source}`
    : "probe not reported";
}

function buildRefreshClause(status: ProviderStatusView): string {
  return status.session.refresh
    ? `refresh ${status.session.refresh.status} via ${status.session.refresh.mode}`
    : "refresh handoff not reported";
}

function buildReAuthClause(status: ProviderStatusView): string {
  return status.session.reAuth
    ? `re-auth ${status.session.reAuth.status} via ${status.session.reAuth.mode}`
    : "re-auth handoff not reported";
}

function buildGrokTransportText(
  request: RuntimeInvocationRequest,
  status: ProviderStatusView,
): string {
  return `Grok Web alpha runtime dispatched ${request.model} for ${status.session.accountLabel ?? "grok:default"} via ${status.authMode} from ${status.session.sessionSource ?? "grok-x-oauth"}; transport ${GROK_INVOKE_MODE} against authenticated Grok home/composer on ${GROK_TRANSPORT_ENTRYPOINT}; session ${status.sessionPresence}, readiness ${status.runtimeReadiness}; ${buildProbeClause(status)}; ${buildRefreshClause(status)}; ${buildReAuthClause(status)}; ${buildValidationClause(status)}; artifacts ${summarizeArtifacts(status.session.artifactDetails)}; input ${request.input.length} chars.`;
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; raw: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GROK_TRANSPORT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const raw = await response.text();

    return {
      response,
      raw,
    };
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new Error(
        `Grok transport timed out after ${GROK_TRANSPORT_TIMEOUT_MS}ms while requesting ${url}.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function invokeGrokTransport(args: {
  request: RuntimeInvocationRequest;
  status: ProviderStatusView;
  context: { env?: Record<string, string | undefined> };
}) {
  const envValues = resolveRequiredEnvValues(
    GROK_WEB_LIVE_PROOF_ENV_NAMES,
    args.context.env ?? process.env,
  );

  if (!envValues) {
    throw new Error("Missing Grok browser session material for real transport.");
  }

  const baseHeaders = {
    accept: "application/json, text/event-stream, */*",
    "accept-language": "en-US,en;q=0.9",
    cookie: envValues.WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE,
    "content-type": "application/json",
    origin: "https://grok.com",
    referer: "https://grok.com/",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": envValues.WEBAI_BRIDGE_WEB_GROK_USER_AGENT,
  };

  let conversationId: string | undefined;

  for (const url of [
    "https://grok.com/rest/app-chat/conversations?limit=1",
    "https://grok.com/rest/app-chat/conversations",
  ]) {
    const { response, raw } = await fetchTextWithTimeout(url, {
      method: "GET",
      headers: baseHeaders,
    });

    if (!response.ok) {
      continue;
    }

    let list: {
      conversations?: Array<{ conversationId?: string; id?: string }>;
    };

    try {
      list = JSON.parse(raw) as {
        conversations?: Array<{ conversationId?: string; id?: string }>;
      };
    } catch {
      continue;
    }

    conversationId =
      list.conversations?.[0]?.conversationId ?? list.conversations?.[0]?.id;

    if (conversationId) {
      break;
    }
  }

  if (!conversationId) {
    const { response, raw } = await fetchTextWithTimeout("https://grok.com/rest/app-chat/conversations", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(
        `Grok conversation creation failed with HTTP ${response.status}: ${summarizeRawTransportOutput("Grok", raw)}`,
      );
    }

    const created = JSON.parse(raw) as { conversationId?: string; id?: string };
    conversationId = created.conversationId ?? created.id;
  }

  if (!conversationId) {
    throw new Error("Grok transport could not resolve a conversation id.");
  }

  const { response, raw } = await fetchTextWithTimeout(
    `https://grok.com/rest/app-chat/conversations/${conversationId}/responses`,
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        message: args.request.input,
        parentResponseId: randomUUID(),
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
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Grok response request failed with HTTP ${response.status}: ${summarizeRawTransportOutput("Grok", raw)}`,
    );
  }

  return {
    outputText:
      extractGrokTransportText(raw) ??
      extractTextFromEventStream(raw) ??
      summarizeRawTransportOutput("Grok", raw),
    providerMessageId: `grok-msg-${randomUUID()}`,
  };
}
