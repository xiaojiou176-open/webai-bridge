import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("service index wiring", () => {
  it("merges stored, env, and option state into the service shell", async () => {
    const buildStoredWebProviderSessions = vi.fn(() => ({
      chatgpt: {
        state: "ready",
        accountLabel: "stored-account",
      },
    }));
    const buildStoredWebRuntimeEnv = vi.fn(() => ({
      STORED_ENV: "1",
    }));
    const createWebaiBridgeSdkClient = vi.fn(() => ({
      kind: "sdk-client",
    }));
    const createDefaultWebLane = vi.fn(({ providerSessions, runtimeEnv }) => ({
      lane: { id: "lane" },
      context: {
        providerSessions,
        runtimeEnv,
      },
    }));
    const createDefaultWebAcquisitionRunners = vi.fn(() => ({
      chatgpt: "acquisition-runner",
    }));
    const createDefaultWebDebugSupportRunners = vi.fn(() => ({
      chatgpt: "debug-support-runner",
    }));
    const createDefaultWebLiveProofRunners = vi.fn(() => ({
      chatgpt: "live-proof-runner",
    }));
    const createNodeHttpHandler = vi.fn(() => "handler");
    const buildServiceRouteCatalog = vi.fn((baseUrl?: string) => ({
      bootstrap: baseUrl
        ? `${baseUrl}/v1/runtime/bootstrap`
        : "/v1/runtime/bootstrap",
    }));
    const loadLocalEnvFiles = vi.fn();
    const loadProviderSessionsFromEnv = vi.fn(() => ({
      chatgpt: {
        sessionSource: "env-session",
      },
    }));
    const loadServicePort = vi.fn(() => 4242);

    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      buildStoredWebProviderSessions,
      buildStoredWebRuntimeEnv,
    }));
    vi.doMock("../../../packages/surfaces/sdk-client/src/index.js", () => ({
      createWebaiBridgeSdkClient,
    }));
    vi.doMock("../../../packages/surfaces/http/src/index.js", () => ({
      WebaiBridgeHttpSurface: vi.fn(function WebaiBridgeHttpSurface(this: { options?: unknown }, options: unknown) {
        this.options = options;
      }),
      createNodeHttpHandler,
      buildServiceRouteCatalog,
    }));
    vi.doMock("../../../apps/service/src/default-web-lane.js", () => ({
      createDefaultWebLane,
    }));
    vi.doMock("../../../apps/service/src/web-auth-acquisition.js", () => ({
      createDefaultWebAcquisitionRunners,
    }));
    vi.doMock("../../../apps/service/src/browser-debug-support.js", () => ({
      createDefaultWebDebugSupportRunners,
    }));
    vi.doMock("../../../apps/service/src/default-web-live-proofs.js", () => ({
      createDefaultWebLiveProofRunners,
    }));
    vi.doMock("../../../apps/service/src/env.js", () => ({
      loadLocalEnvFiles,
      loadProviderSessionsFromEnv,
      loadServicePort,
    }));

    const { createWebaiBridgeService } = await import(
      "../../../apps/service/src/index.js"
    );

    const service = createWebaiBridgeService({
      providerSessions: {
        chatgpt: {
          note: "option-session",
        },
      },
      runtimeEnv: {
        OPTION_ENV: "2",
      },
      liveProofEnv: {
        LIVE_PROOF_ENV: "3",
      },
      serviceName: "webai-bridge-test-service",
      ownerUserId: "local-user",
    });

    expect(loadLocalEnvFiles).toHaveBeenCalledTimes(1);
    expect(buildStoredWebProviderSessions).toHaveBeenCalledWith(process.env);
    expect(loadProviderSessionsFromEnv).toHaveBeenCalledWith(process.env);
    expect(createDefaultWebLane).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSessions: expect.objectContaining({
          chatgpt: expect.objectContaining({
            state: "ready",
            accountLabel: "stored-account",
            sessionSource: "env-session",
            note: "option-session",
          }),
        }),
        runtimeEnv: expect.objectContaining({
          STORED_ENV: "1",
          OPTION_ENV: "2",
          LIVE_PROOF_ENV: "3",
        }),
      }),
    );
    expect(createWebaiBridgeSdkClient).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          STORED_ENV: "1",
          OPTION_ENV: "2",
          LIVE_PROOF_ENV: "3",
        }),
      }),
    );
    expect(createDefaultWebLiveProofRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          STORED_ENV: "1",
          OPTION_ENV: "2",
          LIVE_PROOF_ENV: "3",
        }),
      }),
    );
    expect(createDefaultWebAcquisitionRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        STORED_ENV: "1",
        OPTION_ENV: "2",
        LIVE_PROOF_ENV: "3",
      }),
    );
    expect(createDefaultWebDebugSupportRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        STORED_ENV: "1",
        OPTION_ENV: "2",
        LIVE_PROOF_ENV: "3",
      }),
    );
    expect(createNodeHttpHandler).toHaveBeenCalled();
    expect(service.bootstrapPath).toBe("/v1/runtime/bootstrap");
    expect(service.routes).toEqual({
      bootstrap: "/v1/runtime/bootstrap",
    });
  });

  it("wires the runtime kernel helpers into the service surface when both registries are available", async () => {
    const createServiceRuntimeKernel = vi.fn(() => ({
      kind: "runtime-kernel",
    }));
    const invokeRuntime = vi.fn(async () => ({
      status: 200,
      body: {
        ok: true,
      },
    }));
    const createServiceRuntimeInvoker = vi.fn(() => invokeRuntime);
    const suggestServicePreferredLane = vi.fn(() => "web-login");
    const resolveServiceRuntimeCredentialStates = vi.fn(() => ({
      byok: "configured",
      "web-login": "configured",
    }));
    const buildServiceRuntimePolicyHints = vi.fn(() => ({
      policyProfile: "low-friction",
      preferredLane: "web-login",
      requiredCapabilities: ["text-generation"],
      allowWebLogin: true,
      strictReadyOnly: false,
    }));
    const byokRegistry = {
      id: "byok-registry",
    };
    const webRegistry = {
      id: "web-registry",
    };
    const authStatus = vi.fn(async () => [
      {
        provider: "gemini",
        credentialState: "ready",
      },
    ]);
    let capturedSurfaceOptions: Record<string, unknown> | undefined;

    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      buildStoredWebProviderSessions: () => ({}),
      buildStoredWebRuntimeEnv: () => ({}),
    }));
    vi.doMock("../../../packages/surfaces/sdk-client/src/index.js", () => ({
      createWebaiBridgeSdkClient: () => ({
        kind: "sdk-client",
        registry: byokRegistry,
      }),
    }));
    vi.doMock("../../../packages/surfaces/http/src/index.js", () => ({
      WebaiBridgeHttpSurface: vi.fn(function WebaiBridgeHttpSurface(this: { options?: unknown }, options: unknown) {
        this.options = options;
        capturedSurfaceOptions = options as Record<string, unknown>;
      }),
      createNodeHttpHandler: vi.fn(() => "handler"),
      buildServiceRouteCatalog: vi.fn(() => ({
        bootstrap: "/v1/runtime/bootstrap",
      })),
    }));
    vi.doMock("../../../apps/service/src/default-web-lane.js", () => ({
      createDefaultWebLane: () => ({
        lane: {
          registry: webRegistry,
          authStatus,
        },
        context: {
          source: "mocked-context",
        },
      }),
    }));
    vi.doMock("../../../apps/service/src/web-auth-acquisition.js", () => ({
      createDefaultWebAcquisitionRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/browser-debug-support.js", () => ({
      createDefaultWebDebugSupportRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/default-web-live-proofs.js", () => ({
      createDefaultWebLiveProofRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/env.js", () => ({
      loadLocalEnvFiles: vi.fn(),
      loadProviderSessionsFromEnv: () => ({}),
      loadServicePort: () => 4242,
    }));
    vi.doMock("../../../apps/service/src/runtime-kernel.js", () => ({
      createServiceRuntimeKernel,
      createServiceRuntimeInvoker,
      resolveServiceRuntimeCredentialStates,
      suggestServicePreferredLane,
      buildServiceRuntimePolicyHints,
      SERVICE_RUNTIME_POLICY_PROFILES: [
        { id: "low-friction" },
        { id: "official-api-first" },
      ],
    }));

    const { createWebaiBridgeService } = await import(
      "../../../apps/service/src/index.js"
    );

    const service = createWebaiBridgeService({
      runtimeEnv: {
        WEBAI_BRIDGE_GEMINI_API_KEY: "gemini-test-key",
      },
      ownerUserId: "local-user",
    });

    expect(createServiceRuntimeKernel).toHaveBeenCalledWith({
      byokRegistry,
      webRegistry,
    });
    expect(createServiceRuntimeInvoker).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: {
          kind: "runtime-kernel",
        },
        byokClient: expect.objectContaining({
          registry: byokRegistry,
        }),
        ownerUserId: "local-user",
      }),
    );
    expect(service.runtime).toEqual({
      kind: "runtime-kernel",
    });
    expect(capturedSurfaceOptions?.runtime).toEqual({
      kind: "runtime-kernel",
    });
    expect(capturedSurfaceOptions?.invokeRuntime).toBe(invokeRuntime);
    expect(typeof capturedSurfaceOptions?.resolvePreferredLane).toBe("function");
    expect(typeof capturedSurfaceOptions?.resolveCredentialStates).toBe("function");

    const preferredLane = await (
      capturedSurfaceOptions?.resolvePreferredLane as
        | ((providerId: string) => Promise<string | undefined>)
        | undefined
    )?.("gemini");

    expect(preferredLane).toBe("web-login");
    expect(authStatus).toHaveBeenCalledWith({
      source: "mocked-context",
    });
    expect(suggestServicePreferredLane).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "gemini",
        byokRegistry,
        webProviderStatuses: [
          {
            provider: "gemini",
            credentialState: "ready",
          },
        ],
        env: expect.objectContaining({
          WEBAI_BRIDGE_GEMINI_API_KEY: "gemini-test-key",
        }),
      }),
    );
    const credentialStates = await (
      capturedSurfaceOptions?.resolveCredentialStates as
        | ((providerId: string) => Promise<Record<string, string> | undefined>)
        | undefined
    )?.("gemini");

    expect(credentialStates).toEqual({
      byok: "configured",
      "web-login": "configured",
    });
    expect(resolveServiceRuntimeCredentialStates).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "gemini",
        byokRegistry,
        webProviderStatuses: [
          {
            provider: "gemini",
            credentialState: "ready",
          },
        ],
        env: expect.objectContaining({
          WEBAI_BRIDGE_GEMINI_API_KEY: "gemini-test-key",
        }),
      }),
    );
  });

  it("starts and closes the service using the requested port and route catalog", async () => {
    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      buildStoredWebProviderSessions: () => ({}),
      buildStoredWebRuntimeEnv: () => ({}),
    }));
    vi.doMock("../../../packages/surfaces/sdk-client/src/index.js", () => ({
      createWebaiBridgeSdkClient: () => ({ kind: "sdk-client" }),
    }));
    vi.doMock("../../../packages/surfaces/http/src/index.js", () => ({
      WebaiBridgeHttpSurface: class WebaiBridgeHttpSurface {},
      createNodeHttpHandler: () => (_req: unknown, res: { statusCode: number; end(body: string): void }) => {
        res.statusCode = 200;
        res.end("ok");
      },
      buildServiceRouteCatalog: (baseUrl?: string) => ({
        bootstrap: baseUrl
          ? `${baseUrl}/v1/runtime/bootstrap`
          : "/v1/runtime/bootstrap",
      }),
    }));
    vi.doMock("../../../apps/service/src/default-web-lane.js", () => ({
      createDefaultWebLane: () => ({
        lane: { id: "lane" },
        context: { source: "mocked" },
      }),
    }));
    vi.doMock("../../../apps/service/src/web-auth-acquisition.js", () => ({
      createDefaultWebAcquisitionRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/browser-debug-support.js", () => ({
      createDefaultWebDebugSupportRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/default-web-live-proofs.js", () => ({
      createDefaultWebLiveProofRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/env.js", () => ({
      loadLocalEnvFiles: vi.fn(),
      loadProviderSessionsFromEnv: () => ({}),
      loadServicePort: () => 0,
    }));

    const { startWebaiBridgeService, startFromProcessEnv } = await import(
      "../../../apps/service/src/index.js"
    );

    const started = await startWebaiBridgeService({
      port: 0,
      serviceName: "webai-bridge-start-test",
    });

    expect(started.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(started.bootstrapUrl).toBe(
      `${started.baseUrl}/v1/runtime/bootstrap`,
    );

    await started.close();

    const startedFromEnv = await startFromProcessEnv();
    expect(startedFromEnv.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await startedFromEnv.close();
  });

  it("keeps explicit existing-browser-session bindings even when the runtime default is isolated chrome root", async () => {
    const buildStoredWebProviderSessions = vi.fn(() => ({
      chatgpt: {
        state: "ready",
        acquisitionMode: "existing-browser-session",
      },
      gemini: {
        state: "ready",
        acquisitionMode: "managed-browser",
      },
    }));
    const buildStoredWebRuntimeEnv = vi.fn(() => ({
      WEBAI_BRIDGE_WEB_AUTH_EXISTING_BROWSER_SESSION_URL: "http://127.0.0.1:9555",
    }));
    const createDefaultWebLane = vi.fn(({ providerSessions, runtimeEnv }) => ({
      lane: { id: "lane" },
      context: {
        providerSessions,
        runtimeEnv,
      },
    }));

    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      buildStoredWebProviderSessions,
      buildStoredWebRuntimeEnv,
    }));
    vi.doMock("../../../packages/surfaces/sdk-client/src/index.js", () => ({
      createWebaiBridgeSdkClient: () => ({ kind: "sdk-client" }),
    }));
    vi.doMock("../../../packages/surfaces/http/src/index.js", () => ({
      WebaiBridgeHttpSurface: vi.fn(function WebaiBridgeHttpSurface(this: { options?: unknown }, options: unknown) {
        this.options = options;
      }),
      createNodeHttpHandler: vi.fn(() => "handler"),
      buildServiceRouteCatalog: vi.fn(() => ({
        bootstrap: "/v1/runtime/bootstrap",
      })),
    }));
    vi.doMock("../../../apps/service/src/default-web-lane.js", () => ({
      createDefaultWebLane,
    }));
    vi.doMock("../../../apps/service/src/web-auth-acquisition.js", () => ({
      createDefaultWebAcquisitionRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/browser-debug-support.js", () => ({
      createDefaultWebDebugSupportRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/default-web-live-proofs.js", () => ({
      createDefaultWebLiveProofRunners: () => ({}),
    }));
    vi.doMock("../../../apps/service/src/env.js", () => ({
      loadLocalEnvFiles: vi.fn(),
      loadProviderSessionsFromEnv: () => ({}),
      loadServicePort: () => 4242,
    }));

    const { createWebaiBridgeService } = await import(
      "../../../apps/service/src/index.js"
    );

    createWebaiBridgeService({
      runtimeEnv: {
        WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
      },
    });

    expect(createDefaultWebLane).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSessions: expect.objectContaining({
          chatgpt: expect.objectContaining({
            acquisitionMode: "existing-browser-session",
          }),
          gemini: expect.objectContaining({
            acquisitionMode: "isolated-chrome-root",
          }),
        }),
      }),
    );
  });

  it("derives isolated-root routing env from stored capture provenance when store routing env is intentionally filtered", async () => {
    const buildStoredWebProviderSessions = vi.fn(() => ({
      chatgpt: {
        state: "ready",
        acquisitionMode: "isolated-chrome-root",
        captureProvenance: {
          browserMode: "isolated-chrome-root",
          userDataDir: "/tmp/webai-bridge-browser",
          profileName: "webai-bridge",
          cdpUrl: "http://127.0.0.1:9338",
        },
      },
    }));
    const buildStoredWebRuntimeEnv = vi.fn(() => ({}));
    const createDefaultWebLane = vi.fn(({ runtimeEnv }) => ({
      lane: { id: "lane" },
      context: { runtimeEnv },
    }));
    const createDefaultWebLiveProofRunners = vi.fn(() => ({}));
    const createDefaultWebDebugSupportRunners = vi.fn(() => ({}));
    const createDefaultWebAcquisitionRunners = vi.fn(() => ({}));

    vi.doMock("../../../packages/credentials/src/index.js", () => ({
      buildStoredWebProviderSessions,
      buildStoredWebRuntimeEnv,
    }));
    vi.doMock("../../../packages/surfaces/sdk-client/src/index.js", () => ({
      createWebaiBridgeSdkClient: () => ({ kind: "sdk-client" }),
    }));
    vi.doMock("../../../packages/surfaces/http/src/index.js", () => ({
      WebaiBridgeHttpSurface: vi.fn(function WebaiBridgeHttpSurface(this: { options?: unknown }, options: unknown) {
        this.options = options;
      }),
      createNodeHttpHandler: vi.fn(() => "handler"),
      buildServiceRouteCatalog: vi.fn(() => ({
        bootstrap: "/v1/runtime/bootstrap",
      })),
    }));
    vi.doMock("../../../apps/service/src/default-web-lane.js", () => ({
      createDefaultWebLane,
    }));
    vi.doMock("../../../apps/service/src/default-web-live-proofs.js", () => ({
      createDefaultWebLiveProofRunners,
    }));
    vi.doMock("../../../apps/service/src/browser-debug-support.js", () => ({
      createDefaultWebDebugSupportRunners,
    }));
    vi.doMock("../../../apps/service/src/web-auth-acquisition.js", () => ({
      createDefaultWebAcquisitionRunners,
    }));
    vi.doMock("../../../apps/service/src/env.js", () => ({
      loadLocalEnvFiles: vi.fn(),
      loadProviderSessionsFromEnv: () => ({}),
      loadServicePort: () => 4242,
    }));

    const { createWebaiBridgeService } = await import(
      "../../../apps/service/src/index.js"
    );

    createWebaiBridgeService();

    expect(createDefaultWebLane).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeEnv: expect.objectContaining({
          WEBAI_BRIDGE_BROWSER_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_ACTIVE_MODE: "isolated-chrome-root",
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_GEMINI_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_CHROME_USER_DATA_DIR: "/tmp/webai-bridge-browser",
          WEBAI_BRIDGE_CHROME_PROFILE_NAME: "webai-bridge",
        }),
      }),
    );
    expect(createDefaultWebLiveProofRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
          WEBAI_BRIDGE_WEB_AUTH_CDP_URL: "http://127.0.0.1:9338",
        }),
      }),
    );
    expect(createDefaultWebDebugSupportRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
      }),
    );
    expect(createDefaultWebAcquisitionRunners).toHaveBeenCalledWith(
      expect.objectContaining({
        WEBAI_BRIDGE_WEB_AUTH_EXISTING_PROFILE_CDP_URL: "http://127.0.0.1:9338",
      }),
    );
  });
});
