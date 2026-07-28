import { describe, expect, it } from 'vitest';
import {
  assessPatchProbe,
  describePatchAvailability,
  inspectExpansionCoverage,
  parseCatalogueUpdateArgs,
  sizeBudgetReport
} from './core.mjs';
import { catalogueProfile, itemMatchesCatalogueProfile } from './profiles.mjs';

describe('local catalogue-update assistant', () => {
  it('keeps discovery records inside the requested expansion cap and item-level slice', () => {
    const profile = catalogueProfile('sb');
    expect(itemMatchesCatalogueProfile({ expansionId: 'sb', level: 70, itemLevel: 400 }, profile)).toBe(true);
    expect(itemMatchesCatalogueProfile({ expansionId: 'shb', level: 80, itemLevel: 400 }, profile)).toBe(false);
    expect(itemMatchesCatalogueProfile({ expansionId: 'sb', level: 70, itemLevel: 410 }, profile)).toBe(false);
    expect(catalogueProfile('arr')).toMatchObject({ foodItemLevel: 110, maximumItemId: 10064 });
    expect(itemMatchesCatalogueProfile({ id: 10064, expansionId: 'arr', level: 50, itemLevel: 135 }, catalogueProfile('arr'))).toBe(true);
    expect(itemMatchesCatalogueProfile({ id: 10065, expansionId: 'arr', level: 50, itemLevel: 135 }, catalogueProfile('arr'))).toBe(false);
  });

  it('defaults to a read-only check and requires an expansion for backfills', () => {
    expect(parseCatalogueUpdateArgs([])).toMatchObject({ mode: 'check', apply: false });
    expect(() => parseCatalogueUpdateArgs(['--mode', 'backfill'])).toThrow(/requires --expansion/i);
    expect(parseCatalogueUpdateArgs(['--mode', 'backfill', '--expansion', 'shb', '--apply']))
      .toMatchObject({ mode: 'backfill', expansionId: 'shb', apply: true });
    expect(() => parseCatalogueUpdateArgs(['--mode', 'backfill', '--expansion', 'shb', '--force']))
      .toThrow(/requires --apply/i);
    expect(parseCatalogueUpdateArgs(['--mode', 'patch'])).toMatchObject({ mode: 'patch', apply: false });
    expect(() => parseCatalogueUpdateArgs(['--mode', 'patch', '--apply'])).toThrow(/requires --patch/i);
    expect(parseCatalogueUpdateArgs(['--mode', 'patch', '--patch', '7.6', '--apply']))
      .toMatchObject({ mode: 'patch', patch: '7.6', apply: true });
  });

  it('separates no-op, compatible patch, and unsupported expansion probes', () => {
    const baseline = {
      activeVersion: 'official-a',
      activeSchema: 'schema-a',
      probedSchema: 'schema-a',
      supportedJobs: ['WHM', 'PLD'],
      providerJobs: [
        { abbrev: 'WHM', isCrafting: false, isGathering: false },
        { abbrev: 'PLD', isCrafting: false, isGathering: false },
        { abbrev: 'BLU', isCrafting: false, isGathering: false }
      ],
      maximumSupportedLevel: 100,
      discoveredEquipmentLevels: [100]
    };
    expect(assessPatchProbe({ ...baseline, probedVersion: 'official-a' }).outcome).toBe('already-current');
    expect(assessPatchProbe({ ...baseline, probedVersion: 'official-b' }).outcome).toBe('compatible-change-detected');
    expect(assessPatchProbe({
      ...baseline,
      probedVersion: 'official-b',
      providerJobs: [...baseline.providerJobs, { abbrev: 'NEW', isCrafting: false, isGathering: false }],
      discoveredEquipmentLevels: [100, 110]
    })).toMatchObject({
      outcome: 'blocked-incompatible',
      unknownJobs: ['NEW'],
      unsupportedLevels: [110]
    });
  });

  it('turns patch probe outcomes into safe owner-facing availability messages', () => {
    expect(describePatchAvailability({ outcome: 'already-current' })).toContain('No newer official catalogue version');
    expect(describePatchAvailability({ outcome: 'compatible-change-detected' })).toContain('Run Update-Game-Data.cmd');
    expect(describePatchAvailability({
      outcome: 'blocked-incompatible',
      blockers: ['unsupported equipment levels: 110']
    })).toContain('unsupported equipment levels: 110');
    expect(describePatchAvailability({
      outcome: 'blocked-provider-error',
      blockers: ['provider unavailable']
    })).toContain('provider unavailable');
  });

  it('reports missing cap coverage, rulesets and evaluator profiles without pretending readiness', () => {
    const snapshot = {
      registry: {
        expansions: [{ id: 'arr', order: 0 }, { id: 'shb', order: 3 }],
        jobs: [{ id: 'WHM', introducedIn: 'arr' }]
      },
      items: [],
      rulesets: [],
      evaluatorProfiles: []
    };
    expect(inspectExpansionCoverage(snapshot, 'shb')).toMatchObject({
      expansionId: 'shb', levelCap: 80, ready: false, evaluatorProfiles: 0
    });
  });

  it('keeps catalogue, unique-icon and rollback-pair budgets separate', () => {
    expect(sizeBudgetReport({ snapshotBytes: 20, iconBytes: 30 }, {
      catalogueBytes: 25,
      uniqueIconBytes: 25,
      retainedSnapshotBytes: 35
    })).toEqual({
      catalogue: { bytes: 20, budget: 25, withinBudget: true },
      uniqueIcons: { bytes: 30, budget: 25, withinBudget: false },
      retainedPair: { bytes: 40, budget: 35, withinBudget: false }
    });
  });
});
