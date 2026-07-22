import {
  emptyStats,
  type CalculationRuleset,
  type CombatEvaluatorProfile,
  type CombatJob,
  type ExpansionId,
  type GameRegistry,
  type JobDefinition,
  type JobRole,
  type JobTimingEffect,
  type LevelFormulaConstants,
  type StatBlock,
  type StatKey
} from '@xiv-gear-lab/domain';

export const SNAPSHOT_SCHEMA_VERSION = 'gear-snapshot@1';
export const REGISTRY_SCHEMA_VERSION = 'game-registry@1';
export const RULESET_SCHEMA_VERSION = 'combat-ruleset@1';
export const CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-100@1';
export const ENDWALKER_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-90@1';
export const SHADOWBRINGERS_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-80@1';
export const STORMBLOOD_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-70@1';
export const HEAVENSWARD_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-60@1';
export const EVALUATOR_PROFILE_SCHEMA_VERSION = 'generic-hit-profile@1';
export const CURRENT_RULESET_ID = 'dt-7.51-level-100-standard@1';
export const ENDWALKER_RULESET_ID = 'ew-6.58-level-90-standard@1';
export const SHADOWBRINGERS_RULESET_ID = 'shb-5.58-level-80-standard@1';
export const STORMBLOOD_RULESET_ID = 'sb-4.58-level-70-standard@1';
export const HEAVENSWARD_RULESET_ID = 'hw-3.58-level-60-standard@1';
export const CURRENT_PROFILE_VERSION = 'combat-evaluator-profiles-0.6.0';
export const ENDWALKER_PROFILE_VERSION = 'combat-evaluator-profiles-ew-0.9.0';
export const SHADOWBRINGERS_PROFILE_VERSION = 'combat-evaluator-profiles-shb-0.9.0';
export const STORMBLOOD_PROFILE_VERSION = 'combat-evaluator-profiles-sb-0.9.0';
export const HEAVENSWARD_PROFILE_VERSION = 'combat-evaluator-profiles-hw-0.9.0';

const baseTimingEffect: JobTimingEffect = {
  id: 'base-gcd',
  name: 'Base GCD',
  kind: 'base',
  hastePercent: 0
};

const job = (
  id: CombatJob,
  name: string,
  role: JobRole,
  minimumLevel: number,
  introducedIn: ExpansionId,
  defaultGcdTarget: number,
  recommendedGcdTargets: number[],
  profileId: string,
  timingEffects: JobTimingEffect[] = [baseTimingEffect],
  targetTimingEffectId = 'base-gcd'
): JobDefinition => ({
  id,
  name,
  role,
  minimumLevel,
  introducedIn,
  defaultGcdTarget,
  recommendedGcdTargets,
  timingEffects,
  targetTimingEffectId,
  modes: [{
    id: 'standard',
    name: 'Standard',
    introducedIn,
    capabilities: {
      'generic-hit': { status: 'available', profileId },
      'opener-30': { status: 'pending', reason: 'Planned for the bounded combat evaluator milestone.' },
      'dummy-300': { status: 'pending', reason: 'Planned for the bounded combat evaluator milestone.' }
    }
  }]
});

export const CURRENT_REGISTRY: GameRegistry = {
  schemaVersion: REGISTRY_SCHEMA_VERSION,
  expansions: [
    { id: 'arr', name: 'A Realm Reborn', levelCap: 50, order: 0 },
    { id: 'hw', name: 'Heavensward', levelCap: 60, order: 1 },
    { id: 'sb', name: 'Stormblood', levelCap: 70, order: 2 },
    { id: 'shb', name: 'Shadowbringers', levelCap: 80, order: 3 },
    { id: 'ew', name: 'Endwalker', levelCap: 90, order: 4 },
    { id: 'dt', name: 'Dawntrail', levelCap: 100, order: 5 }
  ],
  jobs: [
    job('WHM', 'White Mage', 'healer', 30, 'arr', 2.41, [2.29, 2.41, 2.43], 'whm-healer-damage-proxy@1'),
    job('SCH', 'Scholar', 'healer', 30, 'arr', 2.4, [2.4], 'sch-healer-damage-proxy@1'),
    job('AST', 'Astrologian', 'healer', 30, 'hw', 2.43, [2.31, 2.43], 'ast-healer-damage-proxy@1'),
    job('SGE', 'Sage', 'healer', 70, 'ew', 2.44, [2.39, 2.44, 2.45], 'sge-healer-damage-proxy@1'),
    job('PLD', 'Paladin', 'tank', 30, 'arr', 2.5, [2.5], 'pld-tank-damage-proxy@1'),
    job('WAR', 'Warrior', 'tank', 30, 'arr', 2.5, [2.4, 2.45, 2.5], 'war-tank-damage-proxy@1'),
    job('DRK', 'Dark Knight', 'tank', 30, 'hw', 2.5, [2.46, 2.5], 'drk-tank-damage-proxy@1'),
    job('GNB', 'Gunbreaker', 'tank', 60, 'shb', 2.5, [2.4, 2.45, 2.5], 'gnb-tank-damage-proxy@1'),
    job('MNK', 'Monk', 'dps', 30, 'arr', 1.94, [1.93, 1.94, 2], 'mnk-dps-damage-proxy@1', [
      baseTimingEffect,
      { id: 'greased-lightning', name: 'Greased Lightning', kind: 'passive', hastePercent: 20 }
    ], 'greased-lightning'),
    job('DRG', 'Dragoon', 'dps', 30, 'arr', 2.5, [2.5], 'drg-dps-damage-proxy@1'),
    job('NIN', 'Ninja', 'dps', 30, 'arr', 2.12, [2.12], 'nin-dps-damage-proxy@1', [
      baseTimingEffect,
      { id: 'ninja-speed-trait', name: 'Ninja speed trait', kind: 'passive', hastePercent: 15 }
    ], 'ninja-speed-trait'),
    job('SAM', 'Samurai', 'dps', 50, 'sb', 2.14, [2.08, 2.14], 'sam-dps-damage-proxy@1', [
      baseTimingEffect,
      { id: 'fuka', name: 'Fuka', kind: 'maintained', hastePercent: 13 }
    ], 'fuka'),
    job('RPR', 'Reaper', 'dps', 70, 'ew', 2.49, [2.49], 'rpr-dps-damage-proxy@1'),
    job('VPR', 'Viper', 'dps', 80, 'dt', 2.1, [2.1, 2.11, 2.12], 'vpr-dps-damage-proxy@1', [
      baseTimingEffect,
      { id: 'swiftscaled', name: 'Swiftscaled', kind: 'maintained', hastePercent: 15 }
    ], 'swiftscaled'),
    job('BRD', 'Bard', 'dps', 30, 'arr', 2.49, [2.48, 2.49, 2.5], 'brd-dps-damage-proxy@1'),
    job('MCH', 'Machinist', 'dps', 30, 'hw', 2.5, [2.5], 'mch-dps-damage-proxy@1'),
    job('DNC', 'Dancer', 'dps', 60, 'shb', 2.5, [2.5], 'dnc-dps-damage-proxy@1'),
    job('BLM', 'Black Mage', 'dps', 30, 'arr', 2.41, [2.15, 2.2, 2.32, 2.37, 2.41, 2.45], 'blm-dps-damage-proxy@1', [
      baseTimingEffect,
      { id: 'ley-lines', name: 'Ley Lines', kind: 'temporary', hastePercent: 15 }
    ]),
    job('SMN', 'Summoner', 'dps', 30, 'arr', 2.48, [2.46, 2.47, 2.48], 'smn-dps-damage-proxy@1'),
    job('RDM', 'Red Mage', 'dps', 50, 'sb', 2.49, [2.48, 2.49, 2.5], 'rdm-dps-damage-proxy@1'),
    job('PCT', 'Pictomancer', 'dps', 80, 'dt', 2.5, [2.48, 2.49, 2.5], 'pct-dps-damage-proxy@1')
  ]
};

export const CURRENT_RULESETS: CalculationRuleset[] = [
  {
    id: CURRENT_RULESET_ID,
    schemaVersion: RULESET_SCHEMA_VERSION,
    calculationSchema: CALCULATION_SCHEMA_VERSION,
    expansionId: 'dt',
    gamePatch: '7.51',
    minimumLevel: 100,
    maximumLevel: 100,
    jobMode: 'standard'
  },
  {
    id: ENDWALKER_RULESET_ID,
    schemaVersion: RULESET_SCHEMA_VERSION,
    calculationSchema: ENDWALKER_CALCULATION_SCHEMA_VERSION,
    expansionId: 'ew',
    gamePatch: '6.58',
    minimumLevel: 90,
    maximumLevel: 90,
    jobMode: 'standard'
  },
  {
    id: SHADOWBRINGERS_RULESET_ID,
    schemaVersion: RULESET_SCHEMA_VERSION,
    calculationSchema: SHADOWBRINGERS_CALCULATION_SCHEMA_VERSION,
    expansionId: 'shb',
    gamePatch: '5.58',
    minimumLevel: 80,
    maximumLevel: 80,
    jobMode: 'standard'
  },
  {
    id: STORMBLOOD_RULESET_ID,
    schemaVersion: RULESET_SCHEMA_VERSION,
    calculationSchema: STORMBLOOD_CALCULATION_SCHEMA_VERSION,
    expansionId: 'sb',
    gamePatch: '4.58',
    minimumLevel: 70,
    maximumLevel: 70,
    jobMode: 'standard'
  },
  {
    id: HEAVENSWARD_RULESET_ID,
    schemaVersion: RULESET_SCHEMA_VERSION,
    calculationSchema: HEAVENSWARD_CALCULATION_SCHEMA_VERSION,
    expansionId: 'hw',
    gamePatch: '3.58',
    minimumLevel: 60,
    maximumLevel: 60,
    jobMode: 'standard'
  }
];

const healerBaseStats = (vitality: number): StatBlock => ({
  ...emptyStats(),
  mind: 509,
  vitality,
  piety: 440,
  criticalHit: 420,
  determination: 440,
  directHit: 420,
  spellSpeed: 420
});

const tankBaseStats = (strength: number, vitality: number): StatBlock => ({
  ...emptyStats(),
  strength,
  vitality,
  tenacity: 420,
  criticalHit: 420,
  determination: 440,
  directHit: 420,
  skillSpeed: 420
});

const dpsBaseStats = (
  mainStat: StatKey,
  mainStatValue: number,
  vitality: number,
  speedStat: 'skillSpeed' | 'spellSpeed'
): StatBlock => ({
  ...emptyStats(),
  [mainStat]: mainStatValue,
  vitality,
  criticalHit: 420,
  determination: 440,
  directHit: 420,
  [speedStat]: 420
});

const commonProfile = (
  id: string,
  jobId: CombatJob,
  role: JobRole,
  timingEffectId: string,
  hastePercent: number
) => ({
  id,
  schemaVersion: EVALUATOR_PROFILE_SCHEMA_VERSION,
  rulesetId: CURRENT_RULESET_ID,
  job: jobId,
  jobMode: 'standard',
  version: CURRENT_PROFILE_VERSION,
  role,
  baseGcdMs: 2500,
  hastePercent,
  timingEffectId,
  confidence: 'reference-validated-proxy' as const
});

const healerProfile = (jobId: CombatJob, id: string, vitality = 438): CombatEvaluatorProfile => ({
  ...commonProfile(id, jobId, 'healer', 'base-gcd', 0),
  mainStat: 'mind',
  mainStatLabel: 'Mind',
  mainStatAbbreviation: 'MND',
  speedStat: 'spellSpeed',
  speedStatLabel: 'Spell Speed',
  speedStatAbbreviation: 'SPS',
  resourceStat: 'piety',
  resourceLabel: 'Piety',
  resourceStatAbbreviation: 'PIE',
  meldStats: ['criticalHit', 'determination', 'directHit', 'spellSpeed'],
  baseStats: healerBaseStats(vitality),
  attackPowerModifier: 237,
  mainStatModifier: 115,
  appliesTenacity: false,
  damageTrait: 1.3,
  objective: 'Expected damage of a single 100-potency magical hit from independently recalculated gear stats.',
  limitation: 'This profile does not simulate a job rotation, healing throughput, raid buffs, encounter timing, or movement.'
});

const tankProfile = (
  jobId: CombatJob,
  id: string,
  strength: number,
  vitality: number,
  mainStatModifier: number
): CombatEvaluatorProfile => ({
  ...commonProfile(id, jobId, 'tank', 'base-gcd', 0),
  mainStat: 'strength',
  mainStatLabel: 'Strength',
  mainStatAbbreviation: 'STR',
  speedStat: 'skillSpeed',
  speedStatLabel: 'Skill Speed',
  speedStatAbbreviation: 'SKS',
  resourceStat: 'tenacity',
  resourceLabel: 'Tenacity',
  resourceStatAbbreviation: 'TEN',
  meldStats: ['criticalHit', 'determination', 'directHit', 'skillSpeed', 'tenacity'],
  baseStats: tankBaseStats(strength, vitality),
  attackPowerModifier: 190,
  mainStatModifier,
  appliesTenacity: true,
  damageTrait: 1,
  objective: 'Expected damage of a single 100-potency physical hit from independently recalculated gear stats.',
  limitation: 'This profile does not simulate a job rotation, mitigation, raid buffs, encounter timing, downtime, or movement.'
});

const dpsProfile = (
  jobId: CombatJob,
  id: string,
  mainStat: 'strength' | 'dexterity' | 'intelligence',
  mainStatValue: number,
  vitality: number,
  mainStatModifier: number,
  speedStat: 'skillSpeed' | 'spellSpeed',
  damageTrait: number,
  hastePercent = 0,
  timingEffectId = 'base-gcd'
): CombatEvaluatorProfile => {
  const mainStatDetails = {
    strength: ['Strength', 'STR'],
    dexterity: ['Dexterity', 'DEX'],
    intelligence: ['Intelligence', 'INT']
  } as const;
  const spell = speedStat === 'spellSpeed';
  return {
    ...commonProfile(id, jobId, 'dps', timingEffectId, hastePercent),
    mainStat,
    mainStatLabel: mainStatDetails[mainStat][0],
    mainStatAbbreviation: mainStatDetails[mainStat][1],
    speedStat,
    speedStatLabel: spell ? 'Spell Speed' : 'Skill Speed',
    speedStatAbbreviation: spell ? 'SPS' : 'SKS',
    meldStats: ['criticalHit', 'determination', 'directHit', speedStat],
    baseStats: dpsBaseStats(mainStat, mainStatValue, vitality, speedStat),
    attackPowerModifier: 237,
    mainStatModifier,
    appliesTenacity: false,
    damageTrait,
    objective: `Expected damage of a single 100-potency ${spell ? 'magical' : 'physical'} hit from independently recalculated gear stats.`,
    limitation: 'This profile compares gear and meld stats; it does not simulate the job rotation, job gauge, raid buffs, encounter timing, downtime, or movement.'
  };
};

export const LEVEL_100_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = [
  healerProfile('WHM', 'whm-healer-damage-proxy@1'),
  healerProfile('SCH', 'sch-healer-damage-proxy@1'),
  healerProfile('AST', 'ast-healer-damage-proxy@1', 439),
  healerProfile('SGE', 'sge-healer-damage-proxy@1'),
  tankProfile('PLD', 'pld-tank-damage-proxy@1', 443, 487, 100),
  tankProfile('WAR', 'war-tank-damage-proxy@1', 465, 486, 105),
  tankProfile('DRK', 'drk-tank-damage-proxy@1', 465, 487, 105),
  tankProfile('GNB', 'gnb-tank-damage-proxy@1', 440, 484, 100),
  dpsProfile('MNK', 'mnk-dps-damage-proxy@1', 'strength', 483, 438, 110, 'skillSpeed', 1, 20, 'greased-lightning'),
  dpsProfile('DRG', 'drg-dps-damage-proxy@1', 'strength', 506, 462, 115, 'skillSpeed', 1),
  dpsProfile('NIN', 'nin-dps-damage-proxy@1', 'dexterity', 487, 440, 110, 'skillSpeed', 1, 15, 'ninja-speed-trait'),
  dpsProfile('SAM', 'sam-dps-damage-proxy@1', 'strength', 492, 440, 112, 'skillSpeed', 1, 13, 'fuka'),
  dpsProfile('RPR', 'rpr-dps-damage-proxy@1', 'strength', 509, 464, 115, 'skillSpeed', 1),
  dpsProfile('VPR', 'vpr-dps-damage-proxy@1', 'dexterity', 484, 440, 110, 'skillSpeed', 1, 15, 'swiftscaled'),
  dpsProfile('BRD', 'brd-dps-damage-proxy@1', 'dexterity', 509, 440, 115, 'skillSpeed', 1.2),
  dpsProfile('MCH', 'mch-dps-damage-proxy@1', 'dexterity', 506, 440, 115, 'skillSpeed', 1.2),
  dpsProfile('DNC', 'dnc-dps-damage-proxy@1', 'dexterity', 509, 440, 115, 'skillSpeed', 1.2),
  dpsProfile('BLM', 'blm-dps-damage-proxy@1', 'intelligence', 505, 440, 115, 'spellSpeed', 1.3),
  dpsProfile('SMN', 'smn-dps-damage-proxy@1', 'intelligence', 506, 440, 115, 'spellSpeed', 1.3),
  dpsProfile('RDM', 'rdm-dps-damage-proxy@1', 'intelligence', 506, 440, 115, 'spellSpeed', 1.3),
  dpsProfile('PCT', 'pct-dps-damage-proxy@1', 'intelligence', 506, 440, 115, 'spellSpeed', 1.3)
];

const LEVEL_90_CONSTANTS: LevelFormulaConstants = {
  baseMain: 390,
  baseSub: 400,
  levelDiv: 1900
};

const LEVEL_80_CONSTANTS: LevelFormulaConstants = {
  baseMain: 340,
  baseSub: 380,
  levelDiv: 1300
};

const LEVEL_70_CONSTANTS: LevelFormulaConstants = {
  baseMain: 292,
  baseSub: 364,
  levelDiv: 900
};

const LEVEL_60_CONSTANTS: LevelFormulaConstants = {
  baseMain: 218,
  baseSub: 354,
  levelDiv: 600
};

const scaleJobBase = (value: number, modifier: number, targetBaseMain = LEVEL_90_CONSTANTS.baseMain) => {
  const level100WithoutRace = Math.floor((440 * modifier) / 100);
  return Math.floor((targetBaseMain * modifier) / 100) + value - level100WithoutRace;
};

const scaleVitalityBase = (value: number, targetBaseMain = LEVEL_90_CONSTANTS.baseMain) => {
  const inferredModifier = Math.round((value / 440) * 20) * 5;
  const racialOffset = value - Math.floor((440 * inferredModifier) / 100);
  return Math.floor((targetBaseMain * inferredModifier) / 100) + racialOffset;
};

const historicalLevelStats = (profile: CombatEvaluatorProfile, constants: LevelFormulaConstants): StatBlock => ({
  ...emptyStats(),
  [profile.mainStat]: scaleJobBase(profile.baseStats[profile.mainStat], profile.mainStatModifier, constants.baseMain),
  vitality: scaleVitalityBase(profile.baseStats.vitality, constants.baseMain),
  piety: profile.role === 'healer' ? constants.baseMain : 0,
  tenacity: profile.role === 'tank' ? constants.baseSub : 0,
  criticalHit: constants.baseSub,
  determination: constants.baseMain,
  directHit: constants.baseSub,
  [profile.speedStat]: constants.baseSub
});

export const ENDWALKER_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = LEVEL_100_EVALUATOR_PROFILES
  .filter((profile) => profile.job !== 'VPR' && profile.job !== 'PCT')
  .map((profile) => ({
    ...profile,
    id: profile.id.replace(/@1$/, '-ew90@1'),
    rulesetId: ENDWALKER_RULESET_ID,
    version: ENDWALKER_PROFILE_VERSION,
    baseStats: historicalLevelStats(profile, LEVEL_90_CONSTANTS),
    levelConstants: LEVEL_90_CONSTANTS,
    limitation: `${profile.limitation} This historical profile is limited to the level-90 Endwalker cap.`
  }));

export const SHADOWBRINGERS_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = LEVEL_100_EVALUATOR_PROFILES
  .filter((profile) => !['SGE', 'RPR', 'VPR', 'PCT'].includes(profile.job))
  .map((profile) => ({
    ...profile,
    id: profile.id.replace(/@1$/, '-shb80@1'),
    rulesetId: SHADOWBRINGERS_RULESET_ID,
    version: SHADOWBRINGERS_PROFILE_VERSION,
    baseStats: historicalLevelStats(profile, LEVEL_80_CONSTANTS),
    levelConstants: LEVEL_80_CONSTANTS,
    confidence: 'internal-unverified',
    limitation: `${profile.limitation} This historical profile is limited to the level-80 Shadowbringers cap and remains preliminary until independently validated.`
  }));

export const STORMBLOOD_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = LEVEL_100_EVALUATOR_PROFILES
  .filter((profile) => !['GNB', 'DNC', 'SGE', 'RPR', 'VPR', 'PCT'].includes(profile.job))
  .map((profile) => ({
    ...profile,
    id: profile.id.replace(/@1$/, '-sb70@1'),
    rulesetId: STORMBLOOD_RULESET_ID,
    version: STORMBLOOD_PROFILE_VERSION,
    baseStats: historicalLevelStats(profile, LEVEL_70_CONSTANTS),
    levelConstants: LEVEL_70_CONSTANTS,
    confidence: 'internal-unverified',
    limitation: `${profile.limitation} This historical profile is limited to the level-70 Stormblood cap and remains preliminary until independently validated.`
  }));

export const HEAVENSWARD_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = LEVEL_100_EVALUATOR_PROFILES
  .filter((profile) => !['SAM', 'RDM', 'GNB', 'DNC', 'SGE', 'RPR', 'VPR', 'PCT'].includes(profile.job))
  .map((profile) => ({
    ...profile,
    id: profile.id.replace(/@1$/, '-hw60@1'),
    rulesetId: HEAVENSWARD_RULESET_ID,
    version: HEAVENSWARD_PROFILE_VERSION,
    baseStats: historicalLevelStats(profile, LEVEL_60_CONSTANTS),
    levelConstants: LEVEL_60_CONSTANTS,
    confidence: 'internal-unverified',
    limitation: `${profile.limitation} This historical profile is limited to the level-60 Heavensward cap and remains preliminary until independently validated.`
  }));

export const CURRENT_EVALUATOR_PROFILES: CombatEvaluatorProfile[] = [
  ...LEVEL_100_EVALUATOR_PROFILES,
  ...ENDWALKER_EVALUATOR_PROFILES,
  ...SHADOWBRINGERS_EVALUATOR_PROFILES,
  ...STORMBLOOD_EVALUATOR_PROFILES,
  ...HEAVENSWARD_EVALUATOR_PROFILES
];
