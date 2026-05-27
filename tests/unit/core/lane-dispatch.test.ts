import { describe, expect, it } from "vitest";

import { WebaiBridgeContractError } from "../../../packages/contracts/src/index.js";
import {
  createProviderRegistry,
  dispatchLane,
} from "../../../packages/kernel/src/index.js";

function createRegistry() {
  return createProviderRegistry([
    {
      providerId: "gemini",
      laneId: "byok",
      authModes: ["api-key"],
      defaultModel: "gemini/gemini-2.5-pro",
      capabilities: {
        "text-generation": true,
        streaming: true,
        "official-api": true,
      },
    },
    {
      providerId: "gemini",
      laneId: "web-login",
      authModes: ["web-login"],
      defaultModel: "gemini/gemini-2.5-flash",
      capabilities: {
        "text-generation": true,
        streaming: true,
        "web-login": true,
      },
    },
    {
      providerId: "chatgpt",
      laneId: "web-login",
      authModes: ["web-login"],
      defaultModel: "chatgpt/gpt-4o",
      capabilities: {
        "text-generation": true,
        streaming: true,
        "tool-calling": true,
        "web-login": true,
      },
    },
  ]);
}

describe("lane dispatch", () => {
  it("derives providerId from modelReference and prefers lane order among usable lanes", () => {
    const result = dispatchLane(
      createRegistry(),
      {
        modelReference: "gemini/gemini-2.5-pro",
        credentialStates: {
          byok: "configured",
          "web-login": "configured",
        },
      },
      {
        laneOrder: ["web-login", "byok"],
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        laneId: "web-login",
        reason: "lane-order",
      }),
    );
  });

  it("respects a usable preferred lane", () => {
    const result = dispatchLane(createRegistry(), {
      providerId: "gemini",
      preferredLane: "web-login",
      credentialStates: {
        byok: "configured",
        "web-login": "configured",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        providerId: "gemini",
        laneId: "web-login",
        reason: "preferred-lane",
      }),
    );
  });

  it("throws explicit errors for missing inputs, incompatible preferred lanes, and capability mismatches", () => {
    expect(() => dispatchLane(createRegistry(), {})).toThrowError(WebaiBridgeContractError);

    expect(() =>
      dispatchLane(createRegistry(), {
        providerId: "chatgpt",
        preferredLane: "byok",
      }),
    ).toThrowError(WebaiBridgeContractError);

    expect(() =>
      dispatchLane(createRegistry(), {
        providerId: "gemini",
        requiredCapabilities: ["tool-calling"],
      }),
    ).toThrowError(WebaiBridgeContractError);
  });

  it("throws the right credential-driven error when the preferred lane is unusable", () => {
    try {
      dispatchLane(createRegistry(), {
        providerId: "gemini",
        preferredLane: "web-login",
        credentialStates: {
          byok: "configured",
          "web-login": "expired",
        },
      });
    } catch (error) {
      expect((error as WebaiBridgeContractError).diagnostic.code).toBe("session-expired");
      return;
    }

    throw new Error("Expected a credential usability error for the preferred lane.");
  });

  it("throws the right credential-driven error when no candidate lane is usable", () => {
    expect(() =>
      dispatchLane(createRegistry(), {
        providerId: "gemini",
        credentialStates: {
          byok: "expired",
          "web-login": "user-action-required",
        },
      }),
    ).toThrowError(WebaiBridgeContractError);

    try {
      dispatchLane(createRegistry(), {
        providerId: "gemini",
        credentialStates: {
          byok: "invalid",
          "web-login": "missing",
        },
      });
    } catch (error) {
      expect((error as WebaiBridgeContractError).diagnostic.code).toBe("credential-invalid");
      return;
    }

    throw new Error("Expected dispatchLane to throw when no usable lane exists.");
  });

  it("returns single-compatible-lane when only one lane matches capability requirements", () => {
    const result = dispatchLane(createRegistry(), {
      providerId: "chatgpt",
      requiredCapabilities: ["tool-calling"],
      credentialStates: {
        "web-login": "configured",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        providerId: "chatgpt",
        laneId: "web-login",
        reason: "single-compatible-lane",
      }),
    );
  });
});
