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
  type Materia,
  type StatBlock,
  type StatKey
} from '@xiv-gear-lab/domain';

export const CALCULATION_VERSION = 'combat-evaluator-profiles-0.5.0';
export const CALCULATION_SCHEMA_VERSION = 'ffxiv-combat-level-100@1';
export const GENERIC_HIT_PROFILE_SCHEMA_VERSION = 'generic-hit-profile@1';
export const SUPPORTED_CALCULATION_SCHEMAS = [CALCULATION_SCHEMA_VERSION];
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

export const getCombatEvaluatorProfile = (
  job: CombatJob,
  profiles: readonly CombatEvaluatorProfile[],
  jobMode = 'standard'
): CombatEvaluatorProfile => {
  const profile = profiles.find((entry) => entry.job === job && entry.jobMode === jobMode);
  if (!profile) throw new Error(`No combat evaluator profile is available for ${job}.`);
  if (profile.schemaVersion !== GENERIC_HIT_PROFILE_SCHEMA_VERSION) {
    throw new Error(`Evaluator profile ${profile.id} uses unsupported schema ${profile.schemaVersion}.`);
  }
  return profile;
};

export const mainStatMultiplier = (
  mainStat: number,
  profile: CombatEvaluatorProfile
): number =>
  (Math.floor((profile.attackPowerModifier * (mainStat - LEVEL_100.baseMain)) / LEVEL_100.baseMain) + 100) / 100;

export const weaponDamageMultiplier = (
  weaponDamage: number,
  profile: CombatEvaluatorProfile
): number =>
  Math.floor((LEVEL_100.baseMain * profile.mainStatModifier) / 1000 + weaponDamage) / 100;

export const determinationMultiplier = (determination: number): number =>
  (1000 + Math.floor((140 * (determination - LEVEL_100.baseMain)) / LEVEL_100.levelDiv)) / 1000;

export const tenacityMultiplier = (tenacity: number): number =>
  (1000 + Math.floor((112 * (tenacity - LEVEL_100.baseSub)) / LEVEL_100.levelDiv)) / 1000;

export const tenacityIncomingDamageMultiplier = (tenacity: number): number =>
  (1000 - Math.floor((200 * (tenacity - LEVEL_100.baseSub)) / LEVEL_100.levelDiv)) / 1000;

export const pietyMpBonusPerTick = (piety: number): number =>
  Math.max(0, Math.floor((150 * (piety - LEVEL_100.baseMain)) / LEVEL_100.levelDiv));

export const pietyMpPerTick = (piety: number): number =>
  200 + pietyMpBonusPerTick(piety);

export const criticalHitChance = (criticalHit: number): number =>
  Math.floor((200 * (criticalHit - LEVEL_100.baseSub)) / LEVEL_100.levelDiv + 50) / 1000;

export const criticalHitMultiplier = (criticalHit: number): number =>
  (1400 + Math.floor((200 * (criticalHit - LEVEL_100.baseSub)) / LEVEL_100.levelDiv)) / 1000;

export const directHitChance = (directHit: number): number =>
  Math.max(0, Math.floor((550 * (directHit - LEVEL_100.baseSub)) / LEVEL_100.levelDiv) / 1000);

export const gcdFromSpeed = (speed: number, baseGcdMs = 2500, hastePercent = 0): number => {
  const speedReduction = Math.floor((130 * (speed - LEVEL_100.baseSub)) / LEVEL_100.levelDiv);
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
  const expectedCrit = 1 + criticalHitChance(stats.criticalHit) * (criticalHitMultiplier(stats.criticalHit) - 1);
  const expectedDh = 1 + directHitChance(stats.directHit) * 0.25;
  return (
    100 *
    mainStatMultiplier(stats[profile.mainStat], profile) *
    weaponDamageMultiplier(weaponDamage, profile) *
    determinationMultiplier(stats.determination) *
    (profile.appliesTenacity ? tenacityMultiplier(stats.tenacity) : 1) *
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

export const applyMateria = (item: EquipmentItem, materiaIds: number[], materia: Materia[]): MeldResult => {
  const maximumMelds = item.advancedMelding ? Math.max(item.materiaSlots, 5) : item.materiaSlots;
  if (materiaIds.length > maximumMelds) {
    throw new Error(item.advancedMelding
      ? `${item.name} accepts at most ${maximumMelds} total materia, including advanced melds.`
      : `${item.name} only has ${item.materiaSlots} guaranteed materia slots.`);
  }

  const stats = { ...item.stats };
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
  equipped: Array<{ item: EquipmentItem; materiaIds: number[] }>,
  materia: Materia[],
  food: Food | undefined,
  profile: CombatEvaluatorProfile,
  partyBonus = 1.05
): { stats: StatBlock; materiaWaste: number } => {
  let stats = { ...profile.baseStats };
  let materiaWaste = 0;

  for (const entry of equipped) {
    const melded = applyMateria(entry.item, entry.materiaIds, materia);
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
  const profile = getCombatEvaluatorProfile(set.job, profiles);
  const equipped = Object.values(set.items).map((entry) => {
    const item = items.find((candidate) => String(candidate.id) === String(entry?.itemId));
    if (!entry || !item) throw new Error(`Cannot recalculate missing item ${String(entry?.itemId)}.`);
    return { item, materiaIds: entry.materiaIds };
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
      gcd: gcdFromSpeed(calculated.stats[profile.speedStat], profile.baseGcdMs, profile.hastePercent),
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
