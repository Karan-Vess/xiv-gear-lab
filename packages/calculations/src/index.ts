import {
  STAT_KEYS,
  addStats,
  emptyStats,
  gearSlotItemLevelWeight,
  gearSlotWeightTotal,
  type CombatEvaluatorProfile,
  type CalculationContext,
  type CombatJob,
  type EquipmentItem,
  type Food,
  type GearSet,
  type GearSnapshot,
  type LevelFormulaConstants,
  type Materia,
  type StatBlock,
  type StatKey
} from '@xiv-gear-lab/domain';

export const CALCULATION_VERSION = 'combat-evaluator-profiles-0.6.0';
export const CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-100@1';
export const ENDWALKER_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-90@1';
export const SHADOWBRINGERS_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-80@1';
export const STORMBLOOD_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-70@1';
export const HEAVENSWARD_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-60@1';
export const A_REALM_REBORN_CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-50@1';
export const GENERIC_HIT_PROFILE_SCHEMA_VERSION = 'generic-hit-profile@1';
export const SUPPORTED_CALCULATION_SCHEMAS = [
  CALCULATION_SCHEMA_VERSION,
  ENDWALKER_CALCULATION_SCHEMA_VERSION,
  SHADOWBRINGERS_CALCULATION_SCHEMA_VERSION,
  STORMBLOOD_CALCULATION_SCHEMA_VERSION,
  HEAVENSWARD_CALCULATION_SCHEMA_VERSION,
  A_REALM_REBORN_CALCULATION_SCHEMA_VERSION
];
export const SUPPORTED_EVALUATOR_PROFILE_SCHEMAS = [GENERIC_HIT_PROFILE_SCHEMA_VERSION];

export const LEVEL_100 = {
  baseMain: 440,
  baseSub: 420,
  levelDiv: 2780,
  healerAttackPowerModifier: 237,
  tankAttackPowerModifier: 190,
  healerMainStatModifier: 115,
  healerDamageTrait: 1.3,
  physicalRangedDamageTrait: 1.2,
  casterDamageTrait: 1.3
} as const;

export const LEVEL_90: LevelFormulaConstants = {
  baseMain: 390,
  baseSub: 400,
  levelDiv: 1900
} as const;

export const LEVEL_80: LevelFormulaConstants = {
  baseMain: 340,
  baseSub: 380,
  levelDiv: 1300
} as const;

export const LEVEL_70: LevelFormulaConstants = {
  baseMain: 292,
  baseSub: 364,
  levelDiv: 900
} as const;

export const LEVEL_60: LevelFormulaConstants = {
  baseMain: 218,
  baseSub: 354,
  levelDiv: 600
} as const;

export const LEVEL_50: LevelFormulaConstants = {
  baseMain: 202,
  baseSub: 341,
  levelDiv: 341
} as const;

export const levelFormulaConstantsFor = (profile?: CombatEvaluatorProfile): LevelFormulaConstants =>
  profile?.levelConstants ?? LEVEL_100;

export const getCombatEvaluatorProfile = (
  job: CombatJob,
  profiles: readonly CombatEvaluatorProfile[],
  jobMode = 'standard',
  profileOrRulesetId?: string
): CombatEvaluatorProfile => {
  const profile = profiles.find((entry) =>
    entry.job === job &&
    entry.jobMode === jobMode &&
    (!profileOrRulesetId || entry.id === profileOrRulesetId || entry.rulesetId === profileOrRulesetId)
  );
  if (!profile) throw new Error(`No combat evaluator profile is available for ${job}.`);
  if (profile.schemaVersion !== GENERIC_HIT_PROFILE_SCHEMA_VERSION) {
    throw new Error(`Evaluator profile ${profile.id} uses unsupported schema ${profile.schemaVersion}.`);
  }
  return profile;
};

export const getCombatEvaluatorProfileForAccess = (
  job: CombatJob,
  snapshot: Pick<GearSnapshot, 'registry' | 'rulesets' | 'evaluatorProfiles'>,
  expansionId: string,
  level: number,
  jobMode = 'standard'
): CombatEvaluatorProfile => {
  const selectedExpansion = snapshot.registry.expansions.find((entry) => entry.id === expansionId);
  if (!selectedExpansion) throw new Error(`Unknown expansion: ${expansionId}`);
  const expansionOrder = new Map(snapshot.registry.expansions.map((entry) => [entry.id, entry.order]));
  const rulesets = snapshot.rulesets
    .filter((entry) =>
      entry.jobMode === jobMode &&
      entry.minimumLevel <= level &&
      entry.maximumLevel >= level &&
      (expansionOrder.get(entry.expansionId) ?? Number.MAX_SAFE_INTEGER) <= selectedExpansion.order
    )
    .sort((left, right) =>
      (expansionOrder.get(right.expansionId) ?? -1) - (expansionOrder.get(left.expansionId) ?? -1)
    );
  for (const ruleset of rulesets) {
    const profile = snapshot.evaluatorProfiles.find((entry) =>
      entry.job === job && entry.jobMode === jobMode && entry.rulesetId === ruleset.id
    );
    if (profile) return getCombatEvaluatorProfile(job, snapshot.evaluatorProfiles, jobMode, profile.id);
  }
  throw new Error(`No combat evaluator profile is available for ${job} at level ${level} in ${expansionId}.`);
};

export const getCombatEvaluatorProfileForSet = (
  set: GearSet,
  snapshot: Pick<GearSnapshot, 'evaluatorProfiles'>
): CombatEvaluatorProfile => getCombatEvaluatorProfile(
  set.job,
  snapshot.evaluatorProfiles,
  'standard',
  set.calculationContext?.evaluatorProfileId ?? set.evaluation?.profileId
);

export const mainStatMultiplier = (
  mainStat: number,
  profile: CombatEvaluatorProfile
): number =>
  (Math.floor((profile.attackPowerModifier * (mainStat - levelFormulaConstantsFor(profile).baseMain)) / levelFormulaConstantsFor(profile).baseMain) + 100) / 100;

export const weaponDamageMultiplier = (
  weaponDamage: number,
  profile: CombatEvaluatorProfile
): number =>
  Math.floor((levelFormulaConstantsFor(profile).baseMain * profile.mainStatModifier) / 1000 + weaponDamage) / 100;

export const determinationMultiplier = (determination: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  (1000 + Math.floor((140 * (determination - constants.baseMain)) / constants.levelDiv)) / 1000;

export const tenacityMultiplier = (tenacity: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  (1000 + Math.floor((112 * (tenacity - constants.baseSub)) / constants.levelDiv)) / 1000;

export const tenacityIncomingDamageMultiplier = (tenacity: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  (1000 - Math.floor((200 * (tenacity - constants.baseSub)) / constants.levelDiv)) / 1000;

export const pietyMpBonusPerTick = (piety: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  Math.max(0, Math.floor((150 * (piety - constants.baseMain)) / constants.levelDiv));

export const pietyMpPerTick = (piety: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  200 + pietyMpBonusPerTick(piety, constants);

export const criticalHitChance = (criticalHit: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  Math.floor((200 * (criticalHit - constants.baseSub)) / constants.levelDiv + 50) / 1000;

export const criticalHitMultiplier = (criticalHit: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  (1400 + Math.floor((200 * (criticalHit - constants.baseSub)) / constants.levelDiv)) / 1000;

export const directHitChance = (directHit: number, constants: LevelFormulaConstants = LEVEL_100): number =>
  Math.max(0, Math.floor((550 * (directHit - constants.baseSub)) / constants.levelDiv) / 1000);

export const gcdFromSpeed = (
  speed: number,
  baseGcdMs = 2500,
  hastePercent = 0,
  constants: LevelFormulaConstants = LEVEL_100
): number => {
  const speedReduction = Math.floor((130 * (speed - constants.baseSub)) / constants.levelDiv);
  const speedAdjusted = Math.floor(((1000 - speedReduction) * baseGcdMs) / 1000);
  const hasteAdjusted = Math.floor((speedAdjusted * (100 - hastePercent)) / 100);
  return Math.floor(hasteAdjusted / 10) / 100;
};

export const gcdFromSpellSpeed = gcdFromSpeed;

export const expectedAction100 = (
  stats: StatBlock,
  weaponDamage: number,
  profile: CombatEvaluatorProfile
): number => {
  const constants = levelFormulaConstantsFor(profile);
  const expectedCrit = 1 + criticalHitChance(stats.criticalHit, constants) * (criticalHitMultiplier(stats.criticalHit, constants) - 1);
  const expectedDh = 1 + directHitChance(stats.directHit, constants) * 0.25;
  return (
    100 *
    mainStatMultiplier(stats[profile.mainStat], profile) *
    weaponDamageMultiplier(weaponDamage, profile) *
    determinationMultiplier(stats.determination, constants) *
    (profile.appliesTenacity ? tenacityMultiplier(stats.tenacity, constants) : 1) *
    expectedCrit *
    expectedDh *
    profile.damageTrait
  );
};

export const applyFood = (stats: StatBlock, food?: Food): StatBlock => {
  const result = { ...stats };
  if (!food) return result;
  for (const bonus of food.bonuses) {
    const amount = Math.min(Math.floor((stats[bonus.stat] * bonus.percent) / 100), bonus.cap);
    result[bonus.stat] += amount;
  }
  return result;
};

export interface MeldResult {
  stats: StatBlock;
  appliedByStat: Partial<Record<StatKey, number>>;
  waste: number;
}

export const applyRelicStats = (
  item: EquipmentItem,
  relicStats: Partial<Record<StatKey, number>> | undefined
): StatBlock => {
  if (!item.relicStatModel) {
    if (relicStats && Object.values(relicStats).some((value) => value !== undefined && value !== 0)) {
      throw new Error(`${item.name} does not support allocated relic stats.`);
    }
    return { ...item.stats };
  }

  const allocation = relicStats ?? {};
  let largeCount = 0;
  let smallCount = 0;
  const stats = { ...item.stats };
  for (const [stat, rawValue] of Object.entries(allocation) as Array<[StatKey, number | undefined]>) {
    const value = rawValue ?? 0;
    if (value === 0) continue;
    if (!item.relicStatModel.allowedStats.includes(stat)) {
      throw new Error(`${item.name} cannot allocate relic points to ${stat}.`);
    }
    if (value === item.relicStatModel.largeValue) largeCount += 1;
    else if (value === item.relicStatModel.smallValue) smallCount += 1;
    else throw new Error(`${item.name} relic stats must use ${item.relicStatModel.largeValue} or ${item.relicStatModel.smallValue} points.`);
    stats[stat] += value;
  }
  if (largeCount !== item.relicStatModel.largeStatCount || smallCount !== item.relicStatModel.smallStatCount) {
    throw new Error(`${item.name} requires ${item.relicStatModel.largeStatCount} large and ${item.relicStatModel.smallStatCount} small relic stat allocations.`);
  }
  return stats;
};

export const applyMateria = (
  item: EquipmentItem,
  materiaIds: number[],
  materia: Materia[],
  relicStats?: Partial<Record<StatKey, number>>
): MeldResult => {
  const maximumMelds = item.advancedMelding ? Math.max(item.materiaSlots, 5) : item.materiaSlots;
  if (materiaIds.length > maximumMelds) {
    throw new Error(item.advancedMelding
      ? `${item.name} accepts at most ${maximumMelds} total materia, including advanced melds.`
      : `${item.name} only has ${item.materiaSlots} guaranteed materia slots.`);
  }

  const stats = applyRelicStats(item, relicStats);
  const appliedByStat: Partial<Record<StatKey, number>> = {};
  let waste = 0;

  for (const [index, id] of materiaIds.entries()) {
    const meld = materia.find((entry) => entry.id === id);
    if (!meld) throw new Error(`Unknown materia ID ${id}.`);
    if (index >= item.materiaSlots) {
      const advancedLimit = meld.advancedMeldingLimit
        ?? ([8, 10, 12].includes(meld.tier) ? 'first-slot-only' : [7, 9, 11].includes(meld.tier) ? 'unrestricted' : 'forbidden');
      if (advancedLimit === 'forbidden' || (advancedLimit === 'first-slot-only' && index > item.materiaSlots)) {
        throw new Error(`${meld.name} cannot be used in advanced meld slot ${index - item.materiaSlots + 1} on ${item.name}.`);
      }
    }
    const room = Math.max(0, item.statCaps[meld.stat] - stats[meld.stat]);
    const applied = Math.min(room, meld.value);
    stats[meld.stat] += applied;
    appliedByStat[meld.stat] = (appliedByStat[meld.stat] ?? 0) + applied;
    waste += meld.value - applied;
  }

  return { stats, appliedByStat, waste };
};

export const totalEquippedStats = (
  equipped: Array<{ item: EquipmentItem; materiaIds: number[]; relicStats?: Partial<Record<StatKey, number>> }>,
  materia: Materia[],
  food: Food | undefined,
  profile: CombatEvaluatorProfile,
  partyBonus = 1.05
): { stats: StatBlock; materiaWaste: number } => {
  let stats = { ...profile.baseStats };
  let materiaWaste = 0;

  for (const entry of equipped) {
    const melded = applyMateria(entry.item, entry.materiaIds, materia, entry.relicStats);
    stats = addStats(stats, melded.stats);
    materiaWaste += melded.waste;
  }

  stats[profile.mainStat] = Math.floor(stats[profile.mainStat] * partyBonus);
  stats.vitality = Math.floor(stats.vitality * partyBonus);
  return { stats: applyFood(stats, food), materiaWaste };
};

export const zeroCaps = (): StatBlock => {
  const result = emptyStats();
  for (const key of STAT_KEYS) result[key] = Number.MAX_SAFE_INTEGER;
  return result;
};

export const recalculateGearSet = (
  set: GearSet,
  items: EquipmentItem[],
  materia: Materia[],
  foods: Food[],
  profiles: readonly CombatEvaluatorProfile[],
  calculationContext?: CalculationContext
): GearSet => {
  const profile = getCombatEvaluatorProfile(
    set.job,
    profiles,
    'standard',
    calculationContext?.evaluatorProfileId ?? set.calculationContext?.evaluatorProfileId ?? set.evaluation?.profileId
  );
  const equipped = Object.values(set.items).map((entry) => {
    const item = items.find((candidate) => String(candidate.id) === String(entry?.itemId));
    if (!entry || !item) throw new Error(`Cannot recalculate missing item ${String(entry?.itemId)}.`);
    return { item, materiaIds: entry.materiaIds, relicStats: entry.relicStats };
  });
  const food = foods.find((entry) => entry.id === set.foodId);
  const calculated = totalEquippedStats(equipped, materia, food, profile);
  const weaponDamage = Math.max(...equipped.map((entry) => entry.item.weaponDamage));
  const averageItemLevel = equipped.reduce(
    (total, entry) => total + entry.item.itemLevel * gearSlotItemLevelWeight(set.job, entry.item.slot === 'ring' ? 'ringLeft' : entry.item.slot),
    0
  ) / gearSlotWeightTotal(set.job);

  return {
    ...set,
    metrics: {
      stats: calculated.stats,
      weaponDamage,
      gcd: gcdFromSpeed(calculated.stats[profile.speedStat], profile.baseGcdMs, profile.hastePercent, levelFormulaConstantsFor(profile)),
      expectedAction100: expectedAction100(calculated.stats, weaponDamage, profile),
      averageItemLevel,
      materiaWaste: calculated.materiaWaste
    },
    evaluation: {
      profileId: profile.id,
      version: profile.version,
      objective: profile.objective,
      confidence: profile.confidence,
      limitation: profile.limitation
    },
    calculationContext: calculationContext ?? set.calculationContext,
    calculatedAt: new Date().toISOString()
  };
};
