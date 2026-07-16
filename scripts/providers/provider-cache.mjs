import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProviderContractError, providerFailureMessage } from './contracts.mjs';

export const PROVIDER_CACHE_SCHEMA = 'provider-response-cache@1';
const STATUS_WEIGHT = { current: 0, partial: 1, stale: 2, failed: 3 };

const cacheFileName = (provider, key) => {
  const hash = createHash('sha256').update(`${provider}\0${key}`).digest('hex');
  return `${provider.replace(/[^a-z0-9._-]/gi, '-')}-${hash}.json`;
};

export const createProviderResponseCache = ({ directory, now = () => new Date().toISOString() }) => {
  const states = new Map();

  const report = (id, status, message, retrievedAt) => {
    const current = states.get(id);
    if (!current || STATUS_WEIGHT[status] >= STATUS_WEIGHT[current.status]) {
      states.set(id, {
        id,
        status,
        ...(retrievedAt ? { retrievedAt } : current?.retrievedAt ? { retrievedAt: current.retrievedAt } : {}),
        ...(message ? { message } : {})
      });
    }
  };

  const validatedJson = async ({ provider, key, load, validate }) => {
    const filePath = resolve(directory, cacheFileName(provider, key));
    let liveValue;
    try {
      const value = await load();
      liveValue = { raw: value, validated: validate(value) };
    } catch (liveError) {
      try {
        const cacheEntry = JSON.parse(await readFile(filePath, 'utf8'));
        if (
          cacheEntry?.schemaVersion !== PROVIDER_CACHE_SCHEMA ||
          cacheEntry.provider !== provider ||
          cacheEntry.key !== key ||
          typeof cacheEntry.savedAt !== 'string'
        ) {
          throw new ProviderContractError(provider, PROVIDER_CACHE_SCHEMA, `cached entry for ${key} is malformed.`);
        }
        const validated = validate(cacheEntry.value);
        report(provider, 'stale', `Live refresh failed; used validated response from ${cacheEntry.savedAt}. ${providerFailureMessage(liveError)}`, cacheEntry.savedAt);
        return validated;
      } catch (cacheError) {
        report(provider, 'failed', `Live refresh and last-known-good cache both failed. ${providerFailureMessage(liveError)}`);
        throw new ProviderContractError(
          provider,
          PROVIDER_CACHE_SCHEMA,
          `no validated response is available for ${key}; live error: ${providerFailureMessage(liveError)}; cache error: ${providerFailureMessage(cacheError)}`,
          { cause: liveError }
        );
      }
    }

    try {
      const savedAt = now();
      const cacheEntry = { schemaVersion: PROVIDER_CACHE_SCHEMA, provider, key, savedAt, value: liveValue.raw };
      await mkdir(directory, { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(cacheEntry)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, filePath);
      report(provider, 'current', undefined, savedAt);
    } catch (cacheWriteError) {
      report(provider, 'partial', `Validated live response was used, but its fallback cache could not be updated. ${providerFailureMessage(cacheWriteError)}`);
    }
    return liveValue.validated;
  };

  return {
    validatedJson,
    report,
    freshness(id, defaultRetrievedAt) {
      return states.get(id) ?? { id, status: 'current', ...(defaultRetrievedAt ? { retrievedAt: defaultRetrievedAt } : {}) };
    },
    allFreshness() {
      return [...states.values()];
    }
  };
};
