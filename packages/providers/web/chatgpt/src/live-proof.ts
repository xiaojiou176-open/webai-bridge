import {
  runJsonWebProbe,
  type WebLiveProofResult,
} from "../../../../lanes/web/src/live-proof.js";

export const CHATGPT_WEB_LIVE_PROOF_ENV_NAMES = [
  "WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE",
  "WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT",
] as const;

export const CHATGPT_WEB_LIVE_PROOF_URL = "https://chatgpt.com/api/auth/session";
const LIVE_PROOF_RERUN_COMMAND = "pnpm exec node scripts/verify-web-login-live.mjs --provider chatgpt";

export async function runChatgptWebLiveProof(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<WebLiveProofResult> {
  return runJsonWebProbe(
    {
      provider: "chatgpt",
      probeUrl: CHATGPT_WEB_LIVE_PROOF_URL,
      requiredEnvNames: CHATGPT_WEB_LIVE_PROOF_ENV_NAMES,
      rerunCommand: LIVE_PROOF_RERUN_COMMAND,
      buildHeaders(resolvedEnv) {
        return {
          accept: "application/json, text/plain, */*",
          cookie: resolvedEnv.WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE,
          "user-agent": resolvedEnv.WEBAI_BRIDGE_WEB_CHATGPT_USER_AGENT,
        };
      },
      validate(body) {
        if (typeof body !== "object" || body == null) {
          return {
            ok: false,
            diagnostic: "ChatGPT auth probe did not return a JSON object.",
          };
        }

        const record = body as {
          user?: { email?: string; name?: string };
          accessToken?: string;
          expires?: string;
        };
        const signal =
          record.user?.email ??
          record.user?.name ??
          record.expires ??
          (typeof record.accessToken === "string" && record.accessToken.length > 0
            ? "chatgpt-access-token"
            : undefined);

        if (!signal) {
          return {
            ok: false,
            diagnostic:
              "ChatGPT auth probe did not expose user, expiry, or access-token metadata.",
          };
        }

        return {
          ok: true,
          signal,
          summary: "ChatGPT auth session endpoint returned authenticated session metadata.",
        };
      },
    },
    env,
    fetchFn,
  );
}
