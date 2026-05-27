import { describe, expect, it } from "vitest";

import { WebaiBridgeContractError } from "../../../packages/contracts/src/index.js";
import { createProviderRegistry } from "../../../packages/kernel/src/index.js";

describe("ProviderRegistry branch coverage", () => {
  it("lists, gets, requires, and reports available lanes for normalized registrations", () => {
    const registry = createProviderRegistry([
      {
        providerId: "gemini",
        laneId: "byok",
        authModes: ["api-key", "api-key"],
        defaultModel: "gemini/gemini-2.5-pro",
      },
      {
        providerId: "gemini",
        laneId: "web-login",
        authModes: ["web-login"],
        recommendedModel: "gemini/gemini-2.5-flash",
      },
    ]);

    expect(registry.availableLanes("gemini")).toEqual(["byok", "web-login"]);
    expect(registry.list({ providerId: "gemini" })).toHaveLength(2);
    expect(registry.get("gemini", "byok")).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        laneId: "byok",
      }),
    );
    expect(registry.require("gemini", "web-login")).toEqual(
      expect.objectContaining({
        recommendedModel: expect.objectContaining({
          canonical: "gemini/gemini-2.5-flash",
        }),
      }),
    );
  });

  it("rejects invalid providers, lanes, and provider-lane mismatches", () => {
    expect(() =>
      createProviderRegistry([
        {
          providerId: "deepseek",
          laneId: "byok",
          authModes: ["api-key"],
        },
      ]),
    ).toThrowError(WebaiBridgeContractError);

    expect(() =>
      createProviderRegistry([
        {
          providerId: "gemini",
          laneId: "agent-input",
          authModes: ["api-key"],
        },
      ]),
    ).toThrowError(WebaiBridgeContractError);

    expect(() =>
      createProviderRegistry([
        {
          providerId: "chatgpt",
          laneId: "byok",
          authModes: ["api-key"],
        },
      ]),
    ).toThrowError(WebaiBridgeContractError);
  });

  it("rejects missing auth modes and provider/model mismatches", () => {
    expect(() =>
      createProviderRegistry([
        {
          providerId: "gemini",
          laneId: "byok",
          authModes: [],
        },
      ]),
    ).toThrowError(WebaiBridgeContractError);

    expect(() =>
      createProviderRegistry([
        {
          providerId: "gemini",
          laneId: "byok",
          authModes: ["api-key"],
          defaultModel: "chatgpt/gpt-4o",
        },
      ]),
    ).toThrowError(WebaiBridgeContractError);
  });

  it("throws from require when the requested lane is absent", () => {
    const registry = createProviderRegistry([
      {
        providerId: "chatgpt",
        laneId: "web-login",
        authModes: ["web-login"],
      },
    ]);

    expect(() => registry.require("chatgpt", "byok")).toThrowError(WebaiBridgeContractError);
  });
});
