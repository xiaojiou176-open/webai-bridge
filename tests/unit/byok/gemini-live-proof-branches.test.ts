import { describe, expect, it, vi } from "vitest";

import { runGeminiLiveProof } from "../../../packages/providers/byok/gemini/src/live-proof.js";
import geminiByokProvider from "../../../packages/providers/byok/gemini/src/index.js";

describe("Gemini BYOK live-proof branches", () => {
  it("returns an external blocker when no Gemini key is present", async () => {
    const result = await runGeminiLiveProof({});

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        blocker: "missing-gemini-api-key",
      }),
    );
  });

  it("returns a structured provider failure when the HTTP response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        return new Response(JSON.stringify({ error: "quota exceeded" }), {
          status: 503,
          headers: {
            "content-type": "application/json",
          },
        });
      }),
    );

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: "test-gemini-key",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        reason: "invoke-failed",
        envNameUsed: "WEBAI_BRIDGE_GEMINI_API_KEY",
        requestUrl: expect.stringContaining("key=%3Credacted%3E"),
      }),
    );
  });

  it("returns a success payload with redacted request URL and resolved base URL metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "WEBAI_BRIDGE_GEMINI_LIVE_OK" }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
    );

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: "test-gemini-key",
      WEBAI_BRIDGE_GEMINI_BASE_URL: "https://proxy.internal",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        envNameUsed: "WEBAI_BRIDGE_GEMINI_API_KEY",
        baseUrl: "https://proxy.internal",
        baseUrlSource: "env",
        baseUrlEnvName: "WEBAI_BRIDGE_GEMINI_BASE_URL",
        requestUrl:
          "https://proxy.internal/models/gemini-2.5-flash:generateContent?key=%3Credacted%3E",
        responseText: "WEBAI_BRIDGE_GEMINI_LIVE_OK",
      }),
    );
  });

  it("returns prepare-failed when provider preparation fails for a non-credential reason", async () => {
    const prepareText = vi
      .spyOn(geminiByokProvider, "prepareText")
      .mockReturnValue({
        ok: false,
        diagnostics: [
          {
            code: "provider-capability-mismatch",
            message: "Gemini capability mismatch.",
            retryable: false,
            userActionRequired: false,
          },
        ],
      } as never);

    const result = await runGeminiLiveProof({
      WEBAI_BRIDGE_GEMINI_API_KEY: "test-gemini-key",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "failure",
        reason: "prepare-failed",
      }),
    );

    prepareText.mockRestore();
  });

  it("returns invoke-not-implemented when the provider omits its invokeText hook", async () => {
    const prepareText = vi
      .spyOn(geminiByokProvider, "prepareText")
      .mockReturnValue({
        ok: true,
        prepared: {
          transport: {
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test",
            resolvedBaseUrl: {
              value: "https://generativelanguage.googleapis.com/v1beta",
              source: "default",
            },
          },
        },
        diagnostics: [],
      } as never);
    const originalInvokeText = geminiByokProvider.invokeText;
    (geminiByokProvider as { invokeText?: typeof geminiByokProvider.invokeText }).invokeText =
      undefined;

    try {
      const result = await runGeminiLiveProof({
        WEBAI_BRIDGE_GEMINI_API_KEY: "test-gemini-key",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failure",
          reason: "invoke-not-implemented",
        }),
      );
    } finally {
      geminiByokProvider.invokeText = originalInvokeText;
      prepareText.mockRestore();
    }
  });

  it("returns invoke-failed with a raw summary when the provider throws before returning a result", async () => {
    const prepareText = vi
      .spyOn(geminiByokProvider, "prepareText")
      .mockReturnValue({
        ok: true,
        prepared: {
          transport: {
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test",
            resolvedBaseUrl: {
              value: "https://generativelanguage.googleapis.com/v1beta",
              source: "default",
            },
          },
        },
        diagnostics: [],
      } as never);
    const invokeText = vi
      .spyOn(geminiByokProvider, "invokeText")
      .mockRejectedValue(new Error("socket hang up"));

    try {
      const result = await runGeminiLiveProof({
        WEBAI_BRIDGE_GEMINI_API_KEY: "test-gemini-key",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failure",
          reason: "invoke-failed",
          rawSummary: "socket hang up",
        }),
      );
    } finally {
      invokeText.mockRestore();
      prepareText.mockRestore();
    }
  });
});
