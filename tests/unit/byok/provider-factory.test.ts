import { describe, expect, it, vi } from "vitest";

import {
  createDescriptorProvider,
  createProviderModelFactory,
  hasRequiredCredential,
  resolveCredentialValue,
  resolveTransportBaseUrl,
} from "../../../packages/providers/byok/shared/provider-factory.js";

describe("BYOK provider factory", () => {
  it("builds provider-scoped model factories", () => {
    const factory = createProviderModelFactory("gemini");

    expect(factory.provider).toBe("gemini");
    expect(factory("gemini-2.5-pro").id).toBe("gemini/gemini-2.5-pro");
  });

  it("normalizes transport defaults, respects env overrides, and reports missing credentials", () => {
    const provider = createDescriptorProvider({
      provider: "anthropic",
      displayName: "Anthropic",
      credential: {
        mode: "api-key",
        envNames: ["ANTHROPIC_API_KEY"],
        description: "Anthropic API key",
        presence: { kind: "any" },
      },
      capabilities: {
        textGeneration: true,
      },
      modelCatalog: {
        mode: "inline-default",
        defaultModel: "anthropic/claude-3-7-sonnet",
      },
      transport: {
        family: "anthropic-messages",
        method: "POST",
        requestShape: "messages",
        baseUrl: "https://api.anthropic.com/",
        baseUrlEnvNames: ["ANTHROPIC_BASE_URL"],
        path: "/v1/messages",
        auth: {
          scheme: "x-api-key",
        },
      },
    });

    const missing = provider.prepareText(
      {
        model: provider.createModel("claude-3-7-sonnet"),
        input: {
          prompt: "hello",
        },
      },
      {
        env: {},
        fetch: vi.fn() as unknown as typeof fetch,
      },
    );

    expect(missing.ok).toBe(false);
    expect(missing.diagnostics[0]?.code).toBe("missing-credential");

    const prepared = provider.prepareText(
      {
        model: provider.createModel("claude-3-7-sonnet"),
        input: {
          prompt: "hello",
        },
      },
      {
        env: {
          ANTHROPIC_API_KEY: "secret",
          ANTHROPIC_BASE_URL: "https://proxy.internal/",
        },
        fetch: vi.fn() as unknown as typeof fetch,
      },
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error("Expected prepared provider payload.");
    }

    expect(prepared.prepared.transport.contract.path).toBe("/v1/messages");
    expect(prepared.prepared.transport.contract.auth.scheme).toBe("x-api-key");
    expect(prepared.prepared.transport.resolvedBaseUrl).toEqual({
      value: "https://proxy.internal",
      source: "env",
      envName: "ANTHROPIC_BASE_URL",
    });
  });

  it("covers credential helpers for any-set and all presence contracts", () => {
    expect(
      hasRequiredCredential(
        {
          A: "1",
          B: "2",
        },
        {
          mode: "api-key",
          envNames: ["A", "B"],
          description: "all credentials",
          presence: { kind: "all" },
        },
      ),
    ).toBe(true);

    expect(
      hasRequiredCredential(
        {
          A: "1",
          C: "3",
        },
        {
          mode: "api-key",
          envNames: ["A", "B", "C"],
          description: "any-set credentials",
          presence: { kind: "any-set", envSets: [["A", "B"], ["C"]] },
        },
      ),
    ).toBe(true);

    expect(resolveCredentialValue({ A: "  value  " }, ["B", "A"])).toBe("value");
    expect(
      resolveTransportBaseUrl(
        { WEBAI_BRIDGE_BASE_URL: "https://runtime.internal/" },
        "https://default.internal/",
        ["WEBAI_BRIDGE_BASE_URL"],
      ),
    ).toEqual({
      value: "https://runtime.internal",
      source: "env",
      envName: "WEBAI_BRIDGE_BASE_URL",
    });
  });

  it("fills in family-specific auth, path, and request-shape defaults", () => {
    const vertex = createDescriptorProvider({
      provider: "vertex",
      displayName: "Vertex",
      credential: {
        mode: "api-key",
        envNames: ["VERTEX_TOKEN"],
        description: "Vertex token",
      },
      capabilities: {
        textGeneration: true,
      },
      modelCatalog: {
        mode: "inline-default",
        defaultModel: "vertex/gemini-2.5-flash",
      },
      transport: {
        family: "google-vertex",
      },
    });

    const bedrock = createDescriptorProvider({
      provider: "bedrock",
      displayName: "Bedrock",
      credential: {
        mode: "api-key",
        envNames: ["BEDROCK_TOKEN"],
        description: "Bedrock token",
      },
      capabilities: {
        textGeneration: true,
      },
      modelCatalog: {
        mode: "inline-default",
        defaultModel: "bedrock/claude-3-7-sonnet",
      },
      transport: {
        family: "aws-bedrock",
      },
    });

    const openaiCompatible = createDescriptorProvider({
      provider: "openrouter",
      displayName: "OpenRouter",
      credential: {
        mode: "api-key",
        envNames: ["OPENROUTER_API_KEY"],
        description: "OpenRouter API key",
      },
      capabilities: {
        textGeneration: true,
      },
      modelCatalog: {
        mode: "inline-default",
        defaultModel: "openrouter/gpt-4o-mini",
      },
      transport: {
        family: "openai-compatible",
        entrypoint: "/custom/chat/completions",
      },
    });

    const vertexPrepared = vertex.prepareText(
      {
        model: vertex.createModel("gemini-2.5-flash"),
        input: { prompt: "hello" },
      },
      {
        env: { VERTEX_TOKEN: "secret" },
        fetch: vi.fn() as unknown as typeof fetch,
      },
    );
    const bedrockPrepared = bedrock.prepareText(
      {
        model: bedrock.createModel("claude-3-7-sonnet"),
        input: { prompt: "hello" },
      },
      {
        env: { BEDROCK_TOKEN: "secret" },
        fetch: vi.fn() as unknown as typeof fetch,
      },
    );
    const openaiPrepared = openaiCompatible.prepareText(
      {
        model: openaiCompatible.createModel("gpt-4o-mini"),
        input: { prompt: "hello" },
      },
      {
        env: { OPENROUTER_API_KEY: "secret" },
        fetch: vi.fn() as unknown as typeof fetch,
      },
    );

    expect(vertexPrepared.ok).toBe(true);
    expect(bedrockPrepared.ok).toBe(true);
    expect(openaiPrepared.ok).toBe(true);

    if (!vertexPrepared.ok || !bedrockPrepared.ok || !openaiPrepared.ok) {
      throw new Error("Expected all descriptor providers to prepare successfully.");
    }

    expect(vertexPrepared.prepared.transport.contract.auth.scheme).toBe("google-vertex");
    expect(vertexPrepared.prepared.transport.contract.path).toBe(
      "/publishers/google/models/{model}:generateContent",
    );
    expect(vertexPrepared.prepared.transport.contract.requestShape).toBe(
      "vertex-generate-content",
    );

    expect(bedrockPrepared.prepared.transport.contract.auth.scheme).toBe("aws-sigv4");
    expect(bedrockPrepared.prepared.transport.contract.path).toBe("/model/{model}/converse");
    expect(bedrockPrepared.prepared.transport.contract.requestShape).toBe("bedrock-converse");

    expect(openaiPrepared.prepared.transport.contract.auth.scheme).toBe("bearer");
    expect(openaiPrepared.prepared.transport.contract.path).toBe("/custom/chat/completions");
    expect(openaiPrepared.prepared.transport.contract.requestShape).toBe("chat-completions");
  });

  it("returns undefined when no base-url source is available and trims trailing slashes", () => {
    expect(resolveTransportBaseUrl({}, undefined, ["UNSET_BASE_URL"])).toBeUndefined();
    expect(
      resolveTransportBaseUrl(
        {},
        "https://default.internal/",
        ["UNSET_BASE_URL"],
      ),
    ).toEqual({
      value: "https://default.internal",
      source: "default",
    });
  });
});
