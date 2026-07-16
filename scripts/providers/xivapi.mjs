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

export const createXivApiAdapter = ({ client, cache }) => ({
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
    weaponDamage: itemJobs.some((job) => casterJobs.includes(job) || healerJobs.includes(job))
      ? fields.DamageMag ?? 0
      : fields.DamagePhys ?? 0,
    weaponDelayMs: fields.Delayms ?? 0,
    materiaSlots: fields.MateriaSlotCount,
    advancedMelding: fields.IsAdvancedMeldingPermitted,
    unique: fields.IsUnique,
    sourceFamily: 'other',
    acquisitionNote: 'Acquisition route is supplied by a separate overlay.',
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
