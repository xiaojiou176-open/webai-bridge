import {
  buildStoredWebProviderSessions,
  buildStoredWebRuntimeEnv,
  type WebLoginProviderId,
} from "../../credentials/src/index.js";
import {
  WebLoginLane,
  WebProviderRegistry,
  WEB_PROVIDER_IDS,
  type ProviderStatusView,
  type RuntimeInvocationRequest,
  type RuntimeInvocationResult,
  type WebLaneContext,
  type WebLaneSnapshot,
  type WebProviderId,
  type WebProviderRuntime,
  type WebSessionSnapshot,
} from "../../lanes/web/src/index.js";
import { createChatgptWebRuntime } from "../../providers/web/chatgpt/src/index.js";
import { createGeminiWebRuntime } from "../../providers/web/gemini/src/index.js";
import { createClaudeWebRuntime } from "../../providers/web/claude/src/index.js";
import { createGrokWebRuntime } from "../../providers/web/grok/src/index.js";
import { createQwenWebRuntime } from "../../providers/web/qwen/src/index.js";

export interface WebaiBridgeWebSdkOptions {
  providerSessions?: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>>;
  runtimeEnv?: Record<string, string | undefined>;
  useLocalWebAuthStore?: boolean;
  now?: WebLaneContext["now"];
}

export interface WebaiBridgeWebSdk {
  readonly lane: WebLoginLane;
  readonly registry: WebProviderRegistry;
  readonly context: WebLaneContext;
  listProviders(): readonly WebProviderRuntime[];
  getProvider(provider: WebProviderId): WebProviderRuntime | undefined;
  authStatus(): Promise<ProviderStatusView[]>;
  health(): Promise<WebLaneSnapshot>;
  invoke(request: RuntimeInvocationRequest): Promise<RuntimeInvocationResult>;
}

function normalizeProviderSessions(
  providerSessions: WebaiBridgeWebSdkOptions["providerSessions"] = {},
): WebLaneContext["sessions"] {
  const normalized: WebLaneContext["sessions"] = {};

  for (const provider of WEB_PROVIDER_IDS) {
    const session = providerSessions[provider];

    if (!session) {
      continue;
    }

    normalized[provider] = {
      state: "missing",
      ...session,
    };
  }

  return normalized;
}

function mergeProviderSessions(
  ...sources: Array<
    Partial<Record<WebLoginProviderId, Partial<WebSessionSnapshot>>> | undefined
  >
): Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> {
  const merged: Partial<Record<WebProviderId, Partial<WebSessionSnapshot>>> = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [provider, session] of Object.entries(source) as Array<
      [WebProviderId, Partial<WebSessionSnapshot> | undefined]
    >) {
      if (!session) {
        continue;
      }

      merged[provider] = {
        ...(merged[provider] ?? {}),
        ...session,
      };
    }
  }

  return merged;
}

function mergeRuntimeEnv(
  ...sources: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  return Object.assign({}, ...sources.filter(Boolean));
}

export function createDefaultWebRegistry() {
  return new WebProviderRegistry([
    createChatgptWebRuntime(),
    createGeminiWebRuntime(),
    createClaudeWebRuntime(),
    createGrokWebRuntime(),
    createQwenWebRuntime(),
  ]);
}

export function createWebaiBridgeWebSdk(
  options: WebaiBridgeWebSdkOptions = {},
): WebaiBridgeWebSdk {
  const shouldUseLocalWebAuthStore = options.useLocalWebAuthStore !== false;
  const storedProviderSessions = shouldUseLocalWebAuthStore
    ? (buildStoredWebProviderSessions(process.env) as Partial<
        Record<WebProviderId, Partial<WebSessionSnapshot>>
      >)
    : {};
  const storedRuntimeEnv = shouldUseLocalWebAuthStore
    ? buildStoredWebRuntimeEnv(process.env)
    : {};
  const providerSessions = mergeProviderSessions(
    storedProviderSessions,
    options.providerSessions,
  );
  const runtimeEnv = mergeRuntimeEnv(
    process.env,
    storedRuntimeEnv,
    options.runtimeEnv,
  );
  const registry = createDefaultWebRegistry();
  const lane = new WebLoginLane(registry);
  const context: WebLaneContext = {
    env: runtimeEnv,
    sessions: normalizeProviderSessions(providerSessions),
    now: options.now,
  };

  return {
    lane,
    registry,
    context,
    listProviders() {
      return registry.list();
    },
    getProvider(provider) {
      return registry.get(provider);
    },
    authStatus() {
      return lane.authStatus(context);
    },
    health() {
      return lane.health(context);
    },
    invoke(request) {
      return lane.invoke(request, context);
    },
  };
}
