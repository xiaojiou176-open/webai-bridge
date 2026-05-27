import { describe, expect, it } from "vitest";

import {
  createDiagnostic,
  missingCredentialDiagnostic,
  modelResolutionDiagnostic,
  providerCapabilityDiagnostic,
  providerNotImplementedDiagnostic,
  providerUnavailableDiagnostic,
} from "../../../packages/lanes/byok/src/diagnostics.js";

describe("byok diagnostics helpers", () => {
  it("creates explicit diagnostics with default retry and user-action flags", () => {
    expect(
      createDiagnostic("provider-unavailable", "temporary outage", {
        provider: "gemini",
        modelReference: "gemini/gemini-2.5-pro",
      }),
    ).toEqual({
      code: "provider-unavailable",
      message: "temporary outage",
      provider: "gemini",
      modelReference: "gemini/gemini-2.5-pro",
      state: undefined,
      retryable: false,
      userActionRequired: false,
    });
  });

  it("renders missing credential expectations for any-set and all presence contracts", () => {
    const anySet = missingCredentialDiagnostic(
      "openai",
      "openai/gpt-4o",
      {
        mode: "api-key",
        envNames: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
        description: "OpenAI-compatible credential bundle",
        presence: {
          kind: "any-set",
          envSets: [["OPENAI_API_KEY"], ["OPENAI_BASE_URL", "OPENAI_API_KEY"]],
        },
      },
    );

    const all = missingCredentialDiagnostic(
      "gemini",
      "gemini/gemini-2.5-pro",
      {
        mode: "api-key",
        envNames: ["WEBAI_BRIDGE_GEMINI_API_KEY", "GOOGLE_API_KEY"],
        description: "Gemini BYOK credentials",
        presence: {
          kind: "all",
        },
      },
    );

    expect(anySet.message).toContain("[OPENAI_API_KEY] or [OPENAI_BASE_URL, OPENAI_API_KEY]");
    expect(anySet.userActionRequired).toBe(true);
    expect(all.message).toContain("all of: WEBAI_BRIDGE_GEMINI_API_KEY, GOOGLE_API_KEY");
    expect(all.state).toBe("missing");
  });

  it("renders one-of credential expectations when presence kind falls back to the default branch", () => {
    const oneOf = missingCredentialDiagnostic(
      "anthropic",
      "anthropic/claude-sonnet",
      {
        mode: "api-key",
        envNames: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
        description: "Anthropic credentials",
        presence: {
          kind: "any",
        },
      },
    );

    expect(oneOf.message).toContain("one of: ANTHROPIC_API_KEY, CLAUDE_API_KEY");
    expect(oneOf.userActionRequired).toBe(true);
  });

  it("builds capability, model-resolution, provider-unavailable, and provider-not-implemented diagnostics", () => {
    expect(
      providerCapabilityDiagnostic(
        "openrouter",
        "openrouter/gpt-4o-mini",
        "Tool calling is not available.",
      ),
    ).toEqual(
      expect.objectContaining({
        code: "provider-capability-mismatch",
        provider: "openrouter",
      }),
    );

    expect(modelResolutionDiagnostic("Unknown provider/model")).toEqual(
      expect.objectContaining({
        code: "model-resolution-error",
        userActionRequired: true,
      }),
    );

    expect(
      providerUnavailableDiagnostic(
        "bedrock",
        "bedrock/claude-sonnet",
        "Upstream returned HTTP 503.",
        false,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "provider-unavailable",
        provider: "bedrock",
        retryable: false,
        state: "provider-unavailable",
      }),
    );

    expect(
      providerNotImplementedDiagnostic("groq", "groq/llama-3.3-70b"),
    ).toEqual(
      expect.objectContaining({
        code: "provider-not-implemented",
        provider: "groq",
        userActionRequired: true,
      }),
    );
  });
});
