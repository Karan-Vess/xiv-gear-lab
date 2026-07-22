import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
import { CAP_CATALOGUE_PROFILES, catalogueProfile, itemMatchesCatalogueProfile } from './catalogue-update/profiles.mjs';
import { catalogueContentFingerprint } from './catalogue-update/catalogue-identity.mjs';
import { contentAddressIconRecords } from './catalogue-update/icon-assets.mjs';

const outputPath = resolve('packages/data/src/generated/whm-snapshot.json');
const iconOutputDirectory = resolve('apps/web/public/icons/items');
const acquisitionIconOutputDirectory = resolve('apps/web/public/icons/acquisition');
const generatedAt = new Date().toISOString();

const writeFileWithRetry = async (path, contents, attempts = 5) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(path, contents, 'utf8');
      return;
    } catch (error) {
      const retryable = error && typeof error === 'object' &&
        ['EACCES', 'EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code);
      if (!retryable || attempt === attempts) throw error;
      await delay(250 * attempt);
    }
  }
};

const ACQUISITION_ICON_ASSETS = [
  { file: 'dungeon.png', path: 'ui/icon/061000/061801_hr1.tex' },
  { file: 'raid.png', path: 'ui/icon/061000/061802_hr1.tex' },
  { file: 'trial.png', path: 'ui/icon/061000/061804_hr1.tex' },
  { file: 'quest.png', path: 'ui/icon/061000/061805_hr1.tex' },
  { file: 'crafted.png', path: 'ui/icon/061000/061816_hr1.tex' },
  { file: 'ultimate.png', path: 'ui/icon/061000/061832_hr1.tex' },
  { file: 'mnemonics.png', path: 'ui/icon/065000/065137_hr1.tex' },
  { file: 'comedy.png', path: 'ui/icon/065000/065103_hr1.tex' },
  { file: 'poetics.png', path: 'ui/icon/065000/065023_hr1.tex' },
  { file: 'anabaseios-mythos-1.png', path: 'ui/icon/026000/026450_hr1.tex' },
  { file: 'anabaseios-mythos-2.png', path: 'ui/icon/026000/026451_hr1.tex' },
  { file: 'anabaseios-mythos-3.png', path: 'ui/icon/026000/026452_hr1.tex' },
  { file: 'anabaseios-mythos-4.png', path: 'ui/icon/026000/026453_hr1.tex' },
  { file: 'unsung-helm-anabaseios.png', path: 'ui/icon/040000/040043_hr1.tex' },
  { file: 'unsung-armor-anabaseios.png', path: 'ui/icon/048000/048087_hr1.tex' },
  { file: 'unsung-gauntlets-anabaseios.png', path: 'ui/icon/048000/048662_hr1.tex' },
  { file: 'unsung-chausses-anabaseios.png', path: 'ui/icon/047000/047610_hr1.tex' },
  { file: 'unsung-greaves-anabaseios.png', path: 'ui/icon/047000/047025_hr1.tex' },
  { file: 'unsung-ring-anabaseios.png', path: 'ui/icon/054000/054405_hr1.tex' },
  { file: 'hermetic-tomestone.png', path: 'ui/icon/026000/026645_hr1.tex' },
  { file: 'divine-solvent.png', path: 'ui/icon/027000/027635_hr1.tex' },
  { file: 'divine-twine.png', path: 'ui/icon/021000/021685_hr1.tex' },
  { file: 'divine-shine.png', path: 'ui/icon/027000/027634_hr1.tex' },
  { file: 'voidvessel-totem.png', path: 'ui/icon/026000/026646_hr1.tex' },
  { file: 'cosmic-crystallite.png', path: 'ui/icon/021000/021228_hr1.tex' },
  { file: 'hannish-certificate-grade-3.png', path: 'ui/icon/026000/026171_hr1.tex' },
  { file: 'divine-rain.png', path: 'ui/icon/020000/020682_hr1.tex' },
  { file: 'omega-totem.png', path: 'ui/icon/026000/026639_hr1.tex' },
  { file: 'aac-book-1.png', path: 'ui/icon/026000/026457_hr1.tex' },
  { file: 'aac-book-2.png', path: 'ui/icon/026000/026458_hr1.tex' },
  { file: 'aac-book-3.png', path: 'ui/icon/026000/026459_hr1.tex' },
  { file: 'aac-book-4.png', path: 'ui/icon/026000/026460_hr1.tex' },
  { file: 'heavy-holohelm.png', path: 'ui/icon/026000/026686_hr1.tex' },
  { file: 'heavy-holoarmor.png', path: 'ui/icon/026000/026687_hr1.tex' },
  { file: 'heavy-hologauntlets.png', path: 'ui/icon/026000/026688_hr1.tex' },
  { file: 'heavy-holotrousers.png', path: 'ui/icon/026000/026689_hr1.tex' },
  { file: 'heavy-hologreaves.png', path: 'ui/icon/026000/026690_hr1.tex' },
  { file: 'heavy-holoring.png', path: 'ui/icon/026000/026691_hr1.tex' },
  { file: 'thundersteeped-solvent.png', path: 'ui/icon/027000/027640_hr1.tex' },
  { file: 'thundersteeped-twine.png', path: 'ui/icon/021000/021693_hr1.tex' },
  { file: 'thundersteeping-glaze.png', path: 'ui/icon/027000/027641_hr1.tex' },
  { file: 'universal-tomestone-3.png', path: 'ui/icon/026000/026685_hr1.tex' },
  { file: 'totem-of-naught.png', path: 'ui/icon/026000/026696_hr1.tex' },
  { file: 'mad-harlequin-totem.png', path: 'ui/icon/026000/026697_hr1.tex' },
  { file: 'runaway-totem.png', path: 'ui/icon/026000/026684_hr1.tex' },
  { file: 'waning-arcanite.png', path: 'ui/icon/021000/021208_hr1.tex' },
  { file: 'everkeep-certificate-grade-3.png', path: 'ui/icon/026000/026171_hr1.tex' },
  { file: 'treno-rain.png', path: 'ui/icon/027000/027625_hr1.tex' }
];
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
const requestedBackfills = (process.env.XIV_GEAR_LAB_BACKFILL_EXPANSIONS ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const existingBackfills = Object.keys(CAP_CATALOGUE_PROFILES).filter((expansionId) =>
  !['dt', 'ew'].includes(expansionId) &&
  previousSnapshot?.items?.some((item) => item.expansionId === expansionId)
);
const activeCatalogueProfiles = [...new Set(['dt', 'ew', ...existingBackfills, ...requestedBackfills])].map((expansionId) => {
  const profile = catalogueProfile(expansionId);
  if (!profile.itemNamePattern || profile.minimumItemsPerJob < 1) {
    throw new Error(`${profile.name} backfill discovery has not been configured yet.`);
  }
  return profile;
});
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

const expansionForLevel = (level) => {
  if (level <= 50) return 'arr';
  if (level <= 60) return 'hw';
  if (level <= 70) return 'sb';
  if (level <= 80) return 'shb';
  if (level <= 90) return 'ew';
  return 'dt';
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

const downloadAcquisitionIcon = async ({ file, path }, version) => {
  const localPath = resolve(acquisitionIconOutputDirectory, file);
  try {
    const buffer = await xivApi.asset(path, version);
    await writeFile(localPath, new Uint8Array(buffer));
  } catch (error) {
    try {
      await readFile(localPath);
      providerCache.report('xivapi', 'stale', `Acquisition icon ${file} could not be refreshed; retained the validated local asset. ${error instanceof Error ? error.message : String(error)}`);
    } catch {
      throw error;
    }
  }
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

const equipmentDiscoveries = await Promise.all(activeCatalogueProfiles.map(async (profile) => {
  const jobs = JOBS.filter((job) => !profile.excludedJobs.includes(job));
  const catalogues = await Promise.all(jobs.map(async (job) => [
    job,
    await etro.equipment(job, profile.minimumItemLevel, profile.maximumItemLevel)
  ]));
  const namePattern = new RegExp(profile.itemNamePattern);
  const inConfiguredRange = (id) => profile.itemIdRanges.some(([minimum, maximum]) => id >= minimum && id <= maximum);
  return normalizeEtroEquipmentDiscovery(catalogues, {
    include: (item) => namePattern.test(item.name) || inConfiguredRange(item.id),
    minimumPerJob: profile.minimumItemsPerJob
  });
}));

const jobsByItemId = new Map();
const equipmentById = new Map();
for (const discovery of equipmentDiscoveries) {
  for (const [id, item] of discovery.equipmentById) equipmentById.set(id, item);
  for (const [id, jobs] of discovery.jobsByItemId) {
    jobsByItemId.set(id, [...new Set([...(jobsByItemId.get(id) ?? []), ...jobs])]);
  }
}

const itemIds = [...equipmentById.keys()].sort((a, b) => a - b);
const itemResponse = await xivApi.sheetRows('Item', itemIds, compactFields, { language: 'en' });

const itemLevels = [...new Set(itemResponse.rows.map((row) => row.fields['LevelItem@as(raw)']))].sort();
const itemLevelResponse = await xivApi.sheetRows(
  'ItemLevel',
  itemLevels,
  'Strength,Dexterity,Intelligence,Mind,Vitality,Piety,Tenacity,CriticalHit,Determination,DirectHitRate,SkillSpeed,SpellSpeed'
);
const levelCaps = new Map(itemLevelResponse.rows.map((row) => [row.row_id, row.fields]));

const normalizedItems = normalizeXivApiEquipmentRows({
  response: itemResponse,
  itemLevelCaps: levelCaps,
  jobsByItemId,
  paramToStat: PARAM_TO_STAT,
  slotCoefficients: SLOT_COEFFICIENT,
  slotFromCategory,
  emptyStats,
  casterJobs: CASTER_DPS_JOBS,
  healerJobs: HEALER_JOBS,
  expansionForLevel,
  generatedAt,
  gamePatch: '7.51'
});
const items = normalizedItems.filter((item) =>
  activeCatalogueProfiles.some((profile) => itemMatchesCatalogueProfile(item, profile))
);

for (const item of items) {
  if (!item.name.startsWith('Mandervillous')) continue;
  const paladinSplit = item.jobs.includes('PLD');
  item.relicStatModel = {
    schemaVersion: 'relic-stat-allocation@1',
    type: 'endwalker-discrete',
    largeValue: paladinSplit ? (item.slot === 'offHand' ? 87 : 219) : 306,
    largeStatCount: 2,
    smallValue: paladinSplit ? (item.slot === 'offHand' ? 21 : 51) : 72,
    smallStatCount: 1,
    allowedStats: item.jobs.some((job) => HEALER_JOBS.includes(job))
      ? ['criticalHit', 'determination', 'directHit', 'spellSpeed', 'piety']
      : item.jobs.some((job) => ['PLD', 'WAR', 'DRK', 'GNB'].includes(job))
        ? ['criticalHit', 'determination', 'directHit', 'skillSpeed', 'tenacity']
        : item.jobs.some((job) => CASTER_DPS_JOBS.includes(job))
          ? ['criticalHit', 'determination', 'directHit', 'spellSpeed']
          : ['criticalHit', 'determination', 'directHit', 'skillSpeed']
  };
}

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

const ENDWALKER_FOOD_PROVIDER_IDS = [595, 596, 597, 598, 599, 600, 601, 602];
const foodProviderIds = [...new Set([
  ...referenceSets.map((set) => set.food).filter(Boolean),
  ...ENDWALKER_FOOD_PROVIDER_IDS
])];
const foodRows = await Promise.all(foodProviderIds.map((id) => etro.food(id)));
const foods = normalizeEtroFoods(foodRows, {
  paramToStat: PARAM_TO_STAT,
  generatedAt,
  expansionForItemLevel: (itemLevel) => itemLevel <= 510 ? 'shb' : itemLevel <= 640 ? 'ew' : 'dt',
  requiredLevelForItemLevel: (itemLevel) => itemLevel <= 510 ? 80 : itemLevel <= 640 ? 90 : 100,
  sourcePatchForItemLevel: (itemLevel) => itemLevel <= 510 ? '5.4' : itemLevel <= 640 ? '6.4' : '7.4'
});
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
const materia = normalizeEtroMateria(materiaCatalogue, {
  referencedIds: referencedMateriaIds,
  paramToStat: PARAM_TO_STAT,
  includedTiers: [...new Set(activeCatalogueProfiles.flatMap((profile) => profile.materiaTiers))]
});

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
await mkdir(acquisitionIconOutputDirectory, { recursive: true });
await Promise.all(ACQUISITION_ICON_ASSETS.map((asset) => downloadAcquisitionIcon(asset, itemResponse.version)));
for (let offset = 0; offset < iconRecords.length; offset += 6) {
  const batch = iconRecords.slice(offset, offset + 6);
  const localUrls = await Promise.all(
    batch.map((record) => downloadIcon(record.id, record.iconPath, itemResponse.version))
  );
  batch.forEach((record, index) => {
    record.iconUrl = localUrls[index];
  });
}
const iconAssetReport = await contentAddressIconRecords(iconRecords, {
  publicDirectory: resolve('apps/web/public')
});

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
    version: 'combat-evaluator-profiles-0.6.0',
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

const sortedItems = items.sort((a, b) => a.slot.localeCompare(b.slot) || b.itemLevel - a.itemLevel || a.id - b.id);
const sortedMateria = materia.sort((a, b) => a.id - b.id);
const sortedFoods = foods.sort((a, b) => a.id - b.id);
const sortedCuratedSets = curatedSets.sort((a, b) => a.metrics.gcd - b.metrics.gcd || a.name.localeCompare(b.name));
const acquisitionRecords = buildAcquisitionRecords(sortedItems, generatedAt);
const catalogueFingerprint = catalogueContentFingerprint({
  xivapiVersion: itemResponse.version,
  profiles: activeCatalogueProfiles,
  items: [...sortedItems].sort((left, right) => left.id - right.id),
  materia: sortedMateria,
  foods: sortedFoods,
  acquisitions: [...acquisitionRecords].sort((left, right) => left.itemId - right.itemId),
  curatedSets: [...sortedCuratedSets].sort((left, right) => left.id.localeCompare(right.id))
});
const snapshotManifest = {
  id: `xivapi-${itemResponse.version}-${activeCatalogueProfiles.map((profile) => profile.expansionId).join('-')}-${catalogueFingerprint}`,
  generatedAt,
  gamePatch: '7.51',
  gearTierPatch: '7.4',
  xivapiVersion: itemResponse.version,
  xivapiSchema: itemResponse.schema,
  calculationVersion: 'combat-evaluator-profiles-0.6.0',
  status: 'online-current'
};
const contentProvenance = (sourceUrl, sourcePatch) => [{
  kind: 'official-published',
  provider: 'Square Enix Lodestone',
  sourceUrl,
  sourcePatch,
  sourceVersion: 'm11-content-access@2',
  schemaVersion: 'content-access@1',
  retrievedAt: generatedAt,
  verifiedAt: generatedAt,
  status: 'current'
}];
const contentProvenance74 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/597d1b99656a1a0d3ba6501a48d43ec46c667068',
  '7.4'
);
const contentProvenance64 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/7533e7a9b6b72d8e5aad3c1e7c4247967b3ee196',
  '6.4'
);
const contentProvenance65 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/1dcbf39c97285ba9a42012eecf2c031f0ffbceb1',
  '6.5'
);
const contentProvenance655 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/012d8e96b662a92eb4405c25b9958184db248348',
  '6.55'
);
const contentProvenance75 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/07320affa7e0fcd9685afcbe54fbf55405b6d822/',
  '7.5'
);
const contentProvenance741 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/0de7befbbcefe67d1af77dcbe1bae937b916b67e/',
  '7.41'
);
const contentProvenance751 = contentProvenance(
  'https://na.finalfantasyxiv.com/lodestone/topics/detail/c46881a31a2c90d0965493c921b434eca09113f8/',
  '7.51'
);
const contentGraph = {
  schemaVersion: 'content-access@1',
  nodes: [
    { id: 'expansion:arr', kind: 'expansion', name: 'A Realm Reborn', expansionId: 'arr', level: 50, prerequisites: [], provenance: contentProvenance74 },
    { id: 'expansion:hw', kind: 'expansion', name: 'Heavensward', expansionId: 'hw', level: 60, prerequisites: ['expansion:arr'], provenance: contentProvenance74 },
    { id: 'expansion:sb', kind: 'expansion', name: 'Stormblood', expansionId: 'sb', level: 70, prerequisites: ['expansion:hw'], provenance: contentProvenance74 },
    { id: 'expansion:shb', kind: 'expansion', name: 'Shadowbringers', expansionId: 'shb', level: 80, prerequisites: ['expansion:sb'], provenance: contentProvenance74 },
    { id: 'expansion:ew', kind: 'expansion', name: 'Endwalker', expansionId: 'ew', level: 90, prerequisites: ['expansion:shb'], provenance: contentProvenance74 },
    { id: 'expansion:dt', kind: 'expansion', name: 'Dawntrail', expansionId: 'dt', level: 100, prerequisites: ['expansion:ew'], provenance: contentProvenance74 },
    { id: 'quest:endwalker-complete', kind: 'quest', name: 'Endwalker main scenario completion', expansionId: 'ew', level: 90, prerequisites: ['expansion:ew'], provenance: contentProvenance64 },
    { id: 'currency:poetics', kind: 'currency', name: 'Allagan Tomestone of Poetics', expansionId: 'arr', level: 50, prerequisites: ['expansion:arr'], provenance: contentProvenance655 },
    { id: 'currency:comedy', kind: 'currency', name: 'Allagan Tomestone of Comedy', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance64 },
    { id: 'vendor:cihanti', kind: 'vendor', name: 'Cihanti', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete', 'currency:comedy'], provenance: contentProvenance64 },
    { id: 'vendor:khaldeen', kind: 'vendor', name: 'Khaldeen', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance64 },
    { id: 'vendor:rashti-grade-3', kind: 'vendor', name: 'Rashti grade 3 exchange', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance65 },
    { id: 'vendor:nesvaaz', kind: 'vendor', name: 'Nesvaaz', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance65 },
    { id: 'recipe:diadochos', kind: 'recipe', name: 'Diadochos Master Recipes X', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance64 },
    { id: 'duty:anabaseios-normal', kind: 'duty', name: 'Pandæmonium: Anabaseios', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance64 },
    { id: 'duty:anabaseios-savage', kind: 'duty', name: 'Pandæmonium: Anabaseios (Savage)', expansionId: 'ew', level: 90, prerequisites: ['duty:anabaseios-normal'], provenance: contentProvenance64 },
    { id: 'duty:lunar-subterrane', kind: 'duty', name: 'The Lunar Subterrane', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance65 },
    { id: 'duty:thaleia', kind: 'duty', name: 'Thaleia', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance65 },
    { id: 'duty:abyssal-fracture-extreme', kind: 'duty', name: 'The Abyssal Fracture (Extreme)', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance65 },
    { id: 'duty:omega-protocol-ultimate', kind: 'duty', name: 'The Omega Protocol (Ultimate)', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance64 },
    { id: 'quest:mandervillous-weapons', kind: 'quest', name: 'Gentlemen at Heart', expansionId: 'ew', level: 90, prerequisites: ['quest:endwalker-complete'], provenance: contentProvenance655 },
    { id: 'quest:dawntrail-complete', kind: 'quest', name: 'Dawntrail main scenario completion', expansionId: 'dt', level: 100, prerequisites: ['expansion:dt'], provenance: contentProvenance74 },
    { id: 'currency:mnemonics', kind: 'currency', name: 'Allagan Tomestone of Mnemonics', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'vendor:zircon', kind: 'vendor', name: 'Zircon', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete', 'currency:mnemonics'], provenance: contentProvenance74 },
    { id: 'vendor:theone', kind: 'vendor', name: 'Theone', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'vendor:hhihwi', kind: 'vendor', name: 'Hhihwi', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'duty:aac-heavyweight-normal', kind: 'duty', name: 'AAC Heavyweight Tier', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'duty:aac-heavyweight-savage', kind: 'duty', name: 'AAC Heavyweight Tier (Savage)', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'recipe:courtly-lover', kind: 'recipe', name: 'Courtly Lover Master Recipes XII', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'vendor:eirene-grade-3', kind: 'vendor', name: 'Eirene grade 3 exchange', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance75 },
    { id: 'duty:the-clyteum', kind: 'duty', name: 'The Clyteum', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance75 },
    { id: 'duty:hell-on-rails-extreme', kind: 'duty', name: 'Hell on Rails (Extreme)', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance74 },
    { id: 'quest:phantom-obscurum', kind: 'quest', name: 'A Phantom Reborn', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance741 },
    { id: 'duty:windurst-third-walk', kind: 'duty', name: 'Windurst: The Third Walk', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance75 },
    { id: 'duty:unmaking-extreme', kind: 'duty', name: 'The Unmaking (Extreme)', expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance75 },
    { id: 'vendor:uahshepya', kind: 'vendor', name: "Uah'shepya", expansionId: 'dt', level: 100, prerequisites: ['quest:dawntrail-complete'], provenance: contentProvenance75 },
    { id: 'duty:dancing-mad-ultimate', kind: 'duty', name: 'Dancing Mad (Ultimate)', expansionId: 'dt', level: 100, prerequisites: ['duty:aac-heavyweight-savage'], provenance: contentProvenance751 }
  ]
};
const acquisitionIsPartial = acquisitionRecords.some((entry) =>
  entry.acquisitionRoutes.some((route) => route.status !== 'validated')
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
    payload: { items: sortedItems, materia: sortedMateria, foods: sortedFoods, contentGraph }
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
await writeFileWithRetry(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `Wrote ${items.length} official items for ${JOBS.join('/')}, ${materia.length} materia, ${foods.length} foods, and ${curatedSets.length} deduplicated Etro/The Balance curated sets to ${outputPath}`
);
console.log(`Provider freshness: ${publishedProviders.map((provider) => `${provider.id}=${provider.status}`).join(', ')}`);
console.log(`Content-addressed icons: ${iconAssetReport.uniqueAssets}/${iconAssetReport.records} unique · ${(iconAssetReport.uniqueBytes / 1024 / 1024).toFixed(2)} MiB`);
