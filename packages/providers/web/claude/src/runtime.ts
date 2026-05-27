import crypto from "node:crypto";

import {
  createWebProviderRuntime,
  type SessionArtifactRecord,
  type SessionLifecyclePlan,
  type SessionProbeRecord,
  type WebProviderRuntime,
  type WebSessionContractEvaluation,
} from "../../../../lanes/web/src/index.js";
import { CLAUDE_WEB_LIVE_PROOF_ENV_NAMES } from "./live-proof.js";
import {
  extractTextFromEventStream,
  hasRequiredEnvValues,
  parseCookieValue,
  readTextResponse,
  resolveRequiredEnvValues,
  summarizeRawTransportOutput,
} from "../../shared/http-transport.js";

const CLAUDE_CAPABILITIES = {
  textGeneration: true,
  streaming: true,
  toolCalling: true,
  imageInput: true,
  webLogin: true,
  officialApi: false,
} as const;

const CLAUDE_CAPTURE_HANDOFF =
  "Attach the user-owned Chrome profile on claude.ai/new, confirm the session is live, then capture the `sessionKey` cookie, the Claude cookie bundle, the browser user agent, and any discovered `anthropic-device-id` / organization metadata.";
const CLAUDE_REFRESH_HANDOFF =
  "Reuse the attached Claude browser session to rediscover `/api/organizations` metadata and refresh the local device/session context before the degraded window closes.";
const CLAUDE_REAUTH_HANDOFF =
  "Re-open https://claude.ai/new in the attached browser profile, sign in again, and recapture the `sessionKey` cookie plus the Claude browser cookie bundle.";
const CLAUDE_INVOKE_HANDOFF =
  "Reuse the attached Claude browser session to discover `/api/organizations`, create `/api/organizations/{orgId}/chat_conversations`, then POST `/completion` with the captured `sessionKey`, cookie bundle, and `anthropic-device-id`.";
const CLAUDE_INVOKE_MODE = "claude-chat-conversation-completion";
function sanitizeSegment(value?: string): string {
  const sanitized = (value ?? "default")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return sanitized.length > 0 ? sanitized : "default";
}

function buildClaudeProviderMessageId(model: string, accountLabel?: string): string {
  return `claude-web-${sanitizeSegment(model)}-${sanitizeSegment(accountLabel)}`;
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
    source: "claude-sessionkey-probe",
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
    mode: "claude-organization-refresh",
    handoff: CLAUDE_REFRESH_HANDOFF,
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
    mode: "claude-sessionkey-reauth",
    handoff: CLAUDE_REAUTH_HANDOFF,
    reason,
  };
}

function evaluateClaudeSession(args: {
  session: { state: string };
  observedAt: string;
  artifactDetails: SessionArtifactRecord[];
}): WebSessionContractEvaluation {
  const sessionKeyState = artifactState(args.artifactDetails, "claude-session-key");
  const organizationIdState = artifactState(args.artifactDetails, "organization-id");

  if (
    sessionKeyState === "missing" &&
    args.session.state !== "missing" &&
    args.session.state !== "provider-unavailable"
  ) {
    const reason =
      "Claude no longer has a valid `sessionKey` cookie, so the browser session must be re-established by the user.";

    return {
      state: "user-action-required",
      validationState: "stale",
      requiredUserAction: CLAUDE_REAUTH_HANDOFF,
      probe: buildProbe("re-auth-required", reason, args.observedAt),
      refreshEligible: false,
      refresh: buildRefreshPlan("blocked", reason),
      reAuth: buildReAuthPlan("required-now", reason),
    };
  }

  if (
    organizationIdState === "missing" &&
    args.session.state !== "missing" &&
    args.session.state !== "provider-unavailable" &&
    args.session.state !== "expired" &&
    args.session.state !== "user-action-required"
  ) {
    const reason =
      "Claude still has a valid `sessionKey`, but organization discovery has not completed and should be refreshed before chat endpoints are considered stable.";

    return {
      state: "refreshable-but-degraded",
      validationState: "recovering",
      refreshEligible: true,
      degradedReason: reason,
      probe: buildProbe("refresh-recommended", reason, args.observedAt),
      refresh: buildRefreshPlan("available", reason),
      reAuth: buildReAuthPlan("not-needed"),
    };
  }

  const summary =
    "Claude sessionKey and organization context are present for the attached browser session.";
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
    probe: buildProbe(probeStatus, summary, args.observedAt),
    refresh:
      args.session.state === "expiring"
        ? buildRefreshPlan("available", "Claude session is still valid, but the refresh window is closing.")
        : undefined,
  };
}

export function createClaudeWebRuntime(): WebProviderRuntime {
  return createWebProviderRuntime({
    descriptor: {
      provider: "claude",
      displayName: "Claude Web",
      stabilityTarget: "high",
      degradedInvocationPolicy: "allow-with-warning",
      authProfile: {
        mode: "browser-session",
        loginUrl: "https://claude.ai/new",
        accountLabel: "claude:default",
        sessionSource: "claude-browser-profile",
      },
      capabilities: CLAUDE_CAPABILITIES,
      models: [
        {
          id: "claude-sonnet-4-6",
          displayName: "Claude Sonnet 4.6",
          contextWindow: 200000,
          maxOutputTokens: 8192,
          capabilities: CLAUDE_CAPABILITIES,
          alias: "default",
        },
        {
          id: "claude-opus-4-1",
          displayName: "Claude Opus 4.1",
          contextWindow: 200000,
          maxOutputTokens: 8192,
          capabilities: CLAUDE_CAPABILITIES,
        },
      ],
      notes: [
        "Browser-session runtime for Claude Web.",
        "High-stability target in Kernel Beta, but already wired into Kernel Alpha discovery and invocation.",
        "Degraded but refreshable sessions can continue with warnings instead of silently failing over.",
      ],
    },
    defaults: {
      state: "missing",
      note: "Claude subscription/browser session must be captured locally.",
    },
    invokeContract: {
      kind: "synthetic-demo",
      mode: CLAUDE_INVOKE_MODE,
      handoff: CLAUDE_INVOKE_HANDOFF,
      reason:
        "Claude Web currently returns a descriptive alpha stub, not a real browser-backed conversation response.",
    },
    hasInvokeTransport: (context) =>
      hasRequiredEnvValues(CLAUDE_WEB_LIVE_PROOF_ENV_NAMES, context.env ?? process.env),
    invokeTransport: async ({ request, status, context }) => {
      const envValues = resolveRequiredEnvValues(
        CLAUDE_WEB_LIVE_PROOF_ENV_NAMES,
        context.env ?? process.env,
      );

      if (!envValues) {
        throw new Error("Missing Claude browser session material for real transport.");
      }

      const cookieBundle = envValues.WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE;
      const userAgent = envValues.WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT;
      const deviceId =
        parseCookieValue(cookieBundle, "anthropic-device-id") ?? crypto.randomUUID();

      const organizationsResponse = await fetch("https://claude.ai/api/organizations", {
        method: "GET",
        headers: {
          accept: "application/json",
          cookie: cookieBundle,
          "user-agent": userAgent,
          "anthropic-client-platform": "web_claude_ai",
          "anthropic-device-id": deviceId,
        },
      });

      if (!organizationsResponse.ok) {
        throw new Error(
          `Claude organizations probe failed with HTTP ${organizationsResponse.status}.`,
        );
      }

      const organizations = (await organizationsResponse.json()) as Array<{ uuid?: string }>;
      const organizationId = organizations[0]?.uuid;
      const createUrl = organizationId
        ? `https://claude.ai/api/organizations/${organizationId}/chat_conversations`
        : "https://claude.ai/api/chat_conversations";
      const createResponse = await fetch(createUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          cookie: cookieBundle,
          "content-type": "application/json",
          "user-agent": userAgent,
          "anthropic-client-platform": "web_claude_ai",
          "anthropic-device-id": deviceId,
        },
        body: JSON.stringify({
          name: `WebaiBridge ${new Date().toISOString()}`,
          uuid: crypto.randomUUID(),
        }),
      });

      const createRaw = await readTextResponse(createResponse);

      if (!createResponse.ok) {
        throw new Error(
          `Claude conversation creation failed with HTTP ${createResponse.status}: ${summarizeRawTransportOutput("Claude", createRaw)}`,
        );
      }

      const created = JSON.parse(createRaw) as { uuid?: string };
      const conversationId = created.uuid;

      if (!conversationId) {
        throw new Error("Claude conversation creation did not return a conversation uuid.");
      }

      const completionUrl = organizationId
        ? `https://claude.ai/api/organizations/${organizationId}/chat_conversations/${conversationId}/completion`
        : `https://claude.ai/api/chat_conversations/${conversationId}/completion`;
      const completionResponse = await fetch(completionUrl, {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          cookie: cookieBundle,
          "content-type": "application/json",
          "user-agent": userAgent,
          "anthropic-client-platform": "web_claude_ai",
          "anthropic-device-id": deviceId,
        },
        body: JSON.stringify({
          prompt: request.input,
          parent_message_uuid: "00000000-0000-4000-8000-000000000000",
          model: request.model,
          timezone: "America/Los_Angeles",
          rendering_mode: "messages",
          attachments: [],
          files: [],
          locale: "en-US",
          personalized_styles: [],
          sync_sources: [],
          tools: [],
        }),
      });

      const raw = await readTextResponse(completionResponse);

      if (!completionResponse.ok) {
        throw new Error(
          `Claude completion request failed with HTTP ${completionResponse.status}: ${summarizeRawTransportOutput("Claude", raw)}`,
        );
      }

      const accountLabel = status.session.accountLabel ?? "claude:default";

      return {
        outputText:
          extractTextFromEventStream(raw) ??
          summarizeRawTransportOutput("Claude", raw),
        providerMessageId: buildClaudeProviderMessageId(request.model, accountLabel),
      };
    },
    sessionContract: {
      probeSource: "claude-sessionkey-probe",
      artifacts: [
        {
          id: "browser-profile",
          label: "Attached browser profile",
          kind: "browser-profile",
          required: true,
          source: "browser-profile",
          description: "The local Chrome profile attached to claude.ai over CDP.",
        },
        {
          id: "cookie-bundle",
          label: "Captured Claude cookie bundle",
          kind: "cookie-bundle",
          required: true,
          source: "cookie-store",
          description:
            "The claude.ai cookie jar captured from the user-owned browser profile.",
        },
        {
          id: "claude-session-key",
          label: "Claude sessionKey cookie",
          kind: "session-token",
          required: true,
          source: "cookie-store",
          description:
            "The `sessionKey` cookie (for example `sk-ant-sid01-*` / `sk-ant-sid02-*`) required by Claude web.",
        },
        {
          id: "anthropic-device-id",
          label: "Anthropic device id",
          kind: "device-id",
          required: false,
          source: "cookie-store",
          description:
            "The `anthropic-device-id` value reused when replaying the Claude browser session.",
        },
        {
          id: "organization-id",
          label: "Claude organization id",
          kind: "organization-id",
          required: false,
          source: "organization-discovery",
          description:
            "The organization UUID recovered from `/api/organizations` for stable Claude chat endpoints.",
        },
        {
          id: "user-agent",
          label: "Browser user agent",
          kind: "user-agent",
          required: true,
          source: "runtime-derivation",
          description: "The browser user agent captured with the Claude browser session.",
        },
      ],
      capture: {
        mode: "claude-sessionkey-capture",
        referenceUrl: "https://claude.ai/new",
        handoff: CLAUDE_CAPTURE_HANDOFF,
        artifactIds: [
          "browser-profile",
          "cookie-bundle",
          "claude-session-key",
          "user-agent",
        ],
      },
      refresh: {
        supported: true,
        mode: "claude-organization-refresh",
        handoff: CLAUDE_REFRESH_HANDOFF,
      },
      reAuth: {
        mode: "claude-sessionkey-reauth",
        handoff: CLAUDE_REAUTH_HANDOFF,
      },
      evaluate: evaluateClaudeSession,
    },
  });
}
