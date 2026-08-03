import { describe, expect, it } from 'vitest';
import { gearSnapshot } from '@xiv-gear-lab/data';
import { optimizeCombatJob } from '@xiv-gear-lab/optimizer';
import {
  evaluateGearSetByRotation,
  rerankGearSetsByRotation
} from '@xiv-gear-lab/simulator/rerank-gearsets';
import type { CombatJob, GearSet, OptimizerConstraints } from '@xiv-gear-lab/domain';

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

const pilotAblationConstraints = (
  targetGcd: number
): OptimizerConstraints => ({
  minResource: 0,
  minGcd: targetGcd,
  maxGcd: targetGcd,
  gcdMode: 'exact',
  gcdTargetName: `${targetGcd.toFixed(2)}s validation target`,
  allowedSources: ['savage', 'tomestone-upgrade', 'tomestone', 'relic'],
  includeUpgradedTomestoneGear: true,
  includeAugmentedCraftedGear: true,
  itemLevelMode: 'any',
  minItemLevel: 780,
  maxItemLevel: 795,
  requiredItemIds: [],
  excludedItemIds: [],
  frontierLimit: 500,
  foodMode: 'allowed',
  allowedMateriaStats: [...new Set(gearSnapshot.materia.map((materia) => materia.stat))],
  allowedMateriaTiers: [12, 11],
  allowOvermelds: false,
  allowCustomItems: false,
  allowExperimentalAccess: false,
  accessExpansion: 'dt',
  accessLevel: 100,
  searchMode: 'quick'
});

const equippedItemOverlap = (left: GearSet, right: GearSet): number => {
  const remaining = Object.values(right.items).map((equipped) => String(equipped?.itemId));
  let overlap = 0;
  for (const equipped of Object.values(left.items)) {
    const match = remaining.indexOf(String(equipped?.itemId));
    if (match < 0) continue;
    overlap += 1;
    remaining.splice(match, 1);
  }
  return overlap;
};

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
    expect(reranked.stability).toBeDefined();
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

  it('retains a stronger Black Mage speed tier when searching the full legal GCD range', () => {
    const constraints = {
      ...samConstraints(1.5, 2.5, 'range'),
      allowedSources: ['savage', 'tomestone-upgrade', 'tomestone', 'relic'] as OptimizerConstraints['allowedSources'],
      allowOvermelds: false,
      frontierLimit: 500,
      searchMode: 'quick' as const
    };
    const ranged = optimizeCombatJob(gearSnapshot, constraints, 'BLM');
    const exact = optimizeCombatJob(
      gearSnapshot,
      {
        ...constraints,
        minGcd: 2.41,
        maxGcd: 2.41,
        gcdMode: 'exact',
        gcdTargetName: '2.41s BLM acceptance target'
      },
      'BLM'
    );
    const rangedRerank = rerankGearSetsByRotation(
      gearSnapshot,
      ranged.finalists!,
      'BLM',
      'dummy-300',
      'none'
    );
    const exactRerank = rerankGearSetsByRotation(
      gearSnapshot,
      exact.finalists!,
      'BLM',
      'dummy-300',
      'none'
    );

    expect(rangedRerank.best.rotationEvaluation!.totalDamage)
      .toBeGreaterThanOrEqual(exactRerank.best.rotationEvaluation!.totalDamage);
  }, 60_000);

  it.each([
    ['SAM', 2.14],
    ['DNC', 2.50],
    ['BLM', 2.41],
    ['DRK', 2.46],
    ['WHM', 2.41],
    ['SCH', 2.40],
    ['AST', 2.43],
    ['SGE', 2.44],
    ['PLD', 2.50],
    ['WAR', 2.50],
    ['GNB', 2.50],
    ['MNK', 1.94],
    ['DRG', 2.50],
    ['NIN', 2.12],
    ['RPR', 2.49],
    ['VPR', 2.10],
    ['BRD', 2.49],
    ['MCH', 2.50],
    ['SMN', 2.48],
    ['RDM', 2.49],
    ['PCT', 2.50]
  ] as const)(
    '%s independently reproduces a comparable result with every curated warm start removed',
    (job, targetGcd) => {
      const constraints = pilotAblationConstraints(targetGcd);
      const ablatedSnapshot = structuredClone(gearSnapshot);
      ablatedSnapshot.curatedSets = [];

      const normal = optimizeCombatJob(gearSnapshot, constraints, job as CombatJob);
      const ablated = optimizeCombatJob(ablatedSnapshot, constraints, job as CombatJob);
      expect(normal.finalists).not.toHaveLength(0);
      expect(ablated.finalists).not.toHaveLength(0);

      const normalRerank = rerankGearSetsByRotation(
        gearSnapshot,
        normal.finalists!,
        job as CombatJob,
        'dummy-300',
        'none',
        normal.best?.id
      );
      const ablatedRerank = rerankGearSetsByRotation(
        ablatedSnapshot,
        ablated.finalists!,
        job as CombatJob,
        'dummy-300',
        'none',
        ablated.best?.id
      );
      const community = gearSnapshot.curatedSets
        .filter((set) => set.job === job && set.metrics.gcd === targetGcd)
        .map((set) => ({
          set,
          rotation: evaluateGearSetByRotation(
            gearSnapshot,
            set,
            'dummy-300',
            'none'
          )
        }))
        .sort((left, right) => right.rotation.totalDamage - left.rotation.totalDamage)[0];

      expect(community).toBeDefined();
      expect(equippedItemOverlap(ablatedRerank.best, normalRerank.best)).toBeGreaterThanOrEqual(8);
      expect(ablatedRerank.best.metrics.expectedAction100)
        .toBeGreaterThanOrEqual(normalRerank.best.metrics.expectedAction100 * 0.99);
      expect(ablatedRerank.best.rotationEvaluation!.totalDamage)
        .toBeGreaterThanOrEqual(normalRerank.best.rotationEvaluation!.totalDamage * 0.99);
      expect(ablatedRerank.best.metrics.expectedAction100)
        .toBeGreaterThanOrEqual(community!.set.metrics.expectedAction100 * 0.99);
      expect(ablatedRerank.best.rotationEvaluation!.totalDamage)
        .toBeGreaterThanOrEqual(community!.rotation.totalDamage * 0.99);
    },
    20_000
  );
});
