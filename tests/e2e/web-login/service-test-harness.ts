import {
  createWebaiBridgeService,
  type WebaiBridgeServiceOptions,
} from "../../../apps/service/src/index.js";

const ISOLATED_E2E_RUNTIME_ENV: Record<string, string | undefined> = {
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  WEBAI_BRIDGE_GEMINI_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  GOOGLE_API_KEY: undefined,
  XAI_API_KEY: undefined,
  OPENROUTER_API_KEY: undefined,
  GROQ_API_KEY: undefined,
  QWEN_API_KEY: undefined,
  DASHSCOPE_API_KEY: undefined,
  GOOGLE_VERTEX_API_KEY: undefined,
  GOOGLE_VERTEX_PROJECT: undefined,
  GOOGLE_VERTEX_LOCATION: undefined,
  GOOGLE_VERTEX_BASE_URL: undefined,
  GOOGLE_APPLICATION_CREDENTIALS: undefined,
  AWS_ACCESS_KEY_ID: undefined,
  AWS_SECRET_ACCESS_KEY: undefined,
  AWS_REGION: undefined,
  AWS_BEDROCK_BASE_URL: undefined,
};

const PORT_STATE_KEY = "__webai_bridgeE2ePortState";
const E2E_PORT_BASE = 38_080;
const E2E_PORT_BLOCK_SIZE = 200;
const E2E_URL_PREFIX = "webai-bridge-e2e://service-";
const inMemoryServices = new Map<string, ReturnType<typeof createWebaiBridgeService>>();

function resolveWorkerOffset(): number {
  const rawValue =
    process.env.VITEST_POOL_ID ??
    process.env.VITEST_WORKER_ID ??
    "0";
  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue > 0 ? parsedValue - 1 : 0;
}

function allocateE2EServicePort(): number {
  const globalState = globalThis as typeof globalThis & {
    [PORT_STATE_KEY]?: { nextPort: number };
  };
  const initialPort = E2E_PORT_BASE + resolveWorkerOffset() * E2E_PORT_BLOCK_SIZE;

  if (!globalState[PORT_STATE_KEY]) {
    globalState[PORT_STATE_KEY] = {
      nextPort: initialPort,
    };
  }

  const port = globalState[PORT_STATE_KEY]!.nextPort;
  globalState[PORT_STATE_KEY]!.nextPort += 1;
  return port;
}

export function startWebaiBridgeE2EService(
  options: WebaiBridgeServiceOptions = {},
) {
  const {
    runtimeEnv,
    liveProofEnv,
    useLocalWebAuthStore,
    ...rest
  } = options;
  const port = options.port ?? allocateE2EServicePort();
  const baseUrl = `${E2E_URL_PREFIX}${port}`;
  const service = createWebaiBridgeService({
    ...rest,
    useLocalWebAuthStore: useLocalWebAuthStore ?? false,
    runtimeEnv: {
      ...ISOLATED_E2E_RUNTIME_ENV,
      ...runtimeEnv,
    },
    liveProofEnv: liveProofEnv
      ? {
          ...ISOLATED_E2E_RUNTIME_ENV,
          ...liveProofEnv,
        }
      : undefined,
    port,
  });
  inMemoryServices.set(baseUrl, service);

  return {
    baseUrl,
    port,
    routes: service.routes,
    async close() {
      inMemoryServices.delete(baseUrl);
    },
  };
}

export function resolveInMemoryE2EService(url: string) {
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const service = inMemoryServices.get(baseUrl);

  if (!service) {
    throw new Error(`No in-memory WebaiBridge E2E service registered for ${baseUrl}.`);
  }

  return {
    service,
    pathname: parsed.pathname,
  };
}

export function isInMemoryE2EUrl(url: string) {
  return url.startsWith(E2E_URL_PREFIX);
}
