export class ProviderContractError extends Error {
  constructor(provider, contract, message, options = {}) {
    super(`${provider} ${contract}: ${message}`, options);
    this.name = 'ProviderContractError';
    this.provider = provider;
    this.contract = contract;
  }
}

export const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (provider, contract, path, expectation) => {
  throw new ProviderContractError(provider, contract, `${path} must be ${expectation}.`);
};

export const expectRecord = (value, provider, contract, path = 'response') => {
  if (!isRecord(value)) fail(provider, contract, path, 'an object');
  return value;
};

export const expectArray = (value, provider, contract, path) => {
  if (!Array.isArray(value)) fail(provider, contract, path, 'an array');
  return value;
};

export const expectString = (value, provider, contract, path, { allowEmpty = false } = {}) => {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    fail(provider, contract, path, allowEmpty ? 'a string' : 'a non-empty string');
  }
  return value;
};

export const expectFiniteNumber = (value, provider, contract, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(provider, contract, path, 'a finite number');
  return value;
};

export const expectSafeInteger = (value, provider, contract, path, { minimum = 0 } = {}) => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(provider, contract, path, `a safe integer greater than or equal to ${minimum}`);
  }
  return value;
};

export const expectBoolean = (value, provider, contract, path) => {
  if (typeof value !== 'boolean') fail(provider, contract, path, 'a boolean');
  return value;
};

export const assertUnique = (records, keyFor, provider, contract, label) => {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const key = keyFor(record);
    if (seen.has(key)) {
      throw new ProviderContractError(provider, contract, `${label} contains duplicate key ${String(key)} at index ${index}.`);
    }
    seen.add(key);
  }
};

export const assertExactIds = (actualIds, requestedIds, provider, contract, label) => {
  const actual = new Set(actualIds.map(String));
  const requested = new Set(requestedIds.map(String));
  const missing = [...requested].filter((id) => !actual.has(id));
  const unexpected = [...actual].filter((id) => !requested.has(id));
  if (missing.length || unexpected.length || actualIds.length !== requestedIds.length) {
    throw new ProviderContractError(
      provider,
      contract,
      `${label} ID mismatch; missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}].`
    );
  }
};

export const providerFailureMessage = (error) =>
  error instanceof Error ? error.message : String(error);
