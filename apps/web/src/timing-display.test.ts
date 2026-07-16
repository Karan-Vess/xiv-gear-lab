import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { gearSetTimingDisplay } from './timing-display';

const setFor = (job: 'BLM' | 'MNK' | 'SAM' | 'VPR') =>
  gearSnapshot.curatedSets.find((set) => set.job === job)!;

describe('named GCD-state presentation', () => {
  it('shows Black Mage base timing and temporary Ley Lines timing while keeping base GCD as the optimiser target', () => {
    const timing = gearSetTimingDisplay(setFor('BLM'), gearSnapshot);
    const leyLines = timing.additionalStates.find((state) => state.id === 'ley-lines');

    expect(timing.target).toMatchObject({ id: 'base-gcd', name: 'Base GCD', isTarget: true });
    expect(leyLines).toMatchObject({ name: 'Ley Lines', kind: 'temporary', hastePercent: 15, isTarget: false });
    expect(leyLines!.gcd).toBeLessThan(timing.base);
  });

  it.each([
    ['MNK', 'greased-lightning', 'passive'],
    ['SAM', 'fuka', 'maintained'],
    ['VPR', 'swiftscaled', 'maintained']
  ] as const)('keeps %s named haste as the evaluator target', (job, effectId, kind) => {
    const timing = gearSetTimingDisplay(setFor(job), gearSnapshot);
    const state = timing.additionalStates.find((entry) => entry.id === effectId);

    expect(timing.target.id).toBe(effectId);
    expect(state).toMatchObject({ kind, isTarget: true });
    expect(state!.gcd).toBeLessThan(timing.base);
  });
});
