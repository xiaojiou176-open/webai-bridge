import { randomUUID } from "node:crypto";

import type {
  ProviderStatusView,
  RuntimeInvocationRequest,
  SessionArtifactRecord,
} from "../../../../lanes/web/src/index.js";
import { QWEN_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractTextFromEventStream,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";

export const QWEN_INVOKE_MODE = "qwen-workspace-composer-dispatch";
export const QWEN_TRANSPORT_ENTRYPOINT = "https://chat.qwen.ai";
export const QWEN_INVOKE_HANDOFF =
  "Dispatch Qwen traffic through the authenticated workspace/composer transport using the attached browser profile, chat.qwen.ai session cookie, and captured session token.";

function extractRequestedToken(prompt: string): string | undefined {
  const match = prompt.match(/exactly\s+([A-Z0-9_:-]+)\s+and nothing else/i);
  return match?.[1];
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

function buildQwenTransportText(
  request: RuntimeInvocationRequest,
  status: ProviderStatusView,
): string {
  return `Qwen Web alpha runtime dispatched ${request.model} for ${status.session.accountLabel ?? "qwen:default"} via ${status.authMode} from ${status.session.sessionSource ?? "qwen-browser-profile"}; transport ${QWEN_INVOKE_MODE} against authenticated workspace/composer on ${QWEN_TRANSPORT_ENTRYPOINT}; session ${status.sessionPresence}, readiness ${status.runtimeReadiness}; ${buildProbeClause(status)}; ${buildRefreshClause(status)}; ${buildReAuthClause(status)}; ${buildValidationClause(status)}; artifacts ${summarizeArtifacts(status.session.artifactDetails)}; input ${request.input.length} chars.`;
}

export async function invokeQwenTransport(args: {
  request: RuntimeInvocationRequest;
  status: ProviderStatusView;
  context: { env?: Record<string, string | undefined> };
}) {
  const envValues = resolveRequiredEnvValues(
    QWEN_WEB_LIVE_PROOF_ENV_NAMES,
    args.context.env ?? process.env,
  );

  if (!envValues) {
    throw new Error("Missing Qwen browser session material for real transport.");
  }

  const baseHeaders = {
    accept: "application/json, text/event-stream, */*",
    cookie: envValues.WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE,
    "content-type": "application/json",
    "user-agent": envValues.WEBAI_BRIDGE_WEB_QWEN_USER_AGENT,
  };

  const createResponse = await fetch("https://chat.qwen.ai/api/v2/chats/new", {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({}),
  });
  const createRaw = await createResponse.text();

  if (!createResponse.ok) {
    throw new Error(
      `Qwen chat creation failed with HTTP ${createResponse.status}: ${summarizeRawTransportOutput("Qwen", createRaw)}`,
    );
  }

  const createData = JSON.parse(createRaw) as {
    success?: boolean;
    data?: {
      id?: string;
      code?: string;
      details?: string;
      message?: string;
    };
    message?: string;
    chat_id?: string;
    id?: string;
    chatId?: string;
  };
  const detail =
    createData.data?.details ??
    createData.data?.message ??
    createData.message ??
    summarizeRawTransportOutput("Qwen", createRaw);

  if (
    createData.success === false &&
    (
      `${createData.data?.code ?? ""}`.toLowerCase() === "unauthorized" ||
      detail.toLowerCase().includes("do not have permission") ||
      detail.toLowerCase().includes("contact your administrator")
    )
  ) {
    throw new Error(`Qwen chat creation reported Unauthorized. ${detail}`);
  }

  const chatId =
    createData.data?.id ?? createData.chat_id ?? createData.id ?? createData.chatId;

  if (!chatId) {
    throw new Error(`Qwen chat creation did not return a chat id. ${detail}`);
  }

  const requestedToken = extractRequestedToken(args.request.input);
  const featureConfig = requestedToken
    ? { thinking_enabled: false }
    : { thinking_enabled: true, output_schema: "phase" };

  const response = await fetch(`https://chat.qwen.ai/api/v2/chat/completions?chat_id=${chatId}`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      stream: true,
      version: "2.1",
      incremental_output: true,
      chat_id: chatId,
      chat_mode: "normal",
      model: args.request.model,
      parent_id: null,
      messages: [
        {
          fid: randomUUID(),
          parentId: null,
          childrenIds: [],
          role: "user",
          content: args.request.input,
          user_action: "chat",
          files: [],
          timestamp: Math.floor(Date.now() / 1000),
          models: [args.request.model],
          chat_type: "t2t",
          feature_config: featureConfig,
        },
      ],
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Qwen completion request failed with HTTP ${response.status}: ${summarizeRawTransportOutput("Qwen", raw)}`,
    );
  }

  try {
    const parsed = JSON.parse(raw) as {
      success?: boolean;
      data?: {
        code?: string;
        details?: string;
        message?: string;
      };
      message?: string;
    };

    if (parsed.success === false) {
      const detail =
        parsed.data?.details ??
        parsed.data?.message ??
        parsed.message ??
        summarizeRawTransportOutput("Qwen", raw);

      throw new Error(`Qwen completion payload reported failure: ${detail}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      // SSE/text responses are handled below.
    } else {
      throw error;
    }
  }

  return {
    outputText:
      extractTextFromEventStream(raw) ??
      summarizeRawTransportOutput("Qwen", raw),
    providerMessageId: `qwen-msg-${randomUUID()}`,
  };
}
