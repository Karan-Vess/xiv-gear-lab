import {
  ProviderContractError,
  assertExactIds,
  assertUnique,
  expectArray,
  expectRecord,
  expectSafeInteger,
  expectString
} from './contracts.mjs';

export const XIVAPI_ORIGIN = 'https://v2.xivapi.com';
export const XIVAPI_BASE_URL = `${XIVAPI_ORIGIN}/api`;
export const XIVAPI_SHEET_CONTRACT = 'sheet-response@1';
export const XIVAPI_SEARCH_CONTRACT = 'search-response@1';

export const validateXivApiSheet = (value, requestedIds, label = 'sheet') => {
  const response = expectRecord(value, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT);
  expectString(response.version, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, 'response.version');
  expectString(response.schema, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, 'response.schema');
  const rows = expectArray(response.rows, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, 'response.rows');
  for (const [index, candidate] of rows.entries()) {
    const row = expectRecord(candidate, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, `response.rows[${index}]`);
    expectSafeInteger(row.row_id, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, `response.rows[${index}].row_id`, { minimum: 1 });
    expectRecord(row.fields, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, `response.rows[${index}].fields`);
  }
  assertUnique(rows, (row) => row.row_id, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, `${label} rows`);
  if (requestedIds) assertExactIds(rows.map((row) => row.row_id), requestedIds, 'XIVAPI v2', XIVAPI_SHEET_CONTRACT, label);
  return response;
};

export const validateXivApiSearch = (value, sheet, label = 'search') => {
  const response = expectRecord(value, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT);
  expectString(response.version, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'response.version');
  expectString(response.schema, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'response.schema');
  const results = expectArray(response.results, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'response.results');
  if (response.next !== undefined) {
    expectString(response.next, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'response.next');
  }
  for (const [index, candidate] of results.entries()) {
    const result = expectRecord(candidate, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `response.results[${index}]`);
    expectSafeInteger(result.row_id, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `response.results[${index}].row_id`, { minimum: 1 });
    expectRecord(result.fields, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `response.results[${index}].fields`);
    if (result.sheet !== undefined && result.sheet !== sheet) {
      throw new ProviderContractError('XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `${label} returned sheet ${result.sheet} instead of ${sheet}.`);
    }
  }
  assertUnique(results, (result) => result.row_id, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `${label} results`);
  return response;
};

export const createXivApiAdapter = ({ client, cache }) => ({
  async searchRows(sheet, fields, query, { language, version, limit = 500 } = {}) {
    expectString(sheet, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'sheet');
    expectString(fields, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'fields');
    expectString(query, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, 'query');
    const responses = [];
    let cursor;
    do {
      const url = new URL(`${XIVAPI_BASE_URL}/search`);
      url.searchParams.set('fields', fields);
      url.searchParams.set('limit', String(limit));
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      } else {
        url.searchParams.set('sheets', sheet);
        url.searchParams.set('query', query);
      }
      if (language) url.searchParams.set('language', language);
      if (version) url.searchParams.set('version', version);
      const page = responses.length + 1;
      const validate = (value) => validateXivApiSearch(value, sheet, `${sheet} search page ${page}`);
      const response = cache
        ? await cache.validatedJson({ provider: 'xivapi', key: url.href, load: () => client.getJson(url), validate })
        : validate(await client.getJson(url));
      responses.push(response);
      cursor = response.next;
    } while (cursor);

    const [first] = responses;
    for (const response of responses.slice(1)) {
      if (response.version !== first.version || response.schema !== first.schema) {
        throw new ProviderContractError('XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `${sheet} search pagination changed version or schema mid-request.`);
      }
    }
    const rows = responses.flatMap((response) => response.results);
    assertUnique(rows, (row) => row.row_id, 'XIVAPI v2', XIVAPI_SEARCH_CONTRACT, `${sheet} paginated search results`);
    return { version: first.version, schema: first.schema, rows };
  },

  async sheetRows(sheet, rowIds, fields, { language, version, batchSize = 100 } = {}) {
    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      throw new ProviderContractError('XIVAPI v2', XIVAPI_SHEET_CONTRACT, `${sheet} requires at least one row ID.`);
    }
    const responses = [];
    for (let offset = 0; offset < rowIds.length; offset += batchSize) {
      const batch = rowIds.slice(offset, offset + batchSize);
      const url = new URL(`${XIVAPI_BASE_URL}/sheet/${sheet}`);
      url.searchParams.set('rows', batch.join(','));
      url.searchParams.set('fields', fields);
      if (language) url.searchParams.set('language', language);
      if (version) url.searchParams.set('version', version);
      const validate = (value) => validateXivApiSheet(value, batch, `${sheet} batch ${offset / batchSize + 1}`);
      responses.push(cache
        ? await cache.validatedJson({ provider: 'xivapi', key: url.href, load: () => client.getJson(url), validate })
        : validate(await client.getJson(url)));
    }
    const [first] = responses;
    for (const response of responses.slice(1)) {
      if (response.version !== first.version || response.schema !== first.schema) {
        throw new ProviderContractError('XIVAPI v2', XIVAPI_SHEET_CONTRACT, `${sheet} pagination changed version or schema mid-request.`);
      }
    }
    return { ...first, rows: responses.flatMap((response) => response.rows) };
  },

  async asset(path, version) {
    expectString(path, 'XIVAPI v2', 'asset-request@1', 'path');
    const url = new URL(`${XIVAPI_BASE_URL}/asset`);
    url.searchParams.set('path', path);
    url.searchParams.set('format', 'png');
    url.searchParams.set('version', version);
    const result = await client.getBytes(url, 'image/png');
    const contentType = result.response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new ProviderContractError('XIVAPI v2', 'asset-response@1', `expected an image, received ${contentType || 'an unknown type'}.`);
    }
    return result.buffer;
  }
});

export const normalizeXivApiRelicStatModels = ({
  enhancementResponse,
  materiaResponse,
  paramToStat
}) => {
  const materiaById = new Map(materiaResponse.rows.map((row, index) => {
    const fields = expectRecord(row.fields, 'XIVAPI v2', 'relic-stat-model@1', `materia.rows[${index}].fields`);
    const stat = paramToStat[fields['BaseParam@as(raw)']];
    if (!stat) {
      throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `materia ${row.row_id} references unsupported base parameter ${fields['BaseParam@as(raw)']}.`);
    }
    const values = expectArray(fields.Value, 'XIVAPI v2', 'relic-stat-model@1', `materia.rows[${index}].fields.Value`);
    return [row.row_id, { stat, values }];
  }));

  return new Map(enhancementResponse.rows.map((row, index) => {
    const fields = expectRecord(row.fields, 'XIVAPI v2', 'relic-stat-model@1', `enhancements.rows[${index}].fields`);
    const materiaIds = expectArray(fields['Materia@as(raw)'], 'XIVAPI v2', 'relic-stat-model@1', `enhancements.rows[${index}].fields.Materia@as(raw)`);
    const bigIndexes = expectArray(fields.MateriaBigValueIndex, 'XIVAPI v2', 'relic-stat-model@1', `enhancements.rows[${index}].fields.MateriaBigValueIndex`);
    const smallIndexes = expectArray(fields.MateriaSmallValueIndex, 'XIVAPI v2', 'relic-stat-model@1', `enhancements.rows[${index}].fields.MateriaSmallValueIndex`);
    const allocatedStatCount = expectSafeInteger(fields.Unknown7, 'XIVAPI v2', 'relic-stat-model@1', `enhancements.rows[${index}].fields.Unknown7`, { minimum: 1 });
    if (materiaIds.length === 0 || materiaIds.length !== bigIndexes.length || materiaIds.length !== smallIndexes.length) {
      throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} has mismatched materia allocation arrays.`);
    }
    if (allocatedStatCount !== 3) {
      throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} uses unsupported ${allocatedStatCount}-stat allocation rules.`);
    }

    const allocations = materiaIds.map((materiaId, materiaIndex) => {
      const materia = materiaById.get(materiaId);
      if (!materia) {
        throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} references missing materia ${materiaId}.`);
      }
      const bigIndex = expectSafeInteger(bigIndexes[materiaIndex], 'XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} big index ${materiaIndex}`, { minimum: 0 });
      const smallIndex = expectSafeInteger(smallIndexes[materiaIndex], 'XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} small index ${materiaIndex}`, { minimum: 0 });
      const largeValue = materia.values[bigIndex];
      const smallValue = materia.values[smallIndex];
      if (!Number.isSafeInteger(largeValue) || largeValue <= 0 || !Number.isSafeInteger(smallValue) || smallValue <= 0) {
        throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} resolves invalid allocation values for materia ${materiaId}.`);
      }
      return { stat: materia.stat, largeValue, smallValue };
    });
    const largeValues = new Set(allocations.map((allocation) => allocation.largeValue));
    const smallValues = new Set(allocations.map((allocation) => allocation.smallValue));
    if (largeValues.size !== 1 || smallValues.size !== 1) {
      throw new ProviderContractError('XIVAPI v2', 'relic-stat-model@1', `relic ${row.row_id} uses per-stat allocation values the current client cannot represent.`);
    }
    return [row.row_id, {
      schemaVersion: 'relic-stat-allocation@1',
      type: 'endwalker-discrete',
      largeValue: allocations[0].largeValue,
      largeStatCount: 2,
      smallValue: allocations[0].smallValue,
      smallStatCount: 1,
      allowedStats: allocations.map((allocation) => allocation.stat)
    }];
  }));
};

export const normalizeXivApiEquipmentRows = ({
  response,
  itemLevelCaps,
  jobsByItemId,
  paramToStat,
  slotCoefficients,
  slotFromCategory,
  emptyStats,
  casterJobs,
  healerJobs,
  expansionForLevel,
  generatedAt,
  gamePatch
}) => response.rows.map((row, index) => {
  const fields = expectRecord(row.fields, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields`);
  const name = expectString(fields.Name, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.Name`);
  const categoryName = fields.ItemUICategory?.fields?.Name;
  expectString(categoryName, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.ItemUICategory.fields.Name`);
  const slot = slotFromCategory(categoryName);
  const stats = emptyStats();
  const statCaps = emptyStats();
  const params = expectArray(fields['BaseParam@as(raw)'], 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.BaseParam@as(raw)`);
  const values = expectArray(fields.BaseParamValue, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.BaseParamValue`);
  if (params.length !== values.length) {
    throw new ProviderContractError('XIVAPI v2', 'item-normalizer@1', `item ${row.row_id} base parameter and value arrays differ in length.`);
  }
  for (let parameterIndex = 0; parameterIndex < params.length; parameterIndex += 1) {
    const stat = paramToStat[params[parameterIndex]];
    if (stat) stats[stat] += values[parameterIndex] ?? 0;
  }

  const isHqCapable = fields.CanBeHq === true;
  const specialParams = isHqCapable
    ? expectArray(fields['BaseParamSpecial@as(raw)'], 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.BaseParamSpecial@as(raw)`)
    : [];
  const specialValues = isHqCapable
    ? expectArray(fields.BaseParamValueSpecial, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.BaseParamValueSpecial`)
    : [];
  if (specialParams.length !== specialValues.length) {
    throw new ProviderContractError('XIVAPI v2', 'item-normalizer@1', `item ${row.row_id} HQ parameter and value arrays differ in length.`);
  }
  for (let parameterIndex = 0; parameterIndex < specialParams.length; parameterIndex += 1) {
    const stat = paramToStat[specialParams[parameterIndex]];
    if (stat) stats[stat] += specialValues[parameterIndex] ?? 0;
  }

  const itemLevel = expectSafeInteger(fields['LevelItem@as(raw)'], 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.LevelItem`, { minimum: 1 });
  const caps = itemLevelCaps.get(itemLevel);
  if (!caps) throw new ProviderContractError('XIVAPI v2', 'item-normalizer@1', `missing ItemLevel row ${itemLevel}.`);
  const coefficient = categoryName === "Gladiator's Arm" ? 100 : slotCoefficients[slot];
  if (!coefficient) throw new ProviderContractError('XIVAPI v2', 'item-normalizer@1', `no stat-cap coefficient exists for ${slot}.`);
  const capFields = {
    strength: 'Strength', dexterity: 'Dexterity', intelligence: 'Intelligence', mind: 'Mind', vitality: 'Vitality',
    piety: 'Piety', tenacity: 'Tenacity', criticalHit: 'CriticalHit', determination: 'Determination',
    directHit: 'DirectHitRate', skillSpeed: 'SkillSpeed', spellSpeed: 'SpellSpeed'
  };
  for (const [stat, field] of Object.entries(capFields)) {
    const cap = caps[field];
    if (typeof cap !== 'number' || !Number.isFinite(cap)) {
      throw new ProviderContractError('XIVAPI v2', 'item-normalizer@1', `ItemLevel ${itemLevel}.${field} is missing or invalid.`);
    }
    statCaps[stat] = Math.round((cap * coefficient) / 1000);
  }

  const itemJobs = jobsByItemId.get(row.row_id) ?? [];
  const usesMagicDamage = itemJobs.some((job) => casterJobs.includes(job) || healerJobs.includes(job));
  const weaponDamageParameter = usesMagicDamage ? 13 : 12;
  const hqWeaponDamageIndex = specialParams.findIndex((parameter) => parameter === weaponDamageParameter);
  const hqWeaponDamage = hqWeaponDamageIndex >= 0 ? specialValues[hqWeaponDamageIndex] ?? 0 : 0;
  const iconPath = fields.Icon?.path_hr1 ?? fields.Icon?.path;
  expectString(iconPath, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.Icon.path`);
  return {
    id: row.row_id,
    origin: 'official',
    name,
    jobs: itemJobs,
    slot,
    level: expectSafeInteger(fields.LevelEquip, 'XIVAPI v2', 'item-normalizer@1', `rows[${index}].fields.LevelEquip`, { minimum: 1 }),
    itemLevel,
    iconPath,
    iconUrl: undefined,
    stats,
    statCaps,
    weaponDamage: (usesMagicDamage ? fields.DamageMag ?? 0 : fields.DamagePhys ?? 0) + hqWeaponDamage,
    weaponDelayMs: fields.Delayms ?? 0,
    materiaSlots: fields.MateriaSlotCount,
    advancedMelding: fields.IsAdvancedMeldingPermitted,
    unique: fields.IsUnique,
    sourceFamily: 'other',
    acquisitionNote: 'Acquisition route is supplied by a separate overlay.',
    ...(expansionForLevel ? { expansionId: expansionForLevel(fields.LevelEquip) } : {}),
    quality: isHqCapable ? 'hq' : 'not-applicable',
    provenance: [{
      kind: 'official-client',
      provider: 'XIVAPI v2',
      providerRecordId: String(row.row_id),
      sourceUrl: `${XIVAPI_BASE_URL}/sheet/Item/${row.row_id}`,
      sourcePatch: gamePatch,
      sourceVersion: response.version,
      schemaVersion: response.schema,
      retrievedAt: generatedAt,
      verifiedAt: generatedAt,
      status: 'current'
    }]
  };
});
