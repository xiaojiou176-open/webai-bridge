import {
  runJsonWebProbe,
  type WebLiveProofResult,
} from "../../../../lanes/web/src/live-proof.js";

export const CLAUDE_WEB_LIVE_PROOF_ENV_NAMES = [
  "WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE",
  "WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT",
] as const;

export const CLAUDE_WEB_LIVE_PROOF_URL = "https://claude.ai/api/organizations";
const LIVE_PROOF_RERUN_COMMAND = "pnpm exec node scripts/verify-web-login-live.mjs --provider claude";

export async function runClaudeWebLiveProof(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<WebLiveProofResult> {
  return runJsonWebProbe(
    {
      provider: "claude",
      probeUrl: CLAUDE_WEB_LIVE_PROOF_URL,
      requiredEnvNames: CLAUDE_WEB_LIVE_PROOF_ENV_NAMES,
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
      buildHeaders(resolvedEnv) {
        return {
          accept: "application/json, text/plain, */*",
          cookie: resolvedEnv.WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE,
          "user-agent": resolvedEnv.WEBAI_BRIDGE_WEB_CLAUDE_USER_AGENT,
        };
      },
      validate(body) {
        if (Array.isArray(body) && body.length > 0) {
          return {
            ok: true,
            signal: "claude-organizations",
            summary: "Claude organizations endpoint returned at least one organization.",
          };
        }

        if (typeof body === "object" && body != null) {
          const record = body as {
            organizations?: unknown[];
            organizationId?: string;
          };

          if (
            (Array.isArray(record.organizations) && record.organizations.length > 0) ||
            typeof record.organizationId === "string"
          ) {
            return {
              ok: true,
              signal: "claude-organizations",
              summary:
                "Claude organization probe returned organization metadata for the browser session.",
            };
          }
        }

        return {
          ok: false,
          diagnostic:
            "Claude organization probe did not return organizations or organization metadata.",
        };
      },
    },
    env,
    fetchFn,
  );
}
