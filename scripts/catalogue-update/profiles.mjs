export const CATALOGUE_PROFILE_SCHEMA = 'catalogue-cap-profile@1';

export const CAP_CATALOGUE_PROFILES = Object.freeze({
  dt: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'dt',
    name: 'Dawntrail',
    levelCap: 100,
    gamePatch: '7.51',
    minimumItemLevel: 765,
    maximumItemLevel: 795,
    minimumItemsPerJob: 20,
    excludedJobs: [],
    materiaTiers: [11, 12],
    itemNamePattern: "^(Grand Champion's|Augmented Bygone Brass|Bygone Brass|Vana'dielian|Palazzo Diamond|Praemagitek|Augmented Courtly Lover's|Courtly Lover's|Heavyweight)|of Naught$",
    itemIdRanges: [[49482, 49503], [50032, 50053]]
  }),
  ew: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'ew',
    name: 'Endwalker',
    levelCap: 90,
    gamePatch: '6.58',
    minimumItemLevel: 635,
    maximumItemLevel: 665,
    minimumItemsPerJob: 35,
    excludedJobs: ['VPR', 'PCT'],
    materiaTiers: [9, 10],
    itemNamePattern: '^(Voidmoon|Diadochos|Augmented Diadochos|Anabaseios|Credendum|Augmented Credendum|Theogonic|Ultimate Omega|Mandervillous)|Ascension|^Voidvessel',
    itemIdRanges: []
  }),
  shb: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'shb',
    name: 'Shadowbringers',
    levelCap: 80,
    gamePatch: '5.58',
    minimumItemLevel: 475,
    maximumItemLevel: 535,
    minimumItemsPerJob: 50,
    excludedJobs: ['SGE', 'RPR', 'VPR', 'PCT'],
    materiaTiers: [7, 8],
    itemNamePattern: "^(Augmented Exarchic|Exarchic|Edenmete|Edenmorn|Cryptlurker's|Augmented Cryptlurker's|YoRHa Type-5[135]|Paglth'an|Diamond Zeta|Blade's|Ultimate)",
    itemIdRanges: []
  }),
  sb: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'sb',
    name: 'Stormblood',
    levelCap: 70,
    gamePatch: '4.58',
    minimumItemLevel: 345,
    maximumItemLevel: 405,
    minimumItemsPerJob: 50,
    excludedJobs: ['GNB', 'DNC', 'SGE', 'RPR', 'VPR', 'PCT'],
    materiaTiers: [5, 6],
    itemNamePattern: '.+',
    itemIdRanges: []
  }),
  hw: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'hw',
    name: 'Heavensward',
    levelCap: 60,
    gamePatch: '3.58',
    minimumItemLevel: 235,
    maximumItemLevel: 275,
    minimumItemsPerJob: 0,
    excludedJobs: ['SAM', 'RDM', 'GNB', 'DNC', 'SGE', 'RPR', 'VPR', 'PCT'],
    materiaTiers: [3, 4],
    itemNamePattern: '',
    itemIdRanges: []
  }),
  arr: Object.freeze({
    schemaVersion: CATALOGUE_PROFILE_SCHEMA,
    expansionId: 'arr',
    name: 'A Realm Reborn',
    levelCap: 50,
    gamePatch: '2.58',
    minimumItemLevel: 90,
    maximumItemLevel: 135,
    minimumItemsPerJob: 0,
    excludedJobs: ['AST', 'DRK', 'MCH', 'SAM', 'RDM', 'GNB', 'DNC', 'SGE', 'RPR', 'VPR', 'PCT'],
    materiaTiers: [1, 2],
    itemNamePattern: '',
    itemIdRanges: []
  })
});

export const catalogueProfile = (expansionId) => {
  const profile = CAP_CATALOGUE_PROFILES[expansionId];
  if (!profile) throw new Error(`Unknown catalogue expansion ${expansionId}.`);
  return profile;
};

export const itemMatchesCatalogueProfile = (item, profile) =>
  item.expansionId === profile.expansionId &&
  item.level === profile.levelCap &&
  item.itemLevel >= profile.minimumItemLevel &&
  item.itemLevel <= profile.maximumItemLevel;

export const supportedBackfillProfiles = () => Object.values(CAP_CATALOGUE_PROFILES)
  .filter((profile) => profile.expansionId !== 'dt');
