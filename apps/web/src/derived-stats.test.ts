import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { derivedCombatStats, percentage } from './derived-stats';

describe('derived combat stat presentation', () => {
  it('exposes crit, direct-hit, determination, Tenacity and Piety outcomes from total build stats', () => {
    const set = gearSnapshot.curatedSets.find((entry) => entry.job === 'WHM')!;
    const derived = derivedCombatStats(set.metrics.stats);

    expect(derived.criticalChance).toBeGreaterThan(0.05);
    expect(derived.criticalDamage).toBeGreaterThan(1.4);
    expect(derived.directChance).toBeGreaterThanOrEqual(0);
    expect(derived.directDamage).toBe(1.25);
    expect(derived.determinationIncrease).toBeGreaterThan(0);
    expect(percentage(derived.directDamage)).toBe('125.0%');

    const tank = gearSnapshot.curatedSets.find((entry) => entry.job === 'PLD')!;
    const tankDerived = derivedCombatStats(tank.metrics.stats);
    expect(tankDerived.tenacityDamageHealingIncrease).toBeGreaterThanOrEqual(0);
    expect(tankDerived.tenacityDamageReduction).toBeGreaterThanOrEqual(0);

    const basePiety = derivedCombatStats({ ...set.metrics.stats, piety: 440 });
    const highPiety = derivedCombatStats({ ...set.metrics.stats, piety: 929 });
    expect(basePiety.pietyMpPerTick).toBe(200);
    expect(basePiety.pietyBonusMpPerTick).toBe(0);
    expect(highPiety.pietyMpPerTick).toBe(226);
    expect(highPiety.pietyBonusMpPerTick).toBe(26);
  });
});
