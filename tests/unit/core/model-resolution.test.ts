import { describe, expect, it } from "vitest";

import {
  createProviderRegistry,
  resolveModelReference,
  WebaiBridgeContractError,
} from "../../../packages/kernel/src/index.js";

describe("model resolution", () => {
  it("derives provider and lane from a requested model reference when the provider is omitted", () => {
    const registry = createProviderRegistry([
      {
        providerId: "gemini",
        laneId: "byok",
        authModes: ["api-key"],
        defaultModel: "gemini/gemini-2.5-flash",
      },
      {
        providerId: "gemini",
        laneId: "web-login",
        authModes: ["web-login"],
        recommendedModel: "gemini/gemini-2.5-pro",
      },
    ]);

    const resolved = resolveModelReference(registry, {
      modelReference: "gemini/gemini-2.5-pro",
    });

    expect(resolved).toEqual({
      providerId: "gemini",
      laneId: "byok",
      model: expect.objectContaining({
        canonical: "gemini/gemini-2.5-pro",
      }),
      source: "requested",
    });
  });

  it("rejects a providerId that conflicts with the requested model reference", () => {
    const registry = createProviderRegistry([
      {
        providerId: "gemini",
        laneId: "byok",
        authModes: ["api-key"],
        defaultModel: "gemini/gemini-2.5-flash",
      },
    ]);

    expect(() =>
      resolveModelReference(registry, {
        providerId: "chatgpt",
        modelReference: "gemini/gemini-2.5-flash",
      }),
    ).toThrowError(WebaiBridgeContractError);
  });

  it("falls back to the recommended model when a lane entry has no default model", () => {
    const registry = createProviderRegistry([
      {
        providerId: "chatgpt",
        laneId: "web-login",
        authModes: ["web-login"],
        recommendedModel: "chatgpt/gpt-4.1",
      },
    ]);

    const resolved = resolveModelReference(registry, {
      providerId: "chatgpt",
      laneId: "web-login",
    });

    expect(resolved).toEqual({
      providerId: "chatgpt",
      laneId: "web-login",
      model: expect.objectContaining({
        canonical: "chatgpt/gpt-4.1",
      }),
      source: "recommended-model",
    });
  });

  it("throws a provider-unsupported error when nothing is registered for the provider", () => {
    const registry = createProviderRegistry([
      {
        providerId: "gemini",
        laneId: "byok",
        authModes: ["api-key"],
        defaultModel: "gemini/gemini-2.5-flash",
      },
    ]);

    expect(() =>
      resolveModelReference(registry, {
        providerId: "chatgpt",
      }),
    ).toThrowError(WebaiBridgeContractError);
  });

  it("throws when a requested lane has neither a default nor a recommended model", () => {
    const registry = createProviderRegistry([
      {
        providerId: "grok",
        laneId: "web-login",
        authModes: ["web-login"],
      },
    ]);

    expect(() =>
      resolveModelReference(registry, {
        providerId: "grok",
        laneId: "web-login",
      }),
    ).toThrowError(WebaiBridgeContractError);
  });
});
