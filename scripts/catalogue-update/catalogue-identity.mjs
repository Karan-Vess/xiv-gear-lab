import { createHash } from 'node:crypto';

export const stableCatalogueIdentityValue = (value) => {
  if (Array.isArray(value)) return value.map(stableCatalogueIdentityValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['generatedAt', 'retrievedAt', 'verifiedAt', 'snapshotId'].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, stableCatalogueIdentityValue(entry)]));
};

export const catalogueContentFingerprint = (catalogue) => createHash('sha256')
  .update(JSON.stringify(stableCatalogueIdentityValue(catalogue)))
  .digest('hex')
  .slice(0, 16);
