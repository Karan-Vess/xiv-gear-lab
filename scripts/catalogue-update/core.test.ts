import { describe, expect, it } from 'vitest';
import {
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
  });

  it('defaults to a read-only check and requires an expansion for backfills', () => {
    expect(parseCatalogueUpdateArgs([])).toMatchObject({ mode: 'check', apply: false });
    expect(() => parseCatalogueUpdateArgs(['--mode', 'backfill'])).toThrow(/requires --expansion/i);
    expect(parseCatalogueUpdateArgs(['--mode', 'backfill', '--expansion', 'shb', '--apply']))
      .toMatchObject({ mode: 'backfill', expansionId: 'shb', apply: true });
    expect(() => parseCatalogueUpdateArgs(['--mode', 'backfill', '--expansion', 'shb', '--force']))
      .toThrow(/requires --apply/i);
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
