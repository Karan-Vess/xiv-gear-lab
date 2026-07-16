import { describe, expect, it } from 'vitest';
import { recalculateGearSet } from '@xiv-gear-lab/calculations';
import { assessSnapshotCompatibility } from '@xiv-gear-lab/domain';
import { gearSnapshot } from './index';

describe('live combat-job reference fixtures', () => {
  it('loads the current roster and evaluator profiles from snapshot data', () => {
    expect(gearSnapshot.registry.jobs).toHaveLength(21);
    expect(gearSnapshot.evaluatorProfiles).toHaveLength(21);
    expect(new Set(gearSnapshot.evaluatorProfiles.map((profile) => profile.id)).size).toBe(21);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'AST')?.baseStats.vitality).toBe(439);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'MCH')?.damageTrait).toBe(1.2);
    expect(gearSnapshot.evaluatorProfiles.find((profile) => profile.job === 'MNK')?.hastePercent).toBe(20);
  });

  it('passes the v0.5 runtime compatibility gate before activation', () => {
    const report = assessSnapshotCompatibility(gearSnapshot, {
      appVersion: '0.8.0',
      snapshotSchemas: ['gear-snapshot@1'],
      registrySchemas: ['game-registry@1'],
      rulesetSchemas: ['combat-ruleset@1'],
      calculationSchemas: ['ffxiv-combat-level-100@1'],
      evaluatorProfileSchemas: ['generic-hit-profile@1']
    });
    expect(report.errors).toEqual([]);
    expect(report.compatible).toBe(true);
    expect(gearSnapshot.curatedSets.every((set) =>
      set.calculationContext?.snapshotId === gearSnapshot.manifest.id &&
      set.calculationContext.rulesetId === 'dt-7.51-level-100-standard@1'
    )).toBe(true);
  });

  it('keeps the current independently attributed reference count for every supported job', () => {
    expect(Object.fromEntries(['WHM', 'SCH', 'AST', 'SGE', 'PLD', 'WAR', 'DRK', 'GNB', 'MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM', 'PCT'].map((job) => [
      job,
      gearSnapshot.curatedSets.filter((set) => set.job === job).length
    ]))).toEqual({
      WHM: 6, SCH: 2, AST: 4, SGE: 4, PLD: 1, WAR: 2, DRK: 4, GNB: 3,
      MNK: 3, DRG: 1, NIN: 1, SAM: 2, RPR: 1, VPR: 3,
      BRD: 1, MCH: 1, DNC: 1, BLM: 6, SMN: 6, RDM: 5, PCT: 3
    });
  });

  it('cross-attributes matching Etro and Balance sets without duplicating cards', () => {
    expect(gearSnapshot.curatedSets).toHaveLength(60);
    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'The Balance')
    )).toHaveLength(55);
    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'Etro')
    )).toHaveLength(56);

    expect(gearSnapshot.curatedSets.filter((set) =>
      set.provenance.some((entry) => entry.provider === 'Etro') &&
      set.provenance.some((entry) => entry.provider === 'The Balance')
    )).toHaveLength(51);

    const scholarFast = gearSnapshot.curatedSets.find((set) =>
      set.job === 'SCH' && set.metrics.gcd === 2.31
    );
    expect(scholarFast?.name).toBe('2.31 Max Damage');
    expect(scholarFast?.provenance.map((entry) => entry.provider)).toEqual(['The Balance', 'XivGear']);
    expect(gearSnapshot.curatedSets.find((set) => set.job === 'DRK' && set.name === '2.46 The Balance')
      ?.provenance.map((entry) => entry.provider)).toEqual(['The Balance', 'XivGear']);
  });

  for (const source of gearSnapshot.curatedSets) {
    it(`reproduces ${source.job} ${source.name}`, () => {
      const calculated = recalculateGearSet(
        source,
        gearSnapshot.items,
        gearSnapshot.materia,
        gearSnapshot.foods,
        gearSnapshot.evaluatorProfiles
      );
      expect(calculated.metrics.gcd).toBe(source.metrics.gcd);
      expect(calculated.metrics.stats).toEqual(source.metrics.stats);
      expect(calculated.metrics.expectedAction100).toBeCloseTo(source.metrics.expectedAction100, 2);
      expect(calculated.evaluation?.profileId).toBe(source.evaluation?.profileId);
    });
  }
});
