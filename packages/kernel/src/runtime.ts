import {
  type DiagnosticRecord,
  type LaneId,
  type RuntimeInvocationPlan,
  type RuntimeRequest,
  WebaiBridgeContractError,
  createDiagnosticRecord
} from '../../contracts/src/index.js';
import { dispatchLane, type LaneDispatchOptions } from './lane-dispatch.js';
import { resolveModelReference } from './model-resolution.js';
import { type ProviderRegistry } from './provider-registry.js';

export interface WebaiBridgeRuntimeOptions extends LaneDispatchOptions {
  readonly registry: ProviderRegistry;
}

export interface RuntimeLaneExecution<TInput = unknown> {
  readonly plan: RuntimeInvocationPlan;
  readonly request: RuntimeRequest;
  readonly input: TInput;
}

export interface RuntimeLaneExecutor<TInput = unknown, TResult = unknown> {
  execute(args: RuntimeLaneExecution<TInput>): Promise<TResult> | TResult;
}

export type RuntimeLaneExecutors<TInput = unknown, TResult = unknown> = Partial<
  Record<LaneId, RuntimeLaneExecutor<TInput, TResult>>
>;

function buildRuntimeDiagnostics(
  request: RuntimeRequest,
  laneId: LaneId
): readonly DiagnosticRecord[] {
  if (request.credentialStates?.[laneId] !== 'refreshable-degraded') {
    return [];
  }

  return Object.freeze([
    createDiagnosticRecord({
      code: 'session-refreshable-degraded',
      message: `Lane "${laneId}" remains usable but requires refresh attention before it becomes unavailable.`,
      context: {
        providerId: request.providerId,
        laneId,
        surfaceId: request.surface,
        consumerId: request.consumer?.consumerId
      }
    })
  ]);
}

export class WebaiBridgeRuntime {
  readonly registry: ProviderRegistry;
  readonly laneOrder: readonly LaneId[];

  constructor(options: WebaiBridgeRuntimeOptions) {
    this.registry = options.registry;
    this.laneOrder = Object.freeze([...(options.laneOrder ?? ['byok', 'web-login'])]);
  }

  listProviders(filters?: { readonly laneId?: LaneId }) {
    return this.registry.list(filters);
  }

  prepareInvocation(request: RuntimeRequest): RuntimeInvocationPlan {
    if (!request.providerId && !request.modelReference) {
      throw new WebaiBridgeContractError(
        'routing-failed',
        'Runtime invocation requires at least providerId or modelReference.'
      );
    }

    const laneDecision = dispatchLane(this.registry, request, {
      laneOrder: this.laneOrder
    });

    const resolvedModel = resolveModelReference(
      this.registry,
      {
        providerId: laneDecision.providerId,
        laneId: laneDecision.laneId,
        modelReference: request.modelReference
      },
      {
        laneOrder: this.laneOrder
      }
    );

    const providerEntry = this.registry.require(laneDecision.providerId, laneDecision.laneId);

    return Object.freeze({
      selection: Object.freeze({
        providerId: laneDecision.providerId,
        laneId: laneDecision.laneId,
        model: resolvedModel.model,
        surface: request.surface
      }),
      dispatch: Object.freeze({
        candidateLanes: laneDecision.candidateLanes,
        reason: laneDecision.reason,
        preferredLane: request.preferredLane,
      }),
      capabilities: providerEntry.capabilities,
      diagnostics: buildRuntimeDiagnostics(request, laneDecision.laneId),
      consumer: request.consumer,
      policyProfile: request.policyProfile,
    });
  }

  async invoke<TInput, TResult>(
    request: RuntimeRequest,
    executors: RuntimeLaneExecutors<TInput, TResult>,
    inputs: Partial<Record<LaneId, TInput>> = {}
  ): Promise<TResult> {
    const plan = this.prepareInvocation(request);
    const executor = executors[plan.selection.laneId];

    if (!executor) {
      throw new WebaiBridgeContractError(
        'routing-failed',
        `No runtime executor is configured for lane "${plan.selection.laneId}".`,
        {
          context: {
            providerId: plan.selection.providerId,
            laneId: plan.selection.laneId,
            surfaceId: plan.selection.surface,
            consumerId: request.consumer?.consumerId
          }
        }
      );
    }

    const input = inputs[plan.selection.laneId];

    if (input === undefined) {
      throw new WebaiBridgeContractError(
        'routing-failed',
        `No runtime execution input is configured for lane "${plan.selection.laneId}".`,
        {
          context: {
            providerId: plan.selection.providerId,
            laneId: plan.selection.laneId,
            surfaceId: plan.selection.surface,
            consumerId: request.consumer?.consumerId
          }
        }
      );
    }

    return await executor.execute({
      plan,
      request,
      input
    });
  }
}

export function createWebaiBridgeRuntime(options: WebaiBridgeRuntimeOptions): WebaiBridgeRuntime {
  return new WebaiBridgeRuntime(options);
}
