import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildAcquisitionRecords } from './providers/acquisition.mjs';
import { createBalanceAdapter } from './providers/balance.mjs';
import {
  createEtroAdapter,
  normalizeEtroEquipmentDiscovery,
  normalizeEtroEquippedItems,
  normalizeEtroFoods,
  normalizeEtroMateria
} from './providers/etro.mjs';
import { createProviderClient } from './providers/http-client.mjs';
import { createProviderResponseCache } from './providers/provider-cache.mjs';
import { captureOverlay, createProviderOverlay, publishOverlaySnapshot } from './providers/snapshot-builder.mjs';
import { createXivApiAdapter, normalizeXivApiEquipmentRows } from './providers/xivapi.mjs';
import { createXivGearAdapter, normalizeXivGearEquippedItems } from './providers/xivgear.mjs';

const outputPath = resolve('packages/data/src/generated/whm-snapshot.json');
const iconOutputDirectory = resolve('apps/web/public/icons/items');
const generatedAt = new Date().toISOString();
const providerClients = new Map([
  ['https://v2.xivapi.com', createProviderClient({ provider: 'XIVAPI v2', allowedOrigins: ['https://v2.xivapi.com'] })],
  ['https://etro.gg', createProviderClient({ provider: 'Etro', allowedOrigins: ['https://etro.gg'] })],
  ['https://api.xivgear.app', createProviderClient({ provider: 'XivGear', allowedOrigins: ['https://api.xivgear.app'] })]
]);
const forcedProviderFailures = new Set(
  (process.env.XIV_GEAR_LAB_SYNC_FAIL_PROVIDERS ?? '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
);
const knownProviderIds = new Set(['xivapi', 'etro', 'xivgear']);
for (const provider of forcedProviderFailures) {
  if (!knownProviderIds.has(provider)) throw new Error(`Unknown forced provider failure ${provider}.`);
}
const providerClient = (origin, id) => {
  const client = providerClients.get(origin);
  if (!client) throw new Error(`Provider client ${origin} is not configured.`);
  if (!forcedProviderFailures.has(id)) return client;
  const fail = async () => { throw new Error(`${id} failure was forced for the release drill.`); };
  return { getJson: fail, getBytes: fail };
};
const providerCache = createProviderResponseCache({ directory: resolve('.cache/provider-data') });
const xivApi = createXivApiAdapter({ client: providerClient('https://v2.xivapi.com', 'xivapi'), cache: providerCache });
const etro = createEtroAdapter({ client: providerClient('https://etro.gg', 'etro'), cache: providerCache });
const xivGear = createXivGearAdapter({ client: providerClient('https://api.xivgear.app', 'xivgear'), cache: providerCache });
const previousSnapshot = await readFile(outputPath, 'utf8').then(JSON.parse).catch(() => undefined);
const HEALER_JOBS = ['WHM', 'SCH', 'AST', 'SGE'];
const TANK_JOBS = ['PLD', 'WAR', 'DRK', 'GNB'];
const MELEE_DPS_JOBS = ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'];
const RANGED_DPS_JOBS = ['BRD', 'MCH', 'DNC'];
const CASTER_DPS_JOBS = ['BLM', 'SMN', 'RDM', 'PCT'];
const DPS_JOBS = [...MELEE_DPS_JOBS, ...RANGED_DPS_JOBS, ...CASTER_DPS_JOBS];
const JOBS = [...HEALER_JOBS, ...TANK_JOBS, ...DPS_JOBS];
const EVALUATOR_PROFILE_ID = {
  WHM: 'whm-healer-damage-proxy@1',
  SCH: 'sch-healer-damage-proxy@1',
  AST: 'ast-healer-damage-proxy@1',
  SGE: 'sge-healer-damage-proxy@1',
  PLD: 'pld-tank-damage-proxy@1',
  WAR: 'war-tank-damage-proxy@1',
  DRK: 'drk-tank-damage-proxy@1',
  GNB: 'gnb-tank-damage-proxy@1',
  MNK: 'mnk-dps-damage-proxy@1',
  DRG: 'drg-dps-damage-proxy@1',
  NIN: 'nin-dps-damage-proxy@1',
  SAM: 'sam-dps-damage-proxy@1',
  RPR: 'rpr-dps-damage-proxy@1',
  VPR: 'vpr-dps-damage-proxy@1',
  BRD: 'brd-dps-damage-proxy@1',
  MCH: 'mch-dps-damage-proxy@1',
  DNC: 'dnc-dps-damage-proxy@1',
  BLM: 'blm-dps-damage-proxy@1',
  SMN: 'smn-dps-damage-proxy@1',
  RDM: 'rdm-dps-damage-proxy@1',
  PCT: 'pct-dps-damage-proxy@1'
};
const BALANCE_GUIDE_URLS = {
  WHM: 'https://www.thebalanceffxiv.com/jobs/healers/white-mage/best-in-slot/',
  SCH: 'https://www.thebalanceffxiv.com/jobs/healers/scholar/best-in-slot/',
  AST: 'https://www.thebalanceffxiv.com/jobs/healers/astrologian/best-in-slot/',
  SGE: 'https://www.thebalanceffxiv.com/jobs/healers/sage/best-in-slot/',
  PLD: 'https://www.thebalanceffxiv.com/jobs/tanks/paladin/best-in-slot/',
  WAR: 'https://www.thebalanceffxiv.com/jobs/tanks/warrior/best-in-slot/',
  DRK: 'https://www.thebalanceffxiv.com/jobs/tanks/dark-knight/best-in-slot/',
  GNB: 'https://www.thebalanceffxiv.com/jobs/tanks/gunbreaker/best-in-slot/',
  MNK: 'https://www.thebalanceffxiv.com/jobs/melee/monk/best-in-slot/',
  DRG: 'https://www.thebalanceffxiv.com/jobs/melee/dragoon/best-in-slot/',
  NIN: 'https://www.thebalanceffxiv.com/jobs/melee/ninja/best-in-slot/',
  SAM: 'https://www.thebalanceffxiv.com/jobs/melee/samurai/best-in-slot/',
  RPR: 'https://www.thebalanceffxiv.com/jobs/melee/reaper/best-in-slot/',
  VPR: 'https://www.thebalanceffxiv.com/jobs/melee/viper/best-in-slot/',
  BRD: 'https://www.thebalanceffxiv.com/jobs/ranged/bard/best-in-slot/',
  MCH: 'https://www.thebalanceffxiv.com/jobs/ranged/machinist/best-in-slot/',
  DNC: 'https://www.thebalanceffxiv.com/jobs/ranged/dancer/best-in-slot/',
  BLM: 'https://www.thebalanceffxiv.com/jobs/casters/black-mage/best-in-slot/',
  SMN: 'https://www.thebalanceffxiv.com/jobs/casters/summoner/best-in-slot/',
  RDM: 'https://www.thebalanceffxiv.com/jobs/casters/red-mage/best-in-slot/',
  PCT: 'https://www.thebalanceffxiv.com/jobs/casters/pictomancer/best-in-slot/'
};
const BALANCE_FINAL_REFERENCES = [
  {
    job: 'WHM',
    recordId: '73551d94-354a-4e30-9205-5d52d2efaf3f',
    setIndexes: [1, 2, 3, 5, 6, 7],
    guidePatch: '7.4',
    guideUpdatedAt: '2025-12-25'
  },
  { job: 'SCH', recordId: 'bd329cd1-5135-45d3-97b6-0d1342f6b5fe', displayName: '2.40 Max Damage', guidePatch: '7.51', guideUpdatedAt: '2026-06-25' },
  { job: 'SCH', recordId: '3aeed012-438c-4559-9d47-ac407c29e6cf', displayName: '2.31 Max Damage', guidePatch: '7.51', guideUpdatedAt: '2026-06-25' },
  { job: 'AST', recordId: 'd223a0a1-dde4-410a-ac59-e8593e019a63', displayName: '2.43 Max Damage', guidePatch: '7.4', guideUpdatedAt: '2025-12-27' },
  { job: 'AST', recordId: 'dca27524-4c12-4cd0-b26b-9bc4abba2d27', displayName: '2.31 Max Damage', guidePatch: '7.4', guideUpdatedAt: '2025-12-27' },
  { job: 'AST', recordId: '5ee77798-4286-47cd-8ee7-b5872f25165c', displayName: '2.43 Max Item Level', guidePatch: '7.4', guideUpdatedAt: '2025-12-27' },
  { job: 'AST', recordId: '5a11be40-8c70-49f1-8b8a-e18214c10708', displayName: '2.31 Max Item Level', guidePatch: '7.4', guideUpdatedAt: '2025-12-27' },
  { job: 'SGE', recordId: '9819c827-f701-4aec-8b21-2f46e37cb1e6', displayName: '2.44 Max Damage', guidePatch: '7.4', guideUpdatedAt: '2025-12-26' },
  { job: 'SGE', recordId: 'cb86be25-c3c0-4abf-b63c-a1967f34d73e', displayName: '2.39 Max Damage', guidePatch: '7.4', guideUpdatedAt: '2025-12-26' },
  { job: 'SGE', recordId: '5a21d4d0-b46d-4f3a-92c1-b49b36455af9', displayName: '2.45 Max Item Level', guidePatch: '7.4', guideUpdatedAt: '2025-12-26' },
  { job: 'SGE', recordId: 'aa469de7-d685-4b6a-be2c-789961204c42', displayName: '2.39 Max Item Level', guidePatch: '7.4', guideUpdatedAt: '2025-12-26' },
  { job: 'PLD', recordId: 'bis-pld-current', page: 'bis|pld|current', setIndexes: [0], guidePatch: '7.4', guideUpdatedAt: '2025-12-17' },
  { job: 'WAR', recordId: 'bis-war-current', page: 'bis|war|current', setIndexes: [1, 3], guidePatch: '7.4', guideUpdatedAt: '2025-12-17' },
  { job: 'DRK', recordId: 'bis-drk-current', page: 'bis|drk|current', setIndexes: [0], guidePatch: '7.4', guideUpdatedAt: '2025-12-16' },
  { job: 'DRK', recordId: 'bis-drk-current', page: 'bis|drk|current', setIndexes: [1], displayName: '2.46 The Balance', guidePatch: '7.4', guideUpdatedAt: '2025-12-16' },
  { job: 'GNB', recordId: 'bis-gnb-current', page: 'bis|gnb|current', setIndexes: [0, 1, 2], guidePatch: '7.4', guideUpdatedAt: '2025-12-17' },
  { job: 'MNK', recordId: '8df88ff9-e89c-4503-9085-d7ba8f9ab12b', setIndexes: [14, 16], guidePatch: '7.4', guideUpdatedAt: '2026-01-02' },
  { job: 'DRG', recordId: 'bis-drg-current', page: 'bis|drg|current', setIndexes: [0], guidePatch: '7.5', guideUpdatedAt: '2026-06-27' },
  { job: 'NIN', recordId: 'bis-nin-current', page: 'bis|nin|current', setIndexes: [0], guidePatch: '7.4', guideUpdatedAt: '2025-12-19' },
  { job: 'SAM', recordId: 'bis-sam-current', page: 'bis|sam|current', setIndexes: [1, 6], guidePatch: '7.4', guideUpdatedAt: '2025-12-18' },
  { job: 'RPR', recordId: 'bis-rpr-current', page: 'bis|rpr|current', setIndexes: [0], guidePatch: '7.4', guideUpdatedAt: '2025-12-18' },
  { job: 'VPR', recordId: 'bis-vpr-current', page: 'bis|vpr|current', setIndexes: [0, 1, 2], guidePatch: '7.4', guideUpdatedAt: '2025-12-31' },
  { job: 'BRD', recordId: 'e2c1efce-33f8-4cfe-9db2-bd389aa921bb', guidePatch: '7.4', guideUpdatedAt: '2025-12-18' },
  { job: 'MCH', recordId: '3dac7eb3-10e4-4ef3-9373-e1e1a78fcc9b', guidePatch: '7.4', guideUpdatedAt: '2025-12-16' },
  { job: 'DNC', recordId: 'bis-dnc-current', page: 'bis|dnc|current', setIndexes: [1], displayName: '7.4 DNC BiS', guidePatch: '7.41', guideUpdatedAt: '2026-01-29' },
  { job: 'BLM', recordId: '08698620-8f30-42df-b4c8-df525fe78a95', setIndexes: [0, 1, 2, 3, 4, 5], guidePatch: '7.4', guideUpdatedAt: '2025-12-19' },
  { job: 'SMN', recordId: 'cff8f14d-cc73-459a-86b8-b7476b4d878c', setIndexes: [0, 1, 2, 3, 4, 5], guidePatch: '7.4', guideUpdatedAt: '2025-12-19' },
  { job: 'RDM', recordId: 'bfc781a4-ef20-4f2d-ba35-66388adb30c6', displayName: '2.50', guidePatch: '7.4', guideUpdatedAt: '2026-01-13' },
  { job: 'RDM', recordId: '3a78b6f3-1c36-4a7d-82c6-a2d3ceee62da', displayName: '2.49', guidePatch: '7.4', guideUpdatedAt: '2026-01-13' },
  { job: 'RDM', recordId: 'd01bbb2f-0636-486e-a633-e7a9944760a4', displayName: '2.48', guidePatch: '7.4', guideUpdatedAt: '2026-01-13' },
  { job: 'PCT', recordId: '4bd90c49-7a54-483f-9107-042c89c8c68f', setIndexes: [0, 1, 2], guidePatch: '7.4', guideUpdatedAt: '2026-01-13' }
];
const balance = createBalanceAdapter({
  references: BALANCE_FINAL_REFERENCES,
  guideUrls: BALANCE_GUIDE_URLS,
  expectedSetCount: 55
});

const PARAM_TO_STAT = {
  1: 'strength',
  2: 'dexterity',
  3: 'vitality',
  4: 'intelligence',
  5: 'mind',
  6: 'piety',
  19: 'tenacity',
  22: 'directHit',
  27: 'criticalHit',
  44: 'determination',
  45: 'skillSpeed',
  46: 'spellSpeed'
};

const SLOT_COEFFICIENT = {
  weapon: 140,
  offHand: 40,
  head: 85,
  body: 135,
  hands: 85,
  legs: 135,
  feet: 85,
  ears: 67,
  neck: 67,
  wrists: 67,
  ring: 67
};

const ETRO_SLOT_TO_GEAR_SLOT = {
  weapon: 'weapon',
  offHand: 'offHand',
  head: 'head',
  body: 'body',
  hands: 'hands',
  legs: 'legs',
  feet: 'feet',
  ears: 'ears',
  neck: 'neck',
  wrists: 'wrists',
  fingerL: 'ringLeft',
  fingerR: 'ringRight'
};
const XIVGEAR_SLOT_TO_GEAR_SLOT = {
  Weapon: 'weapon',
  OffHand: 'offHand',
  Head: 'head',
  Body: 'body',
  Hand: 'hands',
  Legs: 'legs',
  Feet: 'feet',
  Ears: 'ears',
  Neck: 'neck',
  Wrist: 'wrists',
  RingLeft: 'ringLeft',
  RingRight: 'ringRight'
};

const emptyStats = () => ({
  strength: 0,
  dexterity: 0,
  intelligence: 0,
  mind: 0,
  vitality: 0,
  piety: 0,
  tenacity: 0,
  criticalHit: 0,
  determination: 0,
  directHit: 0,
  skillSpeed: 0,
  spellSpeed: 0
});

const downloadIcon = async (id, path, version) => {
  const localPath = resolve(iconOutputDirectory, `${id}.png`);
  try {
    const buffer = await xivApi.asset(path, version);
    await writeFile(localPath, new Uint8Array(buffer));
  } catch (error) {
    try {
      await readFile(localPath);
      providerCache.report('xivapi', 'stale', `Icon ${id} could not be refreshed; retained the validated local asset. ${error instanceof Error ? error.message : String(error)}`);
    } catch {
      throw error;
    }
  }
  return `./icons/items/${id}.png`;
};

const compactFields = [
  'Name',
  'Icon',
  'LevelEquip',
  'LevelItem@as(raw)',
  'ItemUICategory.Name',
  'EquipSlotCategory',
  'ClassJobCategory@as(raw)',
  'BaseParam@as(raw)',
  'BaseParamValue',
  'BaseParamSpecial@as(raw)',
  'BaseParamValueSpecial',
  'DamagePhys',
  'DamageMag',
  'Delayms',
  'MateriaSlotCount',
  'IsAdvancedMeldingPermitted',
  'IsUnique',
  'CanBeHq'
].join(',');

const slotFromCategory = (name) => {
  if (/Conjurer|Scholar|Astrologian|Sage|Gladiator|Marauder|Dark Knight|Gunbreaker|Pugilist|Lancer|Rogue|Samurai|Reaper|Viper|Archer|Machinist|Dancer|Thaumaturge|Arcanist|Red Mage|Pictomancer/.test(name)) return 'weapon';
  const slots = {
    Shield: 'offHand',
    Head: 'head',
    Body: 'body',
    Hands: 'hands',
    Legs: 'legs',
    Feet: 'feet',
    Earrings: 'ears',
    Necklace: 'neck',
    Bracelets: 'wrists',
    Ring: 'ring'
  };
  const slot = slots[name];
  if (!slot) throw new Error(`Unsupported item category: ${name}`);
  return slot;
};

const balanceRecordCache = new Map();
for (const reference of BALANCE_FINAL_REFERENCES) {
  const key = reference.page ?? reference.recordId;
  if (balanceRecordCache.has(key)) continue;
  balanceRecordCache.set(key, await xivGear.record(reference));
}

let balanceReferenceSets = [];
for (const reference of BALANCE_FINAL_REFERENCES) {
  const source = balanceRecordCache.get(reference.page ?? reference.recordId);
  balanceReferenceSets.push(...xivGear.normalize(source, reference));
}
balance.assertSelectionCount(balanceReferenceSets);

const equipmentCatalogues = await Promise.all(
  JOBS.map(async (job) => [job, await etro.equipment(job, 780, 795)])
);
const { jobsByItemId, equipmentById } = normalizeEtroEquipmentDiscovery(equipmentCatalogues, {
  include: (item) => /^(Grand Champion's|Augmented Bygone Brass|Bygone Brass)/.test(item.name),
  minimumPerJob: 20
});

const itemIds = [...equipmentById.keys()].sort((a, b) => a - b);
const itemResponse = await xivApi.sheetRows('Item', itemIds, compactFields, { language: 'en' });

const itemLevels = [...new Set(itemResponse.rows.map((row) => row.fields['LevelItem@as(raw)']))].sort();
const itemLevelResponse = await xivApi.sheetRows(
  'ItemLevel',
  itemLevels,
  'Strength,Dexterity,Intelligence,Mind,Vitality,Piety,Tenacity,CriticalHit,Determination,DirectHitRate,SkillSpeed,SpellSpeed'
);
const levelCaps = new Map(itemLevelResponse.rows.map((row) => [row.row_id, row.fields]));

const items = normalizeXivApiEquipmentRows({
  response: itemResponse,
  itemLevelCaps: levelCaps,
  jobsByItemId,
  paramToStat: PARAM_TO_STAT,
  slotCoefficients: SLOT_COEFFICIENT,
  slotFromCategory,
  emptyStats,
  casterJobs: CASTER_DPS_JOBS,
  healerJobs: HEALER_JOBS,
  generatedAt,
  gamePatch: '7.51'
});

const discoveredItemIds = new Set(items.map((item) => item.id));
for (const reference of balanceReferenceSets) {
  for (const item of Object.values(reference.rawItems)) {
    if (!discoveredItemIds.has(item.id)) {
      throw new Error(`The Balance set ${reference.job} ${reference.name} references item ${item.id}, which is outside the verified current-tier pool.`);
    }
  }
}

const bisCatalogue = await etro.bis();
const referenceSets = bisCatalogue.filter((set) => JOBS.includes(set.jobAbbrev) && set.level === 100);
for (const [job, minimum] of [
  ['WHM', 6], ['SCH', 1], ['AST', 4], ['SGE', 4],
  ['PLD', 1], ['WAR', 2], ['DRK', 3], ['GNB', 3],
  ['MNK', 3], ['DRG', 1], ['NIN', 1], ['SAM', 2], ['RPR', 1], ['VPR', 3],
  ['BRD', 1], ['MCH', 1], ['DNC', 1],
  ['BLM', 6], ['SMN', 6], ['RDM', 3], ['PCT', 3]
]) {
  const count = referenceSets.filter((set) => set.jobAbbrev === job).length;
  if (count < minimum) throw new Error(`Etro returned only ${count}/${minimum} expected ${job} reference sets.`);
}

const foodProviderIds = [...new Set(referenceSets.map((set) => set.food).filter(Boolean))];
const foodRows = await Promise.all(foodProviderIds.map((id) => etro.food(id)));
const foods = normalizeEtroFoods(foodRows, { paramToStat: PARAM_TO_STAT, generatedAt });
const availableFoodIds = new Set(foods.map((food) => food.id));
for (const reference of balanceReferenceSets) {
  if (reference.foodId && !availableFoodIds.has(reference.foodId)) {
    throw new Error(`The Balance set ${reference.job} ${reference.name} references food ${reference.foodId}, which is not in the verified food pool.`);
  }
}
const foodProviderToOfficial = new Map(foods.map((food) => [food.providerRecordId, food.id]));

const materiaCatalogue = await etro.materia();
const referencedMateriaIds = new Set(
  [
    ...referenceSets.flatMap((set) =>
      Object.values(set.materia ?? {}).flatMap((slots) => Object.values(slots ?? {}))
    ),
    ...balanceReferenceSets.flatMap((reference) =>
      Object.values(reference.rawItems).flatMap((item) => item.materia?.map((meld) => meld.id) ?? [])
    )
  ]
);
const materia = normalizeEtroMateria(materiaCatalogue, { referencedIds: referencedMateriaIds, paramToStat: PARAM_TO_STAT });

const supportingItemIds = [...new Set([
  ...foods.map((food) => food.id),
  ...materia.map((entry) => entry.id)
])].sort((a, b) => a - b);
const supportingItemResponse = await xivApi.sheetRows('Item', supportingItemIds, 'Icon', {
  language: 'en',
  version: itemResponse.version
});

const officialIconPaths = new Map([
  ...items.map((item) => [item.id, item.iconPath]),
  ...supportingItemResponse.rows.map((row) => [row.row_id, row.fields.Icon?.path_hr1 ?? row.fields.Icon?.path])
]);
const iconRecords = [...items, ...foods, ...materia];
for (const record of iconRecords) {
  const iconPath = officialIconPaths.get(record.id);
  if (!iconPath) throw new Error(`No official icon path was returned for item ${record.id}.`);
  record.iconPath = iconPath;
}

await mkdir(iconOutputDirectory, { recursive: true });
for (let offset = 0; offset < iconRecords.length; offset += 6) {
  const batch = iconRecords.slice(offset, offset + 6);
  const localUrls = await Promise.all(
    batch.map((record) => downloadIcon(record.id, record.iconPath, itemResponse.version))
  );
  batch.forEach((record, index) => {
    record.iconUrl = localUrls[index];
  });
}

const getPublishedMetric = (set, name) => set.totalParams.find((entry) => entry.name === name)?.value;
const getPublishedStat = (set, id) => set.totalParams.find((entry) => String(entry.id) === String(id))?.value ?? 0;

const curatedSetSignature = (set) => {
  const fixedSlots = [];
  const rings = [];
  for (const [slot, item] of Object.entries(set.items)) {
    const piece = `${item.itemId}:${[...item.materiaIds].sort((left, right) => left - right).join(',')}`;
    if (slot === 'ringLeft' || slot === 'ringRight') rings.push(piece);
    else fixedSlots.push(`${slot}=${piece}`);
  }
  return `${set.job}|${fixedSlots.sort().join('|')}|rings=${rings.sort().join('/')}|food=${set.foodId ?? ''}`;
};

const balanceXivGearUrl = (reference) => {
  const selectedSet = reference.setIndex === undefined ? '' : `&onlySetIndex=${reference.setIndex}`;
  const page = reference.page ? `embed|${reference.page}` : `sl|${reference.recordId}`;
  return `https://xivgear.app/?page=${page}${selectedSet}`;
};

const balanceProvenance = (reference) => [
  balance.provenance(reference, generatedAt),
  {
    kind: 'community-curated',
    provider: 'XivGear',
    providerRecordId: reference.setIndex === undefined
      ? reference.recordId
      : `${reference.recordId}:${reference.setIndex}`,
    sourceUrl: balanceXivGearUrl(reference),
    sourcePatch: '7.4',
    sourceVersion: reference.sourceTimestamp,
    schemaVersion: reference.page ? 'xivgear-current-sheet@2026-07' : 'xivgear-shortlink@2026-02',
    retrievedAt: generatedAt,
    verifiedAt: reference.sourceTimestamp,
    status: 'current'
  }
];

const profileBaseStats = (mainStat, mainValue, vitality, speedStat, resourceStat, resourceValue) => ({
  ...emptyStats(),
  [mainStat]: mainValue,
  vitality,
  [speedStat]: 420,
  ...(resourceStat ? { [resourceStat]: resourceValue } : {}),
  criticalHit: 420,
  determination: 440,
  directHit: 420
});

const EVALUATOR_BY_JOB = {
  WHM: { role: 'healer', mainStat: 'mind', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('mind', 509, 438, 'spellSpeed', 'piety', 440) },
  SCH: { role: 'healer', mainStat: 'mind', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('mind', 509, 438, 'spellSpeed', 'piety', 440) },
  AST: { role: 'healer', mainStat: 'mind', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('mind', 509, 439, 'spellSpeed', 'piety', 440) },
  SGE: { role: 'healer', mainStat: 'mind', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('mind', 509, 438, 'spellSpeed', 'piety', 440) },
  PLD: { role: 'tank', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 190, mainStatModifier: 100, damageTrait: 1, appliesTenacity: true, hastePercent: 0, baseStats: profileBaseStats('strength', 443, 487, 'skillSpeed', 'tenacity', 420) },
  WAR: { role: 'tank', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 190, mainStatModifier: 105, damageTrait: 1, appliesTenacity: true, hastePercent: 0, baseStats: profileBaseStats('strength', 465, 486, 'skillSpeed', 'tenacity', 420) },
  DRK: { role: 'tank', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 190, mainStatModifier: 105, damageTrait: 1, appliesTenacity: true, hastePercent: 0, baseStats: profileBaseStats('strength', 465, 487, 'skillSpeed', 'tenacity', 420) },
  GNB: { role: 'tank', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 190, mainStatModifier: 100, damageTrait: 1, appliesTenacity: true, hastePercent: 0, baseStats: profileBaseStats('strength', 440, 484, 'skillSpeed', 'tenacity', 420) },
  MNK: { role: 'dps', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 110, damageTrait: 1, appliesTenacity: false, hastePercent: 20, baseStats: profileBaseStats('strength', 483, 438, 'skillSpeed') },
  DRG: { role: 'dps', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('strength', 506, 462, 'skillSpeed') },
  NIN: { role: 'dps', mainStat: 'dexterity', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 110, damageTrait: 1, appliesTenacity: false, hastePercent: 15, baseStats: profileBaseStats('dexterity', 487, 440, 'skillSpeed') },
  SAM: { role: 'dps', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 112, damageTrait: 1, appliesTenacity: false, hastePercent: 13, baseStats: profileBaseStats('strength', 492, 440, 'skillSpeed') },
  RPR: { role: 'dps', mainStat: 'strength', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('strength', 509, 464, 'skillSpeed') },
  VPR: { role: 'dps', mainStat: 'dexterity', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 110, damageTrait: 1, appliesTenacity: false, hastePercent: 15, baseStats: profileBaseStats('dexterity', 484, 440, 'skillSpeed') },
  BRD: { role: 'dps', mainStat: 'dexterity', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.2, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('dexterity', 509, 440, 'skillSpeed') },
  MCH: { role: 'dps', mainStat: 'dexterity', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.2, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('dexterity', 506, 440, 'skillSpeed') },
  DNC: { role: 'dps', mainStat: 'dexterity', speedStat: 'skillSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.2, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('dexterity', 509, 440, 'skillSpeed') },
  BLM: { role: 'dps', mainStat: 'intelligence', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('intelligence', 505, 440, 'spellSpeed') },
  SMN: { role: 'dps', mainStat: 'intelligence', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('intelligence', 506, 440, 'spellSpeed') },
  RDM: { role: 'dps', mainStat: 'intelligence', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('intelligence', 506, 440, 'spellSpeed') },
  PCT: { role: 'dps', mainStat: 'intelligence', speedStat: 'spellSpeed', attackPowerModifier: 237, mainStatModifier: 115, damageTrait: 1.3, appliesTenacity: false, hastePercent: 0, baseStats: profileBaseStats('intelligence', 506, 440, 'spellSpeed') }
};

const evaluationForJob = (job) => {
  const profile = EVALUATOR_BY_JOB[job];
  const actionType = profile.speedStat === 'spellSpeed' ? 'magical hit' : 'physical hit';
  return {
    profileId: EVALUATOR_PROFILE_ID[job],
    version: 'combat-evaluator-profiles-0.5.0',
    objective: `Expected damage of a single 100-potency ${actionType} from independently recalculated gear stats.`,
    confidence: 'reference-validated-proxy',
    limitation: profile.role === 'tank'
      ? 'This profile does not simulate a job rotation, mitigation, raid buffs, encounter timing, downtime, or movement.'
      : profile.role === 'healer'
        ? 'This profile does not simulate a job rotation, healing throughput, raid buffs, encounter timing, or movement.'
        : 'This profile compares gear and meld stats; it does not simulate the job rotation, job gauge, raid buffs, encounter timing, downtime, or movement.'
  };
};

const gcdFromSpeed = (speed, profile) => {
  const speedReduction = Math.floor((130 * (speed - 420)) / 2780);
  const speedAdjusted = Math.floor(((1000 - speedReduction) * 2500) / 1000);
  const hasteAdjusted = Math.floor((speedAdjusted * (100 - profile.hastePercent)) / 100);
  return Math.floor(hasteAdjusted / 10) / 100;
};

const expectedAction100 = (stats, weaponDamage, job) => {
  const profile = EVALUATOR_BY_JOB[job];
  const mainStatMultiplier = (Math.floor((profile.attackPowerModifier * (stats[profile.mainStat] - 440)) / 440) + 100) / 100;
  const weaponDamageMultiplier = Math.floor((440 * profile.mainStatModifier) / 1000 + weaponDamage) / 100;
  const determinationMultiplier = (1000 + Math.floor((140 * (stats.determination - 440)) / 2780)) / 1000;
  const tenacityMultiplier = profile.appliesTenacity
    ? (1000 + Math.floor((112 * (stats.tenacity - 420)) / 2780)) / 1000
    : 1;
  const criticalHitChance = Math.floor((200 * (stats.criticalHit - 420)) / 2780 + 50) / 1000;
  const criticalHitMultiplier = (1400 + Math.floor((200 * (stats.criticalHit - 420)) / 2780)) / 1000;
  const directHitChance = Math.max(0, Math.floor((550 * (stats.directHit - 420)) / 2780) / 1000);
  return 100 * mainStatMultiplier * weaponDamageMultiplier * determinationMultiplier * tenacityMultiplier *
    (1 + criticalHitChance * (criticalHitMultiplier - 1)) *
    (1 + directHitChance * 0.25) * profile.damageTrait;
};

const averageItemLevelForEquipped = (equipped, job) => Object.entries(equipped).reduce((total, [slot, entry]) => {
  const item = items.find((candidate) => candidate.id === entry.itemId);
  if (!item) throw new Error(`Cannot calculate average item level for missing item ${entry.itemId}.`);
  const weight = job === 'PLD' ? slot === 'weapon' ? 5 / 7 : slot === 'offHand' ? 2 / 7 : 1 : 1;
  return total + item.itemLevel * weight;
}, 0) / 11;

const materiaWasteFor = (equipped) => {
  let waste = 0;
  for (const entry of Object.values(equipped)) {
    const item = items.find((candidate) => candidate.id === entry.itemId);
    if (!item) throw new Error(`Cannot calculate materia waste for missing item ${entry.itemId}.`);
    const meldedStats = { ...item.stats };
    for (const materiaId of entry.materiaIds) {
      const meld = materia.find((candidate) => candidate.id === materiaId);
      if (!meld) throw new Error(`Cannot calculate materia waste for missing materia ${materiaId}.`);
      const room = Math.max(0, item.statCaps[meld.stat] - meldedStats[meld.stat]);
      const applied = Math.min(room, meld.value);
      meldedStats[meld.stat] += applied;
      waste += meld.value - applied;
    }
  }
  return waste;
};

const locallyCalculatedStats = (equipped, job, foodId) => {
  const profile = EVALUATOR_BY_JOB[job];
  const stats = { ...profile.baseStats };
  for (const entry of Object.values(equipped)) {
    const item = items.find((candidate) => candidate.id === entry.itemId);
    if (!item) throw new Error(`Cannot calculate stats for missing item ${entry.itemId}.`);
    const itemStats = { ...item.stats };
    for (const materiaId of entry.materiaIds) {
      const meld = materia.find((candidate) => candidate.id === materiaId);
      if (!meld) throw new Error(`Cannot calculate stats for missing materia ${materiaId}.`);
      const room = Math.max(0, item.statCaps[meld.stat] - itemStats[meld.stat]);
      itemStats[meld.stat] += Math.min(room, meld.value);
    }
    for (const stat of Object.keys(stats)) stats[stat] += itemStats[stat];
  }
  stats[profile.mainStat] = Math.floor(stats[profile.mainStat] * 1.05);
  stats.vitality = Math.floor(stats.vitality * 1.05);
  const food = foods.find((candidate) => candidate.id === foodId);
  for (const bonus of food?.bonuses ?? []) {
    stats[bonus.stat] += Math.min(Math.floor((stats[bonus.stat] * bonus.percent) / 100), bonus.cap);
  }
  return stats;
};

const curatedSets = referenceSets.map((set) => {
  const equipped = normalizeEtroEquippedItems(set, ETRO_SLOT_TO_GEAR_SLOT);
  const profile = EVALUATOR_BY_JOB[set.jobAbbrev];
  const foodId = foodProviderToOfficial.get(set.food);
  const stats = locallyCalculatedStats(equipped, set.jobAbbrev, foodId);
  const weaponDamage = getPublishedStat(set, 12);
  return {
    id: `etro-${set.id}`,
    origin: 'curated',
    name: set.name,
    job: set.jobAbbrev,
    level: 100,
    patch: String(set.patch),
    items: equipped,
    foodId,
    metrics: {
      stats,
      weaponDamage,
      gcd: gcdFromSpeed(stats[profile.speedStat], profile),
      expectedAction100: expectedAction100(stats, weaponDamage, set.jobAbbrev),
      averageItemLevel: getPublishedMetric(set, 'Average Item Level'),
      materiaWaste: materiaWasteFor(equipped)
    },
    evaluation: evaluationForJob(set.jobAbbrev),
    assumptions: [
      'Source record uses a five percent party bonus.',
      `Source clan: ${set.clanName ?? 'not specified'}.`,
      'No source notes were provided; set name and published totals are preserved without inferred intent.'
    ],
    provenance: [
      {
        kind: 'community-curated',
        provider: 'Etro',
        providerRecordId: set.id,
        sourceUrl: `https://etro.gg/gearset/${set.id}`,
        sourcePatch: String(set.patch),
        sourceVersion: set.lastUpdate,
        schemaVersion: 'etro-bis@2026-07-15',
        retrievedAt: generatedAt,
        verifiedAt: set.lastUpdate,
        status: 'current'
      }
    ]
  };
});

const curatedBySignature = new Map(curatedSets.map((set) => [curatedSetSignature(set), set]));
for (const reference of balanceReferenceSets) {
  const equipped = normalizeXivGearEquippedItems(reference, XIVGEAR_SLOT_TO_GEAR_SLOT);
  const signature = curatedSetSignature({
    job: reference.job,
    items: equipped,
    foodId: reference.foodId
  });
  const matchingSet = curatedBySignature.get(signature);
  const provenance = balanceProvenance(reference);
  if (matchingSet) {
    if (matchingSet.name !== reference.name) {
      matchingSet.assumptions.push(`Etro record name: ${matchingSet.name}.`);
      matchingSet.name = reference.name;
    }
    matchingSet.assumptions.push(
      `The Balance guide independently recommends this exact equipment, meld, and food combination as ${reference.name}.`
    );
    matchingSet.provenance.push(...provenance);
    continue;
  }

  const fullData = reference.publishedStats ? undefined : await xivGear.fullData(
    balanceXivGearUrl(reference),
    reference.job
  );
  const published = reference.publishedStats ?? fullData?.sets?.[0]?.computedStats;
  if (!published || (fullData && fullData.job !== reference.job)) {
    throw new Error(`XivGear full-data validation failed for ${reference.job} ${reference.name}.`);
  }
  const profile = EVALUATOR_BY_JOB[reference.job];
  const equippedItems = Object.values(equipped).map((entry) =>
    items.find((item) => item.id === entry.itemId)
  );
  if (equippedItems.some((item) => !item)) {
    throw new Error(`The Balance set ${reference.job} ${reference.name} could not resolve every official item.`);
  }
  const stats = locallyCalculatedStats(equipped, reference.job, reference.foodId);
  const weaponDamage = Math.max(...equippedItems.map((item) => item.weaponDamage));
  const balanceSet = {
    id: `balance-${reference.recordId}${reference.setIndex === undefined ? '' : `-${reference.setIndex}`}`,
    origin: 'curated',
    name: reference.name,
    job: reference.job,
    level: 100,
    patch: '7.4',
    items: equipped,
    foodId: reference.foodId,
    metrics: {
      stats,
      weaponDamage,
      gcd: gcdFromSpeed(stats[profile.speedStat], profile),
      expectedAction100: expectedAction100(stats, weaponDamage, reference.job),
      averageItemLevel: averageItemLevelForEquipped(equipped, reference.job),
      materiaWaste: materiaWasteFor(equipped)
    },
    evaluation: evaluationForJob(reference.job),
    assumptions: [
      'Source record uses a five percent party bonus.',
      `The Balance guide labels this recommendation ${reference.name}.`,
      `Linked XivGear record name: ${reference.sourceName}.`
    ],
    provenance
  };
  curatedSets.push(balanceSet);
  curatedBySignature.set(signature, balanceSet);
}

const balanceAttributedSets = curatedSets.filter((set) =>
  set.provenance.some((entry) => entry.provider === 'The Balance')
);
if (balanceAttributedSets.length !== 55 || JOBS.some((job) => !curatedSets.some((set) => set.job === job))) {
  throw new Error(`Expected 55 The Balance attributions and coverage for every combat job; found ${balanceAttributedSets.length} attributions across ${new Set(curatedSets.map((set) => set.job)).size}/${JOBS.length} jobs.`);
}

const snapshotManifest = {
  id: `xivapi-${itemResponse.version}-etro-balance-all-combat-jobs-${generatedAt.slice(0, 10)}`,
  generatedAt,
  gamePatch: '7.51',
  gearTierPatch: '7.4',
  xivapiVersion: itemResponse.version,
  xivapiSchema: itemResponse.schema,
  calculationVersion: 'combat-evaluator-profiles-0.5.0',
  status: 'online-current'
};
const sortedItems = items.sort((a, b) => a.slot.localeCompare(b.slot) || b.itemLevel - a.itemLevel || a.id - b.id);
const sortedMateria = materia.sort((a, b) => a.id - b.id);
const sortedFoods = foods.sort((a, b) => a.id - b.id);
const sortedCuratedSets = curatedSets.sort((a, b) => a.metrics.gcd - b.metrics.gcd || a.name.localeCompare(b.name));
const acquisitionRecords = buildAcquisitionRecords(sortedItems, generatedAt);
const acquisitionIsPartial = acquisitionRecords.some((entry) =>
  entry.provenance.some((provenance) => provenance.status !== 'current')
);
const xivApiFreshness = providerCache.freshness('xivapi', generatedAt);
const etroFreshness = providerCache.freshness('etro', generatedAt);
const xivGearFreshness = providerCache.freshness('xivgear', generatedAt);
const overlayStatus = (freshness) => freshness.some((provider) => provider.status === 'failed')
  ? 'failed'
  : freshness.some((provider) => provider.status === 'stale')
    ? 'stale'
    : freshness.some((provider) => provider.status === 'partial') ? 'partial' : 'current';
const officialProviderFreshness = [xivApiFreshness, { ...etroFreshness, id: 'etro-supporting-data' }];
const curatedProviderFreshness = [
  etroFreshness,
  { id: 'the-balance', status: 'current', retrievedAt: generatedAt },
  xivGearFreshness
];
const sourceFreshness = new Map([
  ['XIVAPI v2', xivApiFreshness],
  ['Etro', etroFreshness],
  ['XivGear', xivGearFreshness]
]);
for (const entity of [...sortedItems, ...sortedFoods, ...sortedCuratedSets]) {
  entity.provenance = entity.provenance.map((entry) => {
    const freshness = sourceFreshness.get(entry.provider);
    if (!freshness || freshness.status === 'current') return entry;
    return {
      ...entry,
      status: freshness.status === 'failed' ? 'stale' : freshness.status,
      retrievedAt: freshness.retrievedAt ?? entry.retrievedAt,
      verifiedAt: undefined
    };
  });
}
const attempts = {
  official: await captureOverlay(async () => createProviderOverlay({
    kind: 'official',
    generatedAt,
    status: overlayStatus(officialProviderFreshness),
    providers: officialProviderFreshness,
    payload: { items: sortedItems, materia: sortedMateria, foods: sortedFoods }
  })),
  acquisition: await captureOverlay(async () => createProviderOverlay({
    kind: 'acquisition',
    generatedAt,
    status: acquisitionIsPartial ? 'partial' : 'current',
    providers: [{
      id: 'acquisition-data',
      status: acquisitionIsPartial ? 'partial' : 'current',
      retrievedAt: generatedAt,
      ...(acquisitionIsPartial ? { message: 'Some exact upgrade routes remain partially verified.' } : {})
    }],
    payload: { items: acquisitionRecords }
  })),
  curated: await captureOverlay(async () => createProviderOverlay({
    kind: 'curated',
    generatedAt,
    status: overlayStatus(curatedProviderFreshness),
    providers: curatedProviderFreshness,
    payload: { sets: sortedCuratedSets }
  }))
};
const { snapshot, providers: publishedProviders } = publishOverlaySnapshot({
  previousSnapshot,
  manifest: snapshotManifest,
  attempts
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(
  `Wrote ${items.length} official items for ${JOBS.join('/')}, ${materia.length} materia, ${foods.length} foods, and ${curatedSets.length} deduplicated Etro/The Balance curated sets to ${outputPath}`
);
console.log(`Provider freshness: ${publishedProviders.map((provider) => `${provider.id}=${provider.status}`).join(', ')}`);
