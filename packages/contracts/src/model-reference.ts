import { WebaiBridgeContractError } from './diagnostics.js';

export interface ModelReference {
  readonly providerKey: string;
  readonly modelId: string;
  readonly canonical: string;
  readonly raw: string;
}

export interface StructuredModelReferenceInput {
  readonly provider: string;
  readonly model: string;
}

export type ModelReferenceInput = string | StructuredModelReferenceInput;

function normalizeProviderSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function normalizeModelSegment(value: string): string {
  return value.trim();
}

function splitModelReference(input: ModelReferenceInput): StructuredModelReferenceInput {
  if (typeof input !== 'string') {
    return input;
  }

  const raw = input.trim();
  const separatorIndex = raw.indexOf('/');

  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    throw new WebaiBridgeContractError(
      'invalid-model-reference',
      `Model reference must use "provider/model" form, received "${input}".`
    );
  }

  return {
    provider: raw.slice(0, separatorIndex),
    model: raw.slice(separatorIndex + 1)
  };
}

export function parseModelReference(input: ModelReferenceInput): ModelReference {
  const parts = splitModelReference(input);
  const providerKey = normalizeProviderSegment(parts.provider);
  const modelId = normalizeModelSegment(parts.model);

  if (!providerKey || !modelId) {
    throw new WebaiBridgeContractError(
      'invalid-model-reference',
      `Model reference must include both provider and model, received "${JSON.stringify(input)}".`
    );
  }

  const raw =
    typeof input === 'string' ? input : `${parts.provider.trim()}/${parts.model.trim()}`;

  return Object.freeze({
    providerKey,
    modelId,
    canonical: `${providerKey}/${modelId}`,
    raw
  });
}

export function normalizeModelReference(input: ModelReferenceInput): string {
  return parseModelReference(input).canonical;
}

export function sameModelReference(left: ModelReferenceInput, right: ModelReferenceInput): boolean {
  return normalizeModelReference(left) === normalizeModelReference(right);
}
