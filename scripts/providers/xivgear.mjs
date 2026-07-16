import {
  ProviderContractError,
  expectArray,
  expectRecord,
  expectSafeInteger,
  expectString,
  isRecord
} from './contracts.mjs';

export const XIVGEAR_ORIGIN = 'https://api.xivgear.app';
export const XIVGEAR_SHORTLINK_CONTRACT = 'xivgear-shortlink@2026-02';
export const XIVGEAR_CURRENT_SHEET_CONTRACT = 'xivgear-current-sheet@2026-07';

const validateItemMap = (items, providerRecordId, expectedSlotCount) => {
  const record = expectRecord(items, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items`);
  if (Object.keys(record).length !== expectedSlotCount) {
    throw new ProviderContractError('XivGear', 'xivgear-set-items@1', `${providerRecordId} contains ${Object.keys(record).length}/${expectedSlotCount} equipped slots.`);
  }
  for (const [slot, candidate] of Object.entries(record)) {
    const item = expectRecord(candidate, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items.${slot}`);
    expectSafeInteger(item.id, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items.${slot}.id`, { minimum: 1 });
    if (item.materia !== undefined) {
      const melds = expectArray(item.materia, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items.${slot}.materia`);
      for (const [index, meldCandidate] of melds.entries()) {
        const meld = expectRecord(meldCandidate, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items.${slot}.materia[${index}]`);
        if (meld.id !== undefined && meld.id !== null) {
          expectSafeInteger(meld.id, 'XivGear', 'xivgear-set-items@1', `${providerRecordId}.items.${slot}.materia[${index}].id`, { minimum: 1 });
        }
      }
    }
  }
  return record;
};

export const validateXivGearRecord = (value, reference) => {
  const contract = reference.page ? XIVGEAR_CURRENT_SHEET_CONTRACT : XIVGEAR_SHORTLINK_CONTRACT;
  const record = expectRecord(value, 'XivGear', contract, 'response');
  expectString(record.job, 'XivGear', contract, 'response.job');
  if (record.job !== reference.job) {
    throw new ProviderContractError('XivGear', contract, `${reference.recordId} resolved to ${record.job}, expected ${reference.job}.`);
  }
  if (record.timestamp === undefined || Number.isNaN(new Date(record.timestamp).valueOf())) {
    throw new ProviderContractError('XivGear', contract, `${reference.recordId} has an invalid timestamp.`);
  }
  const selections = reference.setIndexes
    ? reference.setIndexes.map((setIndex) => {
      const sets = expectArray(record.sets, 'XivGear', contract, 'response.sets');
      return { setIndex, set: sets[setIndex] };
    })
    : [{ setIndex: undefined, set: record }];
  const expectedSlotCount = reference.job === 'PLD' ? 12 : 11;
  return selections.map(({ setIndex, set }) => {
    if (!isRecord(set) || set.isSeparator) {
      throw new ProviderContractError('XivGear', contract, `${reference.recordId}${setIndex === undefined ? '' : ` set ${setIndex}`} is missing or is a separator.`);
    }
    const sourceName = expectString(set.name, 'XivGear', contract, `${reference.recordId}.name`).trim();
    const rawItems = validateItemMap(set.items, `${reference.recordId}${setIndex === undefined ? '' : `:${setIndex}`}`, expectedSlotCount);
    return {
      ...reference,
      setIndex,
      name: reference.displayName ?? sourceName,
      sourceName,
      sourceTimestamp: new Date(record.timestamp).toISOString(),
      foodId: set.food ?? record.food,
      rawItems,
      publishedStats: set.computedStats
    };
  });
};

export const createXivGearAdapter = ({ client, cache }) => ({
  async record(reference) {
    const url = reference.page
      ? `${XIVGEAR_ORIGIN}/fulldata?page=${encodeURIComponent(reference.page)}`
      : `${XIVGEAR_ORIGIN}/shortlink/${reference.recordId}`;
    const validate = (value) => {
      validateXivGearRecord(value, reference);
      return value;
    };
    return cache
      ? cache.validatedJson({ provider: 'xivgear', key: url, load: () => client.getJson(url), validate })
      : validate(await client.getJson(url));
  },
  normalize(value, reference) {
    return validateXivGearRecord(value, reference);
  },
  async reference(reference) {
    return validateXivGearRecord(await this.record(reference), reference);
  },
  async fullData(sourceUrl, expectedJob) {
    const url = `${XIVGEAR_ORIGIN}/fulldata?url=${encodeURIComponent(sourceUrl)}`;
    const validate = (candidate) => {
      const value = expectRecord(candidate, 'XivGear', 'xivgear-full-data@2026-07', 'response');
      if (value.job !== expectedJob) {
        throw new ProviderContractError('XivGear', 'xivgear-full-data@2026-07', `resolved to ${value.job}, expected ${expectedJob}.`);
      }
      return value;
    };
    return cache
      ? cache.validatedJson({ provider: 'xivgear', key: url, load: () => client.getJson(url), validate })
      : validate(await client.getJson(url));
  }
});

export const normalizeXivGearEquippedItems = (reference, slotMap) => Object.fromEntries(
  Object.entries(reference.rawItems).map(([providerSlot, item]) => {
    const gearSlot = slotMap[providerSlot];
    if (!gearSlot) throw new ProviderContractError('XivGear', 'equipped-item-normalizer@1', `unsupported slot ${providerSlot}.`);
    return [gearSlot, { itemId: item.id, materiaIds: item.materia?.map((meld) => meld.id).filter(Boolean) ?? [] }];
  })
);
