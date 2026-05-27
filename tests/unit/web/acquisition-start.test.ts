import { describe, expect, it } from "vitest";

import { createDefaultWebAcquisitionRunners } from "../../../apps/service/src/web-auth-acquisition.ts";

describe("web acquisition start flows", () => {
  it("keeps existing browser-session mode visible in runtime env and capture request", async () => {
    const bootstrapBrowser = async ({
      provider,
      loginUrl,
    }: {
      provider: string;
      loginUrl: string;
    }) => ({
      status: "attached" as const,
      provider,
      mode: "existing-browser-session" as const,
      modeLabel: "Attach Existing Browser Session",
      advanced: true,
      loginUrl,
      loginOpened: false,
      cdpUrl: "http://127.0.0.1:9555",
      browserTarget: {
        kind: "attached-browser-session" as const,
        label: "Existing browser session",
        summary: "Attach to a browser session that is already exposing a reusable browser-session URL.",
      },
      summary: "WebaiBridge attached the existing browser session.",
    });

    const runners = createDefaultWebAcquisitionRunners({}, { bootstrapBrowser });
    const result = await runners.gemini?.start({
      mode: "existing-browser-session",
      existingBrowserSession: {
        sessionUrl: "http://127.0.0.1:9555",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ready-for-user-login",
        provider: "gemini",
        mode: "existing-browser-session",
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "existing-browser-session",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9555",
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL: "http://127.0.0.1:9555",
          WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9555",
        }),
        captureRequest: {
          mode: "existing-browser-session",
          existingBrowserSession: {
            sessionUrl: "http://127.0.0.1:9555",
          },
        },
      }),
    );
    expect(result?.instructions).toContain("already open there");
  });

  it("returns an isolated-root blocker with product-language instructions when bootstrap fails generically", async () => {
    const runners = createDefaultWebAcquisitionRunners({}, {
      bootstrapBrowser: async () => {
        throw new Error("Chrome is unavailable");
      },
    });

    const result = await runners.claude?.start();

    expect(result).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "claude",
        mode: "isolated-chrome-root",
        blocker: "claude-existing-profile-unavailable",
      }),
    );
    expect(result?.instructions).toContain("isolated repo Chrome root");
  });
});
