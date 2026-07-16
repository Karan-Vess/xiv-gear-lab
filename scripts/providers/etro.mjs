import {
  ProviderContractError,
  assertUnique,
  expectArray,
  expectFiniteNumber,
  expectRecord,
  expectSafeInteger,
  expectString
} from './contracts.mjs';

export const ETRO_ORIGIN = 'https://etro.gg';
export const ETRO_BASE_URL = `${ETRO_ORIGIN}/api`;
export const ETRO_EQUIPMENT_CONTRACT = 'etro-equipment@2026-07';
export const ETRO_BIS_CONTRACT = 'etro-bis@2026-07';
export const ETRO_FOOD_CONTRACT = 'etro-food@1';
export const ETRO_MATERIA_CONTRACT = 'etro-materia@1';

const validateEquipment = (value, job) => {
  const records = expectArray(value, 'Etro', ETRO_EQUIPMENT_CONTRACT, 'response');
  for (const [index, candidate] of records.entries()) {
    const record = expectRecord(candidate, 'Etro', ETRO_EQUIPMENT_CONTRACT, `response[${index}]`);
    expectSafeInteger(record.id, 'Etro', ETRO_EQUIPMENT_CONTRACT, `response[${index}].id`, { minimum: 1 });
    expectString(record.name, 'Etro', ETRO_EQUIPMENT_CONTRACT, `response[${index}].name`);
  }
  assertUnique(records, (record) => record.id, 'Etro', ETRO_EQUIPMENT_CONTRACT, `${job} equipment`);
  return records;
};

export const validateEtroBis = (value) => {
  const records = expectArray(value, 'Etro', ETRO_BIS_CONTRACT, 'response');
  for (const [index, candidate] of records.entries()) {
    const record = expectRecord(candidate, 'Etro', ETRO_BIS_CONTRACT, `response[${index}]`);
    expectString(record.id, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].id`);
    expectString(record.name, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].name`);
    expectString(record.jobAbbrev, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].jobAbbrev`);
    expectSafeInteger(record.level, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].level`, { minimum: 1 });
    expectArray(record.totalParams, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].totalParams`);
    expectRecord(record.materia ?? {}, 'Etro', ETRO_BIS_CONTRACT, `response[${index}].materia`);
  }
  assertUnique(records, (record) => record.id, 'Etro', ETRO_BIS_CONTRACT, 'BiS records');
  return records;
};

export const validateEtroFood = (value, id) => {
  const record = expectRecord(value, 'Etro', ETRO_FOOD_CONTRACT, 'response');
  expectSafeInteger(record.id, 'Etro', ETRO_FOOD_CONTRACT, 'response.id', { minimum: 1 });
  expectSafeInteger(record.item, 'Etro', ETRO_FOOD_CONTRACT, 'response.item', { minimum: 1 });
  expectString(record.name, 'Etro', ETRO_FOOD_CONTRACT, 'response.name');
  expectSafeInteger(record.itemLevel, 'Etro', ETRO_FOOD_CONTRACT, 'response.itemLevel', { minimum: 1 });
  if (String(record.id) !== String(id)) {
    throw new ProviderContractError('Etro', ETRO_FOOD_CONTRACT, `requested food ${id}, received ${record.id}.`);
  }
  for (let index = 0; index < 3; index += 1) {
    if (record[`param${index}`] === null || record[`param${index}`] === undefined) continue;
    expectSafeInteger(record[`param${index}`], 'Etro', ETRO_FOOD_CONTRACT, `response.param${index}`, { minimum: 1 });
    expectFiniteNumber(record[`valueHQ${index}`], 'Etro', ETRO_FOOD_CONTRACT, `response.valueHQ${index}`);
    expectFiniteNumber(record[`maxHQ${index}`], 'Etro', ETRO_FOOD_CONTRACT, `response.maxHQ${index}`);
  }
  return record;
};

export const validateEtroMateria = (value) => {
  const families = expectArray(value, 'Etro', ETRO_MATERIA_CONTRACT, 'response');
  for (const [index, candidate] of families.entries()) {
    const family = expectRecord(candidate, 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}]`);
    expectSafeInteger(family.param, 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}].param`, { minimum: 1 });
    for (let tier = 1; tier <= 12; tier += 1) {
      const row = family[`tier${tier}`];
      if (!row) continue;
      const tierRecord = expectRecord(row, 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}].tier${tier}`);
      expectSafeInteger(tierRecord.id, 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}].tier${tier}.id`, { minimum: 1 });
      expectString(tierRecord.name, 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}].tier${tier}.name`);
      expectFiniteNumber(family[`tier${tier}Value`], 'Etro', ETRO_MATERIA_CONTRACT, `response[${index}].tier${tier}Value`);
    }
  }
  assertUnique(families, (family) => family.param, 'Etro', ETRO_MATERIA_CONTRACT, 'materia families');
  return families;
};

export const createEtroAdapter = ({ client, cache }) => ({
  async equipment(job, minimumItemLevel, maximumItemLevel) {
    const url = new URL(`${ETRO_BASE_URL}/equipment/`);
    url.searchParams.set('jobAbbrev', job);
    url.searchParams.set('minItemLevel', String(minimumItemLevel));
    url.searchParams.set('maxItemLevel', String(maximumItemLevel));
    const validate = (value) => validateEquipment(value, job);
    return cache
      ? cache.validatedJson({ provider: 'etro', key: url.href, load: () => client.getJson(url), validate })
      : validate(await client.getJson(url));
  },
  async bis() {
    const url = `${ETRO_BASE_URL}/gearsets/bis/`;
    return cache
      ? cache.validatedJson({ provider: 'etro', key: url, load: () => client.getJson(url), validate: validateEtroBis })
      : validateEtroBis(await client.getJson(url));
  },
  async food(id) {
    const url = `${ETRO_BASE_URL}/food/${id}/`;
    const validate = (value) => validateEtroFood(value, id);
    return cache
      ? cache.validatedJson({ provider: 'etro', key: url, load: () => client.getJson(url), validate })
      : validate(await client.getJson(url));
  },
  async materia() {
    const url = `${ETRO_BASE_URL}/materia/`;
    return cache
      ? cache.validatedJson({ provider: 'etro', key: url, load: () => client.getJson(url), validate: validateEtroMateria })
      : validateEtroMateria(await client.getJson(url));
  }
});

export const normalizeEtroEquipmentDiscovery = (catalogues, { include, minimumPerJob }) => {
  const jobsByItemId = new Map();
  const equipmentById = new Map();
  for (const [job, catalogue] of catalogues) {
    const selected = catalogue.filter(include);
    if (selected.length < minimumPerJob) {
      throw new ProviderContractError('Etro', 'equipment-discovery@1', `${job} returned only ${selected.length}/${minimumPerJob} expected equipment records.`);
    }
    for (const item of selected) {
      equipmentById.set(item.id, item);
      jobsByItemId.set(item.id, [...new Set([...(jobsByItemId.get(item.id) ?? []), job])]);
    }
  }
  return { jobsByItemId, equipmentById };
};

export const normalizeEtroFoods = (foodRows, { paramToStat, generatedAt }) => foodRows.map((food) => {
  const bonuses = [0, 1, 2]
    .map((index) => ({ stat: paramToStat[food[`param${index}`]], percent: food[`valueHQ${index}`], cap: food[`maxHQ${index}`] }))
    .filter((bonus) => bonus.stat);
  return {
    id: food.item,
    providerRecordId: food.id,
    name: food.name,
    itemLevel: food.itemLevel,
    iconPath: food.iconPath,
    iconUrl: undefined,
    bonuses,
    provenance: [{
      kind: 'community-curated', provider: 'Etro', providerRecordId: String(food.id),
      sourceUrl: `${ETRO_BASE_URL}/food/${food.id}/`, sourcePatch: '7.4', sourceVersion: 'retrieved-live',
      schemaVersion: ETRO_FOOD_CONTRACT, retrievedAt: generatedAt, status: 'unverified'
    }]
  };
});

export const normalizeEtroMateria = (catalogue, { referencedIds, paramToStat }) => {
  const materia = [];
  for (const family of catalogue) {
    const stat = paramToStat[family.param];
    if (!stat) continue;
    for (let tier = 1; tier <= 12; tier += 1) {
      const row = family[`tier${tier}`];
      if (!row || !referencedIds.has(row.id)) continue;
      const advancedMeldingLimit = [8, 10, 12].includes(tier)
        ? 'first-slot-only'
        : [7, 9, 11].includes(tier) ? 'unrestricted' : undefined;
      materia.push({
        id: row.id,
        name: row.name,
        stat,
        value: family[`tier${tier}Value`],
        tier,
        // Explicitly evidenced expansion pairs. Unknown future tiers must be reviewed, not guessed.
        ...(advancedMeldingLimit ? { advancedMeldingLimit } : {}),
        iconPath: row.iconPath
      });
    }
  }
  if (materia.length !== referencedIds.size) {
    throw new ProviderContractError('Etro', 'materia-normalizer@1', `mapped ${materia.length}/${referencedIds.size} referenced materia IDs.`);
  }
  return materia;
};

export const normalizeEtroEquippedItems = (set, slotMap) => {
  const materiaForSlot = (slot, itemId) => {
    const suffix = slot === 'fingerL' ? 'L' : slot === 'fingerR' ? 'R' : '';
    const record = set.materia?.[`${itemId}${suffix}`] ?? set.materia?.[String(itemId)] ?? {};
    return Object.entries(record)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, id]) => id);
  };
  const equipped = {};
  for (const [providerSlot, gearSlot] of Object.entries(slotMap)) {
    const itemId = set[providerSlot];
    if (!itemId) continue;
    equipped[gearSlot] = { itemId, materiaIds: materiaForSlot(providerSlot, itemId) };
  }
  return equipped;
};
