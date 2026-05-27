import type { LaneId, SurfaceId } from './dimensions.js';

export const RUNTIME_ERROR_CATEGORIES = [
  'auth',
  'session',
  'provider',
  'capability',
  'model-resolution',
  'routing',
  'configuration',
  'user-action-required'
] as const;

export type RuntimeErrorCategory = (typeof RUNTIME_ERROR_CATEGORIES)[number];
export type DiagnosticSeverity = 'info' | 'warning' | 'error';
export type DiagnosticStatus = 'healthy' | 'degraded' | 'unavailable' | 'user-action-required';
export type DiagnosticMetadataValue = string | number | boolean | null;

const ERROR_DEFINITIONS = {
  'invalid-model-reference': {
    category: 'model-resolution',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'missing-credential': {
    category: 'auth',
    severity: 'error',
    status: 'user-action-required',
    userActionRequired: true
  },
  'credential-invalid': {
    category: 'auth',
    severity: 'error',
    status: 'user-action-required',
    userActionRequired: true
  },
  'session-expired': {
    category: 'session',
    severity: 'error',
    status: 'user-action-required',
    userActionRequired: true
  },
  'session-invalid': {
    category: 'session',
    severity: 'error',
    status: 'user-action-required',
    userActionRequired: true
  },
  'session-refreshable-degraded': {
    category: 'session',
    severity: 'warning',
    status: 'degraded',
    userActionRequired: false
  },
  'provider-unavailable': {
    category: 'provider',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'provider-capability-mismatch': {
    category: 'capability',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'provider-unsupported': {
    category: 'provider',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'provider-lane-incompatible': {
    category: 'configuration',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'model-resolution-failed': {
    category: 'model-resolution',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'routing-failed': {
    category: 'routing',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'registry-invalid': {
    category: 'configuration',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'configuration-invalid': {
    category: 'configuration',
    severity: 'error',
    status: 'unavailable',
    userActionRequired: false
  },
  'user-action-required': {
    category: 'user-action-required',
    severity: 'warning',
    status: 'user-action-required',
    userActionRequired: true
  }
} as const satisfies Record<
  string,
  {
    readonly category: RuntimeErrorCategory;
    readonly severity: DiagnosticSeverity;
    readonly status: DiagnosticStatus;
    readonly userActionRequired: boolean;
  }
>;

export type RuntimeErrorCode = keyof typeof ERROR_DEFINITIONS;

export interface DiagnosticContext {
  readonly providerId?: string;
  readonly laneId?: LaneId;
  readonly modelReference?: string;
  readonly surfaceId?: SurfaceId;
  readonly consumerId?: string;
}

export interface DiagnosticRecord {
  readonly code: RuntimeErrorCode;
  readonly category: RuntimeErrorCategory;
  readonly severity: DiagnosticSeverity;
  readonly status: DiagnosticStatus;
  readonly message: string;
  readonly userActionRequired: boolean;
  readonly hints: readonly string[];
  readonly context?: DiagnosticContext;
  readonly metadata?: Readonly<Record<string, DiagnosticMetadataValue>>;
}

export interface CreateDiagnosticRecordInput {
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly hints?: readonly string[];
  readonly context?: DiagnosticContext;
  readonly metadata?: Readonly<Record<string, DiagnosticMetadataValue>>;
  readonly severity?: DiagnosticSeverity;
  readonly status?: DiagnosticStatus;
  readonly userActionRequired?: boolean;
}

export function createDiagnosticRecord(input: CreateDiagnosticRecordInput): DiagnosticRecord {
  const defaults = ERROR_DEFINITIONS[input.code];

  return Object.freeze({
    code: input.code,
    category: defaults.category,
    severity: input.severity ?? defaults.severity,
    status: input.status ?? defaults.status,
    message: input.message,
    userActionRequired: input.userActionRequired ?? defaults.userActionRequired,
    hints: Object.freeze([...(input.hints ?? [])]),
    context: input.context ? Object.freeze({ ...input.context }) : undefined,
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined
  });
}

export class WebaiBridgeContractError extends Error {
  readonly diagnostic: DiagnosticRecord;

  constructor(
    code: RuntimeErrorCode,
    message: string,
    options: Omit<CreateDiagnosticRecordInput, 'code' | 'message'> = {}
  ) {
    super(message);
    this.name = 'WebaiBridgeContractError';
    this.diagnostic = createDiagnosticRecord({
      code,
      message,
      ...options
    });
  }
}
