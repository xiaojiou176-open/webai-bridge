import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildStoredWebCredentialRecords,
  buildStoredWebProviderSessions,
  buildStoredWebRuntimeEnv,
  createEmptyLocalWebAuthStore,
  getStoredWebProviderSession,
  listStoredWebProviderSessions,
  readLocalWebAuthStore,
  removeStoredWebProviderSession,
  resolveLocalWebAuthStorePath,
  upsertStoredWebProviderSession,
  writeLocalWebAuthStore,
} from "../../../packages/credentials/src/index.js";

function createStoreEnv(fileName: string) {
  return {
    WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH: join(
      process.cwd(),
      ".runtime-cache",
      "temp",
      fileName,
    ),
  };
}

describe("local web auth store", () => {
  it("creates and reads an empty store when the file does not exist", () => {
    const storeEnv = createStoreEnv("local-web-auth-store-empty.json");
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    expect(resolveLocalWebAuthStorePath(storeEnv)).toContain("local-web-auth-store-empty.json");
    expect(createEmptyLocalWebAuthStore()).toEqual({
      version: 1,
      providers: {},
    });
    expect(readLocalWebAuthStore(storeEnv)).toEqual({
      version: 1,
      providers: {},
    });
  });

  it("writes, lists, gets, and removes stored provider sessions", () => {
    const storeEnv = createStoreEnv("local-web-auth-store-roundtrip.json");
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    writeLocalWebAuthStore(
      {
        version: 1,
        providers: {},
      },
      storeEnv,
    );

    upsertStoredWebProviderSession(
      {
        providerId: "chatgpt",
        state: "ready",
        acquisitionMode: "managed-browser",
        accountLabel: "chatgpt:default",
        sessionSource: "chatgpt-browser-profile",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_cookie=1",
        },
        updatedAt: "2026-04-01T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );
    upsertStoredWebProviderSession(
      {
        providerId: "qwen",
        state: "user-action-required",
        acquisitionMode: "existing-browser-session",
        accountLabel: "qwen:default",
        sessionSource: "qwen-browser-profile",
        requiredUserAction: "Complete sign-in",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
        },
        updatedAt: "2026-04-01T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );

    expect(getStoredWebProviderSession("chatgpt", storeEnv)).toEqual(
      expect.objectContaining({
        providerId: "chatgpt",
        state: "ready",
      }),
    );
    expect(listStoredWebProviderSessions(storeEnv).map((record) => record.providerId)).toEqual([
      "chatgpt",
      "qwen",
    ]);

    const afterRemove = removeStoredWebProviderSession("chatgpt", storeEnv);
    expect(afterRemove.providers.chatgpt).toBeUndefined();
    expect(getStoredWebProviderSession("chatgpt", storeEnv)).toBeUndefined();

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });

  it("treats blank store files as empty and merges runtime env plus provider snapshots", () => {
    const storeEnv = createStoreEnv("local-web-auth-store-blank.json");
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
    writeFileSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, "", "utf8");

    expect(readLocalWebAuthStore(storeEnv)).toEqual({
      version: 1,
      providers: {},
    });

    upsertStoredWebProviderSession(
      {
        providerId: "chatgpt",
        state: "ready",
        sessionSource: "chatgpt-browser-profile",
        runtimeEnv: {
          WEBAI_BRIDGE_BROWSER_MODE: "managed-browser",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:39222",
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_cookie=1",
          WEBAI_BRIDGE_SHARED: "from-chatgpt",
        },
        updatedAt: "2026-04-02T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );
    upsertStoredWebProviderSession(
      {
        providerId: "gemini",
        state: "expiring",
        sessionSource: "gemini-google-oauth",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "managed-browser",
          WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:39222",
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "gemini_cookie=1",
          WEBAI_BRIDGE_SHARED: "from-gemini",
        },
        updatedAt: "2026-04-02T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );

    expect(buildStoredWebProviderSessions(storeEnv)).toEqual(
      expect.objectContaining({
        chatgpt: expect.objectContaining({
          state: "ready",
          sessionSource: "chatgpt-browser-profile",
        }),
        gemini: expect.objectContaining({
          state: "expiring",
          sessionSource: "gemini-google-oauth",
        }),
      }),
    );
    expect(buildStoredWebRuntimeEnv(storeEnv)).toEqual({
      WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_cookie=1",
      WEBAI_BRIDGE_SHARED: "from-gemini",
      WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "gemini_cookie=1",
    });

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });

  it("maps stored sessions into credential records across lifecycle states", () => {
    const storeEnv = createStoreEnv("local-web-auth-store-records.json");
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    const recordsToStore = [
      {
        providerId: "chatgpt",
        state: "ready",
        accountLabel: "chatgpt:default",
        sessionSource: "chatgpt-browser-profile",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CHATGPT_COOKIE_BUNDLE: "chatgpt_cookie=1",
        },
      },
      {
        providerId: "gemini",
        state: "expiring",
        accountLabel: "gemini:oauth",
        sessionSource: "gemini-google-oauth",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "gemini_cookie=1",
        },
      },
      {
        providerId: "claude",
        state: "expired",
        accountLabel: "claude:default",
        sessionSource: "claude-browser-profile",
        expiresAt: "2026-04-03T00:00:00.000Z",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_CLAUDE_COOKIE_BUNDLE: "claude_cookie=1",
        },
      },
      {
        providerId: "grok",
        state: "refreshable-but-degraded",
        accountLabel: "grok:default",
        sessionSource: "grok-x-oauth",
        refreshEligible: true,
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_GROK_COOKIE_BUNDLE: "grok_cookie=1",
        },
      },
      {
        providerId: "qwen",
        state: "user-action-required",
        accountLabel: "qwen:default",
        sessionSource: "qwen-browser-profile",
        requiredUserAction: "Complete sign-in",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_QWEN_COOKIE_BUNDLE: "qwen_cookie=1",
        },
      },
    ] as const;

    for (const record of recordsToStore) {
      upsertStoredWebProviderSession(
        {
          ...record,
          updatedAt: "2026-04-02T00:00:00.000Z",
          source: "local-auth-portal",
        },
        storeEnv,
      );
    }

    const records = buildStoredWebCredentialRecords("local-user", storeEnv);

    expect(records).toHaveLength(5);
    expect(records.find((record) => record.provider.providerId === "chatgpt")).toEqual(
      expect.objectContaining({
        state: "ready",
        materialKind: "browser-session",
      }),
    );
    expect(records.find((record) => record.provider.providerId === "gemini")).toEqual(
      expect.objectContaining({
        state: "expiring",
        materialKind: "oauth-session",
      }),
    );
    expect(records.find((record) => record.provider.providerId === "claude")).toEqual(
      expect.objectContaining({
        state: "expired",
        status: expect.objectContaining({
          expired: true,
        }),
      }),
    );
    expect(records.find((record) => record.provider.providerId === "grok")).toEqual(
      expect.objectContaining({
        state: "refreshable-but-degraded",
        status: expect.objectContaining({
          degraded: true,
          refreshEligible: true,
        }),
      }),
    );
    expect(records.find((record) => record.provider.providerId === "qwen")).toEqual(
      expect.objectContaining({
        state: "user-action-required",
        status: expect.objectContaining({
          userActionRequired: true,
        }),
      }),
    );

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });

  it("maps missing and provider-unavailable stored sessions into credential facts", () => {
    const storeEnv = createStoreEnv("local-web-auth-store-problem-states.json");
    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });

    upsertStoredWebProviderSession(
      {
        providerId: "chatgpt",
        state: "missing",
        accountLabel: "chatgpt:missing",
        runtimeEnv: {},
        updatedAt: "2026-04-02T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );
    upsertStoredWebProviderSession(
      {
        providerId: "gemini",
        state: "provider-unavailable",
        accountLabel: "gemini:down",
        runtimeEnv: {
          WEBAI_BRIDGE_WEB_GEMINI_COOKIE_BUNDLE: "gemini_cookie=1",
        },
        updatedAt: "2026-04-02T00:00:00.000Z",
        source: "local-auth-portal",
      },
      storeEnv,
    );

    const records = buildStoredWebCredentialRecords("local-user", storeEnv);

    expect(records.find((record) => record.provider.providerId === "chatgpt")).toEqual(
      expect.objectContaining({
        state: "missing",
        status: expect.objectContaining({
          hasMaterial: false,
        }),
      }),
    );
    expect(records.find((record) => record.provider.providerId === "gemini")).toEqual(
      expect.objectContaining({
        state: "provider-unavailable",
        status: expect.objectContaining({
          hasMaterial: true,
          providerAvailable: false,
        }),
      }),
    );

    rmSync(storeEnv.WEBAI_BRIDGE_LOCAL_WEB_AUTH_STORE_PATH, { force: true });
  });
});
