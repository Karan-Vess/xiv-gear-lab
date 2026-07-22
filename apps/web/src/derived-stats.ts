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
import type { LevelFormulaConstants, StatBlock } from '@xiv-gear-lab/domain';

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

export const derivedCombatStats = (stats: StatBlock, constants?: LevelFormulaConstants): DerivedCombatStats => ({
  criticalChance: criticalHitChance(stats.criticalHit, constants),
  criticalDamage: criticalHitMultiplier(stats.criticalHit, constants),
  directChance: directHitChance(stats.directHit, constants),
  directDamage: 1.25,
  determinationIncrease: determinationMultiplier(stats.determination, constants) - 1,
  tenacityDamageHealingIncrease: tenacityMultiplier(stats.tenacity, constants) - 1,
  tenacityDamageReduction: 1 - tenacityIncomingDamageMultiplier(stats.tenacity, constants),
  pietyMpPerTick: pietyMpPerTick(stats.piety, constants),
  pietyBonusMpPerTick: pietyMpBonusPerTick(stats.piety, constants)
});

export const percentage = (value: number): string => `${(value * 100).toFixed(1)}%`;
