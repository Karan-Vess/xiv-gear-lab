import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import {
  evaluateGearSetByRotation,
  rerankGearSetsByRotation
} from '@xiv-gear-lab/simulator/rerank-gearsets';
import type { OptimizerConstraints } from '@xiv-gear-lab/domain';

const samConstraints = (
  minGcd: number,
  maxGcd: number,
  gcdMode: OptimizerConstraints['gcdMode']
): OptimizerConstraints => ({
  minResource: 0,
  minGcd,
  maxGcd,
  allowedSources: [
    'crafted',
    'normal-raid',
    'savage',
    'tomestone',
    'tomestone-upgrade',
    'dungeon',
    'trial',
    'alliance-raid',
    'relic',
    'quest',
    'vendor'
  ],
  includeUpgradedTomestoneGear: true,
  includeAugmentedCraftedGear: true,
  itemLevelMode: 'any',
  minItemLevel: 780,
  maxItemLevel: 795,
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 1_800,
  lockedItemIdsBySlot: {},
  lockedMateriaBySlot: {},
  gcdMode,
  gcdTargetName: gcdMode === 'exact' ? `${minGcd.toFixed(2)}s target` : `${minGcd.toFixed(2)}-${maxGcd.toFixed(2)}s range`,
  foodMode: 'allowed',
  allowedMateriaStats: [...new Set(gearSnapshot.materia.map((materia) => materia.stat))],
  allowedMateriaTiers: [12, 11],
  allowOvermelds: true,
  allowCustomItems: false,
  allowExperimentalAccess: false,
  accessExpansion: 'dt',
  accessLevel: 100
});

describe('rotation-aware optimizer candidate integration', () => {
  it('lets the best legal Samurai Relic allocation replace a dominated curated Savage weapon', () => {
    const result = optimizeCombatJob(gearSnapshot, samConstraints(1.5, 2.5, 'range'), 'SAM');

    const relicFinalist = result.finalists?.find((set) =>
      String(set.items.weapon?.itemId) === '51013' &&
      set.metrics.gcd === 2.14 &&
      set.items.weapon?.relicStats?.criticalHit === 447 &&
      set.items.weapon?.relicStats?.determination === 447 &&
      set.items.weapon?.relicStats?.directHit === 108
    );
    expect(relicFinalist).toBeDefined();
    expect(result.finalists?.some((set) => set.metrics.gcd <= 2)).toBe(true);

    const reranked = rerankGearSetsByRotation(
      gearSnapshot,
      result.finalists!,
      'SAM',
      'dummy-300',
      'none'
    );
    const curatedSavage = gearSnapshot.curatedSets.find((set) =>
      set.job === 'SAM' &&
      String(set.items.weapon?.itemId) === '49671' &&
      set.metrics.gcd === 2.14
    );
    expect(curatedSavage).toBeDefined();
    const savageEvaluation = evaluateGearSetByRotation(
      gearSnapshot,
      curatedSavage!,
      'dummy-300',
      'none'
    );

    expect(String(reranked.best.items.weapon?.itemId)).toBe('51013');
    expect(reranked.best.metrics.gcd).toBe(2.14);
    expect(reranked.best.items.weapon?.relicStats).toMatchObject({
      criticalHit: 447,
      determination: 447,
      directHit: 108
    });
    expect(reranked.best.rotationEvaluation!.totalDamage).toBeGreaterThan(savageEvaluation.totalDamage);
  }, 30_000);

  it('does not let a broad GCD range lose a stronger legal exact-GCD result', () => {
    const ranged = optimizeCombatJob(
      gearSnapshot,
      samConstraints(1.5, 2.5, 'range'),
      'SAM'
    );
    const exact = optimizeCombatJob(
      gearSnapshot,
      samConstraints(2.14, 2.14, 'exact'),
      'SAM'
    );
    const rangedRerank = rerankGearSetsByRotation(
      gearSnapshot,
      ranged.finalists!,
      'SAM',
      'dummy-300',
      'none'
    );
    const exactRerank = rerankGearSetsByRotation(
      gearSnapshot,
      exact.finalists!,
      'SAM',
      'dummy-300',
      'none'
    );

    expect(ranged.finalists!.some((set) => set.metrics.gcd === 2.14)).toBe(true);
    expect(rangedRerank.best.rotationEvaluation!.totalDamage)
      .toBeGreaterThanOrEqual(exactRerank.best.rotationEvaluation!.totalDamage);
  }, 60_000);
});
