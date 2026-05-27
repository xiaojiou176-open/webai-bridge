import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import { renderProviderDebugWorkbench } from "../../../packages/surfaces/http/src/provider-debug-workbench.js";
import { launchChromiumForUiTest } from "../../support/chromium.js";

describe("provider debug workbench browser interaction", () => {
  it(
    "opens the evidence stack and diagnostic trays through real browser interactions",
    async () => {
      const html = renderProviderDebugWorkbench(
        {
          providerId: "grok",
          providerDisplayName: "Grok Web",
          auth: {
            statusSummary: "User action required",
            modeLabel: "Use Isolated Chrome Root",
            session: {
              state: "user-action-required",
              requiredUserAction: "Complete the Grok browser session until it reaches a reusable workspace.",
            },
          },
          runtime: {
            runtimeReadiness: "ready",
            degradedInvocationPolicy: "block",
          },
          storeReadiness: {
            credentialState: "user-action-required",
            validationState: "stale",
            note: "Stored session material exists, but the browser workspace is not reusable yet.",
          },
          liveReadiness: {
            status: "live-blocked",
            diagnostic: "The current browser session has not reached a reusable workspace yet.",
          },
          attachTarget: {
            cdpUrl: "http://127.0.0.1:9338",
            source: "runtime-env",
            note: "This is the canonical browser attach target WebaiBridge will inspect next.",
          },
          currentPage: {
            classification: "session-incomplete",
            diagnostic: "The current browser session has not reached a reusable workspace yet.",
            url: "https://grok.com/",
            title: "Grok",
          },
          currentConsole: {
            diagnostic: "No fresh console entries were captured during this inspection window.",
            entries: [],
          },
          currentNetwork: {
            diagnostic: "No fresh network events were captured during this inspection window.",
            entries: [],
          },
          diagnoseLadder: [
            {
              id: "repair-grok",
              status: "recommended",
              summary: "Finish the current browser session until this provider reaches a real workspace.",
              command: "pnpm exec node scripts/verify-web-login-live.mjs --provider grok",
            },
          ],
          routes: {
            status: "/v1/runtime/providers/grok/status",
            probe: "/v1/runtime/providers/grok/probe",
            remediation: "/v1/runtime/providers/grok/remediation",
            debugCurrentPage: "/v1/runtime/providers/grok/debug/current-page",
            debugCurrentConsole: "/v1/runtime/providers/grok/debug/current-console",
            debugCurrentNetwork: "/v1/runtime/providers/grok/debug/current-network",
            debugSupportBundle: "/v1/runtime/providers/grok/debug/support-bundle",
          },
          captureProvenance: {
            browserMode: "isolated-chrome-root",
            cdpUrl: "http://127.0.0.1:9338",
          },
          persistenceAudit: {
            summary: "Stored session material exists, but the current browser workspace is still incomplete.",
          },
        } as any,
        "/v1/runtime/auth-portal",
      );

      const server = createServer((_request, response) => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(html);
      });

      await new Promise<void>((resolveListen) => server.listen(4198, "127.0.0.1", () => resolveListen()));

      try {
        const browser = await launchChromiumForUiTest();

        try {
          const page = await browser.newPage();
          await page.goto("http://127.0.0.1:4198/", { waitUntil: "networkidle" });

          await page.locator('a[href="#diagnose-ladder-tray"]').click();
          expect(page.url()).toContain("#diagnose-ladder-tray");
          expect(
            await page
              .locator("#diagnose-ladder-tray")
              .evaluate((element) => (element as HTMLDetailsElement).open),
          ).toBe(true);

          const evidenceStack = page.locator("#evidence-stack");
          if (!(await evidenceStack.evaluate((element) => (element as HTMLDetailsElement).open))) {
            const evidenceSummary = page.locator("#evidence-stack > summary");
            await evidenceSummary.scrollIntoViewIfNeeded();
            await evidenceSummary.click({ force: true });
          }
          expect(
            await evidenceStack.evaluate((element) => (element as HTMLDetailsElement).open),
          ).toBe(true);

          const tray = page.locator(".diagnostic-tray").nth(1);
          await tray.locator("summary").click();
          expect(await tray.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);

          const trayText = (await tray.textContent()) ?? "";
          expect(trayText).toContain("Current console and network");
          expect(trayText).toContain("No fresh network events were captured");
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
