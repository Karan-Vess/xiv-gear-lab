import {
  criticalHitChance,
  criticalHitMultiplier,
  determinationMultiplier,
  directHitChance,
  pietyMpBonusPerTick,
  pietyMpPerTick,
  tenacityIncomingDamageMultiplier,
  tenacityMultiplier
} from '@xiv-gear-lab/calculations';
import type { StatBlock } from '@xiv-gear-lab/domain';

export interface DerivedCombatStats {
  criticalChance: number;
  criticalDamage: number;
  directChance: number;
  directDamage: number;
  determinationIncrease: number;
  tenacityDamageHealingIncrease: number;
  tenacityDamageReduction: number;
  pietyMpPerTick: number;
  pietyBonusMpPerTick: number;
}

export const derivedCombatStats = (stats: StatBlock): DerivedCombatStats => ({
  criticalChance: criticalHitChance(stats.criticalHit),
  criticalDamage: criticalHitMultiplier(stats.criticalHit),
  directChance: directHitChance(stats.directHit),
  directDamage: 1.25,
  determinationIncrease: determinationMultiplier(stats.determination) - 1,
  tenacityDamageHealingIncrease: tenacityMultiplier(stats.tenacity) - 1,
  tenacityDamageReduction: 1 - tenacityIncomingDamageMultiplier(stats.tenacity),
  pietyMpPerTick: pietyMpPerTick(stats.piety),
  pietyBonusMpPerTick: pietyMpBonusPerTick(stats.piety)
});

export const percentage = (value: number): string => `${(value * 100).toFixed(1)}%`;
