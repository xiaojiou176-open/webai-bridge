import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditProviderPersistentArtifacts,
  buildBrowserCaptureProvenance,
  diffCaptureProvenance,
  evaluateProviderSessionCoherence,
  resolvePersistentCookieDbPath,
} from "../../../scripts/browser-session-coherence.mjs";

const TEST_WEBAI_BRIDGE_ROOT = join(
  homedir(),
  ".cache",
  "webai-bridge",
  "tests",
  "chatgpt-root",
);
const ALLOWED_ISOLATED_ROOT = join(
  homedir(),
  ".cache",
  "webai-bridge",
  "tests",
  "isolated-chrome-root",
);
const LEGACY_MANAGED_ROOT = join(
  process.cwd(),
  ".runtime-cache",
  "tests",
  "managed-browser",
);

describe("browser session coherence helpers", () => {
  it("audits provider cookie persistence from sqlite rows", () => {
    const audit = auditProviderPersistentArtifacts(
      "chatgpt",
      {
        mode: "isolated-chrome-root",
        existingProfileDir: TEST_WEBAI_BRIDGE_ROOT,
        existingProfileDirectory: "Profile 1",
      },
      {
        cookieDbPath: join(TEST_WEBAI_BRIDGE_ROOT, "Profile 1", "Cookies"),
        assumeCookieDbExists: true,
        sqliteRunner: () => ({
          status: 0,
          stdout: [
            "chatgpt.com|__Secure-next-auth.session-token.0",
            "chatgpt.com|__Secure-next-auth.session-token.1",
            "openai.com|oai-did",
          ].join("\n"),
        }),
      },
    );

    expect(audit).toEqual(
      expect.objectContaining({
        available: true,
        cookieDbPath: join(TEST_WEBAI_BRIDGE_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: expect.arrayContaining([
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ]),
        artifactStates: expect.objectContaining({
          "next-auth-session-token": "present",
        }),
      }),
    );
  });

  it("refuses cookie database paths outside the allowed browser storage roots", () => {
    expect(() =>
      resolvePersistentCookieDbPath({
        mode: "isolated-chrome-root",
        existingProfileDir: "/etc",
        existingProfileDirectory: "Profile 1",
      }),
    ).toThrow(/must stay inside one of/i);
  });

  it("detects capture provenance mismatches on browser root moves", () => {
    const stored = {
      browserMode: "managed-browser",
      userDataDir: LEGACY_MANAGED_ROOT,
      profileDirectory: "Default",
      cdpUrl: "http://127.0.0.1:39222",
    };
    const current = {
      browserMode: "isolated-chrome-root",
      userDataDir: ALLOWED_ISOLATED_ROOT,
      profileDirectory: "Profile 1",
      cdpUrl: "http://127.0.0.1:9338",
    };

    expect(diffCaptureProvenance(stored, current)).toEqual({
      mismatch: true,
      mismatchedFields: [
        "browserMode",
        "userDataDir",
        "profileDirectory",
        "cdpUrl",
      ],
    });
  });

  it("downgrades to user-action-required when provenance no longer matches the active target", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "chatgpt",
      storedSession: {
        state: "ready",
        captureProvenance: {
          browserMode: "managed-browser",
          userDataDir: LEGACY_MANAGED_ROOT,
          profileDirectory: "Default",
          cdpUrl: "http://127.0.0.1:39222",
        },
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: [
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ],
        artifactStates: {
          "next-auth-session-token": "present",
        },
      },
      runtimeStatus: {
        credentialState: "ready",
        session: {
          validationState: "validated",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        validationState: "stale",
      }),
    );
  });

  it("normalizes the legacy existing-chrome-profile alias to isolated-root provenance", () => {
    const provenance = buildBrowserCaptureProvenance({
      mode: "existing-chrome-profile",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338/",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(provenance).toEqual({
      browserMode: "isolated-chrome-root",
      userDataDir: ALLOWED_ISOLATED_ROOT,
      profileDirectory: "Profile 1",
      profileName: "webai-bridge",
      cdpUrl: "http://127.0.0.1:9338/",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
  });

  it("downgrades legacy ready records without explicit provenance when the active target moved", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "chatgpt",
      storedSession: {
        state: "ready",
        acquisitionMode: "managed-browser",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
          WEBAI_BRIDGE_WEB_AUTH_USER_DATA_DIR: LEGACY_MANAGED_ROOT,
        },
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: [
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ],
        artifactStates: {
          "next-auth-session-token": "present",
        },
      },
      runtimeStatus: {
        credentialState: "ready",
        session: {
          validationState: "validated",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence).toEqual(
      expect.objectContaining({
        status: "user-action-required",
        validationState: "stale",
        degradedReason: expect.stringContaining("predates explicit provenance hardening"),
      }),
    );
  });

  it("prefers fresh workspace-ready browser truth over stale refreshable runtime state", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "chatgpt",
      storedSession: {
        state: "refreshable-but-degraded",
        acquisitionMode: "isolated-chrome-root",
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: [
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ],
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      runtimeStatus: {
        credentialState: "refreshable-but-degraded",
        session: {
          validationState: "recovering",
          degradedReason: "stale store state",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence).toEqual(
      expect.objectContaining({
        status: "ready",
        validationState: "recovering",
      }),
    );
  });

  it("prefers fresh workspace-ready browser truth over stale user-action-required runtime state", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "chatgpt",
      storedSession: {
        state: "user-action-required",
        acquisitionMode: "isolated-chrome-root",
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chatgpt.com/",
          title: "ChatGPT",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: [
          "__Secure-next-auth.session-token.0",
          "__Secure-next-auth.session-token.1",
        ],
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
        },
      },
      runtimeStatus: {
        credentialState: "user-action-required",
        session: {
          validationState: "stale",
          requiredUserAction: "old stale recovery hint",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence).toEqual(
      expect.objectContaining({
        status: "ready",
        validationState: "stale",
      }),
    );
  });

  it("filters foreign artifact ids out of provider-specific coherence output", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "qwen",
      storedSession: {
        state: "ready",
        acquisitionMode: "isolated-chrome-root",
        artifactStates: {
          "next-auth-session-token": "present",
          "openai-access-token": "present",
          "session-cookie": "present",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: ["sca"],
        artifactStates: {
          "session-cookie": "present",
          "session-token": "missing",
        },
      },
      runtimeStatus: {
        credentialState: "ready",
        session: {
          validationState: "validated",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence.artifactStates).toEqual({
      "session-cookie": "present",
      "session-token": "missing",
    });
  });

  it("preserves a derived Qwen session-token when disk audit only confirms session cookies", () => {
    const currentProvenance = buildBrowserCaptureProvenance({
      mode: "isolated-chrome-root",
      env: {
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: ALLOWED_ISOLATED_ROOT,
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
      },
      cdpUrl: "http://127.0.0.1:9338",
      capturedAt: "2026-04-05T00:00:00.000Z",
    });
    const coherence = evaluateProviderSessionCoherence({
      provider: "qwen",
      storedSession: {
        state: "ready",
        acquisitionMode: "isolated-chrome-root",
        artifactStates: {
          "session-cookie": "present",
          "session-token": "derived",
        },
      },
      currentProvenance,
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
        },
      },
      workspaceStatus: {
        liveReady: true,
        reason: "workspace ready",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: ["sca"],
        artifactStates: {
          "session-cookie": "present",
          "session-token": "missing",
        },
      },
      runtimeStatus: {
        credentialState: "ready",
        session: {
          validationState: "validated",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence.artifactStates).toEqual({
      "session-cookie": "present",
      "session-token": "derived",
    });
  });

  it("preserves Qwen permission-gated workspace classifications in persistence audits", () => {
    const coherence = evaluateProviderSessionCoherence({
      provider: "qwen",
      storedSession: {
        state: "user-action-required",
        artifactStates: {
          "session-cookie": "present",
          "session-token": "present",
        },
      },
      currentProvenance: {
        browserMode: "isolated-chrome-root",
        userDataDir: ALLOWED_ISOLATED_ROOT,
        profileDirectory: "Profile 1",
        profileName: "webai-bridge",
        cdpUrl: "http://127.0.0.1:9338",
        capturedAt: "2026-04-05T00:00:00.000Z",
      },
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://chat.qwen.ai/",
          title: "Qwen Chat",
        },
      },
      workspaceStatus: {
        liveReady: false,
        classification: "permission-gated",
        reason: "Qwen session material is already present, but the attached browser is still hitting an Unauthorized or permission-gated browser-side path.",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: ["sca", "atpsida"],
        artifactStates: {
          "session-cookie": "present",
          "session-token": "present",
        },
      },
      runtimeStatus: {
        credentialState: "user-action-required",
        session: {
          validationState: "stale",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence.status).toBe("user-action-required");
    expect(coherence.persistenceAudit?.workspaceClassification).toBe("permission-gated");
  });

  it("preserves Grok account-action workspace classifications in persistence audits", () => {
    const coherence = evaluateProviderSessionCoherence({
      provider: "grok",
      storedSession: {
        state: "user-action-required",
        artifactStates: {
          "session-cookie": "present",
          "oauth-browser-session": "present",
        },
      },
      currentProvenance: {
        browserMode: "isolated-chrome-root",
        userDataDir: ALLOWED_ISOLATED_ROOT,
        profileDirectory: "Profile 1",
        profileName: "webai-bridge",
        cdpUrl: "http://127.0.0.1:9338",
        capturedAt: "2026-04-05T00:00:00.000Z",
      },
      target: {
        mode: "isolated-chrome-root",
        existingProfileDir: ALLOWED_ISOLATED_ROOT,
        existingProfileDirectory: "Profile 1",
        existingProfileName: "webai-bridge",
        existingProfileCdpUrl: "http://127.0.0.1:9338",
      },
      browserEvidence: {
        currentPage: {
          url: "https://grok.com/",
          title: "Grok",
        },
      },
      workspaceStatus: {
        liveReady: false,
        classification: "account-action-required",
        reason:
          "Grok attached browser is still hitting an account or plan gate before the authenticated composer becomes usable.",
      },
      diskAudit: {
        available: true,
        cookieDbPath: join(ALLOWED_ISOLATED_ROOT, "Profile 1", "Cookies"),
        matchedCookieNames: ["sso", "x-userid"],
        artifactStates: {
          "session-cookie": "present",
          "oauth-browser-session": "present",
        },
      },
      runtimeStatus: {
        credentialState: "user-action-required",
        session: {
          validationState: "stale",
        },
      },
      source: "verify",
      checkedAt: "2026-04-05T00:00:00.000Z",
    });

    expect(coherence.status).toBe("user-action-required");
    expect(coherence.persistenceAudit?.workspaceClassification).toBe("account-action-required");
  });
});
