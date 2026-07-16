import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { derivedCombatStats, percentage } from './derived-stats';

describe('derived combat stat presentation', () => {
  it('exposes crit, direct-hit and determination outcomes from total build stats', () => {
    const set = gearSnapshot.curatedSets.find((entry) => entry.job === 'WHM')!;
    const derived = derivedCombatStats(set.metrics.stats);

    expect(derived.criticalChance).toBeGreaterThan(0.05);
    expect(derived.criticalDamage).toBeGreaterThan(1.4);
    expect(derived.directChance).toBeGreaterThanOrEqual(0);
    expect(derived.directDamage).toBe(1.25);
    expect(derived.determinationIncrease).toBeGreaterThan(0);
    expect(percentage(derived.directDamage)).toBe('125.0%');
  });
});
