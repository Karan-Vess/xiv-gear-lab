import { ProviderContractError, expectString } from './contracts.mjs';

export const BALANCE_CONTRACT = 'balance-guide@1';

export const createBalanceAdapter = ({ references, guideUrls, expectedSetCount }) => {
  if (!Array.isArray(references) || references.length === 0) {
    throw new ProviderContractError('The Balance', BALANCE_CONTRACT, 'reference catalogue must not be empty.');
  }
  for (const [index, reference] of references.entries()) {
    expectString(reference.job, 'The Balance', BALANCE_CONTRACT, `references[${index}].job`);
    expectString(reference.recordId, 'The Balance', BALANCE_CONTRACT, `references[${index}].recordId`);
    expectString(reference.guidePatch, 'The Balance', BALANCE_CONTRACT, `references[${index}].guidePatch`);
    expectString(reference.guideUpdatedAt, 'The Balance', BALANCE_CONTRACT, `references[${index}].guideUpdatedAt`);
    expectString(guideUrls[reference.job], 'The Balance', BALANCE_CONTRACT, `guideUrls.${reference.job}`);
    if (reference.setIndexes !== undefined && (!Array.isArray(reference.setIndexes) || reference.setIndexes.some((value) => !Number.isSafeInteger(value) || value < 0))) {
      throw new ProviderContractError('The Balance', BALANCE_CONTRACT, `references[${index}].setIndexes must contain non-negative integers.`);
    }
  }

  return {
    references,
    expectedSetCount,
    guideUrl(job) {
      return guideUrls[job];
    },
    assertSelectionCount(selections) {
      if (selections.length !== expectedSetCount) {
        throw new ProviderContractError('The Balance', BALANCE_CONTRACT, `resolved ${selections.length}/${expectedSetCount} expected final combat-job sets.`);
      }
    },
    provenance(reference, generatedAt) {
      return {
        kind: 'community-curated',
        provider: 'The Balance',
        providerRecordId: `${reference.job.toLowerCase()}-bis`,
        sourceUrl: guideUrls[reference.job],
        sourcePatch: reference.guidePatch,
        sourceVersion: reference.guideUpdatedAt,
        schemaVersion: BALANCE_CONTRACT,
        retrievedAt: generatedAt,
        verifiedAt: generatedAt,
        status: 'current'
      };
    }
  };
};
