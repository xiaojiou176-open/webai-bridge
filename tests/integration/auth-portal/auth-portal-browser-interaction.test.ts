import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { buildAuthPortalShellModel, renderAuthPortalShell } from "../../../apps/auth-portal/src/index.js";
import { createCredentialOwner } from "../../../packages/credentials/src/index.js";
import { launchChromiumForUiTest } from "../../support/chromium.js";

describe("auth portal browser interaction", () => {
  function buildRouteCatalog() {
    return {
      authPortal: "/v1/runtime/auth-portal",
      providerStatusTemplate: "/v1/runtime/providers/{providerId}/status",
      providerAcquisitionStartTemplate: "/v1/runtime/providers/{providerId}/acquisition/start",
      providerAcquisitionCaptureTemplate: "/v1/runtime/providers/{providerId}/acquisition/capture",
      providerDebugWorkbenchTemplate: "/v1/runtime/providers/{providerId}/debug/workbench",
    };
  }

  it(
    "opens deeper provider shelves from hash and surfaces browser handoff feedback after a start-login click",
    async () => {
      const owner = createCredentialOwner("terry-local");
      const model = buildAuthPortalShellModel({
        owner,
        routeCatalog: buildRouteCatalog(),
      });
      const html = renderAuthPortalShell(model);

      const server = createServer((request, response) => {
        if (request.url === "/v1/runtime/providers/claude/acquisition/start") {
          let body = "";
          request.on("data", (chunk) => {
            body += chunk;
          });
          request.on("end", () => {
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(
              JSON.stringify({
                acquisition: {
                  status: "ready-for-user-login",
                  summary: "Browser handoff ready",
                  modeLabel: "Use Isolated Chrome Root",
                  instructions:
                    "Finish the provider login in the selected browser seat, then capture the session back into WebaiBridge.",
                  browserTarget: {
                    summary: "Attach to the isolated repo-owned browser seat.",
                  },
                  browser: {
                    summary: "The current browser seat is ready for login handoff.",
                    loginOpened: true,
                  },
                  captureUrl: "/v1/runtime/providers/claude/acquisition/capture",
                  captureRequest: {
                    mode: JSON.parse(body || "{}").mode ?? "isolated-chrome-root",
                  },
                },
              }),
            );
          });
          return;
        }

        if (request.url === "/v1/runtime/providers/claude/debug/workbench") {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end("<!doctype html><title>Claude debug workbench</title><main>Claude debug workbench</main>");
          return;
        }

        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(html);
      });

      await new Promise<void>((resolveListen) => server.listen(4197, "127.0.0.1", () => resolveListen()));

      try {
        const browser = await launchChromiumForUiTest();

        try {
          const page = await browser.newPage();
          await page.goto("http://127.0.0.1:4197/v1/runtime/auth-portal#auth-portal-provider-drawers", {
            waitUntil: "domcontentloaded",
          });
          await page.waitForSelector("#auth-portal-provider-drawers");

          expect(
            await page.locator("#auth-portal-provider-drawers").evaluate((element) =>
              (element as HTMLDetailsElement).open,
            ),
          ).toBe(true);

          await page
            .locator('#provider-claude button[data-action-id="start-web-login"][data-acquisition-mode="isolated-chrome-root"]')
            .click();
          await page.waitForSelector('#auth-portal-feedback[data-state="success"]:not([hidden])');
          await page.waitForSelector('#auth-portal-feedback button[data-capture-url]');
          await page.waitForSelector(
            '#auth-portal-feedback a[href="/v1/runtime/providers/claude/debug/workbench"]',
          );

          const feedbackText = (await page.locator("#auth-portal-feedback").textContent()) ?? "";
          expect(feedbackText).toContain("Browser handoff ready");
          expect(feedbackText).toContain("Finish the provider login in the selected browser seat");

          const captureButtonText = (await page.locator('#auth-portal-feedback button[data-capture-url]').textContent()) ?? "";
          expect(captureButtonText).toContain("Capture Session");

          const inspectLinkHref = await page
            .locator('#auth-portal-feedback a[href="/v1/runtime/providers/claude/debug/workbench"]')
            .getAttribute("href");
          expect(inspectLinkHref).toBe("/v1/runtime/providers/claude/debug/workbench");
        } finally {
          await browser.close();
        }
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    },
    60_000,
  );
});
