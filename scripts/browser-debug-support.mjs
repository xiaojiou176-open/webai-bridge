import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import {
  WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE,
  resolveCredentialedBrowserMode,
  resolveManagedBrowserUserDataDir,
  resolveOptionalExistingChromeProfileRoot,
} from "./runtime-policy.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const bundleRootDir = join(repoRoot, ".runtime-cache", "browser-debug", "bundles");

const WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_AUTH_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_DIR";
const WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME =
  "WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL";
const GEMINI_WEB_CDP_URL_ENV_NAME = "WEBAI_BRIDGE_WEB_GEMINI_CDP_URL";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL = "http://127.0.0.1:39222";
const WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL = "http://127.0.0.1:9338";

const PROVIDER_BROWSER_DEBUG_CONFIG = {
  chatgpt: {
    displayName: "ChatGPT",
    loginUrl: "https://chatgpt.com",
    hostnames: ["chatgpt.com", "chat.openai.com", "auth.openai.com"],
    defaultCdpUrl: WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  },
  gemini: {
    displayName: "Gemini",
    loginUrl: "https://gemini.google.com/app",
    hostnames: ["gemini.google.com", "accounts.google.com"],
    defaultCdpUrl: WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  },
  grok: {
    displayName: "Grok",
    loginUrl: "https://grok.com",
    hostnames: ["grok.com", "x.com"],
    defaultCdpUrl: WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  },
  qwen: {
    displayName: "Qwen",
    loginUrl: "https://chat.qwen.ai",
    hostnames: ["chat.qwen.ai", "tongyi.aliyun.com"],
    defaultCdpUrl: WEBAI_BRIDGE_WEB_AUTH_DEFAULT_CDP_URL,
  },
};

function slugNow() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeText(value, limit = 240) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizePageText(value) {
  return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function summarizeCurrentPageTextEvidence({
  bodyText = "",
  rootText = "",
  visibleHintParts = [],
}) {
  const normalizedBody = normalizePageText(bodyText);

  if (normalizedBody) {
    return normalizedBody.slice(0, 280);
  }

  const normalizedRoot = normalizePageText(rootText);
  const hintParts = [];

  for (const part of visibleHintParts) {
    const normalizedPart = normalizePageText(part);

    if (!normalizedPart) {
      continue;
    }

    if (normalizedRoot && normalizedRoot.includes(normalizedPart)) {
      continue;
    }

    if (hintParts.includes(normalizedPart)) {
      continue;
    }

    hintParts.push(normalizedPart);
  }

  return [normalizedRoot, ...hintParts]
    .filter(Boolean)
    .join(" ")
    .slice(0, 280);
}

export function sanitizeTraceUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sanitizeText(value, 240);
  }
}

export function resolveProviderAttachTarget(provider, env = process.env) {
  const config = PROVIDER_BROWSER_DEBUG_CONFIG[provider];
  const mode = resolveCredentialedBrowserMode(env);

  if (!config) {
    return undefined;
  }

  const cdpUrl =
    provider === "gemini"
      ? mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
          WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
        : env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim() ||
          env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
          config.defaultCdpUrl
      : mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE
        ? env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim() ||
          WEBAI_BRIDGE_WEB_AUTH_DEFAULT_EXISTING_PROFILE_CDP_URL
        : env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim() ||
          config.defaultCdpUrl;

  return {
    provider,
    mode,
    cdpUrl,
    cdpUrlSource:
      provider === "gemini" &&
          mode !== WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE &&
          env[GEMINI_WEB_CDP_URL_ENV_NAME]?.trim()
        ? GEMINI_WEB_CDP_URL_ENV_NAME
        : mode === WEBAI_BRIDGE_ISOLATED_BROWSER_ROOT_MODE &&
            env[WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME]?.trim()
          ? WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL_ENV_NAME
        : env[WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME]?.trim()
          ? WEBAI_BRIDGE_WEB_AUTH_CDP_URL_ENV_NAME
          : "default",
    loginUrl: config.loginUrl,
    hostnames: config.hostnames,
  };
}

export function resolveCanonicalProfile(provider, env = process.env) {
  const attachTarget = resolveProviderAttachTarget(provider, env);
  const configuredRealProfile = resolveOptionalExistingChromeProfileRoot(env);

  if (!attachTarget) {
    return undefined;
  }

  return {
    provider,
    managedProfileDir: resolveManagedBrowserUserDataDir(env, repoRoot),
    managedProfileSource: env[WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME]?.trim()
      ? WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR_ENV_NAME
      : "default",
    existingProfileDir: configuredRealProfile?.userDataDir,
    existingProfileName: configuredRealProfile?.profileName,
    existingProfileDirectory: configuredRealProfile?.profileDirectory,
    attachTarget,
  };
}

export function buildProviderDiagnoseLadder(provider, result, debugContext) {
  const attachTarget = debugContext?.attachTarget;
  const currentPage = debugContext?.currentPage;
  const classification = result?.classification ?? "unknown";
  const blocker = result?.blocker ?? result?.reason ?? "unknown";
  const qwenPermissionGateLikely =
    provider === "qwen" &&
    classification === "user-action-required" &&
    (
      result?.persistenceAudit?.artifactStates?.["session-token"] === "present" ||
      `${result?.summary ?? ""}`.toLowerCase().includes("permission-gated") ||
      `${result?.diagnostic ?? ""}`.toLowerCase().includes("permission-gated") ||
      `${result?.diagnostic ?? ""}`.toLowerCase().includes("unauthorized")
    );

  const ladder = [
    `确认 ${provider} 当前 attach target 可达：${attachTarget?.cdpUrl ?? "unknown-cdp-target"}.`,
    `核对当前页面是否已经落到 ${attachTarget?.loginUrl ?? "目标站点主页"} 对应的已登录工作区，而不是登录页、验证页或风险页。`,
    "查看 currentConsole 与 currentNetwork，先区分 session 不完整、CDP attach 问题、还是 provider 上游 gate。",
    "如果 support bundle 已生成，先读 summary.json 和截图，再决定是否需要重开 managed browser。",
  ];

  if (classification === "session-incomplete") {
    ladder.push(
      `当前 blocker=${blocker}。优先在附着浏览器里完成登录/恢复会话，然后重新跑 provider scoped gate。`,
    );
  } else if (
    classification === "provider-unavailable" ||
    classification === "human-verification-required"
  ) {
    ladder.push(
      `当前 blocker=${blocker}。这更像 provider gate 或人工验证问题，不要先怀疑本地 store。`,
    );
  } else if (classification === "transport-instability") {
    ladder.push(
      `当前 blocker=${blocker}。优先看 attach 是否稳定、页面是否存在、CDP 会话是否可持续。`,
    );
  }

  if (qwenPermissionGateLikely) {
    ladder.push(
      "当前 Qwen session-cookie 与 session-token 都已到位；不要再先追 token 缺失，优先在同一个 repo-owned browser 里清掉剩余的 Unauthorized / permission gate。",
    );
  }

  if (currentPage?.url) {
    ladder.push(`当前页面快照：${currentPage.url}`);
  }

  return ladder;
}

function selectProviderPage(context, provider) {
  const config = PROVIDER_BROWSER_DEBUG_CONFIG[provider];
  const pages = context?.pages?.() ?? [];

  if (!config || pages.length === 0) {
    return pages[0];
  }

  return (
    pages.find((page) => {
      try {
        const hostname = new URL(page.url()).hostname;
        return config.hostnames.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`),
        );
      } catch {
        return false;
      }
    }) ?? pages[0]
  );
}

function createNetworkEntry(request) {
  return {
    method: request?.method?.(),
    resourceType: request?.resourceType?.(),
    url: sanitizeTraceUrl(request?.url?.()),
  };
}

export async function captureBrowserDebugContext(
  provider,
  result,
  env = process.env,
  options = {},
) {
  const attachTarget = resolveProviderAttachTarget(provider, env);
  const canonicalProfile = resolveCanonicalProfile(provider, env);

  if (!attachTarget || !canonicalProfile) {
    return undefined;
  }

  const bundleDir =
    options.bundleDir ??
    join(bundleRootDir, `${provider}-${slugNow()}-${randomUUID().slice(0, 6)}`);
  const summaryPath = join(bundleDir, "summary.json");
  const screenshotPath = join(bundleDir, "current-page.png");
  const tracePath = join(bundleDir, "trace.zip");
  const observeMs = options.observeMs ?? 750;

  const debugContext = {
    provider,
    attachStatus: "pending",
    attachTarget,
    canonicalProfile,
    currentPage: undefined,
    currentConsole: [],
    currentNetwork: [],
    supportBundle: {
      bundleDir,
      summaryPath,
      screenshotPath,
      tracePath,
      traceMode: "playwright-core-browser-ops",
      command: `pnpm exec node scripts/capture-web-debug-bundle.mjs --provider ${provider}`,
    },
    diagnoseLadder: [],
  };
  let bundleWritable = true;
  let traceStarted = false;

  try {
    mkdirSync(bundleDir, { recursive: true });
  } catch (error) {
    bundleWritable = false;
    debugContext.supportBundle.error =
      error instanceof Error ? error.message : String(error);
  }

  let browser;
  let context;
  try {
    browser = await chromium.connectOverCDP(attachTarget.cdpUrl, {
      timeout: options.attachTimeoutMs ?? 5_000,
    });
    context = browser.contexts()[0];

    if (!context) {
      throw new Error(`No Chrome context is available at ${attachTarget.cdpUrl}.`);
    }

    if (
      bundleWritable &&
      typeof context.tracing?.start === "function"
    ) {
      try {
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          title: `WebaiBridge ${provider} browser debug support`,
        });
        traceStarted = true;
      } catch (error) {
        debugContext.supportBundle.traceError =
          error instanceof Error ? error.message : String(error);
      }
    }

    const page = selectProviderPage(context, provider);

    if (!page) {
      throw new Error(`No visible page is available in the attached browser for ${provider}.`);
    }

    const consoleEvents = [];
    const networkEvents = [];
    const pendingRequests = new Map();

    page.on("console", (message) => {
      consoleEvents.push({
        type: message.type(),
        text: sanitizeText(message.text()),
      });
    });
    page.on("pageerror", (error) => {
      consoleEvents.push({
        type: "pageerror",
        text: sanitizeText(error?.message ?? error),
      });
    });
    page.on("request", (request) => {
      const entry = createNetworkEntry(request);
      pendingRequests.set(request, entry);
      networkEvents.push(entry);
    });
    page.on("response", async (response) => {
      const request = response.request();
      const entry = pendingRequests.get(request);

      if (!entry) {
        return;
      }

      entry.status = response.status();
      pendingRequests.delete(request);
    });
    page.on("requestfailed", (request) => {
      const entry = pendingRequests.get(request);

      if (!entry) {
        return;
      }

      entry.errorText = sanitizeText(request.failure()?.errorText);
      pendingRequests.delete(request);
    });

    if (observeMs > 0) {
      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, observeMs);
      });
    }

    if (typeof page.waitForLoadState === "function") {
      await page.waitForLoadState("domcontentloaded", {
        timeout: 5_000,
      }).catch(() => undefined);
    }

    let title;
    try {
      title = await page.title();
    } catch {
      title = undefined;
    }

    const currentPageSnapshot =
      typeof page.evaluate === "function"
        ? await page
            .evaluate(() => {
              const hasComposerSurface = [
                '[contenteditable="true"]',
                'div[role="textbox"]',
                "textarea",
                '[role="textbox"]',
              ].some((selector) => {
                const element = document.querySelector(selector);
                return Boolean(element && element.offsetParent !== null);
              });
              const visibleHintParts = Array.from(
                document.querySelectorAll(
                  [
                    "[aria-label]",
                    "[placeholder]",
                    "[data-placeholder]",
                    "button",
                    "a",
                    "[role='button']",
                    "[role='textbox']",
                    '[contenteditable="true"]',
                    "textarea",
                  ].join(", "),
                ),
              )
                .map((node) => {
                  return (
                    node.textContent?.trim() ||
                    node.getAttribute?.("aria-label")?.trim() ||
                    node.getAttribute?.("placeholder")?.trim() ||
                    node.getAttribute?.("data-placeholder")?.trim() ||
                    ""
                  );
                })
                .filter(Boolean);

              return {
                bodyText: document.body?.innerText ?? "",
                rootText: document.documentElement?.innerText ?? "",
                visibleHintParts,
                hasComposerSurface,
              };
            })
            .catch(() => ({
              bodyText: "",
              rootText: "",
              visibleHintParts: [],
              hasComposerSurface: false,
            }))
        : {
            bodyText: "",
            rootText: "",
            visibleHintParts: [],
            hasComposerSurface: false,
          };
    const currentPageSnippet = summarizeCurrentPageTextEvidence(currentPageSnapshot);
    const currentPageClassification =
      typeof result?.classification === "string" &&
      result.classification !== "diagnose-ladder"
        ? result.classification
        : undefined;
    const currentPageDiagnostic = sanitizeText(
      result?.diagnostic ?? result?.summary,
      320,
    ) || undefined;

    debugContext.attachStatus = "attached";
    debugContext.currentPage = {
      url: sanitizeTraceUrl(page.url()),
      title: sanitizeText(title, 160) || undefined,
      snippet: currentPageSnippet || undefined,
      hasComposerSurface: Boolean(currentPageSnapshot.hasComposerSurface),
      classification: currentPageClassification,
      diagnostic: currentPageDiagnostic,
    };
    debugContext.currentConsole = consoleEvents.slice(0, 10);
    debugContext.currentNetwork = networkEvents.slice(0, 10);

    try {
      if (!bundleWritable) {
        return;
      }

      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });
    } catch {
      // Best-effort local support bundle.
    }
  } catch (error) {
    debugContext.attachStatus = "attach-failed";
    debugContext.attachError =
      error instanceof Error ? error.message : String(error);
  } finally {
    debugContext.diagnoseLadder = buildProviderDiagnoseLadder(
      provider,
      result,
      debugContext,
    );

    if (bundleWritable) {
      try {
        if (
          traceStarted &&
          typeof context?.tracing?.stop === "function"
        ) {
          await context.tracing.stop({
            path: tracePath,
          });
        }
        writeFileSync(summaryPath, `${JSON.stringify(debugContext, null, 2)}\n`, "utf8");
      } catch (error) {
        debugContext.supportBundle.error =
          error instanceof Error ? error.message : String(error);
      }
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return debugContext;
}
