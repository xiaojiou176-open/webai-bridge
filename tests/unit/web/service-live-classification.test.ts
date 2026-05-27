import { describe, expect, it } from "vitest";

describe("Service live classification", () => {
  it("reuses provider-scoped external blockers when service-live only sees a generic fetch failure", async () => {
    const { mapServicePreflightResult } = await import(
      "../../../scripts/verify-service-live.mjs"
    );

    const mapped = mapServicePreflightResult(
      {
        provider: "gemini",
        requiresManagedBrowser: true,
      },
      {
        baseUrl: "http://127.0.0.1:55907",
      },
      {
        status: 503,
      },
      {
        error: {
          message: "fetch failed",
        },
      },
      {
        status: "external-blocker",
        provider: "gemini",
        blocker: "gemini-browser-session-invalid",
        classification: "session-incomplete",
        rerunCommand:
          "pnpm run bootstrap:web-login-browser -- --provider gemini && pnpm exec node scripts/verify-web-login-live.mjs --provider gemini",
        diagnostic:
          "Gemini attached browser is still on a Google sign-in screen, so the browser session must be completed before WebaiBridge can invoke Gemini.",
        summary:
          "Gemini is currently attached to a Google CookieMismatch or sign-in page. Reopen the managed Gemini browser, complete Google sign-in again, then rerun the live gate.",
      },
    );

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "gemini",
        baseUrl: "http://127.0.0.1:55907",
        blocker: "gemini-browser-session-invalid",
        classification: "session-incomplete",
        errorMessage: "fetch failed",
        rerunCommand: expect.stringContaining("--provider gemini"),
        diagnoseCommand: expect.stringContaining("diagnose-web-login-browser.mjs --provider gemini"),
        diagnostic: expect.stringContaining("Google sign-in screen"),
      }),
    );
  });

  it("maps chatgpt browser-session-incomplete service failures into external blockers", async () => {
    const { mapServiceInvokeFailure } = await import(
      "../../../scripts/verify-service-live.mjs"
    );

    const mapped = mapServiceInvokeFailure(
      {
        provider: "chatgpt",
        requiresManagedBrowser: true,
      },
      {
        baseUrl: "http://127.0.0.1:55907",
      },
      {
        status: 503,
      },
      {
        error: {
          message:
            "ChatGPT attached browser is still showing the logged-out landing page or login/signup controls, so the browser workspace is not ready for live invocation.",
        },
      },
    );

    expect(mapped).toEqual(
      expect.objectContaining({
        status: "external-blocker",
        provider: "chatgpt",
        baseUrl: "http://127.0.0.1:55907",
        blocker: "chatgpt-browser-session-incomplete",
        classification: "session-incomplete",
        responseStatus: 503,
      }),
    );
  });

  it("requests a managed-browser retry when the service reports a CDP attach failure", async () => {
    const { shouldRetryWithManagedBrowserBootstrap } = await import(
      "../../../scripts/verify-service-live.mjs"
    );

    expect(
      shouldRetryWithManagedBrowserBootstrap(
        {
          provider: "chatgpt",
          requiresManagedBrowser: true,
        },
        {
          error: {
            message: "connectOverCDP ECONNREFUSED 127.0.0.1:39222",
          },
        },
      ),
    ).toBe(true);

    expect(
      shouldRetryWithManagedBrowserBootstrap(
        {
          provider: "claude",
          requiresManagedBrowser: false,
        },
        {
          error: {
            message: "connectOverCDP ECONNREFUSED 127.0.0.1:39222",
          },
        },
      ),
    ).toBe(false);
  });
});
