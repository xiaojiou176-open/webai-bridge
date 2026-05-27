import { describe, expect, it, vi } from "vitest";

import { createWebaiBridgeServiceClient } from "../../../packages/sdk/src/index.js";

describe("WebaiBridge service client branch coverage", () => {
  it("merges default headers, per-request headers, and JSON bodies across the provider routes", async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          request: {
            method: init?.method ?? "GET",
            body: init?.body ?? null,
          },
        };
      },
    }));

    const client = createWebaiBridgeServiceClient({
      baseUrl: "http://127.0.0.1:4317",
      fetch: fetchMock as unknown as typeof fetch,
      headers: {
        authorization: "Bearer shared-token",
      },
    });

    await client.entrypoint();
    await client.authStatus();
    await client.health();
    await client.providerStatus("chatgpt");
    await client.providerProbe("chatgpt");
    await client.providerRemediation("chatgpt");
    await client.startProviderAcquisition("chatgpt", {
      mode: "managed-browser",
    });
    await client.captureProviderAcquisition("chatgpt", {
      mode: "existing-browser-session",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4317/v1/runtime/providers/chatgpt/acquisition/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "managed-browser",
        }),
        headers: expect.any(Headers),
      }),
    );

    const startHeaders = fetchMock.mock.calls[6]?.[1]?.headers as Headers;
    expect(startHeaders.get("authorization")).toBe("Bearer shared-token");
    expect(startHeaders.get("content-type")).toBe("application/json");
  });

  it("throws an enriched error when the service responds with a non-2xx payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      async json() {
        return {
          error: {
            type: "missing-credential",
          },
        };
      },
    }));

    const client = createWebaiBridgeServiceClient({
      baseUrl: "http://127.0.0.1:4317",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.invoke({
        provider: "chatgpt",
        model: "gpt-4o",
        input: "HELLO",
      }),
    ).rejects.toMatchObject({
      status: 409,
      payload: {
        error: {
          type: "missing-credential",
        },
      },
    });
  });
});
