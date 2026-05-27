export function resolveCliBaseUrl(
  env?: NodeJS.ProcessEnv,
  explicitBaseUrl?: string,
): string;

export function parseCliArgs(
  argv?: string[],
): {
  command?: string;
  provider?: string;
  baseUrl?: string;
  json: boolean;
};

export function runWebaiBridgeCli(
  options: {
    command?: string;
    provider?: string;
    baseUrl?: string;
    json?: boolean;
  },
  client: {
    listProviders(): Promise<unknown>;
    health(): Promise<unknown>;
    authStatus(): Promise<unknown>;
    providerStatus(provider: string): Promise<unknown>;
    providerProbe(provider: string): Promise<unknown>;
    providerRemediation(provider: string): Promise<unknown>;
    providerCurrentPage(provider: string): Promise<unknown>;
    providerCurrentConsole(provider: string): Promise<unknown>;
    providerCurrentNetwork(provider: string): Promise<unknown>;
    providerStoreReadiness?(provider: string): Promise<unknown>;
    providerLiveReadiness?(provider: string): Promise<unknown>;
    providerAttachTarget?(provider: string): Promise<unknown>;
    providerDiagnoseLadder?(provider: string): Promise<unknown>;
    providerDiagnose?(provider: string): Promise<unknown>;
    providerSupportBundle(provider: string): Promise<unknown>;
  },
): Promise<unknown>;

export function renderCliPayload(payload: unknown): string;
